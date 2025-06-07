// Оптимизация базы данных и кэширования
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../libs/supabase/db/prisma.service';
import { Prisma } from 'generated/client';
import Redis from 'ioredis';

interface CacheConfig {
  ttl: number;
  prefix: string;
}

@Injectable()
export class DatabaseOptimizer {
  private readonly logger = new Logger(DatabaseOptimizer.name);
  private redis: Redis;

  // Конфигурация кэширования
  private cacheConfigs: Record<string, CacheConfig> = {
    userChats: { ttl: 300, prefix: 'user_chats' }, // 5 минут
    chatInfo: { ttl: 600, prefix: 'chat_info' }, // 10 минут
    unreadCounts: { ttl: 60, prefix: 'unread' }, // 1 минута
    participants: { ttl: 300, prefix: 'participants' }, // 5 минут
    chatSettings: { ttl: 1800, prefix: 'settings' }, // 30 минут
  };
  constructor(private readonly prisma: PrismaService) {
    // Инициализация Redis для кэширования
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.redis.on('error', err => {
      this.logger.error('Redis connection error:', err);
    });
  }

  /**
   * Оптимизированное получение чатов пользователя с кэшированием
   */
  async getOptimizedUserChats(
    userId: bigint,
    options: {
      limit?: number;
      offset?: number;
      chatType?: string;
      searchQuery?: string;
      onlyUnread?: boolean;
    } = {},
  ) {
    const cacheKey = this.generateCacheKey('userChats', {
      userId: userId.toString(),
      limit: options.limit?.toString() || '50',
      offset: options.offset?.toString() || '0',
      chatType: options.chatType || 'all',
      searchQuery: options.searchQuery || 'none',
      onlyUnread: options.onlyUnread?.toString() || 'false',
    });

    // Проверяем кэш
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for user chats: ${userId}`);
      return cached;
    }
    // Используем оптимизированный запрос с правильными JOIN'ами
    const result = await this.prisma.$queryRaw`
      WITH user_chats_optimized AS (
        SELECT DISTINCT ON (c.id)
          c.id,
          c.type,
          c.title,
          c.description,
          c."avatarUrl",
          c.flags,
          c."memberCount",
          c."lastMessageAt",
          c."createdAt",
          cp.role,
          cp."joinedAt",
          cp."mutedUntil",
          -- Оптимизированный подсчет непрочитанных
          COALESCE(unread_count.count, 0) as unread_count,
          -- Последнее сообщение
          lm.content as last_message_content,
          lm."senderId" as last_message_sender_id,
          lu.username as last_message_sender_username
        FROM "Chat" c
        INNER JOIN "ChatParticipant" cp ON c.id = cp."chatId"
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::INTEGER as count
          FROM "Message" m
          LEFT JOIN "MessageRead" mr ON m.id = mr."messageId" AND mr."userId" = ${userId}
          WHERE m."chatId" = c.id 
            AND m."deletedAt" IS NULL
            AND mr.id IS NULL
        ) unread_count ON true
        LEFT JOIN LATERAL (
          SELECT m.content, m."senderId"
          FROM "Message" m
          WHERE m."chatId" = c.id AND m."deletedAt" IS NULL
          ORDER BY m."createdAt" DESC
          LIMIT 1
        ) lm ON true
        LEFT JOIN "User" lu ON lm."senderId" = lu.id
        WHERE cp."userId" = ${userId}
          AND cp."leftAt" IS NULL
          AND c."deletedAt" IS NULL
          ${options.chatType ? Prisma.sql`AND c.type = ${options.chatType}` : Prisma.empty}
          ${options.searchQuery ? Prisma.sql`AND c.title ILIKE ${'%' + options.searchQuery + '%'}` : Prisma.empty}
          ${options.onlyUnread ? Prisma.sql`AND unread_count.count > 0` : Prisma.empty}
        ORDER BY c.id, COALESCE(c."lastMessageAt", c."createdAt") DESC
      )
      SELECT * FROM user_chats_optimized
      ORDER BY COALESCE("lastMessageAt", "createdAt") DESC
      LIMIT ${options.limit || 50}
      OFFSET ${options.offset || 0}
    `;

    // Кэшируем результат
    await this.setCache(cacheKey, result, this.cacheConfigs.userChats.ttl);

    return result;
  }

  /**
   * Batch-операция для получения информации о чатах
   */
  async getBatchChatInfo(chatIds: bigint[]) {
    if (chatIds.length === 0) return [];

    // Проверяем кэш для каждого чата
    const cachePromises = chatIds.map(id =>
      this.getFromCache(this.generateCacheKey('chatInfo', { chatId: id.toString() })),
    );
    const cachedResults = await Promise.all(cachePromises);

    // Определяем, какие чаты нужно загрузить из БД
    const uncachedIds: bigint[] = [];
    const result: any[] = [];

    chatIds.forEach((id, index) => {
      if (cachedResults[index]) {
        result[index] = cachedResults[index];
      } else {
        uncachedIds.push(id);
      }
    });

    // Загружаем недостающие данные batch'ем
    if (uncachedIds.length > 0) {
      const dbResults = await this.prisma.chat.findMany({
        where: {
          id: { in: uncachedIds },
          deletedAt: null,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
          _count: {
            select: {
              participants: {
                where: { leftAt: null },
              },
            },
          },
        },
      });

      // Кэшируем новые результаты и добавляем в общий результат
      for (const dbResult of dbResults) {
        const cacheKey = this.generateCacheKey('chatInfo', { chatId: dbResult.id.toString() });
        await this.setCache(cacheKey, dbResult, this.cacheConfigs.chatInfo.ttl);

        const index = chatIds.findIndex(id => id === dbResult.id);
        if (index !== -1) {
          result[index] = dbResult;
        }
      }
    }

    return result.filter(Boolean);
  }

  /**
   * Оптимизированный подсчет непрочитанных сообщений
   */
  async getOptimizedUnreadCounts(userId: bigint, chatIds?: bigint[]) {
    const cacheKey = this.generateCacheKey('unreadCounts', {
      userId: userId.toString(),
      chatIds: chatIds?.join(',') || 'all',
    });

    const cached = await this.getFromCache(cacheKey);
    if (cached) return cached;

    // Используем материализованное представление или оптимизированный запрос
    const query = chatIds ? Prisma.sql`AND m."chatId" = ANY(${chatIds})` : Prisma.empty;

    const result = await this.prisma.$queryRaw`
      SELECT 
        m."chatId" as chat_id,
        COUNT(*) as unread_count
      FROM "Message" m
      LEFT JOIN "MessageRead" mr ON m.id = mr."messageId" AND mr."userId" = ${userId}
      WHERE m."deletedAt" IS NULL
        AND mr.id IS NULL
        ${query}
      GROUP BY m."chatId"
    `;

    await this.setCache(cacheKey, result, this.cacheConfigs.unreadCounts.ttl);
    return result;
  }

  /**
   * Кэширование настроек чата
   */
  async getCachedChatSettings(chatId: bigint) {
    const cacheKey = this.generateCacheKey('chatSettings', { chatId: chatId.toString() });

    let settings = await this.getFromCache(cacheKey);
    if (!settings) {
      settings = await this.prisma.chatSettings.findUnique({
        where: { chatId },
      });

      if (settings) {
        await this.setCache(cacheKey, settings, this.cacheConfigs.chatSettings.ttl);
      }
    }

    return settings;
  }

  /**
   * Инвалидация кэша при изменениях
   */
  async invalidateUserChatsCache(userId: bigint) {
    const pattern = `${this.cacheConfigs.userChats.prefix}:*${userId}*`;
    await this.deleteByPattern(pattern);
  }

  async invalidateChatCache(chatId: bigint) {
    const patterns = [
      `${this.cacheConfigs.chatInfo.prefix}:*${chatId}*`,
      `${this.cacheConfigs.unreadCounts.prefix}:*${chatId}*`,
      `${this.cacheConfigs.participants.prefix}:*${chatId}*`,
    ];

    for (const pattern of patterns) {
      await this.deleteByPattern(pattern);
    }
  }

  // Вспомогательные методы кэширования
  private generateCacheKey(type: string, params: Record<string, string>): string {
    const config = this.cacheConfigs[type];
    const paramString = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}`)
      .join('|');
    return `${config.prefix}:${paramString}`;
  }

  private async getFromCache(key: string): Promise<any> {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  private async setCache(key: string, value: any, ttl: number): Promise<void> {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  private async deleteByPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      this.logger.error(`Cache delete error for pattern ${pattern}:`, error);
    }
  }

  /**
   * Пакетная вставка сообщений для оптимизации
   */
  async batchInsertMessages(
    messages: Array<{
      chatId: bigint;
      senderId: bigint;
      content: string | Buffer;
      messageType: string;
      replyToId?: bigint;
      threadId?: bigint;
    }>,
  ) {
    // Используем транзакцию для атомарности
    return await this.prisma.$transaction(async tx => {
      const insertedMessages: any[] = [];

      for (const messageData of messages) {
        const message = await tx.message.create({
          data: {
            chatId: messageData.chatId,
            senderId: messageData.senderId,
            content:
              typeof messageData.content === 'string'
                ? Buffer.from(messageData.content)
                : messageData.content,
            header: Buffer.alloc(0), // Добавляем обязательное поле header
            messageType: messageData.messageType as any,
            replyToId: messageData.replyToId,
            threadId: messageData.threadId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        insertedMessages.push(message);
      }

      return insertedMessages;
    });
  }

  /**
   * Оптимизированное обновление последней активности
   */
  async updateUserLastActivity(userIds: bigint[]) {
    if (userIds.length === 0) return;

    // Batch update для производительности
    await this.prisma.user.updateMany({
      where: {
        id: { in: userIds },
      },
      data: {
        lastSeen: new Date(),
      },
    });
  }
}
