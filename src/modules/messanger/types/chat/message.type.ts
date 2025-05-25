import { Sticker, CustomEmoji, Gif } from '../common.type';
import { UserInfo } from '../user.type';
import { MessageType } from './enum.type';

export interface MessageInfo {
  id: bigint;
  chatId: bigint;
  senderId: bigint;
  content: Buffer; // Зашифрованный контент
  header: Buffer; // Метаданные сообщения
  messageType: MessageType;
  flags: number;
  createdAt: Date;
  updatedAt: Date;
  editedAt?: Date;
  deletedAt?: Date;
  replyToId?: bigint;
  forwardedFromId?: bigint;
  threadId?: bigint;
  replyDepth: number;
  sender: UserInfo;
  replyTo?: MessageInfo;
  forwardedFrom?: MessageInfo;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
}

export interface MessageList {
  messages: MessageInfo[];
  totalCount: number;
  hasMore: boolean;
  nextOffset?: string;
  prevOffset?: string;
  lastMessageId?: bigint;
  firstMessageId?: bigint;
}

export interface MessageAttachment {
  id: bigint;
  messageId: bigint;
  fileName: string;
  mimeType: string;
  fileHash: string;
  fileKey: string;
  fileIV: string;
  fileSize: number;
  fileType: string;
  thumbnail?: string;
  description?: string;
  url: string;
  createdAt: Date;
}

export interface MessageReaction {
  id: bigint;
  messageId: bigint;
  userId: bigint;
  reaction: string;
  createdAt: Date;
  user?: UserInfo;
}

export interface MessageThread {
  id: bigint;
  chatId: bigint;
  creatorId: bigint;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
  flags: number;
}

export interface MessageSticker {
  id: bigint;
  messageId: bigint;
  stickerId: bigint;
  message: MessageInfo;
  sticker: Sticker;
}

export interface MessageEmoji {
  id: bigint;
  messageId: bigint;
  emojiId: bigint;
  message: MessageInfo;
  emoji: CustomEmoji;
}

export interface MessageGif {
  id: bigint;
  messageId: bigint;
  gifId: bigint;
  message: MessageInfo;
  gif: Gif;
}

export interface PaginatedMessages {
  messages: MessageInfo[];
  hasMore: boolean;
  nextCursor?: string;
}
