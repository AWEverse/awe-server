// Оптимизация Service слоя
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseOptimizer } from './database-optimization';
import { PrismaService } from '../../../libs/db/prisma.service';
import { ChatInfo, MessageInfo, ChatType, MessageType } from '../types';

interface BatchOperation<T> {
  execute(): Promise<T[]>;
  rollback?(): Promise<void>;
}

@Injectable()
export class MessangerServiceOptimized {
  private readonly logger = new Logger(MessangerServiceOptimized.name);
  private readonly batchQueue = new Map<string, any[]>();
  private readonly batchTimers = new Map<string, NodeJS.Timeout>();

  // Константы для оптимизации
  private readonly BATCH_SIZE = 100;
  private readonly BATCH_TIMEOUT = 1000; // 1 секунда
  private readonly MAX_CONCURRENT_OPERATIONS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dbOptimizer: DatabaseOptimizer,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Оптимизированное получение чатов пользователя
   */
  async getUserChatsOptimized(
    userId: bigint,
    options: {
      searchQuery?: string;
      chatType?: ChatType;
      limit?: number;
      offset?: number;
      onlyMuted?: boolean;
      onlyUnread?: boolean;
    } = {},
  ): Promise<ChatInfo[]> {
    try {
      // Используем оптимизированный метод с кэшированием
      const chats = await this.dbOptimizer.getOptimizedUserChats(userId, {
        ...options,
        chatType: options.chatType?.toString(),
      });

      // Преобразуем результат в типизированный формат
      return chats.map(chat => this.mapToChitInfo(chat));
    } catch (error) {
      this.logger.error(`Error getting user chats for ${userId}:`, error);
      throw new BadRequestException('Failed to get user chats');
    }
  }

  /**
   * Batch отправка сообщений
   */
  async sendMessagesBatch(
    messages: Array<{
      chatId: bigint;
      senderId: bigint;
      content: string;
      messageType?: MessageType;
      replyToId?: bigint;
      threadId?: bigint;
    }>,
  ): Promise<MessageInfo[]> {
    if (messages.length === 0) return [];

    try {
      // Валидация доступа ко всем чатам batch'ем
      const chatIds = [...new Set(messages.map(m => m.chatId))];
      await this.validateBatchChatAccess(messages[0].senderId, chatIds);

      // Используем batch операцию для вставки
      const insertedMessages = await this.dbOptimizer.batchInsertMessages(
        messages.map(m => ({
          ...m,
          messageType: m.messageType?.toString() || 'TEXT',
        })),
      );

      // Инвалидируем кэш для всех чатов
      await Promise.all(chatIds.map(chatId => this.dbOptimizer.invalidateChatCache(chatId)));

      // Эмитим события для WebSocket
      for (const message of insertedMessages) {
        this.eventEmitter.emit('message.sent', {
          chatId: message.chatId,
          messageId: message.id,
          senderId: message.senderId,
        });
      }

      return insertedMessages.map(m => this.mapToMessageInfo(m));
    } catch (error) {
      this.logger.error('Batch message send failed:', error);
      throw new BadRequestException('Failed to send messages');
    }
  }

