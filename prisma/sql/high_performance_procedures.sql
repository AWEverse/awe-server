-- =====================================================
-- ВЫСОКОПРОИЗВОДИТЕЛЬНЫЕ ПРОЦЕДУРЫ И ФУНКЦИИ
-- Мультимедийная платформа AWE
-- =====================================================

-- Включаем расширения для улучшения производительности
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- =====================================================
-- ПОЛЬЗОВАТЕЛИ И АУТЕНТИФИКАЦИЯ
-- =====================================================

-- Быстрое создание пользователя с криптографическими ключами
CREATE OR REPLACE FUNCTION create_user_with_crypto(
    p_email VARCHAR(254),
    p_username VARCHAR(32),
    p_password_hash VARCHAR(128),
    p_full_name VARCHAR(128) DEFAULT NULL,
    p_phone_number VARCHAR(15) DEFAULT NULL,
    p_identity_key_public VARCHAR(128) DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id BIGINT;
    v_crypto_id UUID;
BEGIN
    -- Вставляем пользователя
    INSERT INTO "User" (
        email, username, "passwordHash", "fullName", "phoneNumber",
        "searchVector", "roleId"
    ) VALUES (
        p_email, p_username, p_password_hash, p_full_name, p_phone_number,
        to_tsvector('english', COALESCE(p_full_name, '') || ' ' || p_username),
        1
    ) RETURNING id INTO v_user_id;

    -- Создаем криптографические ключи если предоставлены
    IF p_identity_key_public IS NOT NULL THEN
        INSERT INTO "UserCrypto" (
            "userId", "identityKeyPublic"
        ) VALUES (
            v_user_id, p_identity_key_public
        ) RETURNING id INTO v_crypto_id;
    END IF;

    -- Создаем настройки по умолчанию
    INSERT INTO "UserSettings" ("userId", "uiSettings", "notifications", "privacy")
    VALUES (
        v_user_id,
        '{"theme": "auto", "language": "en", "fontSize": "medium"}',
        '{"enabled": true, "sound": true, "vibration": false}',
        '{"lastSeen": "everyone", "profilePhoto": "everyone"}'
    );

    RETURN v_user_id;
END;
$$;

-- Быстрый поиск пользователей с полнотекстовым поиском
CREATE OR REPLACE FUNCTION search_users(
    p_query TEXT,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
) RETURNS TABLE(
    id BIGINT,
    username VARCHAR(32),
    "fullName" VARCHAR(128),
    "avatarUrl" VARCHAR(512),
    "subscribersCount" INTEGER,
    rank REAL
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.username,
        u."fullName",
        u."avatarUrl",
        u."subscribersCount",
        ts_rank(u."searchVector", plainto_tsquery('english', p_query)) as rank
    FROM "User" u
    WHERE 
        u.status = 'ACTIVE' 
        AND u."deletedAt" IS NULL
        AND (
            u."searchVector" @@ plainto_tsquery('english', p_query)
            OR u.username ILIKE '%' || p_query || '%'
            OR u."fullName" ILIKE '%' || p_query || '%'
        )
    ORDER BY 
        ts_rank(u."searchVector", plainto_tsquery('english', p_query)) DESC,
        u."subscribersCount" DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Обновление статистики пользователя
CREATE OR REPLACE FUNCTION update_user_stats(p_user_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE "User" 
    SET 
        "subscribersCount" = (
            SELECT COUNT(*) FROM "Subscription" 
            WHERE "subscribedToId" = p_user_id
        ),
        "subscriptionsCount" = (
            SELECT COUNT(*) FROM "Subscription" 
            WHERE "subscriberId" = p_user_id
        ),
        "videosCount" = (
            SELECT COUNT(*) FROM "Content" 
            WHERE "authorId" = p_user_id AND type IN ('VIDEO', 'SHORT_VIDEO', 'LIVE_STREAM')
        ),
        "postsCount" = (
            SELECT COUNT(*) FROM "Content" 
            WHERE "authorId" = p_user_id AND type IN ('IMAGE_POST', 'TEXT_POST')
        ),
        "totalViews" = (
            SELECT COALESCE(SUM("viewsCount"), 0) FROM "Content" 
            WHERE "authorId" = p_user_id
        ),
        "totalLikes" = (
            SELECT COALESCE(SUM("likesCount"), 0) FROM "Content" 
            WHERE "authorId" = p_user_id
        )
    WHERE id = p_user_id;
END;
$$;

-- =====================================================
-- МЕССЕНДЖЕР
-- =====================================================

-- Создание чата с первичными участниками
CREATE OR REPLACE FUNCTION create_chat_with_participants(
    p_type "ChatType",
    p_created_by_id BIGINT,
    p_title VARCHAR(128) DEFAULT NULL,
    p_participant_ids BIGINT[] DEFAULT NULL,
    p_is_public BOOLEAN DEFAULT FALSE
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_chat_id BIGINT;
    v_participant_id BIGINT;
    v_flags INTEGER := 0;
BEGIN
    -- Устанавливаем флаги
    IF p_is_public THEN
        v_flags := v_flags | 2; -- public flag
    END IF;

    -- Создаем чат
    INSERT INTO "Chat" (
        type, "createdById", title, flags, "memberCount"
    ) VALUES (
        p_type, p_created_by_id, p_title, v_flags,
        CASE WHEN p_participant_ids IS NOT NULL THEN array_length(p_participant_ids, 1) + 1 ELSE 1 END
    ) RETURNING id INTO v_chat_id;

    -- Добавляем создателя как владельца
    INSERT INTO "ChatParticipant" (
        "chatId", "userId", role, flags
    ) VALUES (
        v_chat_id, p_created_by_id, 'OWNER', 2 -- owner flag
    );

    -- Добавляем участников
    IF p_participant_ids IS NOT NULL THEN
        FOREACH v_participant_id IN ARRAY p_participant_ids
        LOOP
            INSERT INTO "ChatParticipant" (
                "chatId", "userId", role
            ) VALUES (
                v_chat_id, v_participant_id, 'MEMBER'
            );
        END LOOP;
    END IF;

    RETURN v_chat_id;
END;
$$;

-- Отправка сообщения с автоматическим обновлением чата
CREATE OR REPLACE FUNCTION send_message(
    p_chat_id BIGINT,
    p_sender_id BIGINT,
    p_content BYTEA,
    p_header BYTEA,
    p_message_type "MessageType" DEFAULT 'TEXT',
    p_reply_to_id BIGINT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_message_id BIGINT;
    v_last_message_text VARCHAR(100);
BEGIN
    -- Проверяем права участника
    IF NOT EXISTS (
        SELECT 1 FROM "ChatParticipant" 
        WHERE "chatId" = p_chat_id 
        AND "userId" = p_sender_id 
        AND "leftAt" IS NULL
        AND (flags & 8) = 0 -- не забанен
    ) THEN
        RAISE EXCEPTION 'Пользователь не может отправлять сообщения в этот чат';
    END IF;

    -- Создаем сообщение
    INSERT INTO "Message" (
        "chatId", "senderId", content, header, "messageType", "replyToId"
    ) VALUES (
        p_chat_id, p_sender_id, p_content, p_header, p_message_type, p_reply_to_id
    ) RETURNING id INTO v_message_id;

    -- Подготавливаем превью для текстовых сообщений
    IF p_message_type = 'TEXT' THEN
        v_last_message_text := LEFT(convert_from(p_content, 'UTF8'), 100);
    ELSE
        v_last_message_text := '[' || p_message_type::text || ']';
    END IF;

    -- Обновляем статистику чата
    UPDATE "Chat" 
    SET 
        "lastMessageAt" = NOW(),
        "lastMessageText" = v_last_message_text,
        "updatedAt" = NOW()
    WHERE id = p_chat_id;

    RETURN v_message_id;
END;
$$;

-- Получение сообщений чата с пагинацией
CREATE OR REPLACE FUNCTION get_chat_messages(
    p_chat_id BIGINT,
    p_user_id BIGINT,
    p_limit INTEGER DEFAULT 50,
    p_before_message_id BIGINT DEFAULT NULL
) RETURNS TABLE(
    id BIGINT,
    "senderId" BIGINT,
    content BYTEA,
    header BYTEA,
    "messageType" "MessageType",
    "createdAt" TIMESTAMPTZ,
    "replyToId" BIGINT,
    sender_username VARCHAR(32),
    sender_avatar VARCHAR(512)
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Проверяем доступ к чату
    IF NOT EXISTS (
        SELECT 1 FROM "ChatParticipant" 
        WHERE "chatId" = p_chat_id AND "userId" = p_user_id
    ) THEN
        RAISE EXCEPTION 'Нет доступа к этому чату';
    END IF;

    RETURN QUERY
    SELECT 
        m.id,
        m."senderId",
        m.content,
        m.header,
        m."messageType",
        m."createdAt",
        m."replyToId",
        u.username,
        u."avatarUrl"
    FROM "Message" m
    INNER JOIN "User" u ON m."senderId" = u.id
    WHERE 
        m."chatId" = p_chat_id
        AND (m.flags & 1) = 0 -- не удалено
        AND (p_before_message_id IS NULL OR m.id < p_before_message_id)
    ORDER BY m.id DESC
    LIMIT p_limit;
END;
$$;

-- Массовое отмечивание сообщений как прочитанных
CREATE OR REPLACE FUNCTION mark_messages_read(
    p_chat_id BIGINT,
    p_user_id BIGINT,
    p_up_to_message_id BIGINT
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_affected_count INTEGER;
BEGIN
    -- Добавляем записи о прочтении
    INSERT INTO "MessageRead" ("messageId", "userId")
    SELECT m.id, p_user_id
    FROM "Message" m
    WHERE 
        m."chatId" = p_chat_id
        AND m.id <= p_up_to_message_id
        AND m."senderId" != p_user_id
        AND NOT EXISTS (
            SELECT 1 FROM "MessageRead" mr 
            WHERE mr."messageId" = m.id AND mr."userId" = p_user_id
        )
    ON CONFLICT ("messageId", "userId") DO NOTHING;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;
    RETURN v_affected_count;
END;
$$;

-- =====================================================
-- КОНТЕНТ И МЕДИА
-- =====================================================

-- Создание контента с автоматическими тегами
CREATE OR REPLACE FUNCTION create_content(
    p_author_id BIGINT,
    p_type "ContentType",
    p_title VARCHAR(200),
    p_description TEXT DEFAULT NULL,
    p_thumbnail_url VARCHAR(300) DEFAULT NULL,
    p_tags VARCHAR(64)[] DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL,
    p_scheduled_at TIMESTAMPTZ DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_content_id BIGINT;
    v_tag_name VARCHAR(64);
    v_tag_id BIGINT;
    v_status "ContentStatus";
BEGIN
    -- Определяем статус
    IF p_scheduled_at IS NOT NULL AND p_scheduled_at > NOW() THEN
        v_status := 'SCHEDULED';
    ELSE
        v_status := 'PUBLISHED';
    END IF;

    -- Создаем контент
    INSERT INTO "Content" (
        "authorId", type, status, title, description, 
        "thumbnailUrl", metadata, "scheduledAt", "publishedAt"
    ) VALUES (
        p_author_id, p_type, v_status, p_title, p_description,
        p_thumbnail_url, p_metadata, p_scheduled_at,
        CASE WHEN v_status = 'PUBLISHED' THEN NOW() ELSE NULL END
    ) RETURNING id INTO v_content_id;

    -- Добавляем теги
    IF p_tags IS NOT NULL THEN
        FOREACH v_tag_name IN ARRAY p_tags
        LOOP
            -- Ищем или создаем тег
            INSERT INTO "Tag" (name)
            VALUES (LOWER(TRIM(v_tag_name)))
            ON CONFLICT (name) DO UPDATE SET "usageCount" = "Tag"."usageCount" + 1
            RETURNING id INTO v_tag_id;

            -- Связываем с контентом
            INSERT INTO "ContentTag" ("contentId", "tagId")
            VALUES (v_content_id, v_tag_id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    -- Обновляем статистику автора
    PERFORM update_user_stats(p_author_id);

    RETURN v_content_id;
END;
$$;

-- Инкремент просмотров с аналитикой
CREATE OR REPLACE FUNCTION increment_content_view(
    p_content_id BIGINT,
    p_user_id BIGINT DEFAULT NULL,
    p_watch_time INTEGER DEFAULT 0,
    p_completed BOOLEAN DEFAULT FALSE
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_progress FLOAT := 0;
    v_duration INTEGER;
BEGIN
    -- Обновляем счетчик просмотров контента
    UPDATE "Content" 
    SET "viewsCount" = "viewsCount" + 1
    WHERE id = p_content_id;

    -- Если пользователь авторизован, записываем в историю
    IF p_user_id IS NOT NULL THEN
        -- Вычисляем прогресс просмотра
        SELECT CAST(metadata->>'duration' AS INTEGER) INTO v_duration
        FROM "Content" WHERE id = p_content_id;
        
        IF v_duration > 0 AND p_watch_time > 0 THEN
            v_progress := LEAST(p_watch_time::FLOAT / v_duration, 1.0);
        END IF;

        -- Обновляем или создаем запись в истории
        INSERT INTO "WatchHistory" (
            "userId", "contentId", "watchTime", completed, progress
        ) VALUES (
            p_user_id, p_content_id, p_watch_time, p_completed, v_progress
        )
        ON CONFLICT ("userId", "contentId") DO UPDATE SET
            "watchedAt" = NOW(),
            "watchTime" = GREATEST("WatchHistory"."watchTime", p_watch_time),
            completed = p_completed OR "WatchHistory".completed,
            progress = GREATEST("WatchHistory".progress, v_progress);
    END IF;

    -- Обновляем кэш статистики контента
    INSERT INTO "ContentStatsCache" ("contentId", "lastUpdated")
    VALUES (p_content_id, NOW())
    ON CONFLICT ("contentId") DO UPDATE SET "lastUpdated" = NOW();
END;
$$;

-- Получение рекомендаций контента
CREATE OR REPLACE FUNCTION get_content_recommendations(
    p_user_id BIGINT,
    p_limit INTEGER DEFAULT 20,
    p_content_types "ContentType"[] DEFAULT NULL
) RETURNS TABLE(
    id BIGINT,
    title VARCHAR(200),
    "thumbnailUrl" VARCHAR(300),
    "authorId" BIGINT,
    author_username VARCHAR(32),
    "viewsCount" BIGINT,
    "createdAt" TIMESTAMPTZ,
    recommendation_score FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_tags BIGINT[];
    v_subscribed_authors BIGINT[];
BEGIN
    -- Получаем теги из истории просмотров пользователя
    SELECT ARRAY_AGG(DISTINCT ct."tagId")
    INTO v_user_tags
    FROM "WatchHistory" wh
    JOIN "ContentTag" ct ON wh."contentId" = ct."contentId"
    WHERE wh."userId" = p_user_id
    AND wh."watchedAt" > NOW() - INTERVAL '30 days'
    LIMIT 100;

    -- Получаем авторов подписок
    SELECT ARRAY_AGG(s."subscribedToId")
    INTO v_subscribed_authors
    FROM "Subscription" s
    WHERE s."subscriberId" = p_user_id;

    RETURN QUERY
    WITH content_scores AS (
        SELECT 
            c.id,
            c.title,
            c."thumbnailUrl",
            c."authorId",
            u.username as author_username,
            c."viewsCount",
            c."createdAt",
            -- Алгоритм рекомендаций
            (
                -- Базовый вес по популярности (логарифмический)
                LOG(GREATEST(c."viewsCount", 1)) * 0.3 +
                
                -- Вес по свежести
                EXTRACT(EPOCH FROM (NOW() - c."publishedAt")) / -86400.0 * 0.2 +
                
                -- Вес по подпискам
                CASE WHEN c."authorId" = ANY(v_subscribed_authors) THEN 2.0 ELSE 0.0 END +
                
                -- Вес по совпадающим тегам
                COALESCE(
                    (SELECT COUNT(*) * 0.5 
                     FROM "ContentTag" ct 
                     WHERE ct."contentId" = c.id 
                     AND ct."tagId" = ANY(v_user_tags)
                    ), 0
                ) +
                
                -- Случайность для разнообразия
                RANDOM() * 0.1
            ) as recommendation_score
        FROM "Content" c
        JOIN "User" u ON c."authorId" = u.id
        WHERE 
            c.status = 'PUBLISHED'
            AND c."deletedAt" IS NULL
            AND (p_content_types IS NULL OR c.type = ANY(p_content_types))
            AND NOT EXISTS (
                SELECT 1 FROM "WatchHistory" wh 
                WHERE wh."userId" = p_user_id 
                AND wh."contentId" = c.id 
                AND wh.completed = true
            )
    )
    SELECT 
        cs.id,
        cs.title,
        cs."thumbnailUrl",
        cs."authorId",
        cs.author_username,
        cs."viewsCount",
        cs."createdAt",
        cs.recommendation_score
    FROM content_scores cs
    ORDER BY cs.recommendation_score DESC
    LIMIT p_limit;
END;
$$;

-- =====================================================
-- ЛАЙКИ И РЕАКЦИИ
-- =====================================================

-- Переключение лайка с обновлением счетчиков
CREATE OR REPLACE FUNCTION toggle_like(
    p_user_id BIGINT,
    p_content_id BIGINT DEFAULT NULL,
    p_comment_id BIGINT DEFAULT NULL,
    p_value INTEGER DEFAULT 1
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_existing_like "Like";
    v_is_new_like BOOLEAN := FALSE;
    v_counter_delta INTEGER := 0;
BEGIN
    -- Проверяем существующий лайк
    SELECT * INTO v_existing_like
    FROM "Like"
    WHERE "userId" = p_user_id
    AND (
        (p_content_id IS NOT NULL AND "contentId" = p_content_id) OR
        (p_comment_id IS NOT NULL AND "commentId" = p_comment_id)
    );

    IF v_existing_like.id IS NOT NULL THEN
        IF v_existing_like.value = p_value THEN
            -- Убираем лайк
            DELETE FROM "Like" WHERE id = v_existing_like.id;
            v_counter_delta := -p_value;
        ELSE
            -- Меняем тип лайка
            UPDATE "Like" 
            SET value = p_value, "createdAt" = NOW()
            WHERE id = v_existing_like.id;
            v_counter_delta := p_value - v_existing_like.value;
        END IF;
    ELSE
        -- Создаем новый лайк
        INSERT INTO "Like" ("userId", "contentId", "commentId", value)
        VALUES (p_user_id, p_content_id, p_comment_id, p_value);
        v_counter_delta := p_value;
        v_is_new_like := TRUE;
    END IF;

    -- Обновляем счетчики
    IF p_content_id IS NOT NULL THEN
        UPDATE "Content"
        SET 
            "likesCount" = GREATEST("likesCount" + 
                CASE WHEN v_counter_delta > 0 THEN v_counter_delta ELSE 0 END, 0),
            "dislikesCount" = GREATEST("dislikesCount" + 
                CASE WHEN v_counter_delta < 0 THEN -v_counter_delta ELSE 0 END, 0)
        WHERE id = p_content_id;
    ELSIF p_comment_id IS NOT NULL THEN
        UPDATE "Comment"
        SET "likesCount" = GREATEST("likesCount" + v_counter_delta, 0)
        WHERE id = p_comment_id;
    END IF;

    RETURN v_is_new_like;
END;
$$;

-- =====================================================
-- ПОДПИСКИ И УВЕДОМЛЕНИЯ
-- =====================================================

-- Подписка с уведомлением
CREATE OR REPLACE FUNCTION subscribe_to_user(
    p_subscriber_id BIGINT,
    p_subscribed_to_id BIGINT,
    p_notifications_enabled BOOLEAN DEFAULT TRUE
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_is_new_subscription BOOLEAN := FALSE;
    v_flags INTEGER := 0;
BEGIN
    -- Проверяем самоподписку
    IF p_subscriber_id = p_subscribed_to_id THEN
        RAISE EXCEPTION 'Нельзя подписаться на самого себя';
    END IF;

    -- Устанавливаем флаги
    IF p_notifications_enabled THEN
        v_flags := 1;
    END IF;

    -- Создаем подписку
    INSERT INTO "Subscription" ("subscriberId", "subscribedToId", flags)
    VALUES (p_subscriber_id, p_subscribed_to_id, v_flags)
    ON CONFLICT ("subscriberId", "subscribedToId") DO NOTHING;

    GET DIAGNOSTICS v_is_new_subscription = ROW_COUNT;

    -- Обновляем счетчики
    IF v_is_new_subscription THEN
        UPDATE "User" 
        SET "subscribersCount" = "subscribersCount" + 1
        WHERE id = p_subscribed_to_id;

        UPDATE "User" 
        SET "subscriptionsCount" = "subscriptionsCount" + 1
        WHERE id = p_subscriber_id;

        -- Создаем уведомление
        INSERT INTO "Notification" (
            "userId", type, title, message, data
        ) VALUES (
            p_subscribed_to_id,
            'FOLLOW',
            'Новый подписчик',
            (SELECT username FROM "User" WHERE id = p_subscriber_id) || ' подписался на ваш канал',
            jsonb_build_object('subscriberId', p_subscriber_id)
        );
    END IF;

    RETURN v_is_new_subscription;
END;
$$;

-- =====================================================
-- ФОРУМ
-- =====================================================

-- Создание поста форума с автоиндексированием
CREATE OR REPLACE FUNCTION create_forum_post(
    p_category_id BIGINT,
    p_author_id BIGINT,
    p_title VARCHAR(200),
    p_content TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_post_id BIGINT;
BEGIN
    -- Создаем пост
    INSERT INTO "ForumPost" (
        "categoryId", "authorId", title, content
    ) VALUES (
        p_category_id, p_author_id, p_title, p_content
    ) RETURNING id INTO v_post_id;

    -- Обновляем счетчик в категории
    UPDATE "ForumCategory"
    SET "postsCount" = "postsCount" + 1
    WHERE id = p_category_id;

    -- Автоподписка автора на пост
    INSERT INTO "ForumSubscription" ("userId", "postId")
    VALUES (p_author_id, v_post_id);

    RETURN v_post_id;
END;
$$;

-- Ответ на пост форума с уведомлениями
CREATE OR REPLACE FUNCTION create_forum_reply(
    p_post_id BIGINT,
    p_author_id BIGINT,
    p_content TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_reply_id BIGINT;
    v_subscriber_id BIGINT;
    v_post_title VARCHAR(200);
    v_author_username VARCHAR(32);
BEGIN
    -- Получаем информацию о посте
    SELECT title INTO v_post_title
    FROM "ForumPost" WHERE id = p_post_id;

    SELECT username INTO v_author_username
    FROM "User" WHERE id = p_author_id;

    -- Создаем ответ
    INSERT INTO "ForumReply" (
        "postId", "authorId", content
    ) VALUES (
        p_post_id, p_author_id, p_content
    ) RETURNING id INTO v_reply_id;

    -- Обновляем статистику поста
    UPDATE "ForumPost"
    SET 
        "repliesCount" = "repliesCount" + 1,
        "lastReplyAt" = NOW(),
        "updatedAt" = NOW()
    WHERE id = p_post_id;

    -- Отправляем уведомления подписчикам
    FOR v_subscriber_id IN 
        SELECT "userId" FROM "ForumSubscription" 
        WHERE "postId" = p_post_id AND "userId" != p_author_id
    LOOP
        INSERT INTO "Notification" (
            "userId", type, title, message, data
        ) VALUES (
            v_subscriber_id,
            'COMMENT',
            'Новый ответ в форуме',
            v_author_username || ' ответил в теме "' || v_post_title || '"',
            jsonb_build_object('postId', p_post_id, 'replyId', v_reply_id)
        );
    END LOOP;

    RETURN v_reply_id;
END;
$$;

-- =====================================================
-- АНАЛИТИКА И КЭШИРОВАНИЕ
-- =====================================================

-- Обновление трендовых тегов
CREATE OR REPLACE FUNCTION update_trending_tags(
    p_region VARCHAR(8) DEFAULT NULL,
    p_hours_back INTEGER DEFAULT 24
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_trending_data JSONB;
BEGIN
    -- Вычисляем трендовые теги на основе использования
    WITH trending_tags AS (
        SELECT 
            t.id,
            t.name,
            COUNT(c.id) as recent_usage,
            AVG(c."viewsCount") as avg_views
        FROM "Tag" t
        JOIN "ContentTag" ct ON t.id = ct."tagId"
        JOIN "Content" c ON ct."contentId" = c.id
        WHERE c."publishedAt" > NOW() - (p_hours_back || ' hours')::INTERVAL
        AND c.status = 'PUBLISHED'
        GROUP BY t.id, t.name
        HAVING COUNT(c.id) >= 3
        ORDER BY 
            (COUNT(c.id) * 0.7 + AVG(c."viewsCount") * 0.3) DESC
        LIMIT 50
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'name', name,
            'usage', recent_usage,
            'avgViews', avg_views
        )
    ) INTO v_trending_data
    FROM trending_tags;

    -- Сохраняем в кэш
    INSERT INTO "TrendingCache" (type, data, region, "expiresAt")
    VALUES (
        'tags',
        v_trending_data,
        p_region,
        NOW() + INTERVAL '1 hour'
    )
    ON CONFLICT (type, COALESCE(region, ''))
    DO UPDATE SET
        data = v_trending_data,
        "expiresAt" = NOW() + INTERVAL '1 hour',
        "createdAt" = NOW();
END;
$$;

-- Очистка устаревших данных
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_deleted_count INTEGER;
    v_result TEXT := '';
BEGIN
    -- Очищаем истекшие refresh токены
    DELETE FROM "RefreshTokenBlacklist" 
    WHERE "expiresAt" < NOW();
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    v_result := v_result || 'Удалено токенов: ' || v_deleted_count || E'\n';

    -- Очищаем устаревший search cache
    DELETE FROM "SearchCache" 
    WHERE "expiresAt" < NOW();
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    v_result := v_result || 'Удалено search cache: ' || v_deleted_count || E'\n';

    -- Очищаем устаревший trending cache
    DELETE FROM "TrendingCache" 
    WHERE "expiresAt" < NOW();
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    v_result := v_result || 'Удалено trending cache: ' || v_deleted_count || E'\n';

    -- Архивируем старые сообщения (старше 1 года)
    WITH archived_messages AS (
        DELETE FROM "Message" 
        WHERE "createdAt" < NOW() - INTERVAL '1 year'
        AND (flags & 1) = 1 -- только помеченные как удаленные
        RETURNING *
    )
    INSERT INTO "MessageArchive" (
        "originalId", "chatId", "senderId", content, 
        "messageType", "createdAt", "compressionType"
    )
    SELECT 
        id, "chatId", "senderId", content,
        "messageType", "createdAt", 'gzip'
    FROM archived_messages;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    v_result := v_result || 'Архивировано сообщений: ' || v_deleted_count || E'\n';

    -- Обновляем статистику таблиц
    ANALYZE;

    RETURN v_result;
END;
$$;

-- =====================================================
-- ИНДЕКСЫ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ
-- =====================================================

-- Партиционированные индексы для больших таблиц
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_chat_created_partial 
ON "Message" ("chatId", "createdAt" DESC) 
WHERE (flags & 1) = 0; -- только не удаленные

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_author_published_partial
ON "Content" ("authorId", "publishedAt" DESC)
WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_search_vector_gin
ON "User" USING gin("searchVector")
WHERE status = 'ACTIVE' AND "deletedAt" IS NULL;

-- Композитные индексы для сложных запросов
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_user_type_created
ON "Notification" ("userId", type, "createdAt" DESC)
WHERE (flags & 1) = 0; -- только непрочитанные

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_watchhistory_user_watched
ON "WatchHistory" ("userId", "watchedAt" DESC);

-- =====================================================
-- ТРИГГЕРЫ ДЛЯ АВТОМАТИЗАЦИИ
-- =====================================================

-- Триггер для обновления search vector пользователей
CREATE OR REPLACE FUNCTION update_user_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW."searchVector" := to_tsvector('english', 
        COALESCE(NEW."fullName", '') || ' ' || 
        COALESCE(NEW.username, '') || ' ' ||
        COALESCE(NEW.bio, '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_search_vector
    BEFORE INSERT OR UPDATE ON "User"
    FOR EACH ROW EXECUTE FUNCTION update_user_search_vector();

-- Триггер для обновления счетчиков участников чата
CREATE OR REPLACE FUNCTION update_chat_member_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE "Chat" SET "memberCount" = "memberCount" + 1 WHERE id = NEW."chatId";
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Если пользователь покинул чат
        IF OLD."leftAt" IS NULL AND NEW."leftAt" IS NOT NULL THEN
            UPDATE "Chat" SET "memberCount" = "memberCount" - 1 WHERE id = NEW."chatId";
        -- Если пользователь вернулся в чат
        ELSIF OLD."leftAt" IS NOT NULL AND NEW."leftAt" IS NULL THEN
            UPDATE "Chat" SET "memberCount" = "memberCount" + 1 WHERE id = NEW."chatId";
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE "Chat" SET "memberCount" = "memberCount" - 1 WHERE id = OLD."chatId";
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_chat_member_count
    AFTER INSERT OR UPDATE OR DELETE ON "ChatParticipant"
    FOR EACH ROW EXECUTE FUNCTION update_chat_member_count();

-- =====================================================
-- ПРЕДСТАВЛЕНИЯ ДЛЯ ЧАСТЫХ ЗАПРОСОВ
-- =====================================================

-- Представление активных чатов пользователя
CREATE OR REPLACE VIEW user_active_chats AS
SELECT 
    c.id,
    c.type,
    c.title,
    c."avatarUrl",
    c."lastMessageAt",
    c."lastMessageText",
    c."memberCount",
    cp."userId",
    cp.role,
    cp."mutedUntil",
    (cp.flags & 4) > 0 as is_muted
FROM "Chat" c
INNER JOIN "ChatParticipant" cp ON c.id = cp."chatId"
WHERE 
    cp."leftAt" IS NULL
    AND c."deletedAt" IS NULL
    AND (cp.flags & 8) = 0; -- не забанен

-- Представление популярного контента
CREATE OR REPLACE VIEW trending_content AS
SELECT 
    c.id,
    c.title,
    c."thumbnailUrl",
    c.type,
    c."viewsCount",
    c."likesCount",
    c."commentsCount",
    c."publishedAt",
    u.username as author_username,
    u."avatarUrl" as author_avatar,
    -- Вычисляем trending score
    (
        LOG(GREATEST(c."viewsCount", 1)) * 0.4 +
        LOG(GREATEST(c."likesCount", 1)) * 0.3 +
        LOG(GREATEST(c."commentsCount", 1)) * 0.2 +
        EXTRACT(EPOCH FROM (NOW() - c."publishedAt")) / -3600.0 * 0.1
    ) as trending_score
FROM "Content" c
INNER JOIN "User" u ON c."authorId" = u.id
WHERE 
    c.status = 'PUBLISHED'
    AND c."deletedAt" IS NULL
    AND c."publishedAt" > NOW() - INTERVAL '7 days';

-- =====================================================
-- ФУНКЦИИ ПОИСКА С ПОЛНОТЕКСТОВЫМ ИНДЕКСОМ
-- =====================================================

-- Умный поиск контента
CREATE OR REPLACE FUNCTION search_content(
    p_query TEXT,
    p_content_types "ContentType"[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
) RETURNS TABLE(
    id BIGINT,
    title VARCHAR(200),
    "thumbnailUrl" VARCHAR(300),
    type "ContentType",
    "authorId" BIGINT,
    author_username VARCHAR(32),
    "viewsCount" BIGINT,
    rank REAL
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.title,
        c."thumbnailUrl",
        c.type,
        c."authorId",
        u.username,
        c."viewsCount",
        (
            ts_rank(to_tsvector('english', c.title || ' ' || COALESCE(c.description, '')), 
                   plainto_tsquery('english', p_query)) * 0.8 +
            CASE WHEN c.title ILIKE '%' || p_query || '%' THEN 0.2 ELSE 0 END
        ) as rank
    FROM "Content" c
    INNER JOIN "User" u ON c."authorId" = u.id
    WHERE 
        c.status = 'PUBLISHED'
        AND c."deletedAt" IS NULL
        AND (p_content_types IS NULL OR c.type = ANY(p_content_types))
        AND (
            to_tsvector('english', c.title || ' ' || COALESCE(c.description, '')) @@ 
            plainto_tsquery('english', p_query)
            OR c.title ILIKE '%' || p_query || '%'
        )
    ORDER BY rank DESC, c."viewsCount" DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;
