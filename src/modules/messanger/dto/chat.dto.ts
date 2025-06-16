import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  IsNumber,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsUUID,
  IsIn,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatType, MessageType, ChatRole } from '../types';

/**
 * DTO для создания нового чата
 */
export class CreateChatDto {
  @ApiProperty({
    description: 'Type of chat to create',
    enum: ChatType,
    example: ChatType.GROUP,
    enumName: 'ChatType',
  })
  @IsEnum(ChatType)
  type: ChatType;

  @ApiPropertyOptional({
    description: 'Chat title (required for GROUP and CHANNEL types)',
    minLength: 1,
    maxLength: 128,
    example: 'Development Team Discussion',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  title?: string;

  @ApiPropertyOptional({
    description: 'Chat description (optional for all chat types)',
    maxLength: 500,
    example: 'This chat is for discussing development tasks and updates',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Array of user IDs to add as initial participants',
    type: [String],
    example: ['12345', '67890', '54321'],
  })
  @IsOptional()
  @IsArray()
  @Type(() => String)
  @Transform(({ value }) => value.map((id: string) => BigInt(id)))
  participantIds?: bigint[];

  @ApiPropertyOptional({
    description: 'Whether the chat is public (discoverable by search)',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean = false;

  @ApiPropertyOptional({
    description: 'Custom invite link for the chat (for public chats)',
    maxLength: 64,
    example: 'https://awe.chat/invite/dev-team-123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  inviteLink?: string;
}

/**
 * DTO для отправки сообщения в чат
 */
export class SendMessageDto {
  @ApiProperty({
    description: 'Message content (text or binary data for files)',
    example: 'Hello everyone! 👋',
  })
  @IsNotEmpty()
  content: string | Buffer;

  @ApiPropertyOptional({
    description: 'Additional metadata for the message (used for rich content)',
    example: { formatting: 'markdown', mentions: ['user123'] },
  })
  @IsOptional()
  header?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Type of message content',
    enum: MessageType,
    default: MessageType.TEXT,
    example: MessageType.TEXT,
    enumName: 'MessageType',
  })
  @IsOptional()
  @IsEnum(MessageType)
  messageType?: MessageType = MessageType.TEXT;

  @ApiPropertyOptional({
    description: 'ID of the message this is replying to',
    example: '98765432101234567890',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? BigInt(value) : undefined))
  replyToId?: bigint;

  @ApiPropertyOptional({
    description: 'ID of the thread this message belongs to',
    example: '12345678901234567890',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? BigInt(value) : undefined))
  threadId?: bigint;
}

/**
 * DTO для редактирования сообщения
 */
export class EditMessageDto {
  @ApiProperty({
    description: 'ID of the message to edit',
    example: '12345678901234567890',
  })
  @Transform(({ value }) => BigInt(value))
  messageId: bigint;

  @ApiProperty({
    description: 'New content for the message',
    example: 'Updated message content with corrections',
  })
  @IsNotEmpty()
  content: string | Buffer;

  @ApiPropertyOptional({
    description: 'Updated metadata for the message',
    example: { edited: true, editReason: 'typo correction' },
  })
  @IsOptional()
  header?: Record<string, any>;
}

/**
 * DTO для получения сообщений из чата
 */
export class GetMessagesDto {
  @ApiProperty({
    description: 'ID of the chat to retrieve messages from',
    example: '12345678901234567890',
  })
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @ApiPropertyOptional({
    description: 'Maximum number of messages to return',
    minimum: 1,
    maximum: 100,
    default: 50,
    example: 50,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Get messages before this message ID (for pagination)',
    example: '98765432101234567890',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? BigInt(value) : undefined))
  beforeMessageId?: bigint;

  @ApiPropertyOptional({
    description: 'Get messages after this message ID (for pagination)',
    example: '11111111111111111111',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? BigInt(value) : undefined))
  afterMessageId?: bigint;
}

/**
 * DTO для добавления участника в чат
 */
export class AddParticipantDto {
  @ApiProperty({
    description: 'ID of the user to add to the chat',
    example: '98765432101234567890',
  })
  @Transform(({ value }) => BigInt(value))
  userId: bigint;

  @ApiPropertyOptional({
    description: 'Role to assign to the new participant',
    enum: ChatRole,
    default: ChatRole.MEMBER,
    example: ChatRole.MEMBER,
    enumName: 'ChatRole',
  })
  @IsOptional()
  @IsEnum(ChatRole)
  role?: ChatRole = ChatRole.MEMBER;
}

/**
 * DTO для удаления участника из чата
 */
export class RemoveParticipantDto {
  @ApiProperty({
    description: 'ID of the chat to remove participant from',
    example: '12345678901234567890',
  })
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @ApiProperty({
    description: 'ID of the user to remove from the chat',
    example: '98765432101234567890',
  })
  @Transform(({ value }) => BigInt(value))
  userId: bigint;

  @ApiPropertyOptional({
    description: 'Whether to ban the user from rejoining the chat',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  ban?: boolean = false;

  @ApiPropertyOptional({
    description: 'Reason for removing the participant',
    maxLength: 500,
    example: 'Violated chat rules',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * DTO для изменения роли участника чата
 */
export class UpdateParticipantRoleDto {
  @ApiProperty({
    description: 'New role for the participant',
    enum: ChatRole,
    example: ChatRole.MODERATOR,
    enumName: 'ChatRole',
  })
  @IsEnum(ChatRole)
  role: ChatRole;
}

/**
 * DTO для заглушки участника чата
 */
export class MuteParticipantDto {
  @ApiProperty({
    description: 'ID of the chat',
    example: '12345678901234567890',
  })
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @ApiProperty({
    description: 'ID of the user to mute',
    example: '98765432101234567890',
  })
  @Transform(({ value }) => BigInt(value))
  userId: bigint;

  @ApiPropertyOptional({
    description: 'Date until which the user is muted (if not provided, muted indefinitely)',
    type: Date,
    example: '2024-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  mutedUntil?: Date;
}

/**
 * DTO для отметки сообщений как прочитанных
 */
export class MarkMessagesReadDto {
  @ApiProperty({
    description: 'ID of the chat where messages should be marked as read',
    example: '12345678901234567890',
  })
  @IsString()
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @ApiProperty({
    description: 'Mark all messages up to and including this message ID as read',
    example: '98765432101234567890',
  })
  @IsString()
  @Transform(({ value }) => BigInt(value))
  upToMessageId: bigint;
}

/**
 * DTO для добавления реакции на сообщение
 */
export class AddReactionDto {
  @ApiProperty({
    description: 'ID of the message to react to',
    example: '12345678901234567890',
  })
  @IsString()
  @Transform(({ value }) => BigInt(value))
  messageId: bigint;

  @ApiProperty({
    description: 'Emoji reaction to add',
    maxLength: 8,
    example: '👍',
  })
  @IsString()
  @MaxLength(8)
  reaction: string;
}

/**
 * DTO для удаления реакции с сообщения
 */
export class RemoveReactionDto {
  @ApiProperty({
    description: 'ID of the message to remove reaction from',
    example: '12345678901234567890',
  })
  @IsString()
  @Transform(({ value }) => BigInt(value))
  messageId: bigint;

  @ApiProperty({
    description: 'Emoji reaction to remove',
    maxLength: 8,
    example: '👍',
  })
  @IsString()
  @MaxLength(8)
  reaction: string;
}

/**
 * DTO для поиска чатов
 */
export class SearchChatsDto {
  @ApiPropertyOptional({
    description: 'Search query string to filter chats by title or description',
    maxLength: 255,
    example: 'development team',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  searchQuery?: string;

  @ApiPropertyOptional({
    description: 'Filter chats by type',
    enum: ChatType,
    example: ChatType.GROUP,
    enumName: 'ChatType',
  })
  @IsOptional()
  @IsEnum(ChatType)
  chatType?: ChatType;

  @ApiPropertyOptional({
    description: 'Maximum number of chats to return',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Offset for pagination',
    minimum: 0,
    default: 0,
    example: 0,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  offset?: number = 0;

  @ApiPropertyOptional({
    description: 'Show only muted chats',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  onlyMuted?: boolean;

  @ApiPropertyOptional({
    description: 'Show only chats with unread messages',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  onlyUnread?: boolean;
}

/**
 * DTO для обновления информации о чате
 */
export class UpdateChatDto {
  @ApiPropertyOptional({
    description: 'New title for the chat',
    minLength: 1,
    maxLength: 128,
    example: 'Updated Development Team Discussion',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  title?: string;

  @ApiPropertyOptional({
    description: 'New description for the chat',
    maxLength: 500,
    example: 'Updated description for the development team chat',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'New avatar URL for the chat',
    maxLength: 200,
    example: 'https://example.com/avatar.jpg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  avatarUrl?: string;
}

/**
 * DTO для закрепления сообщения в чате
 */
export class PinMessageDto {
  @ApiProperty({
    description: 'ID of the chat where message should be pinned',
    example: '12345678901234567890',
  })
  @IsString()
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @ApiProperty({
    description: 'ID of the message to pin',
    example: '98765432101234567890',
  })
  @IsString()
  @Transform(({ value }) => BigInt(value))
  messageId: bigint;
}

/**
 * DTO для пересылки сообщения
 */
export class ForwardMessageDto {
  @ApiProperty({
    description: 'ID of the message to forward',
    example: '12345678901234567890',
  })
  @IsString()
  @Transform(({ value }) => BigInt(value))
  messageId: bigint;

  @ApiProperty({
    description: 'Array of chat IDs where the message should be forwarded',
    type: [String],
    example: ['98765432101234567890', '11111111111111111111'],
  })
  @IsArray()
  @Type(() => String)
  @Transform(({ value }) => value.map((id: string) => BigInt(id)))
  targetChatIds: bigint[];

  @ApiPropertyOptional({
    description: 'Optional comment to add when forwarding the message',
    maxLength: 255,
    example: 'Check this out!',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  comment?: string;
}

/**
 * DTO для создания треда (ветки обсуждения)
 */
export class CreateThreadDto {
  @ApiProperty({
    description: 'ID of the chat where thread should be created',
    example: '12345678901234567890',
  })
  @IsString()
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @ApiPropertyOptional({
    description: 'Optional title for the thread',
    maxLength: 128,
    example: 'Discussion about feature X',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string;

  @ApiProperty({
    description: 'ID of the message that starts the thread',
    example: '98765432101234567890',
  })
  @IsString()
  @Transform(({ value }) => BigInt(value))
  replyToMessageId: bigint;
}

/**
 * DTO для массовых операций модерации
 */
export class BulkModerationDto {
  @ApiProperty({
    description: 'ID of the chat where moderation actions should be applied',
    example: '12345678901234567890',
  })
  @IsString()
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @ApiProperty({
    description: 'Array of message IDs to apply the action to',
    type: [String],
    example: ['98765432101234567890', '11111111111111111111'],
  })
  @IsArray()
  @Type(() => String)
  @Transform(({ value }) => value.map((id: string) => BigInt(id)))
  messageIds: bigint[];

  @ApiProperty({
    description: 'Moderation action to perform on the messages',
    enum: ['delete', 'flag', 'pin', 'unpin'],
    example: 'delete',
  })
  @IsIn(['delete', 'flag', 'pin', 'unpin'])
  action: 'delete' | 'flag' | 'pin' | 'unpin';

  @ApiPropertyOptional({
    description: 'Optional reason for the moderation action',
    maxLength: 500,
    example: 'Violated community guidelines',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * DTO для проверки разрешений пользователя в чате
 */
export class CheckPermissionsDto {
  @ApiProperty({
    description: 'Array of permission names to check',
    type: [String],
    example: ['SEND_MESSAGES', 'DELETE_MESSAGES', 'BAN_MEMBERS'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  permissions: string[];
}

/**
 * DTO для архивации старых сообщений
 */
export class ArchiveMessagesDto {
  @ApiProperty({
    description: 'Archive all messages created before this date',
    type: Date,
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsString()
  @Transform(({ value }) => new Date(value))
  beforeDate: Date;
}

// Export new DTOs for stickers, GIFs, and emojis
export * from './stickers-gifs.dto';