  /**
   * Оптимизированное получение сообщений с пагинацией и кэшированием
   */
  async getMessagesOptimized(
    chatId: bigint,
    userId: bigint,
    options: {
      limit?: number;
      beforeMessageId?: bigint;
      afterMessageId?: bigint;
      includeReactions?: boolean;
      includeAttachments?: boolean;
    } = {},
  ) {
    const limit = Math.min(options.limit || 50, 100); // Ограничиваем максимум

    // Используем cursor-based пагинацию для лучшей производительности
    const whereClause: any = {
      chatId,
      deletedAt: null,
    };

    if (options.beforeMessageId) {
      whereClause.id = { lt: options.beforeMessageId };
    }
    if (options.afterMessageId) {
      whereClause.id = { gt: options.afterMessageId };
    }

    // Оптимизированный запрос с селективными включениями
    const include: any = {
      sender: {
        select: {
          id: true,
          username: true,
          fullName: true,
          avatarUrl: true,
        },
      },
    };

    if (options.includeReactions) {
      include.reactions = {
        select: {
          id: true,
          reaction: true,
          userId: true,
          user: {
            select: { username: true, avatarUrl: true },
          },
        },
      };
    }

    if (options.includeAttachments) {
      include.attachments = true;
    }

    const messages = await this.prisma.message.findMany({
      where: whereClause,
      include,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Помечаем сообщения как прочитанные асинхронно
    if (messages.length > 0) {
      this.markMessagesAsReadAsync(
        userId,
        messages.map(m => m.id),
      );
    }

    return {
      messages: messages.map(m => this.mapToMessageInfo(m)),
      hasMore: messages.length === limit,
      nextCursor: messages.length === limit ? messages[messages.length - 1].id.toString() : null,
    };
  }

  /**
   * Batch операции с участниками
   */
  async addParticipantsBatch(
    chatId: bigint,
    userIds: bigint[],
    addedById: bigint,
    role: string = 'MEMBER',
  ): Promise<{ added: number; failed: Array<{ userId: bigint; reason: string }> }> {
    const results = { added: 0, failed: [] as Array<{ userId: bigint; reason: string }> };

    try {
      // Проверяем права доступа
      await this.validateChatAccess(chatId, addedById);

      // Проверяем существующих участников batch'ем
      const existingParticipants = await this.prisma.chatParticipant.findMany({
        where: {
          chatId,
          userId: { in: userIds },
          leftAt: null,
        },
        select: { userId: true },
      });

      const existingUserIds = new Set(existingParticipants.map(p => p.userId));
      const newUserIds = userIds.filter(id => !existingUserIds.has(id));

      if (newUserIds.length === 0) {
        results.failed = userIds.map(userId => ({ userId, reason: 'Already a participant' }));
        return results;
      }

      // Batch создание участников
      await this.prisma.chatParticipant.createMany({
        data: newUserIds.map(userId => ({
          chatId,
          userId,
          role: role as any,
          joinedAt: new Date(),
        })),
        skipDuplicates: true,
      });

      // Обновляем счетчик участников
      await this.prisma.chat.update({
        where: { id: chatId },
        data: {
          memberCount: {
            increment: newUserIds.length,
          },
        },
      });

      results.added = newUserIds.length;

      // Инвалидируем кэш
      await this.dbOptimizer.invalidateChatCache(chatId);

      // Эмитим события
      this.eventEmitter.emit('chat.participants.added', {
        chatId,
        userIds: newUserIds,
        addedById,
      });
    } catch (error) {
      this.logger.error(`Batch add participants failed:`, error);
      results.failed = userIds.map(userId => ({ userId, reason: error.message }));
    }

    return results;
  }

  /**
   * Оптимизированное удаление сообщений
   */
  async deleteMessagesBatch(
    messageIds: bigint[],
    userId: bigint,
    forEveryone: boolean = false,
  ): Promise<{ deleted: number; failed: number }> {
    if (messageIds.length === 0) return { deleted: 0, failed: 0 };

    try {
      const whereClause: any = {
        id: { in: messageIds },
        deletedAt: null,
      };

      // Если не модератор, можем удалять только свои сообщения
      if (!forEveryone) {
        whereClause.senderId = userId;
      }

      const updateResult = await this.prisma.message.updateMany({
        where: whereClause,
        data: {
          deletedAt: new Date(),
          flags: { increment: 1 },
        },
      });

      // Инвалидируем кэш для затронутых чатов
      const messages = await this.prisma.message.findMany({
        where: { id: { in: messageIds } },
        select: { chatId: true },
      });

      const affectedChatIds = [...new Set(messages.map(m => m.chatId))];
      await Promise.all(
        affectedChatIds.map(chatId => this.dbOptimizer.invalidateChatCache(chatId)),
      );

      return {
        deleted: updateResult.count,
        failed: messageIds.length - updateResult.count,
      };
    } catch (error) {
      this.logger.error('Batch delete messages failed:', error);
      return { deleted: 0, failed: messageIds.length };
    }
  }

  /**
   * Оптимизированная статистика чатов
   */
  async getChatStatistics(chatIds: bigint[]) {
    if (chatIds.length === 0) return [];

    const stats = await this.prisma.$queryRaw`
      SELECT 
        c.id as chat_id,
        c."memberCount",
        COUNT(DISTINCT m.id) as message_count,
        COUNT(DISTINCT m."senderId") as active_users,
        MAX(m."createdAt") as last_message_at,
        COUNT(CASE WHEN m."createdAt" >= NOW() - INTERVAL '24 hours' THEN 1 END) as messages_last_24h,
        COUNT(CASE WHEN m."createdAt" >= NOW() - INTERVAL '7 days' THEN 1 END) as messages_last_week
      FROM "Chat" c
      LEFT JOIN "Message" m ON c.id = m."chatId" AND m."deletedAt" IS NULL
      WHERE c.id = ANY(${chatIds})
        AND c."deletedAt" IS NULL
      GROUP BY c.id, c."memberCount"
    `;

    return stats;
  }

  // Вспомогательные методы
  private async validateBatchChatAccess(userId: bigint, chatIds: bigint[]): Promise<void> {
    const accessResults = await this.prisma.chatParticipant.findMany({
      where: {
        chatId: { in: chatIds },
        userId,
        leftAt: null,
      },
      select: { chatId: true },
    });

    const accessibleChatIds = new Set(accessResults.map(r => r.chatId));
    const inaccessibleChats = chatIds.filter(id => !accessibleChatIds.has(id));

    if (inaccessibleChats.length > 0) {
      throw new BadRequestException(`No access to chats: ${inaccessibleChats.join(', ')}`);
    }
  }

  private async validateChatAccess(chatId: bigint, userId: bigint): Promise<void> {
    const participant = await this.prisma.chatParticipant.findFirst({
      where: { chatId, userId, leftAt: null },
    });

    if (!participant) {
      throw new BadRequestException('No access to this chat');
    }
  }

  private async markMessagesAsReadAsync(userId: bigint, messageIds: bigint[]): Promise<void> {
    // Выполняем асинхронно, чтобы не блокировать основной поток
    setImmediate(async () => {
      try {
        await this.prisma.messageRead.createMany({
          data: messageIds.map(messageId => ({
            messageId,
            userId,
            readAt: new Date(),
          })),
          skipDuplicates: true,
        });
      } catch (error) {
        this.logger.error('Failed to mark messages as read:', error);
      }
    });
  }

  private mapToChitInfo(data: any): ChatInfo {
    return {
      id: data.id,
      type: data.type as ChatType,
      title: data.title,
      description: data.description,
      avatarUrl: data.avatarUrl,
      flags: data.flags || 0,
      memberCount: data.memberCount || 0,
      lastMessageAt: data.lastMessageAt,
      lastMessageText: data.last_message_content?.toString(),
      inviteLink: data.inviteLink,
      createdAt: data.createdAt,
      createdBy: {
        id: data.createdById || BigInt(0),
        username: data.last_message_sender_username || '',
        fullName: '',
        avatarUrl: undefined,
        flags: 0,
        lastSeen: undefined,
      },
    };
  }

  private mapToMessageInfo(data: any): MessageInfo {
    return {
      id: data.id,
      chatId: data.chatId,
      senderId: data.senderId,
      content: Buffer.isBuffer(data.content) ? data.content : Buffer.from(data.content || ''),
      header: Buffer.alloc(0),
      messageType: data.messageType as MessageType,
      flags: data.flags || 0,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      editedAt: data.editedAt,
      deletedAt: data.deletedAt,
      replyToId: data.replyToId,
      forwardedFromId: data.forwardedFromId,
      threadId: data.threadId,
      replyDepth: 0,
      sender: data.sender
        ? {
            id: data.sender.id,
            username: data.sender.username,
            fullName: data.sender.fullName || undefined,
            avatarUrl: data.sender.avatarUrl || undefined,
            flags: data.sender.flags || 0,
            lastSeen: data.sender.lastSeen,
          }
        : {
            id: BigInt(0),
            username: 'Unknown',
            fullName: undefined,
            avatarUrl: undefined,
            flags: 0,
            lastSeen: undefined,
          },
      replyTo: undefined,
      attachments: data.attachments || [],
      reactions: data.reactions || [],
    };
  }
}

// Export alias for module imports
export { MessangerServiceOptimized as ServiceOptimizer };
