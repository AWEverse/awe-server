import {
  BadRequestException,
  NotFoundException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  PrivateChat,
  PrivateMessage,
  PrivateMessageAttachment,
} from '@prisma/client';

@Injectable()
export class PrivateService {
  constructor(private readonly prisma: PrismaService) {}

  async createPrivateChat(
    userId: bigint,
    recipientId: bigint,
    folderId?: bigint,
  ): Promise<PrivateChat> {
    if (userId === recipientId) {
      throw new BadRequestException('Cannot create chat with yourself');
    }

    const existingChat = await this.prisma.privateChat.findFirst({
      where: {
        members: {
          every: {
            user_id: { in: [userId, recipientId] },
          },
        },
      },
    });

    if (existingChat) {
      throw new BadRequestException('Chat already exists');
    }

    return this.prisma.privateChat.create({
      data: {
        folder_id: folderId || BigInt(0), 
        members: {
          create: [{ user_id: userId }, { user_id: recipientId }],
        },
      },
      include: {
        members: {
          include: { user: true },
        },
      },
    });
  }

  async sendMessage(
    chatId: bigint,
    userId: bigint,
    encryptedBody: string,
    replyToId?: bigint,
  ): Promise<PrivateMessage> {
    const chat = await this.validateChatAndMembership(chatId, userId);

    const message = await this.prisma.privateMessage.create({
      data: {
        chat_id: chatId,
        user_id: userId,
        encrypted_body: encryptedBody,
        msg_reply_id: replyToId,
      },
      include: {
        user: true,
        reply: true,
      },
    });

    await this.prisma.privateChat.update({
      where: { chat_id: chatId },
      data: {
        last_message_id: message.msg_id,
        unread_count: {
          increment: 1,
        },
      },
    });

    return message;
  }

  async addAttachment(
    messageId: bigint,
    userId: bigint,
    attachType: string,
    attachPath: string,
    metadata: {
      fileSize?: number;
      width?: number;
      height?: number;
      duration?: number;
      mimeType?: string;
      caption?: string;
    },
  ): Promise<PrivateMessageAttachment> {
    const message = await this.prisma.privateMessage.findUnique({
      where: { msg_id: messageId },
      include: { chat: true },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.user_id !== userId) {
      throw new BadRequestException('Only message author can add attachments');
    }

    return this.prisma.privateMessageAttachment.create({
      data: {
        msg_id: messageId,
        user_id: userId,
        chat_id: message.chat_id,
        attach_type: attachType, 
        attach_path: attachPath,
        file_size: metadata.fileSize ? BigInt(metadata.fileSize) : undefined,
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        mime_type: metadata.mimeType,
        caption: metadata.caption,
      },
    });
  }

  async addReaction(
    messageId: bigint,
    userId: bigint,
    emojiId: bigint,
  ): Promise<void> {
    const message = await this.validateMessageAndMembership(messageId, userId);

    await this.prisma.privateMessageReaction.upsert({
      where: {
        msg_id_user_id_emoji_id: {
          msg_id: messageId,
          user_id: userId,
          emoji_id: emojiId,
        },
      },
      update: {},
      create: {
        msg_id: messageId,
        user_id: userId,
        emoji_id: emojiId,
      },
    });
  }

  async getChatMessages(
    chatId: bigint,
    userId: bigint,
    options: {
      limit?: number;
      cursor?: bigint;
      direction?: 'asc' | 'desc';
    } = {},
  ): Promise<PrivateMessage[]> {
    await this.validateChatAndMembership(chatId, userId);

    const { limit = 50, cursor, direction = 'desc' } = options;

    return this.prisma.privateMessage.findMany({
      where: {
        chat_id: chatId,
        is_deleted: false,
      },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { msg_id: cursor } : undefined,
      orderBy: {
        created_at: direction,
      },
      include: {
        user: true,
        reply: true,
        reactions: { include: { emoji: true, user: true } },
        attachments: true,
      },
    });
  }

  async markMessagesAsRead(chatId: bigint, userId: bigint): Promise<void> {
    await this.validateChatAndMembership(chatId, userId);

    await this.prisma.$transaction([
      this.prisma.privateMessage.updateMany({
        where: {
          chat_id: chatId,
          user_id: { not: userId },
          is_read: false,
        },
        data: { is_read: true },
      }),
      this.prisma.privateChat.update({
        where: { chat_id: chatId },
        data: { unread_count: 0 },
      }),
    ]);
  }

  private async validateChatAndMembership(
    chatId: bigint,
    userId: bigint,
  ): Promise<PrivateChat> {
    const chat = await this.prisma.privateChat.findUnique({
      where: { chat_id: chatId },
      include: { members: true },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (!chat.members.some((member) => member.user_id === userId)) {
      throw new BadRequestException('User is not a member of this chat');
    }

    return chat;
  }

  private async validateMessageAndMembership(
    messageId: bigint,
    userId: bigint,
  ): Promise<PrivateMessage> {
    const message = await this.prisma.privateMessage.findUnique({
      where: { msg_id: messageId },
      include: { chat: { include: { members: true } } },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (!message.chat.members.some((member) => member.user_id === userId)) {
      throw new BadRequestException('User is not a member of this chat');
    }

    return message;
  }
}
