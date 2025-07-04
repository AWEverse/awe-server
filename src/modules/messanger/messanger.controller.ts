import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  ValidationPipe,
  HttpStatus,
  HttpCode,
  UseInterceptors,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common';
import { MessangerService } from './messanger.service';
import {
  CreateChatDto,
  SendMessageDto,
  UpdateChatDto,
  EditMessageDto,
  AddParticipantDto,
  UpdateParticipantRoleDto,
  CheckPermissionsDto,
  ArchiveMessagesDto,
  AddReactionDto,
  RemoveReactionDto,
  ForwardMessageDto,
  MuteParticipantDto,
  SearchChatsDto,
  MarkMessagesReadDto,
} from './dto/chat.dto';
import { SendStickerDto, SendGifDto, SendCustomEmojiDto } from './dto/stickers-gifs.dto';
import {
  ChatResponseDto,
  MessageResponseDto,
  PaginatedMessagesResponseDto,
  PaginatedChatsResponseDto,
  PaginatedParticipantsResponseDto,
  PermissionsCheckResponseDto,
  ArchiveResultResponseDto,
  StickerPackResponseDto,
  TrendingGifsResponseDto,
} from './dto/response.dto';
import { ChatType, MessageType, ChatRole } from './types';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { GlobalAuthGuard } from '../common/guards/global-auth.guard';
import { UserRequest } from '../auth/types';
import { JwtAuthGuard } from '../auth';

@UseInterceptors(ResponseInterceptor)
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
@ApiTags('Messenger')
@Controller('messenger')
export class MessangerController {
  private readonly logger = new Logger(MessangerController.name);

  constructor(private readonly messengerService: MessangerService) {}

  private getUserIdFromRequest(request?: any): bigint {
    if (!request || !request.user || !request.user.id) {
      throw new Error('User ID not found in request');
    }
    const userId = BigInt(request.user.id);
    this.logger.log(`Messenger: Extracted user ID: ${userId}`);
    return userId;
  }

