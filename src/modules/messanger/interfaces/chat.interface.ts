// filepath: d:\Projects\AWE\server\src\modules\messanger\interfaces/chat.interface.ts

import {
  ChatInfo,
  ChatParticipantInfo,
  MessageInfo,
  MessageAttachment,
  MessageReaction,
  MessageThread,
  ChatSettings,
  PaginatedMessages,
  ChatType,
  MessageType,
  ChatRole,
} from '../types';

import { ChatStatistics, UserChatStatistics } from '../types/statistics.type';

export interface IChatService {
  // ===============================================
  // УПРАВЛЕНИЕ ЧАТАМИ
  // ===============================================

  /**
   * Создать новый чат с участниками
   */
  createChat(
    userId: bigint,
    type: ChatType,
    title?: string,
    description?: string,
    participantIds?: bigint[],
    isPublic?: boolean,
    inviteLink?: string,
  ): Promise<ChatInfo>;

  /**
   * Получить информацию о чате
   */
  getChatInfo(chatId: bigint, userId: bigint): Promise<ChatInfo>;

  /**
   * Обновить информацию о чате
   */
  updateChat(
    chatId: bigint,
    userId: bigint,
    updates: Partial<Pick<ChatInfo, 'title' | 'description' | 'avatarUrl'>>,
  ): Promise<ChatInfo>;

  /**
   * Удалить чат
   */
  deleteChat(chatId: bigint, userId: bigint): Promise<boolean>;

  /**
   * Получить список чатов пользователя
   */
  getUserChats(
    userId: bigint,
    options?: {
      searchQuery?: string;
      chatType?: ChatType;
      limit?: number;
      offset?: number;
      onlyMuted?: boolean;
      onlyUnread?: boolean;
    },
  ): Promise<ChatInfo[]>;

  // ===============================================
  // УПРАВЛЕНИЕ УЧАСТНИКАМИ
  // ===============================================

  /**
   * Добавить участника в чат
   */
  addParticipant(
    chatId: bigint,
    userId: bigint,
    addedById: bigint,
    role?: ChatRole,
  ): Promise<boolean>;

  /**
   * Удалить участника из чата
   */
  removeParticipant(
    chatId: bigint,
    userId: bigint,
    removedById: bigint,
    ban?: boolean,
    reason?: string,
  ): Promise<boolean>;

  /**
   * Изменить роль участника
   */
  updateParticipantRole(
    chatId: bigint,
    userId: bigint,
    newRole: ChatRole,
    updatedById: bigint,
  ): Promise<boolean>;

  /**
   * Заглушить участника
   */
  muteParticipant(
    chatId: bigint,
    userId: bigint,
    mutedById: bigint,
    mutedUntil?: Date,
  ): Promise<boolean>;

  /**
   * Снять заглушение с участника
   */
  unmuteParticipant(chatId: bigint, userId: bigint, unmutedById: bigint): Promise<boolean>;

  /**
   * Получить список участников чата
   */
  getChatParticipants(
    chatId: bigint,
    userId: bigint,
    options?: {
      role?: ChatRole;
      limit?: number;
      offset?: number;
    },
  ): Promise<ChatParticipantInfo[]>;

  // ===============================================
  // СООБЩЕНИЯ
  // ===============================================

  /**
   * Отправить сообщение
   */
  sendMessage(
    chatId: bigint,
    senderId: bigint,
    content: string | Buffer,
    messageType?: MessageType,
    options?: {
      header?: Record<string, any>;
      replyToId?: bigint;
      threadId?: bigint;
      attachments?: MessageAttachment[];
    },
  ): Promise<MessageInfo>;

  /**
   * Редактировать сообщение
   */
  editMessage(
    messageId: bigint,
    userId: bigint,
    content: string | Buffer,
    header?: Record<string, any>,
  ): Promise<MessageInfo>;

  /**
   * Удалить сообщение
   */
  deleteMessage(messageId: bigint, userId: bigint, forEveryone?: boolean): Promise<boolean>;

  /**
   * Получить сообщения чата с пагинацией
   */
  getChatMessages(
    chatId: bigint,
    userId: bigint,
    options?: {
      limit?: number;
      beforeMessageId?: bigint;
      afterMessageId?: bigint;
      threadId?: bigint;
    },
  ): Promise<PaginatedMessages>;

  /**
   * Переслать сообщения
   */
  forwardMessages(
    messageIds: bigint[],
    targetChatIds: bigint[],
    userId: bigint,
    comment?: string,
  ): Promise<MessageInfo[]>;

  /**
   * Закрепить сообщение
   */
  pinMessage(chatId: bigint, messageId: bigint, userId: bigint): Promise<boolean>;

