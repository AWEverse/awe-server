import { IsString, IsOptional, IsBoolean, IsArray, IsEnum, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '../types';

/**
 * DTO для отправки сообщения через WebSocket
 */
export class SendMessageDto {
  @ApiProperty({
    description: 'ID of the chat to send message to',
    example: '12345678901234567890',
  })
  @IsString()
  chatId: string;

  @ApiPropertyOptional({
    description: 'Message content (text)',
    example: 'Hello everyone! 👋',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description: 'Type of message',
    enum: MessageType,
    default: MessageType.TEXT,
    example: MessageType.TEXT,
    enumName: 'MessageType',
  })
  @IsOptional()
  @IsEnum(MessageType)
  messageType?: MessageType;

  @ApiPropertyOptional({
    description: 'ID of the message this is replying to',
    example: '98765432101234567890',
  })
  @IsOptional()
  @IsString()
  replyToId?: string;

  @ApiPropertyOptional({
    description: 'ID of the thread this message belongs to',
    example: '11111111111111111111',
  })
  @IsOptional()
  @IsString()
  threadId?: string;

  @ApiPropertyOptional({
    description: 'Array of file attachments',
    type: [Object],
    example: [{ type: 'image', url: 'https://example.com/image.jpg', name: 'photo.jpg' }],
  })
  @IsOptional()
  @IsArray()
  attachments?: any[];

  @ApiPropertyOptional({
    description: 'Client-side temporary ID for message tracking',
    example: 'temp_msg_123456',
  })
  @IsOptional()
  @IsString()
  tempId?: string;

  @ApiPropertyOptional({
    description: 'ID of sticker to send',
    example: '98765432101234567890',
  })
  @IsOptional()
  @IsString()
  stickerId?: string;

  @ApiPropertyOptional({
    description: 'ID of GIF to send',
    example: 'giphy_abc123def456',
  })
  @IsOptional()
  @IsString()
  gifId?: string;

  @ApiPropertyOptional({
    description: 'ID of custom emoji to send',
    example: '98765432101234567890',
  })
  @IsOptional()
  @IsString()
  customEmojiId?: string;
}

/**
 * DTO для редактирования сообщения через WebSocket
 */
export class EditMessageDto {
  @ApiProperty({
    description: 'ID of the message to edit',
    example: '12345678901234567890',
  })
  @IsString()
  messageId: string;

  @ApiProperty({
    description: 'New content for the message',
    example: 'Updated message content',
  })
  @IsString()
  content: string;
}

/**
 * DTO для индикатора набора текста
 */
export class TypingIndicatorDto {
  @ApiProperty({
    description: 'ID of the chat where user is typing',
    example: '12345678901234567890',
  })
  @IsString()
  chatId: string;
}

/**
 * DTO для реакции на сообщение через WebSocket
 */
export class MessageReactionDto {
  @ApiProperty({
    description: 'ID of the message to react to',
    example: '12345678901234567890',
  })
  @IsString()
  messageId: string;

  @ApiProperty({
    description: 'Emoji reaction',
    example: '👍',
  })
  @IsString()
  emoji: string;
}

/**
 * DTO для статуса онлайн пользователя
 */
export class OnlineStatusDto {
  @ApiProperty({
    description: 'Whether user is online',
    example: true,
  })
  @IsBoolean()
  isOnline: boolean;
}

/**
 * DTO для присоединения к чату через WebSocket
 */
export class JoinChatDto {
  @ApiProperty({
    description: 'ID of the chat to join',
    example: '12345678901234567890',
  })
  @IsString()
  chatId: string;
}

/**
 * DTO для покидания чата через WebSocket
 */
export class LeaveChatDto {
  @ApiProperty({
    description: 'ID of the chat to leave',
    example: '12345678901234567890',
  })
  @IsString()
  chatId: string;
}

/**
 * DTO для уведомления о доставке сообщения
 */
export class MessageDeliveryDto {
  @ApiProperty({
    description: 'ID of the message',
    example: '12345678901234567890',
  })
  @IsString()
  messageId: string;

  @ApiProperty({
    description: 'ID of the chat',
    example: '98765432101234567890',
  })
  @IsString()
  chatId: string;

  @ApiProperty({
    description: 'Whether message was delivered',
    example: true,
  })
  @IsBoolean()
  delivered: boolean;
}

/**
 * DTO для голосового/видео звонка
 */
export class VoiceCallDto {
  @ApiProperty({
    description: 'ID of the chat for the call',
    example: '12345678901234567890',
  })
  @IsString()
  chatId: string;

  @ApiProperty({
    description: 'Type of call (audio or video)',
    enum: ['audio', 'video'],
    example: 'video',
  })
  @IsString()
  callType: 'audio' | 'video';

  @ApiPropertyOptional({
    description: 'WebRTC SDP offer',
    example: 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\n...',
  })
  @IsOptional()
  @IsString()
  sdpOffer?: string;

  @ApiPropertyOptional({
    description: 'WebRTC SDP answer',
    example: 'v=0\r\no=- 987654321 2 IN IP4 127.0.0.1\r\n...',
  })
  @IsOptional()
  @IsString()
  sdpAnswer?: string;

  @ApiPropertyOptional({
    description: 'ICE candidates for WebRTC connection',
    type: [Object],
    example: [
      {
        candidate: 'candidate:1 1 UDP 2113667326 192.168.1.1 54400 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      },
    ],
  })
  @IsOptional()
  @IsArray()
  iceCandidates?: any[];
}

/**
 * DTO для отправки стикера через WebSocket
 */
export class SendStickerDto {
  @ApiProperty({
    description: 'ID of the chat to send sticker to',
    example: '12345678901234567890',
  })
  @IsString()
  chatId: string;

  @ApiProperty({
    description: 'ID of the sticker to send',
    example: '98765432101234567890',
  })
  @IsString()
  stickerId: string;

  @ApiPropertyOptional({
    description: 'ID of the message this is replying to',
    example: '11111111111111111111',
  })
  @IsOptional()
  @IsString()
  replyToId?: string;

  @ApiPropertyOptional({
    description: 'ID of the thread this sticker belongs to',
    example: '22222222222222222222',
  })
  @IsOptional()
  @IsString()
  threadId?: string;

  @ApiPropertyOptional({
    description: 'Client-side temporary ID for tracking',
    example: 'temp_sticker_123456',
  })
  @IsOptional()
  @IsString()
  tempId?: string;
}

/**
 * DTO для отправки GIF через WebSocket
 */
export class SendGifDto {
  @ApiProperty({
    description: 'ID of the chat to send GIF to',
    example: '12345678901234567890',
  })
  @IsString()
  chatId: string;

  @ApiProperty({
    description: 'ID of the GIF to send (from Giphy, Tenor, etc.)',
    example: 'giphy_abc123def456',
  })
  @IsString()
  gifId: string;

  @ApiPropertyOptional({
    description: 'ID of the message this is replying to',
    example: '11111111111111111111',
  })
  @IsOptional()
  @IsString()
  replyToId?: string;

  @ApiPropertyOptional({
    description: 'ID of the thread this GIF belongs to',
    example: '22222222222222222222',
  })
  @IsOptional()
  @IsString()
  threadId?: string;

  @ApiPropertyOptional({
    description: 'Client-side temporary ID for tracking',
    example: 'temp_gif_123456',
  })
  @IsOptional()
  @IsString()
  tempId?: string;
}

/**
 * DTO для отправки кастомного эмоджи через WebSocket
 */
export class SendCustomEmojiDto {
  @ApiProperty({
    description: 'ID of the chat to send custom emoji to',
    example: '12345678901234567890',
  })
  @IsString()
  chatId: string;

  @ApiProperty({
    description: 'ID of the custom emoji to send',
    example: '98765432101234567890',
  })
  @IsString()
  customEmojiId: string;

  @ApiPropertyOptional({
    description: 'ID of the message this is replying to',
    example: '11111111111111111111',
  })
  @IsOptional()
  @IsString()
  replyToId?: string;

  @ApiPropertyOptional({
    description: 'ID of the thread this emoji belongs to',
    example: '22222222222222222222',
  })
  @IsOptional()
  @IsString()
  threadId?: string;

  @ApiPropertyOptional({
    description: 'Client-side temporary ID for tracking',
    example: 'temp_emoji_123456',
  })
  @IsOptional()
  @IsString()
  tempId?: string;
}
