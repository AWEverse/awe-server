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
import { ConfigService } from '@nestjs/config';
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
} from '../dto/realtime.dto';
import { MessageType } from '../types';
import { JwtService } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../../libs/db/prisma.service';
import { WEBSOCKET_CONFIG } from './websocket.config';
import { WebSocketRateLimiter } from './websocket-rate-limiter.service';
import { WebSocketMonitor } from './websocket-monitor.service';

interface AuthenticatedSocket extends Socket {
  userId: bigint;
  username: string;
}

interface SocketUserInfo {
  userId: bigint;
  username: string;
  socketId: string;
  lastActivity: number;
  chatRooms: Set<string>;
}

interface ConnectionPool {
  connectedUsers: Map<string, SocketUserInfo>; // socketId -> userInfo
  userSockets: Map<string, Set<string>>; // userId -> Set of socketIds
  typingUsers: Map<string, Set<string>>; // chatId -> Set of userIds typing
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/messenger-realtime',
  pingTimeout: WEBSOCKET_CONFIG.PING_TIMEOUT,
  pingInterval: WEBSOCKET_CONFIG.PING_INTERVAL,
  maxHttpBufferSize: WEBSOCKET_CONFIG.MAX_HTTP_BUFFER_SIZE,
  transports: WEBSOCKET_CONFIG.WEBSOCKET_ONLY ? ['websocket'] : ['websocket', 'polling'],
  compression: WEBSOCKET_CONFIG.ENABLE_COMPRESSION,
})
export class MessangerGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessangerGateway.name);

  // Optimized connection pool
  private readonly connectionPool: ConnectionPool = {
    connectedUsers: new Map(),
    userSockets: new Map(),
    typingUsers: new Map(),
  };

  // Timers for cleanup and broadcasting
  private cleanupInterval: NodeJS.Timeout;
  private typingCleanupInterval: NodeJS.Timeout;
  constructor(
    private readonly messengerService: MessangerService,
    private readonly jwtService: JwtService,
    private readonly rateLimiter: WebSocketRateLimiter,
    private readonly monitor: WebSocketMonitor,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}
  afterInit(_server: Server) {
    this.logger.log('WebSocket Gateway initialized with optimizations');

    // Optimized cleanup intervals using config
    this.cleanupInterval = setInterval(
      () => this.cleanupStaleConnections(),
      WEBSOCKET_CONFIG.CLEANUP_INTERVAL,
    );
    this.typingCleanupInterval = setInterval(
      () => this.cleanupTypingIndicators(),
      WEBSOCKET_CONFIG.TYPING_CLEANUP_INTERVAL,
    );

    // Start monitoring
    this.monitor.startPeriodicLogging();
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractTokenFromHandshake(client);

      if (!token) {
        this.logger.warn('Connection attempt without authentication token');
        client.emit('error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

      const userInfo = await this.validateTokenAndGetUser(token);
      if (!userInfo) {
        this.logger.warn('Connection attempt with invalid token');
        client.emit('error', { message: 'Invalid or expired token' });
        client.disconnect();
        return;
      }

      // Attach user info to socket (using database user ID, not supabaseId)
      client.userId = userInfo.id;
      client.username = userInfo.username || userInfo.email; // Register user connection efficiently
      this.registerUserConnection(client);

      // Update metrics
      this.monitor.updateConnectionCount(this.connectionPool.connectedUsers.size);
      this.monitor.updateActiveUsers(this.connectionPool.userSockets.size);

      this.logger.log(`User ${client.username} (${client.userId}) connected from ${client.id}`);

      // Send connection confirmation
      client.emit('connected', {
        message: 'Connected to messenger',
        userId: client.userId.toString(),
        socketId: client.id,
      });

      // Auto-join user to their active chats (optimized)
      await this.autoJoinUserChats(client);
    } catch (error) {
      this.logger.error('Connection error:', error);
      client.emit('error', { message: 'Connection failed' });
      client.disconnect();
    }
  }
  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      this.unregisterUserConnection(client);

      // Update metrics
      this.monitor.updateConnectionCount(this.connectionPool.connectedUsers.size);
      this.monitor.updateActiveUsers(this.connectionPool.userSockets.size);

      this.logger.log(`User ${client.username} (${client.userId}) disconnected from ${client.id}`);
    }
  }

  @SubscribeMessage('test_connection')
  @UseGuards(WsJwtGuard)
  async handleTestConnection(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { message: string },
  ) {
    try {
      this.logger.log(`Test connection from ${client.username}: ${data.message}`);
      client.emit('test_response', { message: 'Connection successful', data });
      return { success: true, message: 'Connection test passed' };
    } catch (error) {
      this.logger.error('Error in test_connection:', error);
      throw new WsException('Test connection failed');
    }
  }

  // ===============================================
  // CORE MESSAGE HANDLING (OPTIMIZED)
  // ===============================================
  @SubscribeMessage('send_message')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SendMessageDto,
  ) {
    try {
      // Check rate limit
      if (!this.rateLimiter.checkLimit(client.userId.toString(), 'message')) {
        this.monitor.incrementRateLimitViolation();
        throw new Error('Message rate limit exceeded');
      }

      // Update message metrics
      this.monitor.incrementMessageCount();

      const { chatId, content, messageType = MessageType.TEXT, replyToId, threadId } = data;
      if (!content?.trim()) {
        throw new Error('Message content is required');
      }

      // Validate message length
      if (content.length > WEBSOCKET_CONFIG.MAX_MESSAGE_LENGTH) {
        throw new Error(
          `Message too long. Maximum ${WEBSOCKET_CONFIG.MAX_MESSAGE_LENGTH} characters allowed`,
        );
      }

      // Validate attachments count
      if (data.attachments && data.attachments.length > WEBSOCKET_CONFIG.MAX_ATTACHMENTS) {
        throw new Error(
          `Too many attachments. Maximum ${WEBSOCKET_CONFIG.MAX_ATTACHMENTS} allowed`,
        );
      }

      // Send message through service
      const result = await this.messengerService.sendMessage(
        BigInt(chatId),
        client.userId,
        content,
        messageType,
        {
          replyToId: replyToId ? BigInt(replyToId) : undefined,
          threadId: threadId ? BigInt(threadId) : undefined,
          attachments: data.attachments || [],
        },
      );

      // Efficient broadcast to chat room
      this.broadcastToChatRoom(chatId, 'new_message', {
        ...result,
        chatId: chatId,
      });

      // Send delivery confirmation to sender
      client.emit('message_sent', {
        tempId: data.tempId,
        messageId: result.id,
        timestamp: result.createdAt,
      });

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
  @UsePipes(new ValidationPipe({ transform: true }))
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
      const message = await this.messengerService.getMessageById(BigInt(messageId));

      // Broadcast edit to all chat participants
      this.broadcastToChatRoom(message.chatId.toString(), 'message_edited', {
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
      const message = await this.messengerService.getMessageById(BigInt(messageId));

      const result = await this.messengerService.deleteMessage(
        BigInt(messageId),
        client.userId,
        forEveryone,
      );

      if (result) {
        // Broadcast deletion to all chat participants
        this.broadcastToChatRoom(message.chatId.toString(), 'message_deleted', {
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
  // CHAT ROOM MANAGEMENT (OPTIMIZED)
  // ===============================================

  @SubscribeMessage('join_chat')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleJoinChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: JoinChatDto,
  ) {
    try {
      const { chatId } = data;
      const roomName = `chat_${chatId}`;

      // Join socket to chat room
      await client.join(roomName);

      // Update user's chat rooms
      const userInfo = this.connectionPool.connectedUsers.get(client.id);
      if (userInfo) {
        userInfo.chatRooms.add(roomName);
        userInfo.lastActivity = Date.now();
      }

      // Mark messages as read
      await this.messengerService.markMessagesAsRead(BigInt(chatId), client.userId);

      this.logger.log(`User ${client.username} joined chat ${chatId}`);

      return { success: true, message: 'Joined chat successfully' };
    } catch (error) {
      this.logger.error('Error joining chat:', error);
      throw new WsException(error.message);
    }
  }

  @SubscribeMessage('leave_chat')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
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
      const userInfo = this.connectionPool.connectedUsers.get(client.id);
      if (userInfo) {
        userInfo.chatRooms.delete(roomName);
        userInfo.lastActivity = Date.now();
      }

      this.logger.log(`User ${client.username} left chat ${chatId}`);

      return { success: true, message: 'Left chat successfully' };
    } catch (error) {
      this.logger.error('Error leaving chat:', error);
      throw new WsException(error.message);
    }
  }

  // ===============================================
  // TYPING INDICATORS (OPTIMIZED)
  // ===============================================
  @SubscribeMessage('typing_start')
  @UseGuards(WsJwtGuard)
  async handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: TypingIndicatorDto,
  ) {
    // Check rate limit
    if (!this.rateLimiter.checkLimit(client.userId.toString(), 'typing')) {
      return; // Silently ignore if rate limited
    }

    const { chatId } = data;
    const userIdStr = client.userId.toString();

    // Add to typing users set
    if (!this.connectionPool.typingUsers.has(chatId)) {
      this.connectionPool.typingUsers.set(chatId, new Set());
    }
    this.connectionPool.typingUsers.get(chatId)!.add(userIdStr);

    // Broadcast typing indicator
    this.broadcastToChatRoom(chatId, 'user_typing', {
      chatId,
      userId: userIdStr,
      username: client.username,
      isTyping: true,
    }); // Auto-cleanup typing after configured timeout
    setTimeout(() => {
      const typingSet = this.connectionPool.typingUsers.get(chatId);
      if (typingSet) {
        typingSet.delete(userIdStr);
        if (typingSet.size === 0) {
          this.connectionPool.typingUsers.delete(chatId);
        }
      }
    }, WEBSOCKET_CONFIG.TYPING_INDICATOR_TIMEOUT);
  }

  @SubscribeMessage('typing_stop')
  @UseGuards(WsJwtGuard)
  async handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: TypingIndicatorDto,
  ) {
    const { chatId } = data;
    const userIdStr = client.userId.toString();

    // Remove from typing users
    const typingSet = this.connectionPool.typingUsers.get(chatId);
    if (typingSet) {
      typingSet.delete(userIdStr);
      if (typingSet.size === 0) {
        this.connectionPool.typingUsers.delete(chatId);
      }
    }

    // Broadcast stop typing
    this.broadcastToChatRoom(chatId, 'user_typing', {
      chatId,
      userId: userIdStr,
      username: client.username,
      isTyping: false,
    });
  }

  // ===============================================
  // MESSAGE REACTIONS (OPTIMIZED)
  // ===============================================
  @SubscribeMessage('add_reaction')
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleAddReaction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: MessageReactionDto,
  ) {
    try {
      // Check rate limit
      if (!this.rateLimiter.checkLimit(client.userId.toString(), 'reaction')) {
        throw new Error('Reaction rate limit exceeded');
      }

      const { messageId, emoji } = data;
      const result = await this.messengerService.addReaction(
        BigInt(messageId),
        client.userId,
        emoji,
      );

      const message = await this.messengerService.getMessageById(BigInt(messageId));

      // Broadcast reaction to chat participants
      this.broadcastToChatRoom(message.chatId.toString(), 'reaction_added', {
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
  @UsePipes(new ValidationPipe({ transform: true }))
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
        const message = await this.messengerService.getMessageById(BigInt(messageId));

        this.broadcastToChatRoom(message.chatId.toString(), 'reaction_removed', {
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
  // HELPER METHODS (OPTIMIZED)
  // ===============================================

  private extractTokenFromHandshake(client: Socket): string | null {
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    const token = client.handshake.query.token;
    return typeof token === 'string' ? token : null;
  }
  private async validateTokenAndGetUser(token: string) {
    try {
      const supabaseJwtSecret = this.configService.get<string>('SUPABASE_JWT_SECRET');
      if (!supabaseJwtSecret) {
        this.logger.error('SUPABASE_JWT_SECRET is not configured');
        return null;
      }

      // Verify token with Supabase JWT secret
      const payload = jwt.verify(token, supabaseJwtSecret) as { sub: string; email?: string };

      if (!payload.sub) {
        this.logger.warn('Token payload missing sub claim');
        return null;
      }

      // Check if user exists in database
      const user = await this.prisma.user.findUnique({
        where: { supabaseId: payload.sub },
        select: {
          id: true,
          supabaseId: true,
          email: true,
          username: true,
          flags: true,
        },
      });

      if (!user) {
        this.logger.warn(`User not found for supabaseId: ${payload.sub}`);
        return null;
      }

      // Check if user is active (same logic as WsJwtGuard)
      if (!(user.flags & 1)) {
        this.logger.warn(`Inactive user attempted to connect: ${user.id}`);
        return null;
      }

      return user;
    } catch (error) {
      this.logger.error('Token validation error:', error);

      if (error.name === 'JsonWebTokenError') {
        this.logger.warn('Invalid token format');
      } else if (error.name === 'TokenExpiredError') {
        this.logger.warn('Token expired');
      } else if (error.name === 'NotBeforeError') {
        this.logger.warn('Token not active');
      }

      return null;
    }
  }

  private registerUserConnection(client: AuthenticatedSocket) {
    const userIdStr = client.userId.toString();
    const now = Date.now();

    // Register socket
    this.connectionPool.connectedUsers.set(client.id, {
      userId: client.userId,
      username: client.username,
      socketId: client.id,
      lastActivity: now,
      chatRooms: new Set(),
    });

    // Track user sockets
    if (!this.connectionPool.userSockets.has(userIdStr)) {
      this.connectionPool.userSockets.set(userIdStr, new Set());
    }
    this.connectionPool.userSockets.get(userIdStr)!.add(client.id);
  }

  private unregisterUserConnection(client: AuthenticatedSocket) {
    const userIdStr = client.userId.toString();

    // Remove from connected users
    this.connectionPool.connectedUsers.delete(client.id);

    // Remove from user sockets
    const userSocketIds = this.connectionPool.userSockets.get(userIdStr);
    if (userSocketIds) {
      userSocketIds.delete(client.id);
      if (userSocketIds.size === 0) {
        this.connectionPool.userSockets.delete(userIdStr);
      }
    }

    // Clean up typing indicators
    for (const [chatId, typingSet] of this.connectionPool.typingUsers.entries()) {
      typingSet.delete(userIdStr);
      if (typingSet.size === 0) {
        this.connectionPool.typingUsers.delete(chatId);
      }
    }
  }

  private async autoJoinUserChats(client: AuthenticatedSocket) {
    try {
      // Get user's active chats (limit to prevent overload)
      const userChats = await this.messengerService.getUserChats(client.userId, {
        limit: WEBSOCKET_CONFIG.MAX_AUTO_JOIN_CHATS,
        offset: 0,
      });

      // Join socket to chat rooms efficiently
      const userInfo = this.connectionPool.connectedUsers.get(client.id);
      if (userInfo) {
        for (const chat of userChats) {
          const roomName = `chat_${chat.id}`;
          await client.join(roomName);
          userInfo.chatRooms.add(roomName);
        }
      }
    } catch (error) {
      this.logger.error('Error auto-joining user chats:', error);
    }
  }

  private broadcastToChatRoom(chatId: string, event: string, data: any) {
    const roomName = `chat_${chatId}`;
    this.server.to(roomName).emit(event, data);
  }
  private cleanupStaleConnections() {
    const now = Date.now();
    const staleThreshold = WEBSOCKET_CONFIG.STALE_CONNECTION_THRESHOLD;

    for (const [socketId, userInfo] of this.connectionPool.connectedUsers.entries()) {
      const timeSinceLastActivity = now - userInfo.lastActivity;

      if (timeSinceLastActivity > staleThreshold) {
        this.logger.warn(`Cleaning up stale connection for user ${userInfo.username}`);

        const socket = this.server.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      }
    }
  }

  private cleanupTypingIndicators() {
    // Clean up empty typing indicator sets
    for (const [chatId, typingSet] of this.connectionPool.typingUsers.entries()) {
      if (typingSet.size === 0) {
        this.connectionPool.typingUsers.delete(chatId);
      }
    }
  }

  // Cleanup on shutdown
  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.typingCleanupInterval) {
      clearInterval(this.typingCleanupInterval);
    }
  }
}
