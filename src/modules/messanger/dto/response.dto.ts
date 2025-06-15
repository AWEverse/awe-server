import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatType, MessageType, ChatRole } from '../types';

/**
 * DTO для информации о пользователе (краткая версия)
 * @description Компактная информация о пользователе для отображения в чатах и сообщениях
 */
export class UserPreviewDto {
  @ApiProperty({
    description: 'Уникальный идентификатор пользователя',
    example: '12345678901234567890',
    format: 'string',
    pattern: '^[0-9]+$',
  })
  id: string;

  @ApiProperty({
    description: 'Имя пользователя (логин)',
    example: 'john_doe',
    minLength: 3,
    maxLength: 32,
    pattern: '^[a-zA-Z0-9_]+$',
  })
  username: string;

  @ApiPropertyOptional({
    description: 'Полное имя пользователя',
    example: 'John Doe',
    maxLength: 128,
    nullable: true,
  })
  fullName?: string | null;

  @ApiPropertyOptional({
    description: 'URL аватара пользователя',
    example: 'https://example.com/avatar.jpg',
    format: 'uri',
    nullable: true,
  })
  avatarUrl?: string | null;

  @ApiProperty({
    description: 'Флаги пользователя (битовая маска для статуса, премиум, верификации и т.д.)',
    example: 5,
    minimum: 0,
    type: 'integer',
  })
  flags: number;

  @ApiPropertyOptional({
    description: 'Время последней активности пользователя',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T10:30:00.000Z',
    nullable: true,
  })
  lastSeen?: Date | null;
}

/**
 * DTO для ответа при создании/получении информации о чате
 * @description Полная информация о чате включая участников, настройки и метаданные
 */
export class ChatResponseDto {
  @ApiProperty({
    description: 'Уникальный идентификатор чата',
    example: '12345678901234567890',
    format: 'string',
    pattern: '^[0-9]+$',
  })
  id: string;
  @ApiProperty({
    description: 'Тип чата',
    enum: ChatType,
    example: ChatType.GROUP,
    enumName: 'ChatType',
  })
  type: ChatType;

  @ApiPropertyOptional({
    description: 'Название чата (обязательно для групп и каналов)',
    example: 'Development Team Discussion',
    maxLength: 128,
    minLength: 1,
    nullable: true,
  })
  title?: string | null;

  @ApiPropertyOptional({
    description: 'Описание чата',
    example: 'This chat is for discussing development tasks and updates',
    maxLength: 500,
    nullable: true,
  })
  description?: string | null;

  @ApiPropertyOptional({
    description: 'URL аватара чата',
    example: 'https://example.com/chat-avatar.jpg',
    format: 'uri',
    nullable: true,
  })
  avatarUrl?: string | null;

  @ApiProperty({
    description: 'Количество участников в чате',
    example: 15,
    minimum: 0,
    type: 'integer',
  })
  memberCount: number;

  @ApiProperty({
    description: 'Время создания чата',
    type: 'string',
    format: 'date-time',
    example: '2024-06-01T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiPropertyOptional({
    description: 'Время последнего сообщения в чате',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T10:30:00.000Z',
    nullable: true,
  })
  lastMessageAt?: Date | null;

  @ApiPropertyOptional({
    description: 'Предварительный просмотр последнего сообщения',
    example: 'John: Hey everyone! 👋',
    maxLength: 100,
    nullable: true,
  })
  lastMessageText?: string | null;

  @ApiProperty({
    description: 'Информация о создателе чата',
    type: UserPreviewDto,
  })
  createdBy: UserPreviewDto;

  @ApiProperty({
    description: 'Флаги чата (битовая маска для настроек приватности, модерации и т.д.)',
    example: 1,
    minimum: 0,
    type: 'integer',
  })
  flags: number;

  @ApiPropertyOptional({
    description: 'Пригласительная ссылка для чата',
    example: 'https://awe.chat/invite/dev-team-123',
    format: 'uri',
    nullable: true,
  })
  inviteLink?: string | null;
}

/**
 * DTO для информации об участнике чата
 */
