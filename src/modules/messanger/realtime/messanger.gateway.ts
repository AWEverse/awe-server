import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Logger, UseGuards, UsePipes, ValidationPipe, Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { MessangerService } from '../messanger.service';
import { WsJwtGuard } from '../../common/guards/WsJwtGuard.guard';
import {
  SendMessageDto,
  EditMessageDto,
  TypingIndicatorDto,
  MessageReactionDto,
  OnlineStatusDto,
  JoinChatDto,
  LeaveChatDto,
  SendStickerDto,
  SendGifDto,
  SendCustomEmojiDto,
} from '../dto/realtime.dto';
import { MessageType, ChatType } from '../types';
import { PrismaService } from '../../../libs/supabase/db/prisma.service';
import { JwtService } from '@nestjs/jwt';

interface AuthenticatedSocket extends Socket {
  userId: bigint;
  username: string;
  deviceId?: string;
}

interface SocketUserInfo {
  userId: bigint;
  username: string;
  socketId: string;
  lastSeen: Date;
  isOnline: boolean;
  chatRooms: Set<string>;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/messenger',
})
export class MessangerGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessangerGateway.name);
  private connectedUsers = new Map<string, SocketUserInfo>(); // socketId -> userInfo
  private userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds
  private chatRooms = new Map<string, Set<string>>(); // chatId -> Set of socketIds

  constructor(
    private readonly messengerService: MessangerService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');

    // Setup periodic cleanup of stale connections
    setInterval(() => this.cleanupStaleConnections(), 30000); // Every 30 seconds

    // Setup periodic online status broadcast
    setInterval(() => this.broadcastOnlineUsers(), 60000); // Every minute
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractTokenFromHandshake(client);

      if (!token) {
        client.emit('error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

      const payload = await this.validateToken(token);
      if (!payload) {
        client.emit('error', { message: 'Invalid token' });
        client.disconnect();
        return;
      }

      // Attach user info to socket
      client.userId = BigInt(payload.sub);
      client.username = payload.username;
      client.deviceId = payload.deviceId;

      // Register user connection
      await this.registerUserConnection(client);

      this.logger.log(`User ${client.username} (${client.userId}) connected from ${client.id}`);

      // Send connection confirmation
      client.emit('connected', {
        message: 'Connected to messenger',
        userId: client.userId.toString(),
        socketId: client.id,
      });

      // Broadcast online status to user's contacts
      await this.broadcastUserOnlineStatus(client.userId, true);
    } catch (error) {
      this.logger.error('Connection error:', error);
      client.emit('error', { message: 'Connection failed' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      await this.unregisterUserConnection(client);

      this.logger.log(`User ${client.username} (${client.userId}) disconnected from ${client.id}`);

      // Check if user has other active connections
      const userSocketIds = this.userSockets.get(client.userId.toString());
      if (!userSocketIds || userSocketIds.size === 0) {
        // User is completely offline
        await this.broadcastUserOnlineStatus(client.userId, false);
        await this.updateUserLastSeen(client.userId);
      }
    }
  }

  // ===============================================
  // MESSAGE HANDLING
  // ===============================================

  @SubscribeMessage('send_message')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe())
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SendMessageDto,
  ) {
    try {
      const { chatId, content, messageType = MessageType.TEXT, replyToId, threadId } = data;

      // Verify user has access to chat
      await this.verifyUserChatAccess(client.userId, BigInt(chatId));

      // Content is required for regular messages
      if (!content && !data.stickerId && !data.gifId && !data.customEmojiId) {
        throw new Error('Message content or media is required');
      }

      // Send message through service
      const result = await this.messengerService.sendMessage(
        BigInt(chatId),
        client.userId,
        content || '',
        messageType,
        {
          replyToId: replyToId ? BigInt(replyToId) : undefined,
          threadId: threadId ? BigInt(threadId) : undefined,
          attachments: data.attachments || [],
        },
      );

      // Broadcast message to all chat participants
      await this.broadcastToChatRoom(chatId, 'new_message', {
        ...result,
        chatId: chatId,
      });

      // Send delivery confirmation to sender
      client.emit('message_sent', {
        tempId: data.tempId,
        messageId: result.id,
        timestamp: result.createdAt,
      });

      // Update chat's last message timestamp
      await this.updateChatLastActivity(BigInt(chatId));

      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Error sending message:', error);
      client.emit('message_error', {
        tempId: data.tempId,
        error: error.message,
      });
      throw new WsException(error.message);
    }
  }

  @SubscribeMessage('edit_message')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe())
  async handleEditMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: EditMessageDto,
  ) {
    try {
      const { messageId, content } = data;
      const result = await this.messengerService.editMessage(
        BigInt(messageId),
        client.userId,
        content,
      );

      // Get chat ID for message
      const message = await this.getMessageWithChatId(BigInt(messageId));

      // Broadcast edit to all chat participants
      await this.broadcastToChatRoom(message.chatId.toString(), 'message_edited', {
        messageId,
        content,
        editedAt: result.editedAt,
      });

      return result;
    } catch (error) {
      this.logger.error('Error editing message:', error);
      throw new WsException(error.message);
    }
  }

  @SubscribeMessage('delete_message')
  @UseGuards(WsJwtGuard)
  async handleDeleteMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: string; forEveryone?: boolean },
  ) {
    try {
      const { messageId, forEveryone = false } = data;
      const result = await this.messengerService.deleteMessage(
        BigInt(messageId),
        client.userId,
        forEveryone,
      );

      if (result) {
        const message = await this.getMessageWithChatId(BigInt(messageId));

        // Broadcast deletion to all chat participants
        await this.broadcastToChatRoom(message.chatId.toString(), 'message_deleted', {
          messageId,
          forEveryone,
          deletedBy: client.userId.toString(),
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Error deleting message:', error);
      throw new WsException(error.message);
    }
  }

  // ===============================================
  // CHAT ROOM MANAGEMENT
  // ===============================================

  @SubscribeMessage('join_chat')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe())
  async handleJoinChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: JoinChatDto,
  ) {
    try {
      const { chatId } = data;

      // Verify user has access to chat
      await this.verifyUserChatAccess(client.userId, BigInt(chatId));

      // Join socket to chat room
      const roomName = `chat_${chatId}`;
      await client.join(roomName);

      // Update user's chat rooms
      const userInfo = this.connectedUsers.get(client.id);
      if (userInfo) {
        userInfo.chatRooms.add(roomName);
      }

      // Update chat room participants
      if (!this.chatRooms.has(chatId)) {
        this.chatRooms.set(chatId, new Set());
      }
      this.chatRooms.get(chatId)!.add(client.id);

      // Mark messages as read
      await this.markMessagesAsRead(BigInt(chatId), client.userId);

      // Notify other participants
      client.to(roomName).emit('user_joined_chat', {
        chatId,
        userId: client.userId.toString(),
        username: client.username,
      });

      this.logger.log(`User ${client.username} joined chat ${chatId}`);

      return { success: true, message: 'Joined chat successfully' };
    } catch (error) {
      this.logger.error('Error joining chat:', error);
      throw new WsException(error.message);
    }
  }

  @SubscribeMessage('leave_chat')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe())
  async handleLeaveChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: LeaveChatDto,
  ) {
    try {
      const { chatId } = data;
      const roomName = `chat_${chatId}`;

      // Leave socket room
      await client.leave(roomName);

      // Update user's chat rooms
      const userInfo = this.connectedUsers.get(client.id);
      if (userInfo) {
        userInfo.chatRooms.delete(roomName);
      }

      // Update chat room participants
      const chatParticipants = this.chatRooms.get(chatId);
      if (chatParticipants) {
        chatParticipants.delete(client.id);
        if (chatParticipants.size === 0) {
          this.chatRooms.delete(chatId);
        }
      }

      // Notify other participants
      client.to(roomName).emit('user_left_chat', {
        chatId,
        userId: client.userId.toString(),
        username: client.username,
      });

      this.logger.log(`User ${client.username} left chat ${chatId}`);

      return { success: true, message: 'Left chat successfully' };
    } catch (error) {
      this.logger.error('Error leaving chat:', error);
      throw new WsException(error.message);
    }
  }

  // ===============================================
  // TYPING INDICATORS
  // ===============================================

  @SubscribeMessage('typing_start')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe())
  async handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: TypingIndicatorDto,
  ) {
    const { chatId } = data;
    const roomName = `chat_${chatId}`;

    // Broadcast typing indicator to other chat participants
    client.to(roomName).emit('user_typing', {
      chatId,
      userId: client.userId.toString(),
      username: client.username,
      isTyping: true,
    });
  }

  @SubscribeMessage('typing_stop')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe())
  async handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: TypingIndicatorDto,
  ) {
    const { chatId } = data;
    const roomName = `chat_${chatId}`;

    // Broadcast stop typing to other chat participants
    client.to(roomName).emit('user_typing', {
      chatId,
      userId: client.userId.toString(),
      username: client.username,
      isTyping: false,
    });
  }

  // ===============================================
  // MESSAGE REACTIONS
  // ===============================================

  @SubscribeMessage('add_reaction')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe())
  async handleAddReaction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: MessageReactionDto,
  ) {
    try {
      const { messageId, emoji } = data; // Add reaction through service
      const result = await this.messengerService.addReaction(
        BigInt(messageId),
        client.userId,
        emoji,
      );

      const message = await this.getMessageWithChatId(BigInt(messageId));

      // Broadcast reaction to chat participants
      await this.broadcastToChatRoom(message.chatId.toString(), 'reaction_added', {
        messageId,
        emoji,
        userId: client.userId.toString(),
        username: client.username,
      });

      return result;
    } catch (error) {
      this.logger.error('Error adding reaction:', error);
      throw new WsException(error.message);
    }
  }

  @SubscribeMessage('remove_reaction')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe())
  async handleRemoveReaction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: MessageReactionDto,
  ) {
    try {
      const { messageId, emoji } = data;
      const result = await this.messengerService.removeReaction(
        BigInt(messageId),
        client.userId,
        emoji,
      );

      if (result) {
        const message = await this.getMessageWithChatId(BigInt(messageId));

        await this.broadcastToChatRoom(message.chatId.toString(), 'reaction_removed', {
          messageId,
          emoji,
          userId: client.userId.toString(),
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Error removing reaction:', error);
      throw new WsException(error.message);
    }
  }

  // ===============================================
  // СТИКЕРЫ И МЕДИА
  // ===============================================

  @SubscribeMessage('send_sticker')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe())
  async handleSendSticker(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SendStickerDto,
  ) {
    try {
      const { chatId, stickerId, replyToId, threadId } = data;

      // Verify user has access to chat
      await this.verifyUserChatAccess(client.userId, BigInt(chatId));

      // Send sticker through service
      const result = await this.messengerService.sendSticker(
        BigInt(chatId),
        client.userId,
        BigInt(stickerId),
        {
          replyToId: replyToId ? BigInt(replyToId) : undefined,
          threadId: threadId ? BigInt(threadId) : undefined,
        },
      );

      // Broadcast sticker to all chat participants
      await this.broadcastToChatRoom(chatId, 'new_message', {
        ...result,
        chatId: chatId,
        messageType: 'STICKER',
      });

      // Send delivery confirmation to sender
      client.emit('message_sent', {
        tempId: data.tempId,
        messageId: result.id,
        timestamp: result.createdAt,
      });

      // Update chat's last message timestamp
      await this.updateChatLastActivity(BigInt(chatId));

      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Error sending sticker:', error);
      client.emit('message_error', {
        tempId: data.tempId,
        error: error.message,
      });
      throw new WsException(error.message);
    }
  }

  @SubscribeMessage('send_gif')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe())
  async handleSendGif(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SendGifDto,
  ) {
    try {
      const { chatId, gifId, replyToId, threadId } = data;

      // Verify user has access to chat
      await this.verifyUserChatAccess(client.userId, BigInt(chatId));

      // Send GIF through service
      const result = await this.messengerService.sendGif(
        BigInt(chatId),
        client.userId,
        BigInt(gifId),
        {
          replyToId: replyToId ? BigInt(replyToId) : undefined,
          threadId: threadId ? BigInt(threadId) : undefined,
        },
      );

      // Broadcast GIF to all chat participants
      await this.broadcastToChatRoom(chatId, 'new_message', {
        ...result,
        chatId: chatId,
        messageType: 'GIF',
      });

      // Send delivery confirmation to sender
      client.emit('message_sent', {
        tempId: data.tempId,
        messageId: result.id,
        timestamp: result.createdAt,
      });

      // Update chat's last message timestamp
      await this.updateChatLastActivity(BigInt(chatId));

      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Error sending GIF:', error);
      client.emit('message_error', {
        tempId: data.tempId,
        error: error.message,
      });
      throw new WsException(error.message);
    }
  }

  @SubscribeMessage('send_custom_emoji')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe())
  async handleSendCustomEmoji(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SendCustomEmojiDto,
  ) {
    try {
      const { chatId, customEmojiId, replyToId, threadId } = data;

      // Verify user has access to chat
      await this.verifyUserChatAccess(client.userId, BigInt(chatId));

      // Send custom emoji through service
      const result = await this.messengerService.sendCustomEmoji(
        BigInt(chatId),
        client.userId,
        BigInt(customEmojiId),
        {
          replyToId: replyToId ? BigInt(replyToId) : undefined,
          threadId: threadId ? BigInt(threadId) : undefined,
        },
      );

      // Broadcast custom emoji to all chat participants
      await this.broadcastToChatRoom(chatId, 'new_message', {
        ...result,
        chatId: chatId,
        messageType: 'CUSTOM_EMOJI',
      });

      // Send delivery confirmation to sender
      client.emit('message_sent', {
        tempId: data.tempId,
        messageId: result.id,
        timestamp: result.createdAt,
      });

      // Update chat's last message timestamp
      await this.updateChatLastActivity(BigInt(chatId));

      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Error sending custom emoji:', error);
      client.emit('message_error', {
        tempId: data.tempId,
        error: error.message,
      });
      throw new WsException(error.message);
    }
  }

  // ===============================================
  // ONLINE STATUS
  // ===============================================

  @SubscribeMessage('update_online_status')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe())
  async handleUpdateOnlineStatus(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: OnlineStatusDto,
  ) {
    try {
      const { isOnline } = data;

      // Update user's online status
      const userInfo = this.connectedUsers.get(client.id);
      if (userInfo) {
        userInfo.isOnline = isOnline;
        userInfo.lastSeen = new Date();
      }

      // Broadcast status to contacts
      await this.broadcastUserOnlineStatus(client.userId, isOnline);

      return { success: true, isOnline };
    } catch (error) {
      this.logger.error('Error updating online status:', error);
      throw new WsException(error.message);
    }
  }

  // ===============================================
  // HELPER METHODS
  // ===============================================

  private extractTokenFromHandshake(client: Socket): string | null {
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Alternative: check query params
    const token = client.handshake.query.token;
    return typeof token === 'string' ? token : null;
  }

  private async validateToken(token: string) {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      return null;
    }
  }

  private async registerUserConnection(client: AuthenticatedSocket) {
    const userIdStr = client.userId.toString();

    // Register socket
    this.connectedUsers.set(client.id, {
      userId: client.userId,
      username: client.username,
      socketId: client.id,
      lastSeen: new Date(),
      isOnline: true,
      chatRooms: new Set(),
    });

    // Track user sockets
    if (!this.userSockets.has(userIdStr)) {
      this.userSockets.set(userIdStr, new Set());
    }
    this.userSockets.get(userIdStr)!.add(client.id);

    // Auto-join user to their active chats
    await this.autoJoinUserChats(client);
  }

  private async unregisterUserConnection(client: AuthenticatedSocket) {
    const userIdStr = client.userId.toString();

    // Remove from connected users
    this.connectedUsers.delete(client.id);

    // Remove from user sockets
    const userSocketIds = this.userSockets.get(userIdStr);
    if (userSocketIds) {
      userSocketIds.delete(client.id);
      if (userSocketIds.size === 0) {
        this.userSockets.delete(userIdStr);
      }
    }

    // Remove from chat rooms
    for (const [chatId, participants] of this.chatRooms.entries()) {
      participants.delete(client.id);
      if (participants.size === 0) {
        this.chatRooms.delete(chatId);
      }
    }
  }

  private async autoJoinUserChats(client: AuthenticatedSocket) {
    try {
      // Get user's active chats
      const userChats = await this.messengerService.getUserChats(client.userId, {
        limit: 100,
        offset: 0,
      }); // Join socket to chat rooms
      for (const chat of userChats) {
        const roomName = `chat_${chat.id}`;
        await client.join(roomName);

        const userInfo = this.connectedUsers.get(client.id);
        if (userInfo) {
          userInfo.chatRooms.add(roomName);
        }
      }
    } catch (error) {
      this.logger.error('Error auto-joining user chats:', error);
    }
  }

  private async verifyUserChatAccess(userId: bigint, chatId: bigint) {
    const hasAccess = await this.prisma.chatParticipant.findFirst({
      where: {
        chatId,
        userId,
        // flags: 0, // Not banned/removed
      },
    });

    if (!hasAccess) {
      throw new Error('No access to this chat');
    }
  }

  private async broadcastToChatRoom(chatId: string, event: string, data: any) {
    const roomName = `chat_${chatId}`;
    this.server.to(roomName).emit(event, data);
  }

  private async broadcastUserOnlineStatus(userId: bigint, isOnline: boolean) {
    // Get user's contacts/chat participants
    const contacts = await this.getUserContacts(userId);

    for (const contactId of contacts) {
      const contactSocketIds = this.userSockets.get(contactId.toString());
      if (contactSocketIds) {
        for (const socketId of contactSocketIds) {
          this.server.to(socketId).emit('contact_status_changed', {
            userId: userId.toString(),
            isOnline,
            lastSeen: new Date(),
          });
        }
      }
    }
  }

  private async getUserContacts(userId: bigint): Promise<bigint[]> {
    // Get all users from chats where this user participates
    const contacts = await this.prisma.chatParticipant.findMany({
      where: {
        chat: {
          participants: {
            some: { userId },
          },
        },
        userId: { not: userId },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    return contacts.map(c => c.userId);
  }

  private async getMessageWithChatId(messageId: bigint) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, chatId: true },
    });

    if (!message) {
      throw new Error('Message not found');
    }

    return message;
  }
  private async markMessagesAsRead(chatId: bigint, userId: bigint) {
    try {
      // Get the latest message in the chat
      const latestMessage = await this.prisma.message.findFirst({
        where: {
          chatId,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (latestMessage) {
        // Use the MessangerService method to properly mark messages as read
        await this.messengerService.markMessagesAsRead(chatId, userId, latestMessage.id);
      }
    } catch (error) {
      this.logger.error('Error marking messages as read:', error);
    }
  }

  private async updateChatLastActivity(chatId: bigint) {
    try {
      await this.prisma.chat.update({
        where: { id: chatId },
        data: { lastMessageAt: new Date() },
      });
    } catch (error) {
      this.logger.error('Error updating chat last activity:', error);
    }
  }

  private async updateUserLastSeen(userId: bigint) {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastSeen: new Date() },
      });
    } catch (error) {
      this.logger.error('Error updating user last seen:', error);
    }
  }

  private cleanupStaleConnections() {
    const now = new Date();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [socketId, userInfo] of this.connectedUsers.entries()) {
      const timeSinceLastSeen = now.getTime() - userInfo.lastSeen.getTime();

      if (timeSinceLastSeen > staleThreshold) {
        this.logger.warn(`Cleaning up stale connection for user ${userInfo.username}`);

        // Force disconnect
        const socket = this.server.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      }
    }
  }

  private broadcastOnlineUsers() {
    const onlineUsers = Array.from(this.connectedUsers.values())
      .filter(user => user.isOnline)
      .map(user => ({
        userId: user.userId.toString(),
        username: user.username,
        lastSeen: user.lastSeen,
      }));

    this.server.emit('online_users_update', { onlineUsers });
  }
}