  /**
   * Открепить сообщение
   */
  unpinMessage(chatId: bigint, userId: bigint): Promise<boolean>;

  /**
   * Отметить сообщения как прочитанные
   */
  markMessagesAsRead(chatId: bigint, userId: bigint, upToMessageId: bigint): Promise<number>;

  // ===============================================
  // РЕАКЦИИ
  // ===============================================

  /**
   * Добавить реакцию к сообщению
   */
  addReaction(messageId: bigint, userId: bigint, reaction: string): Promise<MessageReaction>;

  /**
   * Удалить реакцию с сообщения
   */
  removeReaction(messageId: bigint, userId: bigint, reaction: string): Promise<boolean>;

  /**
   * Получить реакции сообщения
   */
  getMessageReactions(messageId: bigint, userId: bigint): Promise<MessageReaction[]>;

  // ===============================================
  // ТРЕДЫ
  // ===============================================

  /**
   * Создать тред
   */
  createThread(
    chatId: bigint,
    userId: bigint,
    replyToMessageId: bigint,
    title?: string,
  ): Promise<MessageThread>;

  /**
   * Получить сообщения треда
   */
  getThreadMessages(
    threadId: bigint,
    userId: bigint,
    options?: {
      limit?: number;
      beforeMessageId?: bigint;
    },
  ): Promise<PaginatedMessages>;

  // ===============================================
  // ПОИСК И ФИЛЬТРАЦИЯ
  // ===============================================

  /**
   * Поиск сообщений в чате
   */
  searchMessages(
    chatId: bigint,
    userId: bigint,
    query: string,
    options?: {
      messageType?: MessageType;
      fromUserId?: bigint;
      dateFrom?: Date;
      dateTo?: Date;
      limit?: number;
      offset?: number;
    },
  ): Promise<PaginatedMessages>;

  /**
   * Глобальный поиск по чатам
   */
  searchInAllChats(
    userId: bigint,
    query: string,
    options?: {
      chatType?: ChatType;
      limit?: number;
      offset?: number;
    },
  ): Promise<{
    chats: ChatInfo[];
    messages: MessageInfo[];
  }>;

  // ===============================================
  // МОДЕРАЦИЯ
  // ===============================================

  /**
   * Массовые операции с сообщениями
   */
  bulkModerationAction(
    chatId: bigint,
    messageIds: bigint[],
    action: 'delete' | 'flag' | 'pin' | 'unpin',
    moderatorId: bigint,
    reason?: string,
  ): Promise<{ affected: number; errors: string[] }>;

  /**
   * Установить медленный режим
   */
  setSlowMode(chatId: bigint, moderatorId: bigint, intervalSeconds: number): Promise<boolean>;

  /**
   * Очистить историю чата
   */
  clearChatHistory(chatId: bigint, userId: bigint, beforeDate?: Date): Promise<number>;

  // ===============================================
  // АНАЛИТИКА И СТАТИСТИКА
  // ===============================================

  /**
   * Получить статистику чата
   */
  getChatStatistics(
    chatId: bigint,
    userId: bigint,
    daysBack?: number,
  ): Promise<
    ChatStatistics & {
      messagesByDay?: Array<{ date: Date; count: number }>;
      topUsers?: Array<{ userId: bigint; messageCount: number; username: string }>;
      messageTypes?: Record<MessageType, number>;
    }
  >;

  /**
   * Получить статистику пользователя
   */
  getUserStatistics(userId: bigint, requesterId: bigint): Promise<UserChatStatistics>;

  // ===============================================
  // НАСТРОЙКИ
  // ===============================================

  /**
   * Получить настройки чата
   */
  getChatSettings(chatId: bigint, userId: bigint): Promise<ChatSettings>;

  /**
   * Обновить настройки чата
   */
  updateChatSettings(
    chatId: bigint,
    userId: bigint,
    settings: Record<string, any>,
  ): Promise<ChatSettings>;

  // ===============================================
  // УТИЛИТЫ
  // ===============================================

  /**
   * Проверить права пользователя в чате
   */
  checkUserPermissions(
    chatId: bigint,
    userId: bigint,
    permissions: string[],
  ): Promise<Record<string, boolean>>;

  /**
   * Получить информацию о непрочитанных сообщениях
   */
  getUnreadInfo(userId: bigint): Promise<{
    totalUnread: number;
    chatUnreads: Array<{
      chatId: bigint;
      unreadCount: number;
      lastMessageAt: Date;
    }>;
  }>;

  /**
   * Архивировать старые сообщения
   */
  archiveOldMessages(
    chatId: bigint,
    beforeDate: Date,
    userId: bigint,
  ): Promise<{
    archivedCount: number;
    storageFreed: number;
  }>;
}
