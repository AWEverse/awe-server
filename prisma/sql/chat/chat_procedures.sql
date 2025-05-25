-- Оптимизированные SQL процедуры для мессенджера
-- Создание высокопроизводительных функций для работы с чатами и сообщениями

-- Функция для получения списка чатов пользователя с оптимизацией
CREATE OR REPLACE FUNCTION get_user_chats(
  p_user_id BIGINT,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_chat_type TEXT DEFAULT NULL,
  p_search_query TEXT DEFAULT NULL,
  p_only_unread BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  chat_id BIGINT,
  chat_type TEXT,
  title TEXT,
  description TEXT,
  avatar_url TEXT,
  flags INTEGER,
  member_count INTEGER,
  last_message_at TIMESTAMPTZ,
  last_message_text TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  unread_count BIGINT,
  participant_role TEXT,
  participant_flags INTEGER,
  is_muted BOOLEAN,
  last_read_message_id BIGINT
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH user_chats AS (
    SELECT 
      c.id,
      c.type,
      c.title,
      c.description,
      c."avatarUrl",
      c.flags,
      c."memberCount",
      c."lastMessageAt",
      c."lastMessageText",
      c."createdAt",
      c."updatedAt",
      cp.role,
      cp.flags as participant_flags,
      (cp.flags & 2) > 0 as is_muted, -- Проверяем флаг muted
      cp."lastReadMessageId"
    FROM "Chat" c
    INNER JOIN "ChatParticipant" cp ON c.id = cp."chatId"
    WHERE cp."userId" = p_user_id
      AND cp."leftAt" IS NULL
      AND c."deletedAt" IS NULL
      AND (p_chat_type IS NULL OR c.type::text = p_chat_type)
      AND (p_search_query IS NULL OR 
           c.title ILIKE '%' || p_search_query || '%' OR
           c.description ILIKE '%' || p_search_query || '%')
  ),
  chat_unread_counts AS (
    SELECT 
      uc.id as chat_id,
      COALESCE(
        (SELECT COUNT(*)
         FROM "Message" m
         WHERE m."chatId" = uc.id
           AND m.id > COALESCE(uc."lastReadMessageId", 0)
           AND m."senderId" != p_user_id
           AND m."deletedAt" IS NULL), 
        0
      ) as unread_count
    FROM user_chats uc
  )
  SELECT 
    uc.id,
    uc.type::text,
    uc.title,
    uc.description,
    uc."avatarUrl",
    uc.flags,
    uc."memberCount",
    uc."lastMessageAt",
    uc."lastMessageText",
    uc."createdAt",
    uc."updatedAt",
    cuc.unread_count,
    uc.role::text,
    uc.participant_flags,
    uc.is_muted,
    uc."lastReadMessageId"
  FROM user_chats uc
  LEFT JOIN chat_unread_counts cuc ON uc.id = cuc.chat_id
  WHERE (NOT p_only_unread OR cuc.unread_count > 0)
  ORDER BY 
    CASE WHEN uc."lastMessageAt" IS NULL THEN uc."createdAt" ELSE uc."lastMessageAt" END DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Функция для получения сообщений чата с оптимизацией
CREATE OR REPLACE FUNCTION get_chat_messages(
  p_chat_id BIGINT,
  p_user_id BIGINT,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_before_message_id BIGINT DEFAULT NULL,
  p_after_message_id BIGINT DEFAULT NULL,
  p_message_type TEXT DEFAULT NULL,
  p_search_query TEXT DEFAULT NULL
)
RETURNS TABLE (
  message_id BIGINT,
  message_type TEXT,
  content TEXT,
  sender_id BIGINT,
  sender_username TEXT,
  sender_full_name TEXT,
  sender_avatar_url TEXT,
  reply_to_message_id BIGINT,
  thread_id BIGINT,
  flags INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  attachment_count INTEGER,
  reaction_count INTEGER,
  has_user_reaction BOOLEAN,
  is_read BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Проверяем доступ пользователя к чату
  IF NOT EXISTS (
    SELECT 1 FROM "ChatParticipant" 
    WHERE "chatId" = p_chat_id 
      AND "userId" = p_user_id 
      AND "leftAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'User does not have access to this chat';
  END IF;

  RETURN QUERY
  WITH filtered_messages AS (
    SELECT 
      m.id,
      m.type,
      m.content,
      m."senderId",
      m."replyToMessageId",
      m."threadId",
      m.flags,
      m."createdAt",
      m."updatedAt",
      m."editedAt",
      u.username as sender_username,
      u."fullName" as sender_full_name,
      u."avatarUrl" as sender_avatar_url
    FROM "Message" m
    INNER JOIN "User" u ON m."senderId" = u.id
    WHERE m."chatId" = p_chat_id
      AND m."deletedAt" IS NULL
      AND (p_before_message_id IS NULL OR m.id < p_before_message_id)
      AND (p_after_message_id IS NULL OR m.id > p_after_message_id)
      AND (p_message_type IS NULL OR m.type::text = p_message_type)
      AND (p_search_query IS NULL OR m.content ILIKE '%' || p_search_query || '%')
    ORDER BY m.id DESC
    LIMIT p_limit OFFSET p_offset
  ),
  message_stats AS (
    SELECT 
      fm.id as message_id,
      COALESCE(
        (SELECT COUNT(*) FROM "MessageAttachment" ma WHERE ma."messageId" = fm.id), 
        0
      ) as attachment_count,
      COALESCE(
        (SELECT COUNT(*) FROM "MessageReaction" mr WHERE mr."messageId" = fm.id), 
        0
      ) as reaction_count,
      EXISTS(
        SELECT 1 FROM "MessageReaction" mr 
        WHERE mr."messageId" = fm.id AND mr."userId" = p_user_id
      ) as has_user_reaction,
      EXISTS(
        SELECT 1 FROM "MessageRead" mr 
        WHERE mr."messageId" = fm.id AND mr."userId" = p_user_id
      ) as is_read
    FROM filtered_messages fm
  )
  SELECT 
    fm.id,
    fm.type::text,
    fm.content,
    fm."senderId",
    fm.sender_username,
    fm.sender_full_name,
    fm.sender_avatar_url,
    fm."replyToMessageId",
    fm."threadId",
    fm.flags,
    fm."createdAt",
    fm."updatedAt",
    fm."editedAt",
    ms.attachment_count::integer,
    ms.reaction_count::integer,
    ms.has_user_reaction,
    ms.is_read
  FROM filtered_messages fm
  LEFT JOIN message_stats ms ON fm.id = ms.message_id
  ORDER BY fm.id ASC;
END;
$$;

-- Функция для создания чата с оптимизированными операциями
CREATE OR REPLACE FUNCTION create_optimized_chat(
  p_creator_id BIGINT,
  p_chat_type TEXT,
  p_title TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_participant_ids BIGINT[] DEFAULT ARRAY[]::BIGINT[],
  p_is_public BOOLEAN DEFAULT FALSE,
  p_invite_link TEXT DEFAULT NULL
)
RETURNS TABLE (
  chat_id BIGINT,
  success BOOLEAN,
  error_message TEXT
)
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
    type, 
    "createdById", 
    title, 
    description, 
    flags, 
    "inviteLink",
    "memberCount"
  )
  VALUES (
    p_chat_type::"ChatType",
    p_creator_id,
    p_title,
    p_description,
    v_flags,
    p_invite_link,
    1 + array_length(p_participant_ids, 1)
  )
  RETURNING id INTO v_chat_id;

  -- Добавляем создателя как владельца
  INSERT INTO "ChatParticipant" (
    "chatId",
    "userId", 
    role,
    flags,
    "joinedAt"
  )
  VALUES (
    v_chat_id,
    p_creator_id,
    'OWNER'::"ChatRole",
    1, -- active flag
    NOW()
  );

  -- Добавляем остальных участников
  IF array_length(p_participant_ids, 1) > 0 THEN
    FOREACH v_participant_id IN ARRAY p_participant_ids
    LOOP
      -- Проверяем, что пользователь существует
      IF EXISTS (SELECT 1 FROM "User" WHERE id = v_participant_id AND "deletedAt" IS NULL) THEN
        INSERT INTO "ChatParticipant" (
          "chatId",
          "userId",
          role,
          flags,
          "joinedAt"
        )
        VALUES (
          v_chat_id,
          v_participant_id,
          'MEMBER'::"ChatRole",
          1, -- active flag
          NOW()
        )
        ON CONFLICT ("chatId", "userId") DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_chat_id, TRUE, NULL::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::BIGINT, FALSE, SQLERRM;
END;
$$;

-- Функция для отправки сообщения с оптимизацией
CREATE OR REPLACE FUNCTION send_optimized_message(
  p_chat_id BIGINT,
  p_sender_id BIGINT,
  p_message_type TEXT,
  p_content TEXT,
  p_reply_to_message_id BIGINT DEFAULT NULL,
  p_thread_id BIGINT DEFAULT NULL,
  p_flags INTEGER DEFAULT 0
)
RETURNS TABLE (
  message_id BIGINT,
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_message_id BIGINT;
BEGIN
  -- Проверяем доступ пользователя к чату
  IF NOT EXISTS (
    SELECT 1 FROM "ChatParticipant" 
    WHERE "chatId" = p_chat_id 
      AND "userId" = p_sender_id 
      AND "leftAt" IS NULL
      AND (flags & 1) > 0 -- active flag
  ) THEN
    RETURN QUERY SELECT NULL::BIGINT, FALSE, 'User does not have access to this chat'::TEXT;
    RETURN;
  END IF;

  -- Создаем сообщение
  INSERT INTO "Message" (
    "chatId",
    "senderId",
    type,
    content,
    "replyToMessageId",
    "threadId",
    flags
  )
  VALUES (
    p_chat_id,
    p_sender_id,
    p_message_type::"MessageType",
    p_content,
    p_reply_to_message_id,
    p_thread_id,
    p_flags
  )
  RETURNING id INTO v_message_id;

  -- Обновляем последнее сообщение чата
  UPDATE "Chat" 
  SET 
    "lastMessageAt" = NOW(),
    "lastMessageText" = CASE 
      WHEN p_message_type = 'TEXT' THEN LEFT(p_content, 100)
      ELSE p_message_type || ' message'
    END,
    "updatedAt" = NOW()
  WHERE id = p_chat_id;

  RETURN QUERY SELECT v_message_id, TRUE, NULL::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::BIGINT, FALSE, SQLERRM;
END;
$$;

-- Функция для получения участников чата
CREATE OR REPLACE FUNCTION get_chat_participants(
  p_chat_id BIGINT,
  p_user_id BIGINT,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0,
  p_role_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  user_id BIGINT,
  username TEXT,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT,
  flags INTEGER,
  joined_at TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  is_online BOOLEAN,
  message_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Проверяем доступ пользователя к чату
  IF NOT EXISTS (
    SELECT 1 FROM "ChatParticipant" 
    WHERE "chatId" = p_chat_id 
      AND "userId" = p_user_id 
      AND "leftAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'User does not have access to this chat';
  END IF;

  RETURN QUERY
  SELECT 
    u.id,
    u.username,
    u."fullName",
    u."avatarUrl",
    cp.role::text,
    cp.flags,
    cp."joinedAt",
    u."lastSeen",
    (u.flags & 4) > 0 as is_online, -- online flag
    COALESCE(
      (SELECT COUNT(*) FROM "Message" m WHERE m."chatId" = p_chat_id AND m."senderId" = u.id),
      0
    ) as message_count
  FROM "ChatParticipant" cp
  INNER JOIN "User" u ON cp."userId" = u.id
  WHERE cp."chatId" = p_chat_id
    AND cp."leftAt" IS NULL
    AND u."deletedAt" IS NULL
    AND (p_role_filter IS NULL OR cp.role::text = p_role_filter)
  ORDER BY 
    CASE cp.role
      WHEN 'OWNER' THEN 1
      WHEN 'ADMIN' THEN 2
      WHEN 'MODERATOR' THEN 3
      ELSE 4
    END,
    cp."joinedAt" ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Функция для поиска чатов
CREATE OR REPLACE FUNCTION search_chats(
  p_user_id BIGINT,
  p_search_query TEXT,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_chat_type TEXT DEFAULT NULL,
  p_public_only BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  chat_id BIGINT,
  chat_type TEXT,
  title TEXT,
  description TEXT,
  avatar_url TEXT,
  member_count INTEGER,
  is_member BOOLEAN,
  relevance_score REAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH search_results AS (
    SELECT 
      c.id,
      c.type,
      c.title,
      c.description,
      c."avatarUrl",
      c."memberCount",
      EXISTS(
        SELECT 1 FROM "ChatParticipant" cp 
        WHERE cp."chatId" = c.id 
          AND cp."userId" = p_user_id 
          AND cp."leftAt" IS NULL
      ) as is_member,
      -- Расчет релевантности
      (
        CASE WHEN c.title ILIKE p_search_query THEN 10.0 ELSE 0.0 END +
        CASE WHEN c.title ILIKE '%' || p_search_query || '%' THEN 5.0 ELSE 0.0 END +
        CASE WHEN c.description ILIKE '%' || p_search_query || '%' THEN 2.0 ELSE 0.0 END +
        -- Бонус за популярность
        LOG(GREATEST(c."memberCount", 1)) * 0.1
      ) as relevance_score
    FROM "Chat" c
    WHERE c."deletedAt" IS NULL
      AND (
        c.title ILIKE '%' || p_search_query || '%' OR
        c.description ILIKE '%' || p_search_query || '%'
      )
      AND (p_chat_type IS NULL OR c.type::text = p_chat_type)
      AND (NOT p_public_only OR (c.flags & 2) > 0) -- public flag
  )
  SELECT 
    sr.id,
    sr.type::text,
    sr.title,
    sr.description,
    sr."avatarUrl",
    sr."memberCount",
    sr.is_member,
    sr.relevance_score
  FROM search_results sr
  WHERE sr.relevance_score > 0
  ORDER BY sr.relevance_score DESC, sr."memberCount" DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Функция для получения статистики чата
CREATE OR REPLACE FUNCTION get_chat_statistics(
  p_chat_id BIGINT,
  p_user_id BIGINT
)
RETURNS TABLE (
  total_messages BIGINT,
  total_participants INTEGER,
  active_participants INTEGER,
  messages_today BIGINT,
  messages_this_week BIGINT,
  most_active_user_id BIGINT,
  most_active_user_name TEXT,
  most_active_user_count BIGINT,
  average_messages_per_day NUMERIC,
  peak_activity_hour INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_chat_created_at TIMESTAMPTZ;
  v_days_since_creation INTEGER;
BEGIN
  -- Проверяем доступ
  IF NOT EXISTS (
    SELECT 1 FROM "ChatParticipant" 
    WHERE "chatId" = p_chat_id 
      AND "userId" = p_user_id 
      AND "leftAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'User does not have access to this chat';
  END IF;

  -- Получаем дату создания чата
  SELECT "createdAt" INTO v_chat_created_at
  FROM "Chat" WHERE id = p_chat_id;
  
  v_days_since_creation := GREATEST(DATE_PART('day', NOW() - v_chat_created_at), 1);

  RETURN QUERY
  WITH chat_stats AS (
    SELECT 
      COUNT(*) as total_msg,
      COUNT(DISTINCT m."senderId") as unique_senders,
      COUNT(CASE WHEN m."createdAt" >= CURRENT_DATE THEN 1 END) as today_msg,
      COUNT(CASE WHEN m."createdAt" >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_msg
    FROM "Message" m
    WHERE m."chatId" = p_chat_id AND m."deletedAt" IS NULL
  ),
  participant_stats AS (
    SELECT COUNT(*) as total_participants
    FROM "ChatParticipant" cp
    WHERE cp."chatId" = p_chat_id AND cp."leftAt" IS NULL
  ),
  active_users AS (
    SELECT COUNT(*) as active_count
    FROM "ChatParticipant" cp
    INNER JOIN "User" u ON cp."userId" = u.id
    WHERE cp."chatId" = p_chat_id 
      AND cp."leftAt" IS NULL
      AND u."lastSeen" >= NOW() - INTERVAL '30 days'
  ),
  most_active AS (
    SELECT 
      m."senderId",
      u.username,
      COUNT(*) as msg_count
    FROM "Message" m
    INNER JOIN "User" u ON m."senderId" = u.id
    WHERE m."chatId" = p_chat_id AND m."deletedAt" IS NULL
    GROUP BY m."senderId", u.username
    ORDER BY COUNT(*) DESC
    LIMIT 1
  ),
  hourly_activity AS (
    SELECT 
      EXTRACT(HOUR FROM m."createdAt") as hour,
      COUNT(*) as hour_count
    FROM "Message" m
    WHERE m."chatId" = p_chat_id AND m."deletedAt" IS NULL
    GROUP BY EXTRACT(HOUR FROM m."createdAt")
    ORDER BY COUNT(*) DESC
    LIMIT 1
  )
  SELECT 
    cs.total_msg,
    ps.total_participants::integer,
    au.active_count::integer,
    cs.today_msg,
    cs.week_msg,
    ma."senderId",
    ma.username,
    ma.msg_count,
    ROUND(cs.total_msg::numeric / v_days_since_creation, 2) as avg_per_day,
    ha.hour::integer
  FROM chat_stats cs
  CROSS JOIN participant_stats ps
  CROSS JOIN active_users au
  LEFT JOIN most_active ma ON true
  LEFT JOIN hourly_activity ha ON true;
END;
$$;

-- Создаем индексы для оптимизации
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_chat_created_desc 
ON "Message" ("chatId", "createdAt" DESC) 
WHERE "deletedAt" IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_search_content 
ON "Message" USING gin(to_tsvector('russian', content)) 
WHERE "deletedAt" IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_participant_user_active 
ON "ChatParticipant" ("userId", "chatId") 
WHERE "leftAt" IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_search_title_desc 
ON "Chat" USING gin(to_tsvector('russian', title || ' ' || COALESCE(description, ''))) 
WHERE "deletedAt" IS NULL;

-- Комментарии для документации
COMMENT ON FUNCTION get_user_chats IS 'Получение списка чатов пользователя с подсчетом непрочитанных сообщений';
COMMENT ON FUNCTION get_chat_messages IS 'Получение сообщений чата с пагинацией и фильтрацией';
COMMENT ON FUNCTION create_optimized_chat IS 'Создание чата с автоматическим добавлением участников';
COMMENT ON FUNCTION send_optimized_message IS 'Отправка сообщения с обновлением метаданных чата';
COMMENT ON FUNCTION get_chat_participants IS 'Получение списка участников чата с статистикой';
COMMENT ON FUNCTION search_chats IS 'Поиск чатов по названию и описанию с ранжированием';
COMMENT ON FUNCTION get_chat_statistics IS 'Получение подробной статистики чата';
