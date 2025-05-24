-- Скрипт оптимизации базы данных для максимальной производительности
-- Применять поэтапно для минимизации простоя

-- ================================================
-- ЭТАП 1: СОЗДАНИЕ ОПТИМИЗИРОВАННЫХ ТАБЛИЦ
-- ================================================

-- Создание таблицы для битовых флагов пользователей
CREATE TABLE user_flags_mapping (
    user_id BIGINT PRIMARY KEY,
    flags INTEGER DEFAULT 0,
    -- flags битовая маска:
    -- 1: isVerified
    -- 2: isBot  
    -- 4: isOnline
    -- 8: зарезервировано
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Создание партиционированной таблицы сообщений
CREATE TABLE messages_partitioned (
    id BIGSERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL,
    sender_id BIGINT NOT NULL,
    content BYTEA NOT NULL,
    header BYTEA NOT NULL,
    message_type INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    flags INTEGER DEFAULT 0,
    deleted_at TIMESTAMPTZ,
    reply_to_id BIGINT,
    forwarded_from_id BIGINT,
    partition_key VARCHAR(7) GENERATED ALWAYS AS (TO_CHAR(created_at, 'YYYY-MM')) STORED
) PARTITION BY RANGE (created_at);

-- Создание партиций для текущего и следующих месяцев
DO $$
DECLARE
    start_date DATE;
    end_date DATE;
    partition_name TEXT;
BEGIN
    -- Создаем партиции на 12 месяцев вперед
    FOR i IN 0..11 LOOP
        start_date := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '%s months');
        end_date := start_date + INTERVAL '1 month';
        partition_name := 'messages_' || TO_CHAR(start_date, 'YYYY_MM');
        
        EXECUTE FORMAT('CREATE TABLE %I PARTITION OF messages_partitioned 
                       FOR VALUES FROM (%L) TO (%L)',
                       partition_name, start_date, end_date);
        
        -- Создаем индексы для каждой партиции
        EXECUTE FORMAT('CREATE INDEX %I ON %I (chat_id, created_at)',
                       partition_name || '_chat_time_idx', partition_name);
        EXECUTE FORMAT('CREATE INDEX %I ON %I (sender_id, created_at)',
                       partition_name || '_sender_time_idx', partition_name);
    END LOOP;
END $$;

-- ================================================
-- ЭТАП 2: СОЗДАНИЕ ОПТИМИЗИРОВАННЫХ ИНДЕКСОВ
-- ================================================

-- Удаление неэффективных индексов
DROP INDEX IF EXISTS "User_isOnline_lastSeen_idx";
DROP INDEX IF EXISTS "User_status_isOnline_idx";

-- Создание составных индексов для частых запросов
CREATE INDEX CONCURRENTLY "User_status_flags_idx" ON "User" (status, 
    CASE WHEN "isVerified" THEN 1 ELSE 0 END +
    CASE WHEN "isBot" THEN 2 ELSE 0 END +
    CASE WHEN "isOnline" THEN 4 ELSE 0 END
);

-- Частичные индексы для активных пользователей
CREATE INDEX CONCURRENTLY "User_active_lastSeen_idx" 
ON "User" ("lastSeen") 
WHERE status = 'ACTIVE' AND "deletedAt" IS NULL;

-- Индекс для быстрого поиска онлайн пользователей
CREATE INDEX CONCURRENTLY "User_online_idx" 
ON "User" (id) 
WHERE "isOnline" = true AND status = 'ACTIVE';

-- ================================================
-- ЭТАП 3: СОЗДАНИЕ МАТЕРИАЛИЗОВАННЫХ ПРЕДСТАВЛЕНИЙ
-- ================================================

-- Кэш статистики чатов
CREATE MATERIALIZED VIEW chat_stats_cache AS
SELECT 
    c.id as chat_id,
    COUNT(m.id) as message_count,
    COUNT(DISTINCT cp.user_id) as participant_count,
    MAX(m.created_at) as last_activity,
    COALESCE(SUM(ma.file_size), 0) as storage_bytes
FROM "Chat" c
LEFT JOIN "Message" m ON c.id = m.chat_id AND m.deleted = false
LEFT JOIN "ChatParticipant" cp ON c.id = cp.chat_id AND cp.left_at IS NULL
LEFT JOIN "MessageAttachment" ma ON m.id = ma.message_id
GROUP BY c.id;

CREATE UNIQUE INDEX ON chat_stats_cache (chat_id);
CREATE INDEX ON chat_stats_cache (last_activity);

-- Кэш статистики пользователей
CREATE MATERIALIZED VIEW user_stats_cache AS
SELECT 
    u.id as user_id,
    COUNT(m.id) as messages_sent,
    COUNT(DISTINCT cp.chat_id) as chats_count,
    COUNT(DISTINCT cl.contact_id) as contacts_count,
    COALESCE(SUM(ma.file_size), 0) as storage_used,
    MAX(m.created_at) as last_activity
