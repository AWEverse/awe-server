import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Logger,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import { User } from 'generated/client';
import { EmojiService } from '../services/emoji.service';
import { CreateCustomEmojiDto, UpdateCustomEmojiDto, CustomEmojiQueryDto } from '../dto';
import {
  CustomEmojiInfo,
  EmojiUploadResult,
  PaginatedResponse,
  BulkDeleteResult,
  ApiResponse as ApiResponseType,
} from '../types';

@ApiTags('Custom Emojis')
@Controller('media/emojis')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
@UseInterceptors(ResponseInterceptor)
export class EmojiController {
  private readonly logger = new Logger(EmojiController.name);

  constructor(private readonly emojiService: EmojiService) {}

  @Post()
  @ApiOperation({
    summary: 'Create custom emoji',
    description: 'Upload a new custom emoji for a chat or globally',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Emoji name (without colons)' },
        fileName: { type: 'string', description: 'File name' },
        chatId: { type: 'string', description: 'Chat ID (null for global emoji)' },
        isAnimated: { type: 'boolean', description: 'Is animated emoji' },
        isPremium: { type: 'boolean', description: 'Is premium emoji' },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Emoji image file',
        },
      },
      required: ['name', 'fileName', 'file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @ApiResponse({ status: 201, description: 'Custom emoji created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or data' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async createCustomEmoji(
    @Body(ValidationPipe) dto: CreateCustomEmojiDto,
    @UploadedFile() file: Express.Multer.File,
    @GetUser() user: User,
  ): Promise<ApiResponseType<EmojiUploadResult>> {
    try {
      this.logger.log(`Creating custom emoji ${dto.name} by user ${user.id}`);

      if (!file) {
        throw new BadRequestException('Emoji file is required');
      }

      const emoji = await this.emojiService.createCustomEmoji(BigInt(user.id), dto, file);

      return {
        success: true,
        data: emoji,
        message: 'Custom emoji created successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to create custom emoji: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Get custom emojis',
    description: 'Get paginated list of custom emojis with filtering options',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'chatId', required: false, type: String, description: 'Filter by chat ID' })
  @ApiQuery({
    name: 'includeGlobal',
    required: false,
    type: Boolean,
    description: 'Include global emojis',
  })
  @ApiQuery({
    name: 'includeAnimated',
    required: false,
    type: Boolean,
    description: 'Include animated emojis',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['popular', 'recent', 'alphabetical'],
    description: 'Sort order',
  })
  @ApiQuery({ name: 'query', required: false, type: String, description: 'Search query' })
  @ApiResponse({ status: 200, description: 'Custom emojis retrieved successfully' })
  async getCustomEmojis(
    @Query() query: CustomEmojiQueryDto,
  ): Promise<ApiResponseType<PaginatedResponse<CustomEmojiInfo>>> {
    try {
      this.logger.log(`Getting custom emojis with query: ${JSON.stringify(query)}`);

      const result = await this.emojiService.getCustomEmojis(query);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Failed to get custom emojis: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get custom emoji',
    description: 'Get detailed information about a specific custom emoji',
  })
  @ApiParam({ name: 'id', description: 'Custom emoji ID' })
  @ApiResponse({ status: 200, description: 'Custom emoji retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Custom emoji not found' })
  async getCustomEmoji(@Param('id') id: string): Promise<ApiResponseType<CustomEmojiInfo>> {
    try {
      this.logger.log(`Getting custom emoji ${id}`);

      const emoji = await this.emojiService.getCustomEmoji(id);

      return {
        success: true,
        data: emoji,
      };
    } catch (error) {
      this.logger.error(`Failed to get custom emoji: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update custom emoji',
    description: 'Update custom emoji information (author or chat admin only)',
  })
  @ApiParam({ name: 'id', description: 'Custom emoji ID' })
  @ApiResponse({ status: 200, description: 'Custom emoji updated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Custom emoji not found' })
  async updateCustomEmoji(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: UpdateCustomEmojiDto,
    @GetUser() user: User,
  ): Promise<ApiResponseType<CustomEmojiInfo>> {
    try {
      this.logger.log(`Updating custom emoji ${id} by user ${user.id}`);

      const emoji = await this.emojiService.updateCustomEmoji(id, BigInt(user.id), dto);

      return {
        success: true,
        data: emoji,
        message: 'Custom emoji updated successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to update custom emoji: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete custom emoji',
    description: 'Delete a custom emoji (author or chat admin only)',
  })
  @ApiParam({ name: 'id', description: 'Custom emoji ID' })
  @ApiResponse({ status: 200, description: 'Custom emoji deleted successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Custom emoji not found' })
  async deleteCustomEmoji(
    @Param('id') id: string,
    @GetUser() user: User,
  ): Promise<ApiResponseType<void>> {
    try {
      this.logger.log(`Deleting custom emoji ${id} by user ${user.id}`);

      await this.emojiService.deleteCustomEmoji(id, BigInt(user.id));

      return {
        success: true,
        data: undefined,
        message: 'Custom emoji deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to delete custom emoji: ${error.message}`, error.stack);
      throw error;
    }
  }

  // === Special Endpoints ===

  @Get('chat/:chatId')
  @ApiOperation({
    summary: 'Get chat emojis',
    description: 'Get all custom emojis available in a specific chat',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  @ApiQuery({
    name: 'includeGlobal',
    required: false,
    type: Boolean,
    description: 'Include global emojis',
    default: true,
  })
  @ApiResponse({ status: 200, description: 'Chat emojis retrieved successfully' })
  async getChatEmojis(
    @Param('chatId') chatId: string,
    @Query('includeGlobal') includeGlobal = true,
  ): Promise<ApiResponseType<CustomEmojiInfo[]>> {
    try {
      this.logger.log(`Getting emojis for chat ${chatId}`);

      const emojis = await this.emojiService.getChatEmojis(chatId, includeGlobal);

      return {
        success: true,
        data: emojis,
      };
    } catch (error) {
      this.logger.error(`Failed to get chat emojis: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('global/list')
  @ApiOperation({
    summary: 'Get global emojis',
    description: 'Get all global custom emojis',
  })
  @ApiResponse({ status: 200, description: 'Global emojis retrieved successfully' })
  async getGlobalEmojis(): Promise<ApiResponseType<CustomEmojiInfo[]>> {
    try {
      this.logger.log('Getting global emojis');

      const emojis = await this.emojiService.getGlobalEmojis();

      return {
        success: true,
        data: emojis,
      };
    } catch (error) {
      this.logger.error(`Failed to get global emojis: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('search/:query')
  @ApiOperation({
    summary: 'Search emojis',
    description: 'Search custom emojis by name',
  })
  @ApiParam({ name: 'query', description: 'Search query' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum results',
    default: 20,
  })
  @ApiResponse({ status: 200, description: 'Search results retrieved successfully' })
  async searchEmojis(
    @Param('query') query: string,
    @Query('limit') limit = 20,
  ): Promise<ApiResponseType<CustomEmojiInfo[]>> {
    try {
      this.logger.log(`Searching emojis with query: ${query}`);

      const emojis = await this.emojiService.searchEmojis(query, limit);

      return {
        success: true,
        data: emojis,
      };
    } catch (error) {
      this.logger.error(`Failed to search emojis: ${error.message}`, error.stack);
      throw error;
    }
  }

  // === Bulk Operations ===

  @Delete('bulk')
  @ApiOperation({
    summary: 'Bulk delete emojis',
    description: 'Delete multiple custom emojis at once',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        emojiIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of emoji IDs to delete',
        },
      },
      required: ['emojiIds'],
    },
  })
  @ApiResponse({ status: 200, description: 'Bulk delete completed' })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  async bulkDeleteEmojis(
    @Body() body: { emojiIds: string[] },
    @GetUser() user: User,
  ): Promise<ApiResponseType<BulkDeleteResult>> {
    try {
      this.logger.log(`Bulk deleting ${body.emojiIds?.length || 0} emojis by user ${user.id}`);

      if (!body.emojiIds || body.emojiIds.length === 0) {
        throw new BadRequestException('No emoji IDs provided');
      }

      const result = await this.emojiService.bulkDeleteEmojis(BigInt(user.id), body.emojiIds);

      return {
        success: true,
        data: result,
        message: `Bulk delete completed: ${result.summary.successful} successful, ${result.summary.failed} failed`,
      };
    } catch (error) {
      this.logger.error(`Failed to bulk delete emojis: ${error.message}`, error.stack);
      throw error;
    }
  }

  // === Usage Tracking ===

  @Post(':id/use')
  @ApiOperation({
    summary: 'Track emoji usage',
    description: 'Increment usage count for an emoji (called when emoji is used in messages)',
  })
  @ApiParam({ name: 'id', description: 'Custom emoji ID' })
  @ApiResponse({ status: 200, description: 'Usage tracked successfully' })
  async trackEmojiUsage(@Param('id') id: string): Promise<ApiResponseType<void>> {
    try {
      await this.emojiService.incrementUsageCount(id);

      return {
        success: true,
        data: undefined,
        message: 'Usage tracked',
      };
    } catch (error) {
      // Don't throw error for usage tracking - just log it
      this.logger.warn(`Failed to track emoji usage: ${error.message}`);
      return {
        success: true,
        data: undefined,
        message: 'Usage tracking skipped',
      };
    }
  }
}
