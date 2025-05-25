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
import { ChatType, MessageType, ChatRole } from '../types/chat.types';

export class CreateChatDto {
  @IsEnum(ChatType)
  type: ChatType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  @Type(() => String)
  @Transform(({ value }) => value.map((id: string) => BigInt(id)))
  participantIds?: bigint[];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean = false;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  inviteLink?: string;
}

export class SendMessageDto {
  @IsString()
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @IsNotEmpty()
  content: string | Buffer;

  @IsOptional()
  header?: Record<string, any>;

  @IsOptional()
  @IsEnum(MessageType)
  messageType?: MessageType = MessageType.TEXT;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? BigInt(value) : undefined))
  replyToId?: bigint;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? BigInt(value) : undefined))
  threadId?: bigint;
}

export class EditMessageDto {
  @IsString()
  @Transform(({ value }) => BigInt(value))
  messageId: bigint;

  @IsNotEmpty()
  content: string | Buffer;

  @IsOptional()
  header?: Record<string, any>;
}

export class GetMessagesDto {
  @IsString()
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? BigInt(value) : undefined))
  beforeMessageId?: bigint;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? BigInt(value) : undefined))
  afterMessageId?: bigint;
}

export class AddParticipantDto {
  @IsString()
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @IsString()
  @Transform(({ value }) => BigInt(value))
  userId: bigint;

  @IsOptional()
  @IsEnum(ChatRole)
  role?: ChatRole = ChatRole.MEMBER;
}

export class RemoveParticipantDto {
  @IsString()
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @IsString()
  @Transform(({ value }) => BigInt(value))
  userId: bigint;

  @IsOptional()
  @IsBoolean()
  ban?: boolean = false;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateParticipantRoleDto {
  @IsString()
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @IsString()
  @Transform(({ value }) => BigInt(value))
  userId: bigint;

  @IsEnum(ChatRole)
  role: ChatRole;
}

export class MuteParticipantDto {
  @IsString()
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @IsString()
  @Transform(({ value }) => BigInt(value))
  userId: bigint;

  @IsOptional()
  @Type(() => Date)
  mutedUntil?: Date;
}

export class MarkMessagesReadDto {
  @IsString()
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @IsString()
  @Transform(({ value }) => BigInt(value))
  upToMessageId: bigint;
}

export class AddReactionDto {
  @IsString()
  @Transform(({ value }) => BigInt(value))
  messageId: bigint;

  @IsString()
  @MaxLength(8)
  reaction: string;
}

export class RemoveReactionDto {
  @IsString()
  @Transform(({ value }) => BigInt(value))
  messageId: bigint;

  @IsString()
  @MaxLength(8)
  reaction: string;
}

export class SearchChatsDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  searchQuery?: string;

  @IsOptional()
  @IsEnum(ChatType)
  chatType?: ChatType;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  offset?: number = 0;

  @IsOptional()
  @IsBoolean()
  onlyMuted?: boolean;

  @IsOptional()
  @IsBoolean()
  onlyUnread?: boolean;
}

export class UpdateChatDto {
  @IsString()
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  avatarUrl?: string;
}

export class PinMessageDto {
  @IsString()
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @IsString()
  @Transform(({ value }) => BigInt(value))
  messageId: bigint;
}

export class ForwardMessageDto {
  @IsString()
  @Transform(({ value }) => BigInt(value))
  messageId: bigint;

  @IsArray()
  @Type(() => String)
  @Transform(({ value }) => value.map((id: string) => BigInt(id)))
  targetChatIds: bigint[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  comment?: string;
}

export class CreateThreadDto {
  @IsString()
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string;

  @IsString()
  @Transform(({ value }) => BigInt(value))
  replyToMessageId: bigint;
}

export class BulkModerationDto {
  @IsString()
  @Transform(({ value }) => BigInt(value))
  chatId: bigint;

  @IsArray()
  @Type(() => String)
  @Transform(({ value }) => value.map((id: string) => BigInt(id)))
  messageIds: bigint[];

  @IsIn(['delete', 'flag', 'pin', 'unpin'])
  action: 'delete' | 'flag' | 'pin' | 'unpin';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