FROM "User" u
LEFT JOIN "Message" m ON u.id = m.sender_id AND m.deleted = false
LEFT JOIN "ChatParticipant" cp ON u.id = cp.user_id AND cp.left_at IS NULL
LEFT JOIN "ContactList" cl ON u.id = cl.user_id AND cl.is_blocked = false
LEFT JOIN "MessageAttachment" ma ON m.id = ma.message_id
GROUP BY u.id;

CREATE UNIQUE INDEX ON user_stats_cache (user_id);
CREATE INDEX ON user_stats_cache (last_activity);

-- ================================================
-- ЭТАП 4: ФУНКЦИИ ДЛЯ АВТОМАТИЧЕСКОГО ОБНОВЛЕНИЯ
-- ================================================

-- Функция для обновления кэша статистики чата
CREATE OR REPLACE FUNCTION refresh_chat_stats(chat_id_param BIGINT)
RETURNS VOID AS $$
BEGIN
    DELETE FROM chat_stats_cache WHERE chat_id = chat_id_param;
    
    INSERT INTO chat_stats_cache
    SELECT 
        chat_id_param,
        COUNT(m.id),
        COUNT(DISTINCT cp.user_id),
        MAX(m.created_at),
        COALESCE(SUM(ma.file_size), 0)
    FROM "Chat" c
    LEFT JOIN "Message" m ON c.id = m.chat_id AND m.deleted = false
    LEFT JOIN "ChatParticipant" cp ON c.id = cp.chat_id AND cp.left_at IS NULL
    LEFT JOIN "MessageAttachment" ma ON m.id = ma.message_id
    WHERE c.id = chat_id_param
    GROUP BY c.id;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического обновления статистики при новых сообщениях
