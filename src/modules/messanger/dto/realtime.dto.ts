import { IsString, IsOptional, IsBoolean, IsArray, IsEnum, IsNumber } from 'class-validator';
import { MessageType } from '../types';

export class SendMessageDto {
  @IsString()
  chatId: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(MessageType)
  messageType?: MessageType;

  @IsOptional()
  @IsString()
  replyToId?: string;

  @IsOptional()
  @IsString()
  threadId?: string;

  @IsOptional()
  @IsArray()
  attachments?: any[];

  @IsOptional()
  @IsString()
  tempId?: string; // Client-side temporary ID for message tracking

  // Поддержка стикеров
  @IsOptional()
  @IsString()
  stickerId?: string; // ID стикера для отправки

  // Поддержка GIF
  @IsOptional()
  @IsString()
  gifId?: string; // ID GIF для отправки

  // Поддержка кастомных эмоджи
  @IsOptional()
  @IsString()
  customEmojiId?: string; // ID кастомного эмоджи
}

export class EditMessageDto {
  @IsString()
  messageId: string;

  @IsString()
  content: string;
}

export class TypingIndicatorDto {
  @IsString()
  chatId: string;
}

export class MessageReactionDto {
  @IsString()
  messageId: string;

  @IsString()
  emoji: string;
}

export class OnlineStatusDto {
  @IsBoolean()
  isOnline: boolean;
}

export class JoinChatDto {
  @IsString()
  chatId: string;
}

export class LeaveChatDto {
  @IsString()
  chatId: string;
}

export class MessageDeliveryDto {
  @IsString()
  messageId: string;

  @IsString()
  chatId: string;

  @IsBoolean()
  delivered: boolean;
}

export class VoiceCallDto {
  @IsString()
  chatId: string;

  @IsString()
  callType: 'audio' | 'video';

  @IsOptional()
  @IsString()
  sdpOffer?: string;

  @IsOptional()
  @IsString()
  sdpAnswer?: string;

  @IsOptional()
  @IsArray()
  iceCandidates?: any[];
}

// Новые DTO для стикеров
export class SendStickerDto {
  @IsString()
  chatId: string;

  @IsString()
  stickerId: string;

  @IsOptional()
  @IsString()
  replyToId?: string;

  @IsOptional()
  @IsString()
  threadId?: string;

  @IsOptional()
  @IsString()
  tempId?: string;
}

export class SendGifDto {
  @IsString()
  chatId: string;

  @IsString()
  gifId: string;

  @IsOptional()
  @IsString()
  replyToId?: string;

  @IsOptional()
  @IsString()
  threadId?: string;

  @IsOptional()
  @IsString()
  tempId?: string;
}

export class SendCustomEmojiDto {
  @IsString()
  chatId: string;

  @IsString()
  customEmojiId: string;

  @IsOptional()
  @IsString()
  replyToId?: string;

  @IsOptional()
  @IsString()
  threadId?: string;

  @IsOptional()
  @IsString()
  tempId?: string;
}
