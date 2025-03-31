import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { IChannelService } from './channel.interface';
import * as crypto from 'crypto';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: { id: string | number | bigint };
}

@Injectable()
export class ChannelService implements IChannelService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,
  ) {}

  private getCurrentUserId(): bigint {
    const userId = this.request.user?.id;
    if (!userId) {
      throw new ForbiddenException('User ID is missing in the request');
    }
    return BigInt(userId);
  }

  private async ensureUserIsMember(
    chatId: bigint,
    userId: bigint,
  ): Promise<void> {
    const member = await this.prisma.channelMember.findUnique({
      where: { chat_id_user_id: { chat_id: chatId, user_id: userId } },
    });
    if (!member || member.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'User is not an active member of this channel',
      );
    }
  }

  private async ensureUserIsAdmin(
    chatId: bigint,
    userId: bigint,
  ): Promise<void> {
    const member = await this.prisma.channelMember.findUnique({
      where: { chat_id_user_id: { chat_id: chatId, user_id: userId } },
      include: { rights: true },
    });
    if (!member || !member.is_admin || !member.rights?.can_manage_chat) {
      throw new ForbiddenException('User does not have admin privileges');
    }
  }

  async isUsernameAvailable(username: string): Promise<boolean> {
    const existingChannel = await this.prisma.channelChat.findFirst({
      where: { username, deleted_at: null },
    });
    return !existingChannel;
  }

  async upgradeToGigagroup(channelId: string): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    await this.prisma.channelChat.update({
      where: { chat_id: chatId, deleted_at: null },
      data: {
        // Здесь можно добавить поле для лимита участников, например, max_members
      },
    });
  }

  async createNewChannel(
    name: string,
    options: { folderId: string; creatorId: string; isPublic?: boolean },
  ): Promise<string> {
    const { folderId, creatorId, isPublic = false } = options;
    const channel = await this.prisma.channelChat.create({
      data: {
        channel_name: name,
        folder: { connect: { folder_id: BigInt(folderId) } },
        creator: { connect: { id: BigInt(creatorId) } },
        is_public: isPublic,
        invite_link: isPublic
          ? null
          : `awe.me/joinchannel/${crypto.randomUUID()}`,
        members: {
          create: {
            user_id: BigInt(creatorId),
            is_admin: true,
            rights: {
              create: {
                can_post_messages: true,
                can_edit_messages: true,
                can_delete_messages: true,
                can_invite_users: true,
                can_restrict_members: true,
                can_pin_messages: true,
                can_manage_chat: true,
                can_send_media: true,
                can_send_polls: true,
              },
            },
          },
        },
      },
    });
    return channel.chat_id.toString();
  }

  async removeChannel(channelId: string): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    await this.prisma.channelChat.update({
      where: { chat_id: chatId, deleted_at: null },
      data: { deleted_at: new Date() },
    });
  }

  async clearChatHistory(channelId: string): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    await this.prisma.$transaction([
      this.prisma.channelMessage.updateMany({
        where: { chat_id: chatId, deleted_at: null },
        data: { deleted_at: new Date() },
      }),
      this.prisma.channelActivityLog.create({
        data: { chat_id: chatId, user_id: userId, action: 'CLEAR_HISTORY' },
      }),
    ]);
  }

  async removeMessages(channelId: string, messageIds: string[]): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    await this.prisma.channelMessage.updateMany({
      where: {
        chat_id: chatId,
        msg_id: { in: messageIds.map(BigInt) },
        deleted_at: null,
      },
      data: { deleted_at: new Date() },
    });
  }

  async clearParticipantHistory(
    channelId: string,
    participantId: string,
  ): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    const targetUserId = BigInt(participantId);
    await this.ensureUserIsAdmin(chatId, userId);

    await this.prisma.channelMessage.updateMany({
      where: { chat_id: chatId, user_id: targetUserId, deleted_at: null },
      data: { deleted_at: new Date() },
    });
  }

  async updateAdminPermissions(
    channelId: string,
    adminId: string,
    permissions: object,
  ): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    const targetUserId = BigInt(adminId);
    await this.ensureUserIsAdmin(chatId, userId);

    const member = await this.prisma.channelMember.findUnique({
      where: { chat_id_user_id: { chat_id: chatId, user_id: targetUserId } },
    });
    if (!member || !member.is_admin)
      throw new NotFoundException('Admin not found');

    await this.prisma.channelMemberRights.update({
      where: { member_id: member.member_id },
      data: permissions,
    });
  }

  async updateBannedUsers(
    channelId: string,
    userId: string,
    banOptions: object,
  ): Promise<void> {
    const chatId = BigInt(channelId);
    const currentUserId = this.getCurrentUserId();
    const targetUserId = BigInt(userId);
    await this.ensureUserIsAdmin(chatId, currentUserId);

    const { isBanned } = banOptions as { isBanned: boolean };
    await this.prisma.channelMember.update({
      where: { chat_id_user_id: { chat_id: chatId, user_id: targetUserId } },
      data: { status: isBanned ? 'BANNED' : 'ACTIVE' },
    });
  }

  async changeChannelCreator(
    channelId: string,
    newCreatorId: string,
  ): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    const newCreator = BigInt(newCreatorId);
    await this.ensureUserIsAdmin(chatId, userId);

    await this.prisma.channelChat.update({
      where: { chat_id: chatId, deleted_at: null },
      data: { creator_id: newCreator },
    });
  }

  async updateChannelLocation(
    channelId: string,
    location: string,
  ): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    await this.prisma.channelChat.update({
      where: { chat_id: chatId, deleted_at: null },
      data: { about: location },
    });
  }

  async updateChannelPhoto(channelId: string, photo: File): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    const photoPath = `path/to/uploaded/photo/${chatId}/${crypto.randomUUID()}.jpg`; // Интеграция с облаком
    await this.prisma.channelChat.update({
      where: { chat_id: chatId, deleted_at: null },
      data: { photo_path: photoPath },
    });
  }

  async updateChannelTitle(channelId: string, title: string): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    await this.prisma.channelChat.update({
      where: { chat_id: chatId, deleted_at: null },
      data: { channel_name: title },
    });
  }

  async generateMessageLink(
    channelId: string,
    messageId: string,
  ): Promise<string> {
    const chatId = BigInt(channelId);
    const msgId = BigInt(messageId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsMember(chatId, userId);

    const channel = await this.prisma.channelChat.findUnique({
      where: { chat_id: chatId, deleted_at: null },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    return `awe.me/channel/${chatId}/message/${msgId}`;
  }

  async fetchManagedPublicChannels(): Promise<string[]> {
    const userId = this.getCurrentUserId();
    const channels = await this.prisma.channelChat.findMany({
      where: {
        is_public: true,
        members: { some: { user_id: userId, is_admin: true } },
        deleted_at: null,
      },
      select: { chat_id: true },
    });
    return channels.map((ch) => ch.chat_id.toString());
  }

  async fetchAdminActivityLog(channelId: string): Promise<object[]> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    const logs = await this.prisma.channelActivityLog.findMany({
      where: { chat_id: chatId },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return logs;
  }

  async fetchUserChannels(): Promise<string[]> {
    const userId = this.getCurrentUserId();
    const channels = await this.prisma.channelChat.findMany({
      where: {
        members: { some: { user_id: userId, status: 'ACTIVE' } },
        deleted_at: null,
      },
      select: { chat_id: true },
    });
    return channels.map((ch) => ch.chat_id.toString());
  }

  async fetchChannelDetails(channelId: string): Promise<object> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsMember(chatId, userId);

    const channel = await this.prisma.channelChat.findUnique({
      where: { chat_id: chatId, deleted_at: null },
      include: { members: { select: { user_id: true, is_admin: true } } },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    return channel;
  }

  async fetchDiscussionGroups(): Promise<string[]> {
    const userId = this.getCurrentUserId();
    const groups = await this.prisma.discussionGroup.findMany({
      where: {
        chat: { members: { some: { user_id: userId, status: 'ACTIVE' } } },
      },
      select: { chat_id: true },
    });
    return groups.map((g) => g.chat_id.toString());
  }

  async fetchInactiveChannels(): Promise<string[]> {
    const userId = this.getCurrentUserId();
    const channels = await this.prisma.channelChat.findMany({
      where: {
        members: { some: { user_id: userId, status: 'ACTIVE' } },
        messages: {
          none: {
            created_at: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
        deleted_at: null,
      },
      select: { chat_id: true },
    });
    return channels.map((ch) => ch.chat_id.toString());
  }

  async fetchLeftChannels(): Promise<string[]> {
    const userId = this.getCurrentUserId();
    const channels = await this.prisma.channelChat.findMany({
      where: {
        members: { some: { user_id: userId, status: 'LEFT' } },
        deleted_at: null,
      },
      select: { chat_id: true },
    });
    return channels.map((ch) => ch.chat_id.toString());
  }

  async fetchMessages(channelId: string, options?: object): Promise<object[]> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsMember(chatId, userId);

    const { limit = 50, offset = 0 } = options as {
      limit?: number;
      offset?: number;
    };
    const messages = await this.prisma.channelMessage.findMany({
      where: { chat_id: chatId, deleted_at: null },
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
      include: {
        user: { select: { id: true, username: true } },
        reactions: { include: { emoji: true } },
        attachments: true,
      },
    });

    return messages.map((msg) => ({
      msgId: msg.msg_id.toString(),
      encryptedBody: msg.encrypted_body,
      reactionCount: msg.reactions.length, // Вычисляем вместо reaction_count
      isPinned: msg.is_pinned,
      attachments: msg.attachments,
      createdAt: msg.created_at,
    }));
  }

  async fetchParticipantInfo(
    channelId: string,
    participantId: string,
  ): Promise<object> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    const targetUserId = BigInt(participantId);
    await this.ensureUserIsMember(chatId, userId);

    const member = await this.prisma.channelMember.findUnique({
      where: { chat_id_user_id: { chat_id: chatId, user_id: targetUserId } },
      include: { rights: true, user: { select: { id: true, username: true } } },
    });
    if (!member) throw new NotFoundException('Participant not found');
    return member;
  }

  async fetchAllParticipants(channelId: string): Promise<object[]> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsMember(chatId, userId);

    return this.prisma.channelMember.findMany({
      where: { chat_id: chatId },
      include: { user: { select: { id: true, username: true } }, rights: true },
    });
  }

  async fetchSendAsOptions(channelId: string): Promise<object[]> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsMember(chatId, userId);

    const admins = await this.prisma.channelMember.findMany({
      where: { chat_id: chatId, is_admin: true },
      include: { user: { select: { id: true, username: true } } },
    });
    return admins.map((admin) => ({
      userId: admin.user_id.toString(),
      username: admin.user.username,
    }));
  }

  async fetchSponsoredMessages(channelId: string): Promise<object[]> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsMember(chatId, userId);

    const sponsored = await this.prisma.sponsoredMessage.findMany({
      where: { chat_id: chatId, expires_at: { gt: new Date() } },
      include: { message: true },
    });
    return sponsored.map((s) => ({
      msgId: s.msg_id.toString(),
      views: s.views,
      expiresAt: s.expires_at,
    }));
  }

  async inviteUsersToChannel(
    channelId: string,
    userIds: string[],
  ): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    const channel = await this.prisma.channelChat.findUnique({
      where: { chat_id: chatId, deleted_at: null },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    await this.prisma.channelMember.createMany({
      data: userIds.map((uid) => ({
        chat_id: chatId,
        user_id: BigInt(uid),
        status: channel.join_requests ? 'PENDING' : 'ACTIVE',
      })),
      skipDuplicates: true,
    });
  }

  async subscribeToChannel(channelId: string): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();

    const channel = await this.prisma.channelChat.findUnique({
      where: { chat_id: chatId, deleted_at: null },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    await this.prisma.channelMember.upsert({
      where: { chat_id_user_id: { chat_id: chatId, user_id: userId } },
      create: {
        chat_id: chatId,
        user_id: userId,
        status: channel.join_requests ? 'PENDING' : 'ACTIVE',
      },
      update: { status: channel.join_requests ? 'PENDING' : 'ACTIVE' },
    });
  }

  async exitChannel(channelId: string): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();

    await this.prisma.channelMember.update({
      where: { chat_id_user_id: { chat_id: chatId, user_id: userId } },
      data: { status: 'LEFT' },
    });
  }

  async markHistoryAsRead(channelId: string): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsMember(chatId, userId);

    const lastMessage = await this.prisma.channelMessage.findFirst({
      where: { chat_id: chatId, deleted_at: null },
      orderBy: { created_at: 'desc' },
    });
    if (!lastMessage) return;

    await this.prisma.channelReadMessage.upsert({
      where: {
        chat_id_user_id_msg_id: {
          chat_id: chatId,
          user_id: userId,
          msg_id: lastMessage.msg_id,
        },
      },
      create: { chat_id: chatId, user_id: userId, msg_id: lastMessage.msg_id },
      update: { read_at: new Date() },
    });
  }

  async markMessagesAsRead(
    channelId: string,
    messageIds: string[],
  ): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsMember(chatId, userId);

    await this.prisma.channelReadMessage.createMany({
      data: messageIds.map((msgId) => ({
        chat_id: chatId,
        user_id: userId,
        msg_id: BigInt(msgId),
      })),
      skipDuplicates: true,
    });
  }

  async flagAsSpam(channelId: string, messageId: string): Promise<void> {
    const chatId = BigInt(channelId);
    const msgId = BigInt(messageId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsMember(chatId, userId);

    await this.prisma.channelActivityLog.create({
      data: {
        chat_id: chatId,
        user_id: userId,
        action: 'FLAG_SPAM',
        details: { messageId: msgId.toString() },
      },
    });
  }

  async assignDiscussionGroup(
    channelId: string,
    discussionGroupId: string,
  ): Promise<void> {
    const chatId = BigInt(channelId);
    const groupId = BigInt(discussionGroupId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    try {
      await this.prisma.discussionGroup.upsert({
        where: { chat_id: chatId },
        create: { chat_id: chatId },
        update: { chat_id: groupId },
      });
    } catch {
      throw new Error('Prisma discussionGroup model is not defined');
    }
  }

  async updateChannelStickers(
    channelId: string,
    stickerSetId: string,
  ): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    await this.prisma.channelStickerSet.upsert({
      where: { chat_id: chatId },
      create: { chat_id: chatId, sticker_set_id: stickerSetId },
      update: { sticker_set_id: stickerSetId },
    });
  }

  async enableJoinRequests(channelId: string, enabled: boolean): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    await this.prisma.channelChat.update({
      where: { chat_id: chatId, deleted_at: null },
      data: { join_requests: enabled },
    });
  }

  async restrictSendingToMembers(
    channelId: string,
    enabled: boolean,
  ): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    // Здесь можно обновить права по умолчанию для новых участников (заглушка)
  }

  async hidePreJoinMessages(channelId: string, hidden: boolean): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);
  }

  async enableMessageSignatures(
    channelId: string,
    enabled: boolean,
  ): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    await this.prisma.channelChat.update({
      where: { chat_id: chatId, deleted_at: null },
      data: { signatures_enabled: enabled },
    });
  }

  async adjustSlowMode(channelId: string, duration: number): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    if (duration < 0 || duration > 3600)
      throw new BadRequestException('Invalid slow mode duration');
    await this.prisma.channelChat.update({
      where: { chat_id: chatId, deleted_at: null },
      data: { slow_mode_seconds: duration },
    });
  }

  async changeChannelUsername(
    channelId: string,
    newUsername: string,
  ): Promise<void> {
    const chatId = BigInt(channelId);
    const userId = this.getCurrentUserId();
    await this.ensureUserIsAdmin(chatId, userId);

    if (!(await this.isUsernameAvailable(newUsername))) {
      throw new BadRequestException('Username is already taken');
    }
    await this.prisma.channelChat.update({
      where: { chat_id: chatId, deleted_at: null },
      data: { username: newUsername },
    });
  }

  // Отслеживание спонсируемого сообщения (заглушка)
  async trackSponsoredMessage(
    channelId: string,
    messageId: string,
  ): Promise<void> {
    // Требуется модель для спонсируемых сообщений
  }
}
