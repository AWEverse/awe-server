-- High-performance search utilities for global chat search
-- Focus: maximum performance, scalability, and index usage
-- Author: Copilot, 2025-05-25

-- =====================
-- GLOBAL CHAT MESSAGE FULL-TEXT SEARCH (across all chats)
--
-- @function global_search_messages
-- @desc Searches all messages across all chats for a given query, with optional filters.
-- @params
--   p_user_id      BIGINT      -- (optional) Only messages from chats where user is a participant
--   p_query        TEXT        -- Full-text search query
--   p_limit        INTEGER     -- Limit (default 50)
--   p_offset       INTEGER     -- Offset (default 0)
--   p_chat_id      BIGINT      -- (optional) Restrict to a specific chat
--   p_sender_id    BIGINT      -- (optional) Restrict to a specific sender
--   p_date_from    TIMESTAMPTZ -- (optional) Start date
--   p_date_to      TIMESTAMPTZ -- (optional) End date
-- @returns
--   message_id, chat_id, sender_id, content, created_at, message_type, relevance, chat_title, sender_username
--
-- @indexes
--   GIN index on Message.content (to_tsvector)
--   Index on Message.chatId, createdAt, deletedAt
--   Index on ChatParticipant.userId, chatId WHERE leftAt IS NULL
--
-- @performance
--   Uses full-text search, CTEs, and index-only scans where possible
--   Designed for large datasets (millions of messages)
--
CREATE OR REPLACE FUNCTION global_search_messages(
  p_user_id BIGINT DEFAULT NULL,
  p_query TEXT,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_chat_id BIGINT DEFAULT NULL,
  p_sender_id BIGINT DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  message_id BIGINT,
  chat_id BIGINT,
  sender_id BIGINT,
  content BYTEA,
  created_at TIMESTAMPTZ,
  message_type TEXT,
  relevance REAL,
  chat_title TEXT,
  sender_username TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH user_chats AS (
    SELECT cp."chatId"
    FROM "ChatParticipant" cp
    WHERE cp."userId" = p_user_id AND cp."leftAt" IS NULL
  ),
  filtered_messages AS (
    SELECT m.*, 
      ts_rank_cd(to_tsvector('russian', decode(m.content, 'escape')::text), plainto_tsquery('russian', p_query)) AS relevance
    FROM "Message" m
    WHERE m."deletedAt" IS NULL
      AND (p_chat_id IS NULL OR m."chatId" = p_chat_id)
      AND (p_sender_id IS NULL OR m."senderId" = p_sender_id)
      AND (p_date_from IS NULL OR m."createdAt" >= p_date_from)
      AND (p_date_to IS NULL OR m."createdAt" <= p_date_to)
      AND (
        p_user_id IS NULL OR m."chatId" IN (SELECT "chatId" FROM user_chats)
      )
      AND to_tsvector('russian', decode(m.content, 'escape')::text) @@ plainto_tsquery('russian', p_query)
  )
  SELECT 
    fm.id,
    fm."chatId",
    fm."senderId",
    fm.content,
    fm."createdAt",
    fm."messageType"::text,
    fm.relevance,
    c.title,
    u.username
  FROM filtered_messages fm
  LEFT JOIN "Chat" c ON fm."chatId" = c.id
  LEFT JOIN "User" u ON fm."senderId" = u.id
  ORDER BY fm.relevance DESC, fm."createdAt" DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- =====================
-- GLOBAL CHAT TITLE/DESCRIPTION SEARCH (across all chats)
--
-- @function global_search_chats
-- @desc Searches all chats by title and description for a given query.
-- @params
--   p_user_id      BIGINT      -- (optional) Only chats where user is a participant
--   p_query        TEXT        -- Full-text search query
--   p_limit        INTEGER     -- Limit (default 50)
--   p_offset       INTEGER     -- Offset (default 0)
--   p_type         TEXT        -- (optional) Chat type filter
--   p_public_only  BOOLEAN     -- (optional) Only public chats
-- @returns
--   chat_id, chat_type, title, description, member_count, relevance, is_member
--
-- @indexes
--   GIN index on Chat.title || description
--   Index on ChatParticipant.userId, chatId WHERE leftAt IS NULL
--
-- @performance
--   Uses full-text search, index-only scans, and CTEs
--   Designed for large datasets (hundreds of thousands of chats)
--
CREATE OR REPLACE FUNCTION global_search_chats(
  p_user_id BIGINT DEFAULT NULL,
  p_query TEXT,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_type TEXT DEFAULT NULL,
  p_public_only BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  chat_id BIGINT,
  chat_type TEXT,
  title TEXT,
  description TEXT,
  member_count INTEGER,
  relevance REAL,
  is_member BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH user_chats AS (
    SELECT cp."chatId"
    FROM "ChatParticipant" cp
    WHERE cp."userId" = p_user_id AND cp."leftAt" IS NULL
  ),
  filtered_chats AS (
    SELECT c.*, 
      ts_rank_cd(to_tsvector('russian', c.title || ' ' || COALESCE(c.description, '')), plainto_tsquery('russian', p_query)) AS relevance
    FROM "Chat" c
    WHERE c."deletedAt" IS NULL
      AND (p_type IS NULL OR c.type::text = p_type)
      AND (NOT p_public_only OR (c.flags & 2) > 0)
      AND (
        p_user_id IS NULL OR c.id IN (SELECT "chatId" FROM user_chats)
      )
      AND to_tsvector('russian', c.title || ' ' || COALESCE(c.description, '')) @@ plainto_tsquery('russian', p_query)
  )
  SELECT 
    fc.id,
    fc.type::text,
    fc.title,
    fc.description,
    fc."memberCount",
    fc.relevance,
    EXISTS(
      SELECT 1 FROM "ChatParticipant" cp WHERE cp."chatId" = fc.id AND cp."userId" = p_user_id AND cp."leftAt" IS NULL
    ) as is_member
  FROM filtered_chats fc
  ORDER BY fc.relevance DESC, fc."memberCount" DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- =====================
-- INDEX RECOMMENDATIONS
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_global_message_content_search ON "Message" USING gin(to_tsvector('russian', content)) WHERE "deletedAt" IS NULL;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_global_chat_title_desc_search ON "Chat" USING gin(to_tsvector('russian', title || ' ' || COALESCE(description, ''))) WHERE "deletedAt" IS NULL;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_global_chat_participant_user_active ON "ChatParticipant" ("userId", "chatId") WHERE "leftAt" IS NULL;

-- =====================
-- USAGE NOTES
-- - These utilities are designed for high-load, large-scale search scenarios.
-- - For best performance, keep GIN indexes up-to-date and use partitioning for very large tables.
-- - For multi-language support, adjust the to_tsvector/plainto_tsquery language parameter.