export class ChatParticipantResponseDto {
  @ApiProperty({
    description: 'Participant ID',
    example: '12345678901234567890',
  })
  id: string;

  @ApiProperty({
    description: 'User ID',
    example: '98765432101234567890',
  })
  userId: string;

  @ApiProperty({
    description: 'Chat ID',
    example: '11111111111111111111',
  })
  chatId: string;

  @ApiProperty({
    description: 'Participant role in the chat',
    enum: ChatRole,
    example: ChatRole.MEMBER,
    enumName: 'ChatRole',
  })
  role: ChatRole;

  @ApiProperty({
    description: 'When the user joined the chat',
    type: Date,
    example: '2024-06-01T10:00:00.000Z',
  })
  joinedAt: Date;

  @ApiPropertyOptional({
    description: 'When the user was muted (if applicable)',
    type: Date,
    example: '2024-12-31T23:59:59.000Z',
  })
  mutedUntil?: Date | null;

  @ApiProperty({
    description: 'Whether the participant is muted',
    example: false,
  })
  isMuted: boolean;

  @ApiProperty({
    description: 'Number of unread messages for this participant',
    example: 5,
  })
  unreadCount: number;

  @ApiProperty({
    description: 'User information',
    type: UserPreviewDto,
  })
  user: UserPreviewDto;
}

/**
 * DTO для информации о сообщении
 */
export class MessageResponseDto {
  @ApiProperty({
    description: 'Message ID',
    example: '12345678901234567890',
  })
  id: string;

  @ApiProperty({
    description: 'Chat ID',
    example: '98765432101234567890',
  })
  chatId: string;

  @ApiProperty({
    description: 'Sender user ID',
    example: '11111111111111111111',
  })
  senderId: string;

  @ApiProperty({
    description: 'Message content',
    example: 'Hello everyone! 👋',
  })
  content: string;

  @ApiProperty({
    description: 'Message type',
    enum: MessageType,
    example: MessageType.TEXT,
    enumName: 'MessageType',
  })
  messageType: MessageType;

  @ApiProperty({
    description: 'Message creation timestamp',
    type: Date,
    example: '2024-06-13T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiPropertyOptional({
    description: 'Message edit timestamp',
    type: Date,
    example: '2024-06-13T10:35:00.000Z',
  })
  editedAt?: Date | null;

  @ApiPropertyOptional({
    description: 'ID of the message this is replying to',
    example: '22222222222222222222',
  })
  replyToId?: string | null;

  @ApiPropertyOptional({
    description: 'ID of the thread this message belongs to',
    example: '33333333333333333333',
  })
  threadId?: string | null;

  @ApiProperty({
    description: 'Whether the message is pinned',
    example: false,
  })
  isPinned: boolean;

  @ApiProperty({
    description: 'Information about message sender',
    type: UserPreviewDto,
  })
  sender: UserPreviewDto;

  @ApiPropertyOptional({
    description: 'Information about message being replied to',
    type: () => MessageResponseDto,
  })
  replyTo?: MessageResponseDto | null;

  @ApiPropertyOptional({
    description: 'Message attachments',
    type: [Object],
    example: [{ type: 'image', url: 'https://example.com/image.jpg', name: 'photo.jpg' }],
  })
  attachments?: any[];

  @ApiPropertyOptional({
    description: 'Message reactions',
    type: [Object],
    example: [{ emoji: '👍', count: 5, users: ['user1', 'user2'] }],
  })
  reactions?: any[];
}

/**
 * DTO для пагинированного списка сообщений
 */
export class PaginatedMessagesResponseDto {
  @ApiProperty({
    description: 'Array of messages',
    type: [MessageResponseDto],
  })
  messages: MessageResponseDto[];

  @ApiProperty({
    description: 'Whether there are more messages available',
    example: true,
  })
  hasMore: boolean;

  @ApiPropertyOptional({
    description: 'Cursor for next page of messages',
    example: '12345678901234567890',
  })
  nextCursor?: string | null;

  @ApiProperty({
    description: 'Total count of messages in the chat',
    example: 250,
  })
  totalCount: number;
}

/**
 * DTO для пагинированного списка чатов
 */
