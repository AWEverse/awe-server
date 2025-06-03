import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/libs/supabase/db/prisma.service';
import { IChatService } from './interfaces/chat.interface';
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
  ChatFlags,
  ChatParticipantFlags,
  MessageFlags,
  UserInfo,
} from './types';
import { ChatStatistics, UserChatStatistics } from './types/statistics.type';
import { MessangerRepository } from './messanger.repository';
import { callPgFunction } from '../common/db/callPgFunction';

@Injectable()
export class MessangerService implements IChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: MessangerRepository,
  ) {}

  getUserStatistics(userId: bigint, requesterId: bigint): Promise<UserChatStatistics> {
    throw new Error('Method not implemented.');
  }

  getUnreadInfo(userId: bigint): Promise<{
    totalUnread: number;
    chatUnreads: Array<{ chatId: bigint; unreadCount: number; lastMessageAt: Date }>;
  }> {
    throw new Error('Method not implemented.');
  }

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
  ): Promise<PaginatedMessages> {
    throw new Error('Method not implemented.');
  }

  async createChat(
    userId: bigint,
    type: ChatType,
    title?: string,
    description?: string,
    participantIds: bigint[] = [],
    isPublic: boolean = false,
    inviteLink?: string,
  ): Promise<ChatInfo> {
    try {
      const result = await this.prisma.$transaction(async tx => {
        // 1. Create the chat with only the owner
        const chat = await tx.chat.create({
          data: {
            title,
            description,
            type,
            inviteLink,
            createdBy: { connect: { id: userId } },
          },
        });

        // 2. Add the owner as a ChatParticipant with role OWNER
        await tx.chatParticipant.create({
          data: {
            chatId: chat.id,
            userId: userId,
            role: 'OWNER',
            joinedAt: new Date(),
          },
        });

        // 3. Add other participants as ChatParticipant with role MEMBER
        if (participantIds && participantIds.length > 0) {
          const uniqueIds = Array.from(new Set(participantIds.filter(id => id !== userId)));
          if (uniqueIds.length > 0) {
            await tx.chatParticipant.createMany({
              data: uniqueIds.map(pid => ({
                chatId: chat.id,
                userId: pid,
                role: 'MEMBER',
                joinedAt: new Date(),
              })),
              skipDuplicates: true,
            });
          }
        }

        // 4. Return the chat info with creator
        const chatWithCreator = await tx.chat.findUnique({
          where: { id: chat.id },
          include: {
            createdBy: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatarUrl: true,
                flags: true,
                lastSeen: true,
              },
            },
          },
        });
        if (!chatWithCreator) {
          throw new NotFoundException('Chat not found after creation');
        }
        return chatWithCreator;
      });

      return this.formatChatInfo(result);
    } catch (error) {
      throw new BadRequestException(`Failed to create chat: ${error.message}`);
    }
  }

  async getChatInfo(chatId: bigint, userId: bigint): Promise<ChatInfo> {
    const hasAccess = await this.checkChatAccess(chatId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this chat');
    }

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId, deletedAt: undefined },
      include: {
        createdBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
            flags: true,
            lastSeen: true,
          },
        },
      },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    return this.formatChatInfo(chat);
  }

  async updateChat(
    chatId: bigint,
    userId: bigint,
    updates: {
      title?: string;
      description?: string;
      avatarUrl?: string;
    },
  ): Promise<ChatInfo> {
    const hasAccess = await this.checkChatAccess(chatId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('No permission to edit this chat');
    }

    const updatedChat = await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
      include: {
        createdBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
            flags: true,
            lastSeen: true,
          },
        },
      },
    });

    return this.formatChatInfo(updatedChat);
  }

  async deleteChat(chatId: bigint, userId: bigint): Promise<boolean> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: { createdById: true },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (chat.createdById !== userId) {
      throw new ForbiddenException('Only chat owner can delete the chat');
    }

    await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        deletedAt: new Date(),
      },
    });

    return true;
  }

  async getUserChats(
    userId: bigint,
    options?: {
      searchQuery?: string;
      chatType?: ChatType;
      limit?: number;
      offset?: number;
      onlyMuted?: boolean;
      onlyUnread?: boolean;
    },
  ): Promise<ChatInfo[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const chats = await this.repo.getUserChatsRaw(
      userId,
      limit,
      offset,
      options?.chatType,
      options?.searchQuery,
      options?.onlyUnread,
    );

    const chatIds = chats.map(chat => chat.chat_id);
    const chatCreators = await this.prisma.chat.findMany({
      where: { id: { in: chatIds } },
      include: {
        createdBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
            flags: true,
            lastSeen: true,
          },
        },
      },
    });
    const creatorsMap = new Map(chatCreators.map(chat => [chat.id, chat.createdBy]));

    return chats.map(chat => {
      const creator = creatorsMap.get(chat.chat_id);
      const formattedCreator: UserInfo = creator
        ? {
            id: creator.id,
            username: creator.username,
            fullName: creator.fullName || undefined,
            avatarUrl: creator.avatarUrl || undefined,
            flags: creator.flags,
            lastSeen: creator.lastSeen || undefined,
          }
        : {
            id: BigInt(0),
            username: 'unknown',
            fullName: undefined,
            avatarUrl: undefined,
            flags: 0,
            lastSeen: undefined,
          };

      return {
        id: chat.chat_id,
        type: chat.chat_type as ChatType,
        title: chat.title || undefined,
        description: chat.description || undefined,
        avatarUrl: chat.avatar_url || undefined,
        flags: chat.flags || 0,
        memberCount: chat.member_count || 0,
        lastMessageAt: chat.last_message_at || undefined,
        lastMessageText: chat.last_message_text || undefined,
        inviteLink: undefined,
        createdAt: chat.created_at,
        createdBy: formattedCreator,
      };
    });
  }

  async sendMessage(
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
  ): Promise<MessageInfo> {
    try {
      const contentStr = typeof content === 'string' ? content : content.toString();
      const msgType = messageType || MessageType.TEXT;

      const result = await this.prisma.$queryRaw<
        Array<{
          message_id: bigint;
          success: boolean;
          error_message: string | undefined;
        }>
      >`
        SELECT * FROM send_optimized_message(
          ${chatId}::bigint,
          ${senderId}::bigint,
          ${msgType}::text,
          ${contentStr}::text,
          ${options?.replyToId || undefined}::bigint,
          ${options?.threadId || undefined}::bigint,
          ${0}::integer
        )
      `;

      if (!result[0].success) {
        throw new BadRequestException(result[0].error_message || 'Failed to send message');
      }

      const messageId = result[0].message_id;

      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
              flags: true,
              lastSeen: true,
            },
          },
          replyTo: {
            include: {
              sender: {
                select: {
                  id: true,
                  username: true,
                  fullName: true,
                  avatarUrl: true,
                  flags: true,
                  lastSeen: true,
                },
              },
            },
          },
          attachments: true,
          reactions: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  fullName: true,
                  avatarUrl: true,
                  flags: true,
                  lastSeen: true,
                },
              },
            },
          },
        },
      });

      if (!message) {
        throw new NotFoundException('Message not found after creation');
      }

      return this.formatMessageInfo(message);
    } catch (error) {
      throw new BadRequestException(`Failed to send message: ${error.message}`);
    }
  }
  async getChatMessages(
    chatId: bigint,
    userId: bigint,
    options?: {
      limit?: number;
      offset?: number;
      beforeMessageId?: bigint;
      afterMessageId?: bigint;
      messageType?: MessageType;
      searchQuery?: string;
    },
  ): Promise<PaginatedMessages> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const messages = await this.repo.getChatMessagesRaw(
      chatId,
      userId,
      limit,
      offset,
      options?.beforeMessageId,
      options?.afterMessageId,
      options?.messageType,
      options?.searchQuery,
    );

    const formattedMessages: MessageInfo[] = messages.map(msg => ({
      id: msg.message_id,
      chatId: chatId,
      senderId: msg.sender_id,
      content: Buffer.from(msg.content),
      header: Buffer.alloc(0),
      messageType: msg.message_type as MessageType,
      flags: msg.flags,
      createdAt: msg.created_at,
      updatedAt: msg.updated_at,
      editedAt: msg.edited_at || undefined,
      deletedAt: undefined,
      replyToId: msg.reply_to_message_id || undefined,
      forwardedFromId: undefined,
      threadId: msg.thread_id || undefined,
      replyDepth: 0,
      sender: {
        id: msg.sender_id,
        username: msg.sender_username,
        fullName: msg.sender_full_name || undefined,
        avatarUrl: msg.sender_avatar_url || undefined,
        flags: 0,
        lastSeen: undefined,
      },
      replyTo: undefined,
      attachments: [],
      reactions: [],
    }));

    return {
      messages: formattedMessages,
      hasMore: formattedMessages.length === limit,
      nextCursor: formattedMessages.length === limit ? String(offset + limit) : undefined,
    };
  }

  async getMessages(
    chatId: bigint,
    userId: bigint,
    options?: {
      limit?: number;
      beforeMessageId?: bigint;
      afterMessageId?: bigint;
      threadId?: bigint;
    },
  ): Promise<PaginatedMessages> {
    const limit = options?.limit ?? 50;
    const where: any = { chatId, deletedAt: undefined };
    if (options?.beforeMessageId) where.id = { lt: options.beforeMessageId };
    if (options?.afterMessageId) where.id = { gt: options.afterMessageId };
    if (options?.threadId) where.threadId = options.threadId;
    const messages = await this.prisma.message.findMany({
      where,
      include: { sender: true, attachments: true, reactions: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return {
      messages: messages.map(m => this.formatMessageInfo(m)),
      hasMore: messages.length === limit,
      nextCursor: messages.length === limit ? String(messages[messages.length - 1].id) : undefined,
    };
  }

  async getChatParticipants(
    chatId: bigint,
    userId: bigint,
    options?: {
      limit?: number;
      offset?: number;
      roleFilter?: ChatRole;
    },
  ): Promise<ChatParticipantInfo[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const participants = await this.repo.getChatParticipantsRaw(
      chatId,
      userId,
      limit,
      offset,
      options?.roleFilter,
    );
    return participants.map(p => ({
      id: BigInt(0),
      chatId: chatId,
      userId: p.user_id,
      role: p.role as ChatRole,
      flags: p.flags,
      joinedAt: p.joined_at,
      leftAt: undefined,
      mutedUntil: undefined,
      user: {
        id: p.user_id,
        username: p.username,
        fullName: p.full_name || undefined,
        avatarUrl: p.avatar_url || undefined,
        flags: 0,
        lastSeen: p.last_seen || undefined,
      },
    }));
  }

  async addParticipant(
    chatId: bigint,
    userId: bigint,
    addedById: bigint,
    role?: ChatRole,
  ): Promise<boolean> {
    const hasAccess = await this.checkChatAccess(chatId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('No permission to add members');
    }

    const existingParticipant = await this.prisma.chatParticipant.findFirst({
      where: {
        chatId,
        userId: addedById,
        leftAt: undefined,
      },
    });

    if (existingParticipant) {
      throw new BadRequestException('User is already a participant');
    }

    await this.prisma.chatParticipant.create({
      data: {
        chatId,
        userId: addedById,
        role: role ?? ChatRole.MEMBER,
        joinedAt: new Date(),
      },
    });

    await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        memberCount: {
          increment: 1,
        },
      },
    });

    return true;
  }

  async removeParticipant(chatId: bigint, userId: bigint, removedById: bigint): Promise<boolean> {
    const hasAccess = await this.checkChatAccess(chatId, removedById);
    if (!hasAccess) {
      throw new ForbiddenException('No permission to remove members');
    }

    const participant = await this.prisma.chatParticipant.findFirst({
      where: {
        chatId,
        userId,
        leftAt: undefined,
      },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    await this.prisma.chatParticipant.update({
      where: { id: participant.id },
      data: {
        leftAt: new Date(),
      },
    });

    await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        memberCount: {
          decrement: 1,
        },
      },
    });

    return true;
  }

  async searchChats(
    userId: bigint,
    query: string,
    options?: {
      chatType?: ChatType;
      limit?: number;
      offset?: number;
      publicOnly?: boolean;
    },
  ): Promise<ChatInfo[]> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    const results = await this.repo.searchChatsRaw(
      userId,
      query,
      limit,
      offset,
      options?.chatType,
      options?.publicOnly,
    );

    return results.map(chat => ({
      id: chat.chat_id,
      type: chat.chat_type as ChatType,
      title: chat.title,
      description: chat.description,
      avatarUrl: chat.avatar_url,
      flags: 0,
      memberCount: chat.member_count,
      lastMessageAt: undefined,
      lastMessageText: undefined,
      inviteLink: undefined,
      createdAt: new Date(),
      createdBy: {
        id: BigInt(0),
        username: 'unknown',
        fullName: 'Unknown User',
        avatarUrl: undefined,
        flags: 0,
        lastSeen: undefined,
      },
    }));
  }

  async getChatStatistics(chatId: bigint, userId: bigint): Promise<ChatStatistics> {
    throw new Error('Method not implemented.');
  }

  private async checkChatAccess(chatId: bigint, userId: bigint): Promise<boolean> {
    const participant = await this.prisma.chatParticipant.findFirst({
      where: {
        chatId,
        userId,
        leftAt: undefined,
      },
    });

    return !!participant;
  }

  private formatChatInfo(chat: any): ChatInfo {
    return {
      id: chat.id,
      type: chat.type,
      title: chat.title,
      description: chat.description,
      avatarUrl: chat.avatarUrl,
      flags: chat.flags || 0,
      inviteLink: chat.inviteLink,
      memberCount: chat.memberCount || 0,
      lastMessageAt: chat.lastMessageAt,
      lastMessageText: chat.lastMessageText,
      createdAt: chat.createdAt,
      createdBy: chat.createdBy || {
        id: chat.createdById,
        username: 'unknown',
        fullName: 'Unknown User',
        avatarUrl: undefined,
        flags: 0,
        lastSeen: undefined,
      },
    };
  }

  private formatMessageInfo(message: any): MessageInfo {
    return {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      content: message.content,
      header: message.header,
      messageType: message.messageType,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      editedAt: message.editedAt,
      flags: message.flags,
      deletedAt: message.deletedAt,
      replyToId: message.replyToId,
      forwardedFromId: message.forwardedFromId,
      threadId: message.threadId,
      replyDepth: message.replyDepth || 0,
      sender: message.sender
        ? {
            id: message.sender.id,
            username: message.sender.username,
            avatarUrl: message.sender.avatarUrl,
            fullName: message.sender.fullName,
            flags: message.sender.flags || 0,
            lastSeen: message.sender.lastSeen,
          }
        : {
            id: message.senderId,
            username: 'unknown',
            fullName: 'Unknown User',
            avatarUrl: undefined,
            flags: 0,
            lastSeen: undefined,
          },
      replyTo: message.replyTo ? this.formatMessageInfo(message.replyTo) : undefined,
      attachments: message.attachments || [],
      reactions:
        message.reactions?.map((r: any) => ({
          id: r.id,
          messageId: r.messageId,
          userId: r.userId,
          reaction: r.reaction,
          createdAt: r.createdAt,
          user: r.user,
        })) || [],
    };
  }

  async markMessagesAsRead(chatId: bigint, userId: bigint, upToMessageId: bigint): Promise<number> {
    const result = await this.prisma.messageRead.createMany({
      data: [
        {
          messageId: upToMessageId,
          userId: userId,
          readAt: new Date(),
        },
      ],
      skipDuplicates: true,
    });
    await this.prisma.messageRead.update({
      where: { messageId_userId: { messageId: upToMessageId, userId } },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async searchInAllChats(
    userId: bigint,
    query: string,
    options?: { chatType?: ChatType; limit?: number; offset?: number },
  ): Promise<{ chats: ChatInfo[]; messages: MessageInfo[] }> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const chats = await this.prisma.chat.findMany({
      where: {
        participants: { some: { userId, leftAt: undefined } },
        deletedAt: undefined,
        ...(options?.chatType && { type: options.chatType }),
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      skip: offset,
    });
    const messages = await this.prisma.message.findMany({
      where: {
        chat: { participants: { some: { userId, leftAt: undefined } } },
        deletedAt: undefined,
        ...(options?.chatType && { type: options.chatType }),
        content: { equals: Buffer.from(query) },
      },
      include: { sender: true, attachments: true, reactions: true },
      take: limit,
      skip: offset,
    });
    return {
      chats: chats.map(c => this.formatChatInfo(c)),
      messages: messages.map(m => this.formatMessageInfo(m)),
    };
  }

  async editMessage(
    messageId: bigint,
    userId: bigint,
    content: string | Buffer,
    header?: Record<string, any>,
  ): Promise<MessageInfo> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new Error('Message not found');
    if (message.senderId !== userId) throw new Error('No permission to edit');
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: Buffer.isBuffer(content) ? content : Buffer.from(content),
        header: header ? Buffer.from(JSON.stringify(header)) : message.header,
        editedAt: new Date(),
        flags: message.flags | 2,
        updatedAt: new Date(),
      },
      include: { sender: true, attachments: true, reactions: true },
    });
    return this.formatMessageInfo(updated);
  }
  async deleteMessage(messageId: bigint, userId: bigint, forEveryone?: boolean): Promise<boolean> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new Error('Message not found');
    if (message.senderId !== userId) throw new Error('No permission to delete');
    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        flags: message.flags | 1,
        updatedAt: new Date(),
      },
    });
    return true;
  }

  async addReaction(messageId: bigint, userId: bigint, reaction: string): Promise<MessageReaction> {
    const result = await this.prisma.messageReaction.upsert({
      where: { messageId_userId_reaction: { messageId, userId, reaction } },
      update: { createdAt: new Date() },
      create: { messageId, userId, reaction, createdAt: new Date() },
      include: { user: true },
    });
    return {
      ...result,
      user: {
        id: result.user.id,
        username: result.user.username,
        fullName: result.user.fullName || undefined,
        avatarUrl: result.user.avatarUrl || undefined,
        flags: result.user.flags || 0,
        lastSeen: result.user.lastSeen || undefined,
      },
    };
  }
  async removeReaction(messageId: bigint, userId: bigint, reaction: string): Promise<boolean> {
    await this.prisma.messageReaction.deleteMany({ where: { messageId, userId, reaction } });
    return true;
  }

  async forwardMessages(
    messageIds: bigint[],
    targetChatIds: bigint[],
    userId: bigint,
    comment?: string,
  ): Promise<MessageInfo[]> {
    const messages = await this.prisma.message.findMany({ where: { id: { in: messageIds } } });
    const result: MessageInfo[] = [];
    for (const toChatId of targetChatIds) {
      for (const message of messages) {
        const forwarded = await this.prisma.message.create({
          data: {
            chatId: toChatId,
            senderId: userId,
            content: message.content,
            header: message.header,
            messageType: message.messageType,
            forwardedFromId: message.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          include: { sender: true, attachments: true, reactions: true },
        });
        result.push(this.formatMessageInfo(forwarded));
      }
    }
    return result;
  }

  async pinMessage(chatId: bigint, messageId: bigint, userId: bigint): Promise<boolean> {
    await this.prisma.chat.update({ where: { id: chatId }, data: { pinnedMessageId: messageId } });
    return true;
  }
  async unpinMessage(chatId: bigint, userId: bigint): Promise<boolean> {
    await this.prisma.chat.update({ where: { id: chatId }, data: { pinnedMessageId: null } });
    return true;
  }
  async getPinnedMessages(chatId: bigint, userId: bigint): Promise<MessageInfo[]> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { pinnedMessage: { include: { sender: true, attachments: true, reactions: true } } },
    });
    if (!chat?.pinnedMessage) return [];
    return [this.formatMessageInfo(chat.pinnedMessage)];
  }

  async muteParticipant(
    chatId: bigint,
    userId: bigint,
    mutedById: bigint,
    mutedUntil?: Date,
  ): Promise<boolean> {
    await this.prisma.chatParticipant.updateMany({
      where: { chatId, userId },
      data: {
        flags: { increment: 4 },
        mutedUntil: mutedUntil ?? new Date(Date.now() + 3600 * 1000),
      },
    });
    return true;
  }

  async unmuteParticipant(chatId: bigint, userId: bigint, unmutedById: bigint): Promise<boolean> {
    await this.prisma.chatParticipant.updateMany({
      where: { chatId, userId },
      data: { flags: { decrement: 4 }, mutedUntil: null },
    });
    return true;
  }

  async banParticipant(
    chatId: bigint,
    userId: bigint,
    bannedById: bigint,
    reason?: string,
  ): Promise<boolean> {
    await this.prisma.chatParticipant.updateMany({
      where: { chatId, userId },
      data: { flags: { increment: 8 }, leftAt: new Date() },
    });
    return true;
  }

  async unbanParticipant(chatId: bigint, userId: bigint, unbannedById: bigint): Promise<boolean> {
    await this.prisma.chatParticipant.updateMany({
      where: { chatId, userId, leftAt: undefined },
      data: { flags: { decrement: 8 }, leftAt: null },
    });
    return true;
  }

  async updateParticipantRole(
    chatId: bigint,
    userId: bigint,
    newRole: ChatRole,
    updatedById: bigint,
  ): Promise<boolean> {
    await this.prisma.chatParticipant.updateMany({
      where: { chatId, userId },
      data: { role: newRole },
    });
    return true;
  }
  async joinChatByInvite(inviteCode: string, userId: bigint): Promise<ChatInfo> {
    const chat = await this.prisma.chat.findFirst({
      where: { inviteLink: inviteCode, deletedAt: undefined },
    });
    if (!chat) throw new Error('Invite not found');
    await this.prisma.chatParticipant.create({
      data: { chatId: chat.id, userId, role: 'MEMBER', joinedAt: new Date() },
    });
    return this.formatChatInfo(chat);
  }

  async leaveChat(chatId: bigint, userId: bigint): Promise<boolean> {
    await this.prisma.chatParticipant.updateMany({
      where: { chatId, userId, leftAt: undefined },
      data: { leftAt: new Date() },
    });
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId } });
    await this.prisma.chat.update({
      where: { id: chatId },
      data: { memberCount: { decrement: 1 } },
    });
    return true;
  }
  async generateInviteLink(chatId: bigint, userId: bigint): Promise<string> {
    const invite = Math.random().toString(36).substring(2, 10);
    await this.prisma.chat.update({ where: { id: chatId }, data: { inviteLink: invite } });
    return invite;
  }

  async revokeInviteLink(chatId: bigint, userId: bigint): Promise<boolean> {
    await this.prisma.chat.update({ where: { id: chatId }, data: { inviteLink: null } });
    return true;
  }

  async uploadAttachment(file: any, messageId: bigint, userId: bigint): Promise<MessageAttachment> {
    const url = `https://cdn.example.com/${file.filename}`;
    const attachment = await this.prisma.messageAttachment.create({
      data: {
        messageId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileHash: '',
        fileKey: file.filename,
        fileIV: '',

        fileSize: file.size,
        fileType: file.mimetype,
        url,
        thumbnail: undefined,
        description: undefined,
      },
    });
    return { ...attachment, thumbnail: undefined, description: undefined };
  }
  async downloadAttachment(attachmentId: bigint, userId: bigint): Promise<Buffer> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) throw new Error('Attachment not found');
    return Buffer.alloc(0);
  }

  async createThread(
    chatId: bigint,
    userId: bigint,
    replyToMessageId: bigint,
    title?: string,
  ): Promise<MessageThread> {
    const thread = await this.prisma.messageThread.create({
      data: {
        chatId,
        creatorId: userId,
        title: title ?? undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        flags: 1,
      },
    });
    await this.prisma.message.update({
      where: { id: replyToMessageId },
      data: { threadId: thread.id },
    });
    return { ...thread, title: thread.title ?? undefined };
  }
  async getThreadMessages(
    threadId: bigint,
    userId: bigint,
    options?: { limit?: number; beforeMessageId?: bigint },
  ): Promise<PaginatedMessages> {
    const limit = options?.limit ?? 50;
    const messages = await this.prisma.message.findMany({
      where: {
        threadId,
        deletedAt: undefined,
        ...(options?.beforeMessageId && { id: { lt: options.beforeMessageId } }),
      },
      include: { sender: true, attachments: true, reactions: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return {
      messages: messages.map(m => this.formatMessageInfo(m)),
      hasMore: messages.length === limit,
      nextCursor: messages.length === limit ? String(messages[messages.length - 1].id) : undefined,
    };
  }
  async getChatSettings(chatId: bigint, userId: bigint): Promise<ChatSettings> {
    const settings = await this.prisma.chatSettings.findUnique({ where: { chatId } });
    if (!settings) throw new Error('Settings not found');
    return { ...settings, settings: (settings.settings ?? {}) as Record<string, any> };
  }

  async updateChatSettings(
    chatId: bigint,
    userId: bigint,
    settings: Record<string, any>,
  ): Promise<ChatSettings> {
    const updated = await this.prisma.chatSettings.update({
      where: { chatId },
      data: { settings, updatedAt: new Date() },
    });
    return { ...updated, settings: (updated.settings ?? {}) as Record<string, any> };
  }
  async getUnreadCount(userId: bigint): Promise<number> {
    const info = await this.getUnreadInfo(userId);
    return info.totalUnread;
  }

  async getUserChatStatistics(userId: bigint): Promise<UserChatStatistics> {
    throw new Error('Method not implemented.');
  }

  // Исправление: корректная типизация UserInfo для reactions
  async getMessageReactions(messageId: bigint, userId: bigint): Promise<MessageReaction[]> {
    const reactions = await this.prisma.messageReaction.findMany({
      where: { messageId },
      include: { user: true },
    });
    return reactions.map(r => ({
      ...r,
      user: r.user
        ? {
            id: r.user.id,
            username: r.user.username,
            fullName: r.user.fullName || undefined,
            avatarUrl: r.user.avatarUrl || undefined,
            flags: r.user.flags || 0,
            lastSeen: r.user.lastSeen || undefined,
          }
        : undefined,
    }));
  }

  async bulkModerationAction(
    chatId: bigint,
    messageIds: bigint[],
    action: 'delete' | 'flag' | 'pin' | 'unpin',
    moderatorId: bigint,
    reason?: string,
  ): Promise<{ affected: number; errors: string[] }> {
    let affected = 0;
    const errors: string[] = [];
    for (const id of messageIds) {
      try {
        if (action === 'delete') {
          await this.prisma.message.update({
            where: { id },
            data: { deletedAt: new Date(), flags: { increment: 1 } },
          });
        } else if (action === 'flag') {
          await this.prisma.message.update({ where: { id }, data: { flags: { increment: 16 } } });
        } else if (action === 'pin') {
          await this.prisma.chat.update({ where: { id: chatId }, data: { pinnedMessageId: id } });
        } else if (action === 'unpin') {
          await this.prisma.chat.update({ where: { id: chatId }, data: { pinnedMessageId: null } });
        }
        affected++;
      } catch (e: any) {
        errors.push(`id=${id}: ${e.message}`);
      }
    }
    return { affected, errors };
  }
  async setSlowMode(
    chatId: bigint,
    moderatorId: bigint,
    intervalSeconds: number,
  ): Promise<boolean> {
    await this.prisma.chatSettings.upsert({
      where: { chatId },
      update: { settings: { slowMode: intervalSeconds }, updatedAt: new Date() },
      create: {
        chatId: chatId,
        settings: { slowMode: intervalSeconds },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return true;
  }

  async clearChatHistory(chatId: bigint, userId: bigint, beforeDate?: Date): Promise<number> {
    const where: any = { chatId };
    if (beforeDate) where.createdAt = { lt: beforeDate };
    const deleted = await this.prisma.message.updateMany({
      where,
      data: { deletedAt: new Date(), flags: { increment: 1 } },
    });
    return deleted.count;
  }

  async checkUserPermissions(
    chatId: bigint,
    userId: bigint,
    permissions: string[],
  ): Promise<Record<string, boolean>> {
    // Пример: всегда true
    return Object.fromEntries(permissions.map(p => [p, true]));
  }

  async archiveOldMessages(
    chatId: bigint,
    beforeDate: Date,
    userId: bigint,
  ): Promise<{ archivedCount: number; storageFreed: number }> {
    // Заглушка: ничего не архивируем
    return { archivedCount: 0, storageFreed: 0 };
  }
}