  @Post('chats')
  @ApiOperation({
    summary: 'Create a new chat',
    description:
      'Create a new chat with specified type and optional participants. For GROUP and CHANNEL types, title is required.',
  })
  @ApiResponse({
    status: 201,
    description: 'Chat created successfully',
    type: ChatResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid chat data - missing required fields or invalid participants',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Title is required for GROUP and CHANNEL chats' },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions to create this type of chat',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'You do not have permission to create channels' },
        error: { type: 'string', example: 'Forbidden' },
      },
    },
  })
  async createChat(
    @Body(ValidationPipe) createChatDto: CreateChatDto,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(`Creating chat for user ${userId}, type: ${createChatDto.type}`);

      return await this.messengerService.createChat(
        userId,
        createChatDto.type,
        createChatDto.title,
        createChatDto.description,
        createChatDto.participantIds,
        createChatDto.isPublic,
        createChatDto.inviteLink,
      );
    } catch (error) {
      this.logger.error(
        `Error creating chat for user ${this.getUserIdFromRequest(req)}`,
        error.stack,
      );
      throw error;
    }
  }
  @Get('chats/:chatId')
  @ApiOperation({
    summary: 'Get chat information',
    description:
      'Retrieve detailed information about a specific chat including member count, creation date, and basic settings',
  })
  @ApiParam({
    name: 'chatId',
    description: 'Unique identifier of the chat',
    type: 'string',
    example: '12345678901234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Chat information retrieved successfully',
    type: ChatResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Chat not found',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Chat with ID 12345678901234567890 not found' },
        error: { type: 'string', example: 'Not Found' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'No access to this chat - user is not a participant or chat is private',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'You do not have access to this chat' },
        error: { type: 'string', example: 'Forbidden' },
      },
    },
  })
  async getChatInfo(@Param('chatId', ParseIntPipe) chatId: number, @Request() req: UserRequest) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(`Getting chat info for chat ${chatId}, user ${userId}`);

      return await this.messengerService.getChatInfo(BigInt(chatId), userId);
    } catch (error) {
      this.logger.error(`Error getting chat info for chat ${chatId}`, error.stack);
      throw error;
    }
  }
  @Put('chats/:chatId')
  @ApiOperation({
    summary: 'Update chat settings',
    description:
      'Update chat title, description, or avatar. Only chat owners and admins can perform this action.',
  })
  @ApiParam({
    name: 'chatId',
    description: 'Unique identifier of the chat to update',
    type: 'string',
    example: '12345678901234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Chat updated successfully',
    type: ChatResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'No permission to edit this chat - requires owner or admin role',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Only chat owners and admins can edit chat settings' },
        error: { type: 'string', example: 'Forbidden' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Chat not found',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Chat not found' },
        error: { type: 'string', example: 'Not Found' },
      },
    },
  })
  async updateChat(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Body(ValidationPipe) updateChatDto: UpdateChatDto,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(`Updating chat ${chatId} by user ${userId}`);

      return await this.messengerService.updateChat(BigInt(chatId), userId, updateChatDto);
    } catch (error) {
      this.logger.error(`Error updating chat ${chatId}`, error.stack);
      throw error;
    }
  }
  @Delete('chats/:chatId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete chat',
    description: 'Delete a chat (only chat owner can delete)',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: 'number' })
  @ApiResponse({ status: 200, description: 'Chat deleted successfully' })
  @ApiResponse({ status: 403, description: 'Only chat owner can delete the chat' })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  async deleteChat(@Param('chatId', ParseIntPipe) chatId: number, @Request() req: UserRequest) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(`Deleting chat ${chatId} by user ${userId}`);

      return await this.messengerService.deleteChat(BigInt(chatId), userId);
    } catch (error) {
      this.logger.error(`Error deleting chat ${chatId}`, error.stack);
      throw error;
    }
  }

  @Get('chats')
  @ApiOperation({
    summary: 'Get user chats',
    description: 'Retrieve all chats for the authenticated user with optional filters',
  })
  @ApiQuery({ name: 'type', enum: ChatType, required: false, description: 'Filter by chat type' })
  @ApiQuery({
    name: 'limit',
    type: 'number',
    required: false,
    description: 'Limit number of results (default: 50)',
  })
  @ApiQuery({
    name: 'offset',
    type: 'number',
    required: false,
    description: 'Offset for pagination (default: 0)',
  })
  @ApiResponse({
    status: 200,
    description: 'User chats retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['DIRECT', 'GROUP', 'CHANNEL'] },
              title: { type: 'string' },
              memberCount: { type: 'number' },
              lastMessageAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  async getUserChats(
    @Query('type') type?: ChatType,
    @Query('limit', ParseIntPipe) limit = 50,
    @Query('offset', ParseIntPipe) offset = 0,
    @Request() req?: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Getting chats for user ${userId}, type: ${type || 'all'}, limit: ${limit}, offset: ${offset}`,
      );

      return await this.messengerService.getUserChats(userId, {
        chatType: type,
        limit,
        offset,
      });
    } catch (error) {
      this.logger.error(
        `Error getting chats for user ${this.getUserIdFromRequest(req)}`,
        error.stack,
      );
      throw error;
    }
  }
  // ===============================================
  // УПРАВЛЕНИЕ УЧАСТНИКАМИ
  // ===============================================

  @Post('chats/:chatId/participants')
  @ApiOperation({
    summary: 'Add participant to chat',
    description: 'Add a new participant to an existing chat',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: 'number' })
  @ApiResponse({ status: 201, description: 'Participant added successfully' })
  @ApiResponse({ status: 400, description: 'User is already a participant' })
  @ApiResponse({ status: 403, description: 'No permission to add members' })
  async addParticipant(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Body(ValidationPipe) addParticipantDto: AddParticipantDto,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Adding participant ${addParticipantDto.userId} to chat ${chatId} by user ${userId}`,
      );

      return await this.messengerService.addParticipant(
        BigInt(chatId),
        userId,
        addParticipantDto.userId,
        addParticipantDto.role,
      );
    } catch (error) {
      this.logger.error(`Error adding participant to chat ${chatId}`, error.stack);
      throw error;
    }
  }
  @Delete('chats/:chatId/participants/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove participant from chat',
    description: 'Remove a participant from the chat',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: 'number' })
  @ApiParam({ name: 'userId', description: 'User ID to remove', type: 'number' })
  @ApiResponse({ status: 200, description: 'Participant removed successfully' })
  @ApiResponse({ status: 403, description: 'No permission to remove members' })
  @ApiResponse({ status: 404, description: 'Participant not found' })
  async removeParticipant(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Request() req: UserRequest,
  ) {
    try {
      const requestUserId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Removing participant ${userId} from chat ${chatId} by user ${requestUserId}`,
      );

      return await this.messengerService.removeParticipant(
        BigInt(chatId),
        requestUserId,
        BigInt(userId),
      );
    } catch (error) {
      this.logger.error(`Error removing participant ${userId} from chat ${chatId}`, error.stack);
      throw error;
    }
  }
  @Get('chats/:chatId/participants')
  @ApiOperation({
    summary: 'Get chat participants',
    description: 'Retrieve all participants of a specific chat',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: 'number' })
  @ApiQuery({
    name: 'limit',
    type: 'number',
    required: false,
    description: 'Limit number of results (default: 100)',
  })
  @ApiQuery({
    name: 'offset',
    type: 'number',
    required: false,
    description: 'Offset for pagination (default: 0)',
  })
  @ApiResponse({
    status: 200,
    description: 'Chat participants retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              userId: { type: 'string' },
              role: { type: 'string', enum: ['OWNER', 'ADMIN', 'MODERATOR', 'MEMBER'] },
              joinedAt: { type: 'string', format: 'date-time' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  username: { type: 'string' },
                  fullName: { type: 'string' },
                  avatarUrl: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'No access to this chat' })
  async getChatParticipants(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Query('limit', ParseIntPipe) limit = 100,
    @Query('offset', ParseIntPipe) offset = 0,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Getting participants for chat ${chatId}, user ${userId}, limit: ${limit}, offset: ${offset}`,
      );

      return await this.messengerService.getChatParticipants(BigInt(chatId), userId, {
        limit,
        offset,
      });
    } catch (error) {
      this.logger.error(`Error getting participants for chat ${chatId}`, error.stack);
      throw error;
    }
  }
  @Put('chats/:chatId/participants/:userId/role')
  @ApiOperation({
    summary: 'Update participant role',
    description: 'Update the role of a participant in the chat',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: 'number' })
  @ApiParam({ name: 'userId', description: 'User ID whose role to update', type: 'number' })
  @ApiResponse({ status: 200, description: 'Participant role updated successfully' })
  @ApiResponse({ status: 403, description: 'No permission to change roles' })
  @ApiResponse({ status: 404, description: 'Participant not found' })
  async updateParticipantRole(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body(ValidationPipe) updateRoleDto: UpdateParticipantRoleDto,
    @Request() req: UserRequest,
  ) {
    try {
      const requestUserId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Updating role for user ${userId} in chat ${chatId} to ${updateRoleDto.role} by user ${requestUserId}`,
      );

      return await this.messengerService.updateParticipantRole(
        BigInt(chatId),
        requestUserId,
        updateRoleDto.role,
        BigInt(userId),
      );
    } catch (error) {
      this.logger.error(`Error updating role for user ${userId} in chat ${chatId}`, error.stack);
      throw error;
    }
  }
  // ===============================================
  // СООБЩЕНИЯ
  // ===============================================
  @Post('chats/:chatId/messages')
  @ApiOperation({
    summary: 'Send message to chat',
    description:
      'Send a new message to the specified chat. Supports text, images, videos, audio, files, and other message types.',
  })
  @ApiParam({
    name: 'chatId',
    description: 'Unique identifier of the chat to send message to',
    type: 'string',
    example: '12345678901234567890',
  })
  @ApiResponse({
    status: 201,
    description: 'Message sent successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid message data - empty content or unsupported message type',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Message content cannot be empty' },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'No access to this chat or user is muted',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'You are muted in this chat until 2024-12-31' },
        error: { type: 'string', example: 'Forbidden' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Chat not found',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Chat not found' },
        error: { type: 'string', example: 'Not Found' },
      },
    },
  })
  async sendMessage(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Body(ValidationPipe) sendMessageDto: SendMessageDto,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Sending message to chat ${chatId} by user ${userId}, type: ${sendMessageDto.messageType || 'TEXT'}`,
      );

      // Конвертируем content в строку если это Buffer
      const content =
        typeof sendMessageDto.content === 'string'
          ? sendMessageDto.content
          : sendMessageDto.content.toString();

      return await this.messengerService.sendMessage(
        BigInt(chatId),
        userId,
        content,
        sendMessageDto.messageType || MessageType.TEXT,
        {
          attachments: [], // attachments - пока пустой массив
          replyToId: sendMessageDto.replyToId,
          threadId: sendMessageDto.threadId,
        },
      );
    } catch (error) {
      this.logger.error(`Error sending message to chat ${chatId}`, error.stack);
      throw error;
    }
  }
  @Get('chats/:chatId/messages')
  @ApiOperation({
    summary: 'Get chat messages',
    description: 'Retrieve messages from a chat with pagination',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: 'number' })
  @ApiQuery({
    name: 'limit',
    type: 'number',
    required: false,
    description: 'Limit number of results (default: 50)',
  })
  @ApiQuery({
    name: 'beforeId',
    type: 'number',
    required: false,
    description: 'Get messages before this message ID',
  })
  @ApiQuery({
    name: 'afterId',
    type: 'number',
    required: false,
    description: 'Get messages after this message ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Messages retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            messages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  content: { type: 'string' },
                  messageType: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  sender: { type: 'object' },
                },
              },
            },
            hasMore: { type: 'boolean' },
            nextCursor: { type: 'string', nullable: true },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'No access to this chat' })
  async getMessages(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Query('limit') limit?: number,
    @Query('beforeId') beforeId?: number,
    @Query('afterId') afterId?: number,
    @Request() req?: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      const normalizedLimit = limit ? Number(limit) : 50;
      this.logger.log(
        `Getting messages for chat ${chatId}, user ${userId}, limit: ${normalizedLimit}`,
      );

      return await this.messengerService.getChatMessages(BigInt(chatId), userId, {
        limit: normalizedLimit,
        beforeMessageId: beforeId ? BigInt(beforeId) : undefined,
        afterMessageId: afterId ? BigInt(afterId) : undefined,
      });
    } catch (error) {
      this.logger.error(`Error getting messages for chat ${chatId}`, error.stack);
      throw error;
    }
  }

  @Put('messages/:messageId')
  @ApiOperation({
    summary: 'Edit message',
    description: 'Edit an existing message content',
  })
  @ApiParam({ name: 'messageId', description: 'Message ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Message edited successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            editedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'No permission to edit this message' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async editMessage(
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body(ValidationPipe) editMessageDto: EditMessageDto,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(`Editing message ${messageId} by user ${userId}`);

      // Конвертируем content в строку если это Buffer
      const content =
        typeof editMessageDto.content === 'string'
          ? editMessageDto.content
          : editMessageDto.content.toString();

      return await this.messengerService.editMessage(BigInt(messageId), userId, content);
    } catch (error) {
      this.logger.error(`Error editing message ${messageId}`, error.stack);
      throw error;
    }
  }
  @Delete('messages/:messageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete message',
    description: 'Delete a message from the chat',
  })
  @ApiParam({ name: 'messageId', description: 'Message ID', type: 'number' })
  @ApiQuery({
    name: 'forEveryone',
    type: 'boolean',
    required: false,
    description: 'Delete for everyone (default: false)',
  })
  @ApiResponse({ status: 200, description: 'Message deleted successfully' })
  @ApiResponse({ status: 403, description: 'No permission to delete this message' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async deleteMessage(
    @Param('messageId', ParseIntPipe) messageId: number,
    @Query('forEveryone') forEveryone: boolean = false,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Deleting message ${messageId} by user ${userId}, forEveryone: ${forEveryone}`,
      );

      return await this.messengerService.deleteMessage(BigInt(messageId), userId, forEveryone);
    } catch (error) {
      this.logger.error(`Error deleting message ${messageId}`, error.stack);
      throw error;
    }
  }

  // ===============================================
  // PERMISSIONS & ARCHIVING
  // ===============================================

  @Post('chats/:chatId/permissions/check')
  @ApiOperation({
    summary: 'Check user permissions',
    description: 'Check if the user has specific permissions in the chat',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Permissions checked successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          description: 'Object with permission names as keys and boolean values',
          example: {
            SEND_MESSAGES: true,
            DELETE_MESSAGES: false,
            BAN_MEMBERS: true,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'No access to this chat' })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  async checkUserPermissions(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Body(ValidationPipe) checkPermissionsDto: CheckPermissionsDto,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Checking permissions for user ${userId} in chat ${chatId}: ${checkPermissionsDto.permissions.join(', ')}`,
      );

      return await this.messengerService.checkUserPermissions(
        BigInt(chatId),
        userId,
        checkPermissionsDto.permissions,
      );
    } catch (error) {
      const userId = this.getUserIdFromRequest(req);
      this.logger.error(
        `Error checking permissions for user ${userId} in chat ${chatId}`,
        error.stack,
      );
      throw error;
    }
  }

  @Post('chats/:chatId/archive')
  @ApiOperation({
    summary: 'Archive old messages',
    description: 'Archive messages older than specified date (admin/owner only)',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Messages archived successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            archivedCount: { type: 'number', example: 150 },
            storageFreed: { type: 'number', example: 2048, description: 'Storage freed in KB' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Only admins and owners can archive messages' })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  async archiveOldMessages(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Body(ValidationPipe) archiveMessagesDto: ArchiveMessagesDto,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Archiving messages older than ${archiveMessagesDto.beforeDate.toISOString()} in chat ${chatId} by user ${userId}`,
      );

      return await this.messengerService.archiveOldMessages(
        BigInt(chatId),
        archiveMessagesDto.beforeDate,
        userId,
      );
    } catch (error) {
      this.logger.error(`Error archiving messages in chat ${chatId}`, error.stack);
      throw error;
    }
  }

  // ===============================================
  // СТикеры, GIF, Эмодзи
  // ===============================================

  // Стикеры endpoints
  @Post('chats/:chatId/stickers')
  @ApiOperation({
    summary: 'Send sticker in chat',
    description: 'Send a sticker message in the specified chat',
  })
  @ApiResponse({ status: 201, description: 'Sticker sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid sticker data' })
  @ApiResponse({ status: 403, description: 'Access denied or premium required' })
  async sendSticker(
    @Param('chatId') chatId: string,
    @Body(ValidationPipe) sendStickerDto: SendStickerDto,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Sending sticker ${sendStickerDto.stickerId} to chat ${chatId} by user ${userId}`,
      );
      return await this.messengerService.sendSticker(
        BigInt(chatId),
        userId,
        sendStickerDto.stickerId,
        {
          replyToId: sendStickerDto.replyToId,
          threadId: sendStickerDto.threadId,
        },
      );
    } catch (error) {
      this.logger.error(`Error sending sticker to chat ${chatId}`, error.stack);
      throw error;
    }
  }

  @Post('chats/:chatId/gifs')
  @ApiOperation({
    summary: 'Send GIF in chat',
    description: 'Send a GIF message in the specified chat',
  })
  @ApiResponse({ status: 201, description: 'GIF sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid GIF data' })
  async sendGif(
    @Param('chatId') chatId: string,
    @Body(ValidationPipe) sendGifDto: SendGifDto,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(`Sending GIF ${sendGifDto.gifId} to chat ${chatId} by user ${userId}`);
      return await this.messengerService.sendGif(BigInt(chatId), userId, sendGifDto.gifId, {
        replyToId: sendGifDto.replyToId,
        threadId: sendGifDto.threadId,
      });
    } catch (error) {
      this.logger.error(`Error sending GIF to chat ${chatId}`, error.stack);
      throw error;
    }
  }

  @Post('chats/:chatId/custom-emojis')
  @ApiOperation({
    summary: 'Send custom emoji in chat',
    description: 'Send a custom emoji message in the specified chat',
  })
  @ApiResponse({ status: 201, description: 'Custom emoji sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid emoji data' })
  async sendCustomEmoji(
    @Param('chatId') chatId: string,
    @Body(ValidationPipe) sendCustomEmojiDto: SendCustomEmojiDto,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Sending custom emoji ${sendCustomEmojiDto.emojiId} to chat ${chatId} by user ${userId}`,
      );

      return await this.messengerService.sendCustomEmoji(
        BigInt(chatId),
        userId,
        sendCustomEmojiDto.emojiId,
        {
          replyToId: sendCustomEmojiDto.replyToId,
          threadId: sendCustomEmojiDto.threadId,
        },
      );
    } catch (error) {
      this.logger.error(`Error sending custom emoji to chat ${chatId}`, error.stack);
      throw error;
    }
  }

  @Get('sticker-packs')
  @ApiOperation({
    summary: 'Get user sticker packs',
    description: 'Get all sticker packs available to the user',
  })
  @ApiResponse({ status: 200, description: 'Sticker packs retrieved successfully' })
  async getUserStickerPacks(@Request() req: UserRequest) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(`Getting sticker packs for user ${userId}`);

      return await this.messengerService.getUserStickerPacks(userId);
    } catch (error) {
      this.logger.error(`Error getting sticker packs for user`, error.stack);
      throw error;
    }
  }

  @Get('gifs/trending')
  @ApiOperation({
    summary: 'Get trending GIFs',
    description: 'Get trending GIFs for chat usage',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of GIFs to return',
  })
  @ApiResponse({ status: 200, description: 'Trending GIFs retrieved successfully' })
  async getTrendingGifs(@Query('limit') limit?: number) {
    try {
      const normalizedLimit = limit ? Number(limit) : 20;
      this.logger.log(`Getting trending GIFs, limit: ${normalizedLimit}`);

      return await this.messengerService.getTrendingGifs(normalizedLimit);
    } catch (error) {
      this.logger.error('Error getting trending GIFs', error.stack);
      throw error;
    }
  }

  @Get('gifs/search')
  @ApiOperation({
    summary: 'Search GIFs',
    description: 'Search for GIFs by query',
  })
  @ApiQuery({ name: 'q', required: true, type: String, description: 'Search query' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of GIFs to return',
  })
  @ApiResponse({ status: 200, description: 'GIFs found successfully' })
  async searchGifs(@Query('q') query: string, @Query('limit') limit?: number) {
    try {
      const normalizedLimit = limit ? Number(limit) : 20;
      this.logger.log(`Searching GIFs with query: ${query}, limit: ${normalizedLimit}`);

      return await this.messengerService.searchGifs(query, normalizedLimit);
    } catch (error) {
      this.logger.error(`Error searching GIFs with query: ${query}`, error.stack);
      throw error;
    }
  }

  // ===============================================
  // НЕДОСТАЮЩИЕ ЭНДПОИНТЫ
  // ===============================================

  @Post('messages/:messageId/reactions')
  @ApiOperation({
    summary: 'Add reaction to message',
    description: 'Add an emoji reaction to a message',
  })
  @ApiParam({ name: 'messageId', description: 'Message ID', type: 'string' })
  @ApiResponse({ status: 201, description: 'Reaction added successfully' })
  @ApiResponse({ status: 400, description: 'Invalid reaction data' })
  @ApiResponse({ status: 403, description: 'No access to this chat' })
  async addReaction(
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body(ValidationPipe) addReactionDto: AddReactionDto,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Adding reaction ${addReactionDto.reaction} to message ${messageId} by user ${userId}`,
      );

      return await this.messengerService.addReaction(
        BigInt(messageId),
        userId,
        addReactionDto.reaction,
      );
    } catch (error) {
      this.logger.error(`Error adding reaction to message ${messageId}`, error.stack);
      throw error;
    }
  }

  @Delete('messages/:messageId/reactions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove reaction from message',
    description: 'Remove an emoji reaction from a message',
  })
  @ApiParam({ name: 'messageId', description: 'Message ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Reaction removed successfully' })
  @ApiResponse({ status: 404, description: 'Reaction not found' })
  async removeReaction(
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body(ValidationPipe) removeReactionDto: RemoveReactionDto,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Removing reaction ${removeReactionDto.reaction} from message ${messageId} by user ${userId}`,
      );

      return await this.messengerService.removeReaction(
        BigInt(messageId),
        userId,
        removeReactionDto.reaction,
      );
    } catch (error) {
      this.logger.error(`Error removing reaction from message ${messageId}`, error.stack);
      throw error;
    }
  }

  @Post('messages/forward')
  @ApiOperation({
    summary: 'Forward messages',
    description: 'Forward one or more messages to target chats',
  })
  @ApiResponse({ status: 201, description: 'Messages forwarded successfully' })
  @ApiResponse({ status: 403, description: 'No access to source or target chats' })
  async forwardMessages(
    @Body(ValidationPipe) forwardMessageDto: ForwardMessageDto,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Forwarding message ${forwardMessageDto.messageId} to ${forwardMessageDto.targetChatIds.length} chats by user ${userId}`,
      );

      return await this.messengerService.forwardMessages(
        [forwardMessageDto.messageId],
        forwardMessageDto.targetChatIds,
        userId,
        forwardMessageDto.comment,
      );
    } catch (error) {
      this.logger.error(`Error forwarding message ${forwardMessageDto.messageId}`, error.stack);
      throw error;
    }
  }

  @Post('chats/:chatId/messages/:messageId/pin')
  @ApiOperation({
    summary: 'Pin message in chat',
    description: 'Pin a message in the chat for all participants to see',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: 'string' })
  @ApiParam({ name: 'messageId', description: 'Message ID to pin', type: 'string' })
  @ApiResponse({ status: 200, description: 'Message pinned successfully' })
  @ApiResponse({ status: 403, description: 'No permission to pin messages' })
  async pinMessage(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(`Pinning message ${messageId} in chat ${chatId} by user ${userId}`);

      return await this.messengerService.pinMessage(BigInt(chatId), BigInt(messageId), userId);
    } catch (error) {
      this.logger.error(`Error pinning message ${messageId} in chat ${chatId}`, error.stack);
      throw error;
    }
  }

  @Delete('chats/:chatId/pinned')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unpin message in chat',
    description: 'Remove pinned message from chat',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Message unpinned successfully' })
  @ApiResponse({ status: 403, description: 'No permission to unpin messages' })
  async unpinMessage(@Param('chatId', ParseIntPipe) chatId: number, @Request() req: UserRequest) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(`Unpinning message in chat ${chatId} by user ${userId}`);

      return await this.messengerService.unpinMessage(BigInt(chatId), userId);
    } catch (error) {
      this.logger.error(`Error unpinning message in chat ${chatId}`, error.stack);
      throw error;
    }
  }

  @Get('chats/:chatId/pinned')
  @ApiOperation({
    summary: 'Get pinned messages',
    description: 'Get all pinned messages in the chat',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Pinned messages retrieved successfully' })
  @ApiResponse({ status: 403, description: 'No access to this chat' })
  async getPinnedMessages(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(`Getting pinned messages for chat ${chatId}`);

      return await this.messengerService.getPinnedMessages(BigInt(chatId), userId);
    } catch (error) {
      this.logger.error(`Error getting pinned messages for chat ${chatId}`, error.stack);
      throw error;
    }
  }

  @Put('chats/:chatId/participants/:userId/mute')
  @ApiOperation({
    summary: 'Mute participant',
    description: 'Mute a participant in the chat',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: 'string' })
  @ApiParam({ name: 'userId', description: 'User ID to mute', type: 'string' })
  @ApiResponse({ status: 200, description: 'Participant muted successfully' })
  @ApiResponse({ status: 403, description: 'No permission to mute participants' })
  async muteParticipant(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body(ValidationPipe) muteParticipantDto: MuteParticipantDto,
    @Request() req: UserRequest,
  ) {
    try {
      const requestUserId = this.getUserIdFromRequest(req);
      this.logger.log(`Muting user ${userId} in chat ${chatId} by user ${requestUserId}`);

      return await this.messengerService.muteParticipant(
        BigInt(chatId),
        BigInt(userId),
        requestUserId,
        muteParticipantDto.mutedUntil,
      );
    } catch (error) {
      this.logger.error(`Error muting user ${userId} in chat ${chatId}`, error.stack);
      throw error;
    }
  }

  @Delete('chats/:chatId/participants/:userId/mute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unmute participant',
    description: 'Remove mute from a participant in the chat',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: 'string' })
  @ApiParam({ name: 'userId', description: 'User ID to unmute', type: 'string' })
  @ApiResponse({ status: 200, description: 'Participant unmuted successfully' })
  @ApiResponse({ status: 403, description: 'No permission to unmute participants' })
  async unmuteParticipant(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Request() req: UserRequest,
  ) {
    try {
      const requestUserId = this.getUserIdFromRequest(req);
      this.logger.log(`Unmuting user ${userId} in chat ${chatId} by user ${requestUserId}`);

      return await this.messengerService.unmuteParticipant(
        BigInt(chatId),
        BigInt(userId),
        requestUserId,
      );
    } catch (error) {
      this.logger.error(`Error unmuting user ${userId} in chat ${chatId}`, error.stack);
      throw error;
    }
  }

  @Get('chats/search')
  @ApiOperation({
    summary: 'Search chats',
    description: 'Search chats by title, description, or other criteria',
  })
  @ApiResponse({ status: 200, description: 'Chats found successfully' })
  async searchChats(@Query() searchChatsDto: SearchChatsDto, @Request() req: UserRequest) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Searching chats for user ${userId} with query: ${searchChatsDto.searchQuery || 'all'}`,
      );

      return await this.messengerService.searchChats(userId, searchChatsDto.searchQuery || '', {
        chatType: searchChatsDto.chatType,
        limit: searchChatsDto.limit,
        offset: searchChatsDto.offset,
      });
    } catch (error) {
      this.logger.error(`Error searching chats`, error.stack);
      throw error;
    }
  }

  @Get('chats/:chatId/statistics')
  @ApiOperation({
    summary: 'Get chat statistics',
    description: 'Get detailed statistics for a specific chat',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Chat statistics retrieved successfully' })
  @ApiResponse({ status: 403, description: 'No access to this chat' })
  async getChatStatistics(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(`Getting statistics for chat ${chatId} by user ${userId}`);

      return await this.messengerService.getChatStatistics(BigInt(chatId), userId);
    } catch (error) {
      this.logger.error(`Error getting statistics for chat ${chatId}`, error.stack);
      throw error;
    }
  }

  @Post('chats/:chatId/messages/read')
  @ApiOperation({
    summary: 'Mark messages as read',
    description: 'Mark messages in chat as read up to a specific message',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Messages marked as read successfully' })
  @ApiResponse({ status: 403, description: 'No access to this chat' })
  async markMessagesAsRead(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Body(ValidationPipe) markMessagesReadDto: MarkMessagesReadDto,
    @Request() req: UserRequest,
  ) {
    try {
      const userId = this.getUserIdFromRequest(req);
      this.logger.log(
        `Marking messages as read in chat ${chatId} up to message ${markMessagesReadDto.upToMessageId} by user ${userId}`,
      );

      return await this.messengerService.markMessagesAsRead(
        BigInt(chatId),
        userId,
        markMessagesReadDto.upToMessageId,
      );
    } catch (error) {
      this.logger.error(`Error marking messages as read in chat ${chatId}`, error.stack);
      throw error;
    }
  }

  @Get('users/:userId/statistics')
  @ApiOperation({
    summary: 'Get user chat statistics',
    description: 'Get detailed chat statistics for a specific user',
  })
  @ApiParam({ name: 'userId', description: 'User ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'User statistics retrieved successfully' })
  @ApiResponse({ status: 403, description: 'No permission to view user statistics' })
  async getUserStatistics(
    @Param('userId', ParseIntPipe) userId: number,
    @Request() req: UserRequest,
  ) {
    try {
      const requesterId = this.getUserIdFromRequest(req);
      this.logger.log(`Getting statistics for user ${userId} by requester ${requesterId}`);

      return await this.messengerService.getUserStatistics(BigInt(userId), requesterId);
    } catch (error) {
      this.logger.error(`Error getting statistics for user ${userId}`, error.stack);
      throw error;
    }
  }
}