export class PaginatedChatsResponseDto {
  @ApiProperty({
    description: 'Array of chats',
    type: [ChatResponseDto],
  })
  chats: ChatResponseDto[];

  @ApiProperty({
    description: 'Total count of chats',
    example: 25,
  })
  totalCount: number;

  @ApiProperty({
    description: 'Whether there are more chats available',
    example: true,
  })
  hasMore: boolean;
}

/**
 * DTO для пагинированного списка участников чата
 */
export class PaginatedParticipantsResponseDto {
  @ApiProperty({
    description: 'Array of chat participants',
    type: [ChatParticipantResponseDto],
  })
  participants: ChatParticipantResponseDto[];

  @ApiProperty({
    description: 'Total count of participants',
    example: 15,
  })
  totalCount: number;

  @ApiProperty({
    description: 'Whether there are more participants available',
    example: false,
  })
  hasMore: boolean;
}

/**
 * DTO для результата проверки разрешений
 */
export class PermissionsCheckResponseDto {
  @ApiProperty({
    description: 'Object with permission names as keys and boolean values',
    example: {
      SEND_MESSAGES: true,
      DELETE_MESSAGES: false,
      BAN_MEMBERS: true,
      MANAGE_CHAT: false,
    },
  })
  permissions: Record<string, boolean>;
}

/**
 * DTO для результата архивации сообщений
 */
export class ArchiveResultResponseDto {
  @ApiProperty({
    description: 'Number of messages archived',
    example: 150,
  })
  archivedCount: number;

  @ApiProperty({
    description: 'Storage space freed in KB',
    example: 2048,
  })
  storageFreed: number;

  @ApiProperty({
    description: 'Archive operation timestamp',
    type: Date,
    example: '2024-06-13T10:30:00.000Z',
  })
  archivedAt: Date;
}

/**
 * DTO для информации о стикер-паке
 */
export class StickerPackResponseDto {
  @ApiProperty({
    description: 'Sticker pack ID',
    example: '12345678901234567890',
  })
  id: string;

  @ApiProperty({
    description: 'Sticker pack name',
    example: 'Funny Animals',
  })
  name: string;

  @ApiProperty({
    description: 'Sticker pack description',
    example: 'Collection of funny animal stickers',
  })
  description: string;

  @ApiProperty({
    description: 'Pack preview image URL',
    example: 'https://example.com/sticker-pack-preview.jpg',
  })
  previewUrl: string;

  @ApiProperty({
    description: 'Whether the pack is premium',
    example: false,
  })
  isPremium: boolean;

  @ApiProperty({
    description: 'Array of stickers in the pack',
    type: [Object],
    example: [
      { id: '1', name: 'happy_cat', url: 'https://example.com/sticker1.webp' },
      { id: '2', name: 'sad_dog', url: 'https://example.com/sticker2.webp' },
    ],
  })
  stickers: any[];
}

/**
 * DTO для информации о GIF
 */
export class GifResponseDto {
  @ApiProperty({
    description: 'GIF ID from provider (Giphy, Tenor, etc.)',
    example: 'giphy_abc123def456',
  })
  id: string;

  @ApiProperty({
    description: 'GIF title',
    example: 'Happy Dancing Cat',
  })
  title: string;

  @ApiProperty({
    description: 'GIF URL',
    example: 'https://media.giphy.com/media/abc123def456/giphy.gif',
  })
  url: string;

  @ApiProperty({
    description: 'GIF preview URL (static image)',
    example: 'https://media.giphy.com/media/abc123def456/giphy_s.gif',
  })
  previewUrl: string;

  @ApiProperty({
    description: 'GIF width in pixels',
    example: 480,
  })
  width: number;

  @ApiProperty({
    description: 'GIF height in pixels',
    example: 360,
  })
  height: number;
}

/**
 * DTO для списка трендовых GIF
 */
export class TrendingGifsResponseDto {
  @ApiProperty({
    description: 'Array of trending GIFs',
    type: [GifResponseDto],
  })
  gifs: GifResponseDto[];

  @ApiProperty({
    description: 'Total number of available GIFs',
    example: 1000,
  })
  totalCount: number;
}
