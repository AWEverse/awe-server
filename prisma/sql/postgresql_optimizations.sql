-- =====================================================
-- ПРОДВИНУТЫЕ POSTGRESQL ОПТИМИЗАЦИИ
-- Специфичные для PostgreSQL процедуры и функции
-- =====================================================

-- =====================================================
-- ПРОЦЕДУРЫ МАССОВЫХ ОПЕРАЦИЙ
-- =====================================================

-- Массовая вставка сообщений (для импорта/миграции)
CREATE OR REPLACE FUNCTION bulk_insert_messages(
    p_messages JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_inserted_count INTEGER;
BEGIN
    -- Используем COPY-подобный подход через JSON
    INSERT INTO "Message" (
        "chatId", "senderId", content, header, 
        "messageType", "createdAt"
    )
    SELECT 
        (msg->>'chatId')::BIGINT,
        (msg->>'senderId')::BIGINT,
        decode(msg->>'content', 'base64'),
        decode(msg->>'header', 'base64'),
        (msg->>'messageType')::"MessageType",
        (msg->>'createdAt')::TIMESTAMPTZ
    FROM jsonb_array_elements(p_messages) AS msg;
    
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    
    -- Обновляем статистику чатов батчем
    UPDATE "Chat" 
    SET 
        "lastMessageAt" = subq.max_created,
        "updatedAt" = NOW()
    FROM (
        SELECT 
            (msg->>'chatId')::BIGINT as chat_id,
            MAX((msg->>'createdAt')::TIMESTAMPTZ) as max_created
        FROM jsonb_array_elements(p_messages) AS msg
        GROUP BY (msg->>'chatId')::BIGINT
    ) subq
    WHERE "Chat".id = subq.chat_id;
    
    RETURN v_inserted_count;
END;
$$;

-- Массовое обновление статистики пользователей
CREATE OR REPLACE FUNCTION bulk_update_user_stats(
    p_user_ids BIGINT[] DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    -- Если не указаны конкретные пользователи, обновляем всех активных
    WITH user_stats AS (
        SELECT 
            u.id,
            COALESCE(sub_count.subscribers, 0) as subscribers_count,
            COALESCE(sub_count.subscriptions, 0) as subscriptions_count,
            COALESCE(content_stats.videos, 0) as videos_count,
            COALESCE(content_stats.posts, 0) as posts_count,
            COALESCE(content_stats.total_views, 0) as total_views,
            COALESCE(content_stats.total_likes, 0) as total_likes
        FROM "User" u
        LEFT JOIN (
            SELECT 
                s1."subscribedToId" as user_id,
                COUNT(*) as subscribers,
                0 as subscriptions
            FROM "Subscription" s1
            WHERE p_user_ids IS NULL OR s1."subscribedToId" = ANY(p_user_ids)
            GROUP BY s1."subscribedToId"
            
            UNION ALL
            
            SELECT 
                s2."subscriberId" as user_id,
                0 as subscribers,
                COUNT(*) as subscriptions
            FROM "Subscription" s2
            WHERE p_user_ids IS NULL OR s2."subscriberId" = ANY(p_user_ids)
            GROUP BY s2."subscriberId"
        ) sub_count ON u.id = sub_count.user_id
        LEFT JOIN (
            SELECT 
                c."authorId",
                COUNT(CASE WHEN c.type IN ('VIDEO', 'SHORT_VIDEO', 'LIVE_STREAM') THEN 1 END) as videos,
                COUNT(CASE WHEN c.type IN ('IMAGE_POST', 'TEXT_POST') THEN 1 END) as posts,
                SUM(c."viewsCount") as total_views,
                SUM(c."likesCount") as total_likes
            FROM "Content" c
            WHERE 
                c.status = 'PUBLISHED'
                AND c."deletedAt" IS NULL
                AND (p_user_ids IS NULL OR c."authorId" = ANY(p_user_ids))
            GROUP BY c."authorId"
        ) content_stats ON u.id = content_stats."authorId"
        WHERE 
            u.status = 'ACTIVE'
            AND u."deletedAt" IS NULL
            AND (p_user_ids IS NULL OR u.id = ANY(p_user_ids))
    )
    UPDATE "User" 
    SET 
        "subscribersCount" = user_stats.subscribers_count,
        "subscriptionsCount" = user_stats.subscriptions_count,
        "videosCount" = user_stats.videos_count,
        "postsCount" = user_stats.posts_count,
        "totalViews" = user_stats.total_views,
        "totalLikes" = user_stats.total_likes,
        "updatedAt" = NOW()
    FROM user_stats
    WHERE "User".id = user_stats.id;
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count;
END;
$$;

-- =====================================================
-- АНАЛИТИЧЕСКИЕ ФУНКЦИИ
-- =====================================================

-- Аналитика активности пользователей (окно)
CREATE OR REPLACE FUNCTION get_user_activity_analytics(
    p_days_back INTEGER DEFAULT 30
) RETURNS TABLE(
    user_id BIGINT,
    username VARCHAR(32),
    messages_sent INTEGER,
    content_published INTEGER,
    likes_given INTEGER,
    active_days INTEGER,
    avg_session_duration INTERVAL,
    activity_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH activity_data AS (
        -- Сообщения
        SELECT 
            m."senderId" as user_id,
            DATE(m."createdAt") as activity_date,
            COUNT(*) as messages_count,
            0 as content_count,
            0 as likes_count
        FROM "Message" m
        WHERE m."createdAt" > NOW() - (p_days_back || ' days')::INTERVAL
        GROUP BY m."senderId", DATE(m."createdAt")
        
        UNION ALL
        
        -- Контент
        SELECT 
            c."authorId" as user_id,
            DATE(c."publishedAt") as activity_date,
            0 as messages_count,
            COUNT(*) as content_count,
            0 as likes_count
        FROM "Content" c
        WHERE 
            c."publishedAt" > NOW() - (p_days_back || ' days')::INTERVAL
            AND c.status = 'PUBLISHED'
        GROUP BY c."authorId", DATE(c."publishedAt")
        
        UNION ALL
        
        -- Лайки
        SELECT 
            l."userId" as user_id,
            DATE(l."createdAt") as activity_date,
            0 as messages_count,
            0 as content_count,
            COUNT(*) as likes_count
        FROM "Like" l
        WHERE l."createdAt" > NOW() - (p_days_back || ' days')::INTERVAL
        GROUP BY l."userId", DATE(l."createdAt")
    ),
    user_activity AS (
        SELECT 
            ad.user_id,
            SUM(ad.messages_count) as total_messages,
            SUM(ad.content_count) as total_content,
            SUM(ad.likes_count) as total_likes,
            COUNT(DISTINCT ad.activity_date) as active_days
        FROM activity_data ad
        GROUP BY ad.user_id
    ),
    session_stats AS (
        SELECT 
            s."userId",
            AVG(EXTRACT(EPOCH FROM (s."updatedAt" - s."createdAt")) * INTERVAL '1 second') as avg_duration
        FROM "Session" s
        WHERE 
            s."createdAt" > NOW() - (p_days_back || ' days')::INTERVAL
            AND s."updatedAt" > s."createdAt"
        GROUP BY s."userId"
    )
    SELECT 
        u.id,
        u.username,
        COALESCE(ua.total_messages, 0)::INTEGER,
        COALESCE(ua.total_content, 0)::INTEGER,
        COALESCE(ua.total_likes, 0)::INTEGER,
        COALESCE(ua.active_days, 0)::INTEGER,
        COALESCE(ss.avg_duration, INTERVAL '0'),
        -- Вычисляем activity score
        (
            COALESCE(ua.total_messages, 0) * 0.1 +
            COALESCE(ua.total_content, 0) * 2.0 +
            COALESCE(ua.total_likes, 0) * 0.05 +
            COALESCE(ua.active_days, 0) * 1.0
        )::FLOAT as activity_score
    FROM "User" u
    LEFT JOIN user_activity ua ON u.id = ua.user_id
    LEFT JOIN session_stats ss ON u.id = ss."userId"
    WHERE u.status = 'ACTIVE'
    ORDER BY activity_score DESC;
END;
$$;

-- Аналитика контента с временными окнами
CREATE OR REPLACE FUNCTION get_content_performance_analytics(
    p_content_id BIGINT,
    p_interval_hours INTEGER DEFAULT 24
) RETURNS TABLE(
    hour_mark TIMESTAMPTZ,
    views_in_hour INTEGER,
    likes_in_hour INTEGER,
    comments_in_hour INTEGER,
    cumulative_views BIGINT,
    growth_rate FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH hourly_stats AS (
        SELECT 
            date_trunc('hour', wh."watchedAt") as hour_mark,
            COUNT(*) as views_count
        FROM "WatchHistory" wh
        WHERE 
            wh."contentId" = p_content_id
            AND wh."watchedAt" > NOW() - (p_interval_hours || ' hours')::INTERVAL
        GROUP BY date_trunc('hour', wh."watchedAt")
        
        UNION ALL
        
        SELECT 
            date_trunc('hour', l."createdAt") as hour_mark,
            0 as views_count
        FROM "Like" l
        WHERE 
            l."contentId" = p_content_id
            AND l."createdAt" > NOW() - (p_interval_hours || ' hours')::INTERVAL
        GROUP BY date_trunc('hour', l."createdAt")
    ),
    likes_hourly AS (
        SELECT 
            date_trunc('hour', l."createdAt") as hour_mark,
            COUNT(*) as likes_count
        FROM "Like" l
        WHERE 
            l."contentId" = p_content_id
            AND l."createdAt" > NOW() - (p_interval_hours || ' hours')::INTERVAL
        GROUP BY date_trunc('hour', l."createdAt")
    ),
    comments_hourly AS (
        SELECT 
            date_trunc('hour', c."createdAt") as hour_mark,
            COUNT(*) as comments_count
        FROM "Comment" c
        WHERE 
            c."contentId" = p_content_id
            AND c."createdAt" > NOW() - (p_interval_hours || ' hours')::INTERVAL
        GROUP BY date_trunc('hour', c."createdAt")
    ),
    complete_hours AS (
        SELECT 
            generate_series(
                date_trunc('hour', NOW() - (p_interval_hours || ' hours')::INTERVAL),
                date_trunc('hour', NOW()),
                INTERVAL '1 hour'
            ) as hour_mark
    )
    SELECT 
        ch.hour_mark,
        COALESCE(hs.views_count, 0)::INTEGER,
        COALESCE(lh.likes_count, 0)::INTEGER,
        COALESCE(cmh.comments_count, 0)::INTEGER,
        SUM(COALESCE(hs.views_count, 0)) OVER (
            ORDER BY ch.hour_mark 
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) as cumulative_views,
        -- Вычисляем growth rate (% изменения за час)
        CASE 
            WHEN LAG(COALESCE(hs.views_count, 0)) OVER (ORDER BY ch.hour_mark) = 0 THEN 0
            ELSE (
                (COALESCE(hs.views_count, 0)::FLOAT - 
                 LAG(COALESCE(hs.views_count, 0)) OVER (ORDER BY ch.hour_mark)::FLOAT) /
                LAG(COALESCE(hs.views_count, 0)) OVER (ORDER BY ch.hour_mark)::FLOAT * 100
            )
        END as growth_rate
    FROM complete_hours ch
    LEFT JOIN hourly_stats hs ON ch.hour_mark = hs.hour_mark
    LEFT JOIN likes_hourly lh ON ch.hour_mark = lh.hour_mark
    LEFT JOIN comments_hourly cmh ON ch.hour_mark = cmh.hour_mark
    ORDER BY ch.hour_mark;
END;
$$;

-- =====================================================
-- ПРОЦЕДУРЫ БЕЗОПАСНОСТИ
-- =====================================================

-- Детекция подозрительной активности
CREATE OR REPLACE FUNCTION detect_suspicious_activity(
    p_user_id BIGINT DEFAULT NULL,
    p_hours_back INTEGER DEFAULT 1
) RETURNS TABLE(
    user_id BIGINT,
    username VARCHAR(32),
    suspicious_score FLOAT,
    details JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH user_activity AS (
        SELECT 
            u.id,
            u.username,
            -- Подсчитываем различные активности
            COUNT(DISTINCT m.id) as messages_count,
            COUNT(DISTINCT l.id) as likes_count,
            COUNT(DISTINCT s.id) as sessions_count,
            COUNT(DISTINCT s."deviceId") as devices_count,
            COUNT(DISTINCT s."ipAddress") as ip_count
        FROM "User" u
        LEFT JOIN "Message" m ON u.id = m."senderId" 
            AND m."createdAt" > NOW() - (p_hours_back || ' hours')::INTERVAL
        LEFT JOIN "Like" l ON u.id = l."userId"
            AND l."createdAt" > NOW() - (p_hours_back || ' hours')::INTERVAL
        LEFT JOIN "Session" s ON u.id = s."userId"
            AND s."createdAt" > NOW() - (p_hours_back || ' hours')::INTERVAL
        WHERE 
            u.status = 'ACTIVE'
            AND (p_user_id IS NULL OR u.id = p_user_id)
        GROUP BY u.id, u.username
    )
    SELECT 
        ua.id,
        ua.username,
        -- Алгоритм подозрительности
        (
            CASE WHEN ua.messages_count > 100 THEN 2.0 ELSE 0 END +
            CASE WHEN ua.likes_count > 50 THEN 1.5 ELSE 0 END +
            CASE WHEN ua.devices_count > 3 THEN 3.0 ELSE 0 END +
            CASE WHEN ua.ip_count > 3 THEN 4.0 ELSE 0 END +
            CASE WHEN ua.sessions_count > 5 THEN 2.0 ELSE 0 END
        ) as suspicious_score,
        jsonb_build_object(
            'messagesCount', ua.messages_count,
            'likesCount', ua.likes_count,
            'sessionsCount', ua.sessions_count,
            'devicesCount', ua.devices_count,
            'ipCount', ua.ip_count,
            'timeWindow', p_hours_back || ' hours'
        ) as details
    FROM user_activity ua
    WHERE (
        ua.messages_count > 100 OR
        ua.likes_count > 50 OR
        ua.devices_count > 3 OR
        ua.ip_count > 3 OR
        ua.sessions_count > 5
    )
    ORDER BY suspicious_score DESC;
END;
$$;

-- Логирование действий с автоматической классификацией
CREATE OR REPLACE FUNCTION log_security_event(
    p_user_id BIGINT,
    p_action VARCHAR(64),
    p_description VARCHAR(255),
    p_ip_address INET DEFAULT NULL,
    p_user_agent VARCHAR(255) DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_severity INTEGER := 0;
    v_log_id BIGINT;
    v_suspicious_actions TEXT[] := ARRAY[
        'failed_login', 'password_changed', 'email_changed', 
        'multiple_devices', 'suspicious_upload'
    ];
BEGIN
    -- Автоматическое определение severity
    IF p_action = ANY(v_suspicious_actions) THEN
        v_severity := 2; -- warning
    ELSIF p_action LIKE '%failed%' OR p_action LIKE '%blocked%' THEN
        v_severity := 1; -- info
    ELSIF p_action LIKE '%security%' OR p_action LIKE '%admin%' THEN
        v_severity := 3; -- critical
    END IF;

    -- Создаем запись
    INSERT INTO "SecurityAuditLog" (
        "userId", action, severity, description,
        "ipAddress", "userAgent", metadata
    ) VALUES (
        p_user_id, p_action, v_severity, p_description,
        p_ip_address, p_user_agent, p_metadata
    ) RETURNING id INTO v_log_id;

    -- Автоматические действия при критических событиях
    IF v_severity = 3 THEN
        -- Здесь можно добавить автоматические меры безопасности
        -- Например, временная блокировка аккаунта
        NULL;
    END IF;

    RETURN v_log_id;
END;
$$;

-- =====================================================
-- ПРОЦЕДУРЫ ОПТИМИЗАЦИИ ПРОИЗВОДИТЕЛЬНОСТИ
-- =====================================================

-- Автоматическое партиционирование больших таблиц
CREATE OR REPLACE FUNCTION create_monthly_partitions(
    p_table_name TEXT,
    p_months_ahead INTEGER DEFAULT 3
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_partition_name TEXT;
    v_start_date DATE;
    v_end_date DATE;
    v_month_offset INTEGER;
    v_result TEXT := '';
BEGIN
    FOR v_month_offset IN 0..p_months_ahead LOOP
        v_start_date := date_trunc('month', NOW() + (v_month_offset || ' month')::INTERVAL)::DATE;
        v_end_date := (v_start_date + INTERVAL '1 month')::DATE;
        v_partition_name := p_table_name || '_' || to_char(v_start_date, 'YYYY_MM');
        
        -- Проверяем, существует ли партиция
        IF NOT EXISTS (
            SELECT 1 FROM pg_class WHERE relname = v_partition_name
        ) THEN
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I 
                 FOR VALUES FROM (%L) TO (%L)',
                v_partition_name, p_table_name, v_start_date, v_end_date
            );
            v_result := v_result || 'Создана партиция: ' || v_partition_name || E'\n';
        END IF;
    END LOOP;
    
    RETURN v_result;
END;
$$;

-- Обновление статистики таблиц с приоритетом
CREATE OR REPLACE FUNCTION update_table_statistics(
    p_priority_tables TEXT[] DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_table_name TEXT;
    v_result TEXT := '';
    v_priority_tables TEXT[] := COALESCE(
        p_priority_tables, 
        ARRAY['Message', 'Content', 'User', 'WatchHistory', 'Like']
    );
BEGIN
    -- Обновляем приоритетные таблицы
    FOREACH v_table_name IN ARRAY v_priority_tables LOOP
        EXECUTE 'ANALYZE ' || quote_ident(v_table_name);
        v_result := v_result || 'Обновлена статистика: ' || v_table_name || E'\n';
    END LOOP;
    
    -- Обновляем все остальные таблицы
    FOR v_table_name IN 
        SELECT schemaname||'.'||tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename NOT LIKE '%_pkey' 
        AND tablename != ALL(v_priority_tables)
    LOOP
        EXECUTE 'ANALYZE ' || v_table_name;
    END LOOP;
    
    v_result := v_result || 'Обновлена статистика всех остальных таблиц' || E'\n';
    
    RETURN v_result;
END;
$$;

-- =====================================================
-- ПРОЦЕДУРЫ РЕЗЕРВНОГО КОПИРОВАНИЯ И АРХИВИРОВАНИЯ
-- =====================================================

-- Интеллектуальное архивирование старых данных
CREATE OR REPLACE FUNCTION intelligent_archive_data(
    p_archive_older_than INTERVAL DEFAULT '6 months',
    p_keep_popular_content BOOLEAN DEFAULT TRUE
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_archived_messages INTEGER;
    v_archived_content INTEGER;
    v_result TEXT := '';
BEGIN
    -- Архивируем сообщения (исключая важные чаты)
    WITH archived_messages AS (
        DELETE FROM "Message" m
        USING "Chat" c
        WHERE 
            m."chatId" = c.id
            AND m."createdAt" < NOW() - p_archive_older_than
            AND (m.flags & 1) = 1 -- помечены как удаленные
            AND c.type != 'CHANNEL' -- не архивируем каналы
            AND c."memberCount" < 1000 -- не архивируем большие чаты
        RETURNING 
            m.id, m."chatId", m."senderId", m.content,
            m."messageType", m."createdAt"
    )
    INSERT INTO "MessageArchive" (
        "originalId", "chatId", "senderId", content,
        "messageType", "createdAt", "compressionType"
    )
    SELECT 
        id, "chatId", "senderId", content,
        "messageType", "createdAt", 'gzip'
    FROM archived_messages;
    
    GET DIAGNOSTICS v_archived_messages = ROW_COUNT;
    
    -- Архивируем непопулярный контент
    IF p_keep_popular_content THEN
        WITH archived_content AS (
            DELETE FROM "Content" c
            WHERE 
                c."createdAt" < NOW() - p_archive_older_than
                AND c.status = 'DELETED'
                AND c."viewsCount" < 100 -- непопулярный контент
                AND c."likesCount" < 10
            RETURNING 
                c.id, c."authorId", c.type, 
                jsonb_build_object(
                    'title', c.title,
                    'viewsCount', c."viewsCount",
                    'likesCount', c."likesCount",
                    'metadata', c.metadata
                ) as metadata
        )
        INSERT INTO "ContentArchive" (
            "originalId", "authorId", type, metadata,
            "archiveReason", "compressionType"
        )
        SELECT 
            id, "authorId", type, metadata,
            'auto_cleanup', 'gzip'
        FROM archived_content;
        
        GET DIAGNOSTICS v_archived_content = ROW_COUNT;
    END IF;
    
    v_result := 'Архивировано сообщений: ' || v_archived_messages || E'\n';
    v_result := v_result || 'Архивировано контента: ' || COALESCE(v_archived_content, 0) || E'\n';
    
    RETURN v_result;
END;
$$;

-- =====================================================
-- ПРОЦЕДУРЫ МОНИТОРИНГА
-- =====================================================

-- Мониторинг производительности системы
CREATE OR REPLACE FUNCTION get_system_health_report()
RETURNS TABLE(
    metric_name TEXT,
    metric_value NUMERIC,
    status TEXT,
    recommendation TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_active_connections INTEGER;
    v_slow_queries INTEGER;
    v_table_bloat NUMERIC;
    v_cache_hit_ratio NUMERIC;
BEGIN
    -- Активные подключения
    SELECT COUNT(*) INTO v_active_connections
    FROM pg_stat_activity
    WHERE state = 'active';
    
    -- Медленные запросы
    SELECT COUNT(*) INTO v_slow_queries
    FROM pg_stat_statements
    WHERE mean_exec_time > 1000; -- > 1 секунды
    
    -- Cache hit ratio
    SELECT 
        round(
            sum(blks_hit) * 100.0 / 
            nullif(sum(blks_hit) + sum(blks_read), 0), 
            2
        ) INTO v_cache_hit_ratio
    FROM pg_stat_database;
    
    RETURN QUERY VALUES
        ('active_connections', v_active_connections, 
         CASE WHEN v_active_connections > 100 THEN 'WARNING' ELSE 'OK' END,
         CASE WHEN v_active_connections > 100 THEN 'Много активных подключений' ELSE 'Норма' END),
        ('slow_queries', v_slow_queries,
         CASE WHEN v_slow_queries > 10 THEN 'WARNING' ELSE 'OK' END,
         CASE WHEN v_slow_queries > 10 THEN 'Оптимизировать медленные запросы' ELSE 'Норма' END),
        ('cache_hit_ratio', v_cache_hit_ratio,
         CASE WHEN v_cache_hit_ratio < 95 THEN 'WARNING' ELSE 'OK' END,
         CASE WHEN v_cache_hit_ratio < 95 THEN 'Увеличить shared_buffers' ELSE 'Норма' END);
END;
$$;

-- =====================================================
-- ПЛАНИРОВЩИК ЗАДАЧ
-- =====================================================

-- Основная процедура maintenance (запускать по расписанию)
CREATE OR REPLACE FUNCTION daily_maintenance()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_result TEXT := '';
BEGIN
    -- Очистка старых данных
    v_result := v_result || cleanup_old_data() || E'\n';
    
    -- Обновление трендовых тегов
    PERFORM update_trending_tags();
    v_result := v_result || 'Обновлены трендовые теги' || E'\n';
    
    -- Обновление статистики пользователей
    v_result := v_result || 'Обновлено пользователей: ' || 
                bulk_update_user_stats() || E'\n';
    
    -- Обновление статистики таблиц
    v_result := v_result || update_table_statistics() || E'\n';
    
    -- Архивирование старых данных
    v_result := v_result || intelligent_archive_data() || E'\n';
    
    -- VACUUM для важных таблиц
    VACUUM ANALYZE "Message", "Content", "User", "WatchHistory";
    v_result := v_result || 'Выполнен VACUUM для основных таблиц' || E'\n';
    
    RETURN v_result;
END;
$$;

-- Еженедельная процедура maintenance
CREATE OR REPLACE FUNCTION weekly_maintenance()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_result TEXT := '';
BEGIN
    -- Полное обновление статистики
    ANALYZE;
    v_result := v_result || 'Выполнен полный ANALYZE' || E'\n';
    
    -- Создание партиций на следующие месяцы
    v_result := v_result || create_monthly_partitions('MessageArchive') || E'\n';
    v_result := v_result || create_monthly_partitions('ContentArchive') || E'\n';
    
    -- Переиндексация критичных индексов
    REINDEX INDEX CONCURRENTLY idx_message_chat_created_partial;
    REINDEX INDEX CONCURRENTLY idx_content_author_published_partial;
    v_result := v_result || 'Переиндексированы критичные индексы' || E'\n';
    
    RETURN v_result;
END;
$$;