CREATE OR REPLACE FUNCTION update_chat_stats_trigger()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM refresh_chat_stats(NEW.chat_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER message_stats_update
    AFTER INSERT ON "Message"
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_stats_trigger();

-- ================================================
-- ЭТАП 5: АРХИВИРОВАНИЕ СТАРЫХ ДАННЫХ
-- ================================================

-- Создание таблицы для архивных сообщений
CREATE TABLE message_archive (
    id BIGSERIAL PRIMARY KEY,
    original_id BIGINT NOT NULL,
    chat_id BIGINT NOT NULL,
    sender_id BIGINT NOT NULL,
    content BYTEA NOT NULL, -- сжатый контент
    message_type INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    archive_date TIMESTAMPTZ DEFAULT NOW(),
    compression_type VARCHAR(16) DEFAULT 'gzip'
);

CREATE INDEX ON message_archive (chat_id, created_at);
CREATE INDEX ON message_archive (original_id);
CREATE INDEX ON message_archive (archive_date);

-- Функция для архивирования старых сообщений
CREATE OR REPLACE FUNCTION archive_old_messages(days_old INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
    archived_count INTEGER;
BEGIN
    -- Перемещаем сообщения старше указанного количества дней в архив
    WITH archived AS (
        INSERT INTO message_archive (original_id, chat_id, sender_id, content, message_type, created_at)
        SELECT id, chat_id, sender_id, content, 
               CASE message_type
                   WHEN 'TEXT' THEN 0
                   WHEN 'IMAGE' THEN 1
                   WHEN 'VIDEO' THEN 2
                   WHEN 'AUDIO' THEN 3
                   WHEN 'DOCUMENT' THEN 4
                   ELSE 0
               END,
               created_at
        FROM "Message"
        WHERE created_at < NOW() - INTERVAL '%s days'
        AND deleted = false
        RETURNING original_id
    ),
    deleted AS (
        DELETE FROM "Message"
        WHERE id IN (SELECT original_id FROM archived)
        RETURNING id
    )
    SELECT COUNT(*) INTO archived_count FROM deleted;
    
    RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- ЭТАП 6: ОПТИМИЗАЦИЯ СУЩЕСТВУЮЩИХ ТАБЛИЦ
-- ================================================

-- Сжатие таблиц для экономии места
ALTER TABLE "User" SET (fillfactor = 90);
ALTER TABLE "Message" SET (fillfactor = 80);
ALTER TABLE "Chat" SET (fillfactor = 95);

-- Настройка автовакуума для критических таблиц
ALTER TABLE "Message" SET (
    autovacuum_vacuum_scale_factor = 0.1,
    autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE "User" SET (
    autovacuum_vacuum_scale_factor = 0.2,
    autovacuum_analyze_scale_factor = 0.1
);

-- ================================================
-- ЭТАП 7: СОЗДАНИЕ ФУНКЦИЙ ДЛЯ ОПТИМИЗИРОВАННЫХ ЗАПРОСОВ
-- ================================================

-- Функция для быстрого получения последних сообщений чата
CREATE OR REPLACE FUNCTION get_recent_messages(
    chat_id_param BIGINT,
    limit_param INTEGER DEFAULT 50,
    offset_param INTEGER DEFAULT 0
)
RETURNS TABLE (
    id BIGINT,
    sender_id BIGINT,
    content BYTEA,
    message_type TEXT,
    created_at TIMESTAMPTZ,
    reply_to_id BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.sender_id,
        m.content,
        m.message_type::TEXT,
        m.created_at,
        m.reply_to_id
    FROM "Message" m
    WHERE m.chat_id = chat_id_param 
    AND m.deleted = false
    ORDER BY m.created_at DESC
    LIMIT limit_param OFFSET offset_param;
END;
$$ LANGUAGE plpgsql;

-- Функция для быстрого поиска пользователей
CREATE OR REPLACE FUNCTION search_users(
    search_query TEXT,
    limit_param INTEGER DEFAULT 20
)
RETURNS TABLE (
    id BIGINT,
    username TEXT,
    full_name TEXT,
    avatar_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id::BIGINT,
        u.username,
        u.full_name,
        u.avatar_url
    FROM "User" u
    WHERE u.status = 'ACTIVE'
    AND u.deleted_at IS NULL
    AND (
        u.username ILIKE '%' || search_query || '%' OR
        u.full_name ILIKE '%' || search_query || '%' OR
        u.email ILIKE '%' || search_query || '%'
    )
    ORDER BY 
        CASE WHEN u.username ILIKE search_query || '%' THEN 1 ELSE 2 END,
        u.username
    LIMIT limit_param;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- ЭТАП 8: СОЗДАНИЕ ПРОЦЕДУР ОБСЛУЖИВАНИЯ
-- ================================================

-- Процедура для еженедельного обслуживания
CREATE OR REPLACE FUNCTION weekly_maintenance()
RETURNS VOID AS $$
BEGIN
    -- Обновляем статистику таблиц
    ANALYZE "User";
    ANALYZE "Message";
    ANALYZE "Chat";
    ANALYZE "ChatParticipant";
    
    -- Обновляем материализованные представления
    REFRESH MATERIALIZED VIEW CONCURRENTLY chat_stats_cache;
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats_cache;
    
    -- Архивируем старые сообщения (старше года)
    PERFORM archive_old_messages(365);
    
    -- Очищаем истекшие токены
    DELETE FROM "RefreshTokenBlacklist" WHERE expires_at < NOW();
    
    -- Очищаем старые сессии
    DELETE FROM "Session" WHERE expires_at IS NOT NULL AND expires_at < NOW();
    
    RAISE NOTICE 'Weekly maintenance completed';
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- ЭТАП 9: НАСТРОЙКА МОНИТОРИНГА ПРОИЗВОДИТЕЛЬНОСТИ
-- ================================================

-- Создание таблицы для мониторинга медленных запросов
CREATE TABLE query_performance_log (
    id SERIAL PRIMARY KEY,
    query_hash VARCHAR(32) NOT NULL,
    query_text TEXT,
    execution_time_ms REAL NOT NULL,
    rows_examined BIGINT,
    rows_returned BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON query_performance_log (query_hash);
CREATE INDEX ON query_performance_log (execution_time_ms);
CREATE INDEX ON query_performance_log (created_at);

-- Функция для логирования медленных запросов
CREATE OR REPLACE FUNCTION log_slow_query(
    query_text_param TEXT,
    execution_time_param REAL,
    rows_examined_param BIGINT DEFAULT NULL,
    rows_returned_param BIGINT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    -- Логируем только запросы медленнее 100ms
    IF execution_time_param > 100 THEN
        INSERT INTO query_performance_log (
            query_hash, query_text, execution_time_ms, 
            rows_examined, rows_returned
        ) VALUES (
            MD5(query_text_param), query_text_param, execution_time_param,
            rows_examined_param, rows_returned_param
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- ЭТАП 10: РЕКОМЕНДАЦИИ ПО НАСТРОЙКЕ POSTGRESQL
-- ================================================

/*
Рекомендуемые настройки postgresql.conf для оптимальной производительности:

# Память
shared_buffers = 25% от RAM
effective_cache_size = 75% от RAM
work_mem = 256MB
maintenance_work_mem = 1GB

# Checkpoint
checkpoint_completion_target = 0.9
wal_buffers = 16MB
checkpoint_timeout = 10min
max_wal_size = 4GB

# Планировщик
random_page_cost = 1.1
effective_io_concurrency = 200

# Автовакуум
autovacuum = on
autovacuum_max_workers = 4
autovacuum_naptime = 30s

# Логирование медленных запросов
log_min_duration_statement = 100ms
log_statement = 'mod'
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '

# Подключения
max_connections = 200
*/

-- Команды для запуска оптимизации:
-- 1. psql -d your_database -f optimization_script.sql
-- 2. Настроить cron для еженедельного обслуживания:
--    0 2 * * 0 psql -d your_database -c "SELECT weekly_maintenance();"
