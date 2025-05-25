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
} from '@nestjs/common';
import { MessangerService } from './messanger.service';
import {
  CreateChatDto,
  SendMessageDto,
  UpdateChatDto,
  EditMessageDto,
  AddParticipantDto,
  UpdateParticipantRoleDto,
} from './dto/chat.dto';
import { ChatType, MessageType, ChatRole } from './types';

@Controller('messenger')
export class MessangerController {
  constructor(private readonly messengerService: MessangerService) {}

  private getUserIdFromRequest(): bigint {
    return BigInt(1);
  }

  @Post('chats')
  async createChat(@Body(ValidationPipe) createChatDto: CreateChatDto) {
    const userId = this.getUserIdFromRequest();

    return await this.messengerService.createChat(
      userId,
      createChatDto.type,
      createChatDto.title,
      createChatDto.description,
      createChatDto.participantIds,
      createChatDto.isPublic,
      createChatDto.inviteLink,
    );
  }

  @Get('chats/:chatId')
  async getChatInfo(@Param('chatId', ParseIntPipe) chatId: number) {
    const mockUserId = BigInt(1);
    return await this.messengerService.getChatInfo(BigInt(chatId), mockUserId);
  }

  @Put('chats/:chatId')
  async updateChat(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Body(ValidationPipe) updateChatDto: UpdateChatDto,
  ) {
    const mockUserId = BigInt(1);
    return await this.messengerService.updateChat(BigInt(chatId), mockUserId, updateChatDto);
  }

  @Delete('chats/:chatId')
  @HttpCode(HttpStatus.OK)
  async deleteChat(@Param('chatId', ParseIntPipe) chatId: number) {
    const mockUserId = BigInt(1);
    return await this.messengerService.deleteChat(BigInt(chatId), mockUserId);
  }

  @Get('chats')
  async getUserChats(
    @Query('type') type?: ChatType,
    @Query('limit', ParseIntPipe) limit = 50,
    @Query('offset', ParseIntPipe) offset = 0,
  ) {
    const mockUserId = BigInt(1);
    return await this.messengerService.getUserChats(mockUserId, {
      chatType: type,
      limit,
      offset,
    });
  }

  // ===============================================
  // УПРАВЛЕНИЕ УЧАСТНИКАМИ
  // ===============================================

  @Post('chats/:chatId/participants')
  async addParticipant(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Body(ValidationPipe) addParticipantDto: AddParticipantDto,
  ) {
    const mockUserId = BigInt(1);
    return await this.messengerService.addParticipant(
      BigInt(chatId),
      mockUserId,
      addParticipantDto.userId,
      addParticipantDto.role,
    );
  }

  @Delete('chats/:chatId/participants/:userId')
  @HttpCode(HttpStatus.OK)
  async removeParticipant(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    const mockUserId = BigInt(1);
    return await this.messengerService.removeParticipant(
      BigInt(chatId),
      mockUserId,
      BigInt(userId),
    );
  }

  @Get('chats/:chatId/participants')
  async getChatParticipants(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Query('limit', ParseIntPipe) limit = 100,
    @Query('offset', ParseIntPipe) offset = 0,
  ) {
    const mockUserId = BigInt(1);
    return await this.messengerService.getChatParticipants(BigInt(chatId), mockUserId, {
      limit,
      offset,
    });
  }

  @Put('chats/:chatId/participants/:userId/role')
  async updateParticipantRole(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body(ValidationPipe) updateRoleDto: UpdateParticipantRoleDto,
  ) {
    const mockUserId = BigInt(1);
    return await this.messengerService.updateParticipantRole(
      BigInt(chatId),
      mockUserId,
      updateRoleDto.role,
      BigInt(userId),
    );
  }

  // ===============================================
  // СООБЩЕНИЯ
  // ===============================================

  @Post('chats/:chatId/messages')
  async sendMessage(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Body(ValidationPipe) sendMessageDto: SendMessageDto,
  ) {
    const mockUserId = BigInt(1);

    // Конвертируем content в строку если это Buffer
    const content =
      typeof sendMessageDto.content === 'string'
        ? sendMessageDto.content
        : sendMessageDto.content.toString();

    return await this.messengerService.sendMessage(
      BigInt(chatId),
      mockUserId,
      content,
      sendMessageDto.messageType || MessageType.TEXT,
      {
        attachments: [], // attachments - пока пустой массив
        replyToId: sendMessageDto.replyToId,
        threadId: sendMessageDto.threadId,
      },
    );
  }

  @Get('chats/:chatId/messages')
  async getMessages(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Query('limit', ParseIntPipe) limit = 50,
    @Query('beforeId', ParseIntPipe) beforeId?: number,
    @Query('afterId', ParseIntPipe) afterId?: number,
  ) {
    const mockUserId = BigInt(1);
    return await this.messengerService.getMessages(BigInt(chatId), mockUserId, {
      limit,
      beforeMessageId: beforeId ? BigInt(beforeId) : undefined,
      afterMessageId: afterId ? BigInt(afterId) : undefined,
    });
  }

  @Put('messages/:messageId')
  async editMessage(
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body(ValidationPipe) editMessageDto: EditMessageDto,
  ) {
    const mockUserId = BigInt(1);

    // Конвертируем content в строку если это Buffer
    const content =
      typeof editMessageDto.content === 'string'
        ? editMessageDto.content
        : editMessageDto.content.toString();

    return await this.messengerService.editMessage(BigInt(messageId), mockUserId, content);
  }

  @Delete('messages/:messageId')
  @HttpCode(HttpStatus.OK)
  async deleteMessage(
    @Param('messageId', ParseIntPipe) messageId: number,
    @Query('forEveryone') forEveryone: boolean = false,
  ) {
    const mockUserId = BigInt(1);
    return await this.messengerService.deleteMessage(BigInt(messageId), mockUserId, forEveryone);
  }
}
