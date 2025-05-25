import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/libs/supabase/db/prisma.service';
import { ChatType, ChatRole, MessageType } from './types';

@Injectable()
export class MessangerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getUserChatsRaw(
    userId: bigint,
    limit: number,
    offset: number,
    chatType?: ChatType,
    searchQuery?: string,
    onlyUnread?: boolean,
  ) {
    return this.prisma.$queryRaw<Array<any>>`
      SELECT * FROM get_user_chats(
        ${userId}::bigint,
        ${limit}::integer,
        ${offset}::integer,
        ${chatType || undefined}::text,
        ${searchQuery || undefined}::text,
        ${onlyUnread || false}::boolean
      )
    `;
  }

  async getChatMessagesRaw(
    chatId: bigint,
    userId: bigint,
    limit: number,
    offset: number,
    beforeMessageId?: bigint,
    afterMessageId?: bigint,
    messageType?: MessageType,
    searchQuery?: string,
  ) {
    return this.prisma.$queryRaw<Array<any>>`
      SELECT * FROM get_chat_messages(
        ${chatId}::bigint,
        ${userId}::bigint,
        ${limit}::integer,
        ${offset}::integer,
        ${beforeMessageId || undefined}::bigint,
        ${afterMessageId || undefined}::bigint,
        ${messageType || undefined}::text,
        ${searchQuery || undefined}::text
      )
    `;
  }

  async getChatParticipantsRaw(
    chatId: bigint,
    userId: bigint,
    limit: number,
    offset: number,
    roleFilter?: ChatRole,
  ) {
    return this.prisma.$queryRaw<Array<any>>`
      SELECT * FROM get_chat_participants(
        ${chatId}::bigint,
        ${userId}::bigint,
        ${limit}::integer,
        ${offset}::integer,
        ${roleFilter || undefined}::text
      )
    `;
  }

  async searchChatsRaw(
    userId: bigint,
    query: string,
    limit: number,
    offset: number,
    chatType?: ChatType,
    publicOnly?: boolean,
  ) {
    return this.prisma.$queryRaw<Array<any>>`
      SELECT * FROM search_chats(
        ${userId}::bigint,
        ${query}::text,
        ${limit}::integer,
        ${offset}::integer,
        ${chatType || undefined}::text,
        ${publicOnly || false}::boolean
      )
    `;
  }

  async getChatStatisticsRaw(chatId: bigint, userId: bigint) {
    return this.prisma.$queryRaw<Array<any>>`
      SELECT * FROM get_chat_statistics(
        ${chatId}::bigint,
        ${userId}::bigint
      )
    `;
  }

  async getUnreadInfoRaw(userId: bigint) {
    return this.prisma.$queryRaw<Array<any>>`
      SELECT m."chatId" as chat_id, COUNT(*) as unread_count, MAX(m."createdAt") as last_message_at
      FROM "Message" m
      LEFT JOIN "MessageRead" r ON m.id = r."messageId" AND r."userId" = ${userId}
      WHERE r.id IS NULL AND m."deletedAt" IS NULL
      GROUP BY m."chatId"`;
  }

  async globalSearchMessagesRaw(
    query: string,
    options: {
      userId?: bigint;
      limit?: number;
      offset?: number;
      chatId?: bigint;
      senderId?: bigint;
      dateFrom?: Date;
      dateTo?: Date;
    } = {},
  ) {
    return this.prisma.$queryRaw<Array<any>>`
      SELECT * FROM global_search_messages(
        ${options.userId ?? null}::bigint,
        ${query}::text,
        ${options.limit ?? 50}::integer,
        ${options.offset ?? 0}::integer,
        ${options.chatId ?? null}::bigint,
        ${options.senderId ?? null}::bigint,
        ${options.dateFrom ?? null}::timestamptz,
        ${options.dateTo ?? null}::timestamptz
      )
    `;
  }

  async globalSearchChatsRaw(
    query: string,
    options: {
      userId?: bigint;
      limit?: number;
      offset?: number;
      type?: string;
      publicOnly?: boolean;
    } = {},
  ) {
    return this.prisma.$queryRaw<Array<any>>`
      SELECT * FROM global_search_chats(
        ${options.userId ?? null}::bigint,
        ${query}::text,
        ${options.limit ?? 50}::integer,
        ${options.offset ?? 0}::integer,
        ${options.type ?? null}::text,
        ${options.publicOnly ?? false}::boolean
      )
    `;
  }
}
