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
  UploadedFiles,
  UseGuards,
  Request,
  Logger,
  ValidationPipe,
  BadRequestException,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
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
import { StickerService } from '../services/sticker.service';
import {
  CreateStickerPackDto,
  UpdateStickerPackDto,
  CreateStickerDto,
  UpdateStickerDto,
  StickerPackQueryDto,
  BulkUploadDto,
} from '../dto';
import {
  StickerPackInfo,
  StickerInfo,
  StickerUploadResult,
  PaginatedResponse,
  BulkUploadResult,
  ApiResponse as ApiResponseType,
  BulkDeleteResult,
} from '../types';

@ApiTags('Stickers')
@Controller('media/stickers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
@UseInterceptors(ResponseInterceptor)
export class StickerController {
  private readonly logger = new Logger(StickerController.name);

  constructor(private readonly stickerService: StickerService) {}

  // === Sticker Pack Management ===

  @Post('packs')
  @ApiOperation({
    summary: 'Create sticker pack',
    description: 'Create a new sticker pack with optional thumbnail',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Pack name (unique)' },
        title: { type: 'string', description: 'Display title' },
        description: { type: 'string', description: 'Pack description' },
        price: { type: 'number', description: 'Price in cents (0 for free)' },
        category: { type: 'string', description: 'Category' },
        tags: { type: 'string', description: 'Tags (comma-separated)' },
        isPremium: { type: 'boolean', description: 'Is premium pack' },
        isAnimated: { type: 'boolean', description: 'Is animated pack' },
        isOfficial: { type: 'boolean', description: 'Is official pack' },
        thumbnail: {
          type: 'string',
          format: 'binary',
          description: 'Thumbnail image file',
        },
      },
      required: ['name', 'title'],
    },
  })
  @UseInterceptors(FileInterceptor('thumbnail'))
  @ApiResponse({ status: 201, description: 'Sticker pack created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createStickerPack(
    @Body(ValidationPipe) dto: CreateStickerPackDto,
    @UploadedFile() thumbnail: Express.Multer.File,
    @GetUser() user: User,
  ): Promise<ApiResponseType<StickerPackInfo>> {
    try {
      this.logger.log(`Creating sticker pack ${dto.name} by user ${user.id}`);

      const pack = await this.stickerService.createStickerPack(BigInt(user.id), dto, thumbnail);

      return {
        success: true,
        data: pack,
        message: 'Sticker pack created successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to create sticker pack: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('packs')
  @ApiOperation({
    summary: 'Get sticker packs',
    description: 'Get paginated list of sticker packs with filtering options',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'category', required: false, type: String, description: 'Filter by category' })
  @ApiQuery({
    name: 'priceType',
    required: false,
    enum: ['free', 'paid', 'all'],
    description: 'Filter by price type',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['popular', 'recent', 'alphabetical'],
    description: 'Sort order',
  })
  @ApiQuery({ name: 'query', required: false, type: String, description: 'Search query' })
  @ApiResponse({ status: 200, description: 'Sticker packs retrieved successfully' })
  async getStickerPacks(
    @Query() query: StickerPackQueryDto,
  ): Promise<ApiResponseType<PaginatedResponse<StickerPackInfo>>> {
    try {
      this.logger.log(`Getting sticker packs with query: ${JSON.stringify(query)}`);

      const result = await this.stickerService.getStickerPacks(query);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Failed to get sticker packs: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('packs/:id')
  @ApiOperation({
    summary: 'Get sticker pack',
    description: 'Get detailed information about a specific sticker pack',
  })
  @ApiParam({ name: 'id', description: 'Sticker pack ID' })
  @ApiResponse({ status: 200, description: 'Sticker pack retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Sticker pack not found' })
  async getStickerPack(@Param('id') id: string): Promise<ApiResponseType<StickerPackInfo>> {
    try {
      this.logger.log(`Getting sticker pack ${id}`);

      const pack = await this.stickerService.getStickerPack(id);

      return {
        success: true,
        data: pack,
      };
    } catch (error) {
      this.logger.error(`Failed to get sticker pack: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Put('packs/:id')
  @ApiOperation({
    summary: 'Update sticker pack',
    description: 'Update sticker pack information (owner only)',
  })
  @ApiParam({ name: 'id', description: 'Sticker pack ID' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('thumbnail'))
  @ApiResponse({ status: 200, description: 'Sticker pack updated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Sticker pack not found' })
  async updateStickerPack(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: UpdateStickerPackDto,
    @UploadedFile() thumbnail: Express.Multer.File,
    @GetUser() user: User,
  ): Promise<ApiResponseType<StickerPackInfo>> {
    try {
      this.logger.log(`Updating sticker pack ${id} by user ${user.id}`);

      const pack = await this.stickerService.updateStickerPack(id, BigInt(user.id), dto, thumbnail);

      return {
        success: true,
        data: pack,
        message: 'Sticker pack updated successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to update sticker pack: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Delete('packs/:id')
  @ApiOperation({
    summary: 'Delete sticker pack',
    description: 'Delete a sticker pack and all its stickers (owner only)',
  })
  @ApiParam({ name: 'id', description: 'Sticker pack ID' })
  @ApiResponse({ status: 200, description: 'Sticker pack deleted successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Sticker pack not found' })
  async deleteStickerPack(
    @Param('id') id: string,
    @GetUser() user: User,
  ): Promise<ApiResponseType<void>> {
    try {
      this.logger.log(`Deleting sticker pack ${id} by user ${user.id}`);

      await this.stickerService.deleteStickerPack(id, BigInt(user.id));

      return {
        success: true,
        data: undefined,
        message: 'Sticker pack deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to delete sticker pack: ${error.message}`, error.stack);
      throw error;
    }
  }

  // === Individual Sticker Management ===

  @Post('packs/:packId/stickers')
  @ApiOperation({
    summary: 'Add sticker to pack',
    description: 'Upload a new sticker to an existing pack',
  })
  @ApiParam({ name: 'packId', description: 'Sticker pack ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        emoji: { type: 'string', description: 'Associated emoji' },
        fileName: { type: 'string', description: 'File name' },
        position: { type: 'number', description: 'Position in pack' },
        isAnimated: { type: 'boolean', description: 'Is animated sticker' },
        isPremium: { type: 'boolean', description: 'Is premium sticker' },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Sticker image file',
        },
      },
      required: ['emoji', 'fileName', 'file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @ApiResponse({ status: 201, description: 'Sticker added successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or data' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async createSticker(
    @Param('packId') packId: string,
    @Body(ValidationPipe) dto: CreateStickerDto,
    @UploadedFile() file: Express.Multer.File,
    @GetUser() user: User,
  ): Promise<ApiResponseType<StickerUploadResult>> {
    try {
      this.logger.log(`Adding sticker to pack ${packId} by user ${user.id}`);

      if (!file) {
        throw new BadRequestException('Sticker file is required');
      }

      const sticker = await this.stickerService.createSticker(
        BigInt(user.id),
        { ...dto, packId },
        file,
      );

      return {
        success: true,
        data: sticker,
        message: 'Sticker added successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to create sticker: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('packs/:packId/stickers')
  @ApiOperation({
    summary: 'Get pack stickers',
    description: 'Get all stickers in a pack',
  })
  @ApiParam({ name: 'packId', description: 'Sticker pack ID' })
  @ApiResponse({ status: 200, description: 'Stickers retrieved successfully' })
  async getStickers(@Param('packId') packId: string): Promise<ApiResponseType<StickerInfo[]>> {
    try {
      this.logger.log(`Getting stickers for pack ${packId}`);

      const stickers = await this.stickerService.getStickers(packId);

      return {
        success: true,
        data: stickers,
      };
    } catch (error) {
      this.logger.error(`Failed to get stickers: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Put('stickers/:id')
  @ApiOperation({
    summary: 'Update sticker',
    description: 'Update sticker metadata (pack owner only)',
  })
  @ApiParam({ name: 'id', description: 'Sticker ID' })
  @ApiResponse({ status: 200, description: 'Sticker updated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Sticker not found' })
  async updateSticker(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: UpdateStickerDto,
    @GetUser() user: User,
  ): Promise<ApiResponseType<StickerInfo>> {
    try {
      this.logger.log(`Updating sticker ${id} by user ${user.id}`);

      const sticker = await this.stickerService.updateSticker(id, BigInt(user.id), dto);

      return {
        success: true,
        data: sticker,
        message: 'Sticker updated successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to update sticker: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Delete('stickers/:id')
  @ApiOperation({
    summary: 'Delete sticker',
    description: 'Delete a sticker from its pack (pack owner only)',
  })
  @ApiParam({ name: 'id', description: 'Sticker ID' })
  @ApiResponse({ status: 200, description: 'Sticker deleted successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Sticker not found' })
  async deleteSticker(
    @Param('id') id: string,
    @GetUser() user: User,
  ): Promise<ApiResponseType<void>> {
    try {
      this.logger.log(`Deleting sticker ${id} by user ${user.id}`);

      await this.stickerService.deleteSticker(id, BigInt(user.id));

      return {
        success: true,
        data: undefined,
        message: 'Sticker deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to delete sticker: ${error.message}`, error.stack);
      throw error;
    }
  }

  // === Bulk Operations ===

  @Post('packs/:packId/stickers/bulk')
  @ApiOperation({
    summary: 'Bulk upload stickers',
    description: 'Upload multiple stickers to a pack at once',
  })
  @ApiParam({ name: 'packId', description: 'Sticker pack ID' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 50)) // Max 50 files
  @ApiResponse({ status: 201, description: 'Bulk upload completed' })
  @ApiResponse({ status: 400, description: 'Invalid files or data' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async bulkUploadStickers(
    @Param('packId') packId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @GetUser() user: User,
  ): Promise<ApiResponseType<BulkUploadResult<StickerUploadResult>>> {
    try {
      this.logger.log(
        `Bulk uploading ${files?.length || 0} stickers to pack ${packId} by user ${user.id}`,
      );

      if (!files || files.length === 0) {
        throw new BadRequestException('No files provided');
      }

      const result = await this.stickerService.bulkUploadStickers(BigInt(user.id), packId, files);

      return {
        success: true,
        data: result,
        message: `Bulk upload completed: ${result.summary.successful} successful, ${result.summary.failed} failed`,
      };
    } catch (error) {
      this.logger.error(`Failed to bulk upload stickers: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Delete('stickers/bulk')
  @ApiOperation({
    summary: 'Bulk delete stickers',
    description: 'Delete multiple stickers at once',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        stickerIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of sticker IDs to delete',
        },
      },
      required: ['stickerIds'],
    },
  })
  @ApiResponse({ status: 200, description: 'Bulk delete completed' })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  async bulkDeleteStickers(
    @Body() body: { stickerIds: string[] },
    @GetUser() user: User,
  ): Promise<ApiResponseType<BulkDeleteResult>> {
    try {
      this.logger.log(`Bulk deleting ${body.stickerIds?.length || 0} stickers by user ${user.id}`);

      if (!body.stickerIds || body.stickerIds.length === 0) {
        throw new BadRequestException('No sticker IDs provided');
      }

      const result = await this.stickerService.bulkDeleteStickers(BigInt(user.id), body.stickerIds);

      return {
        success: true,
        data: result,
        message: `Bulk delete completed: ${result.summary.successful} successful, ${result.summary.failed} failed`,
      };
    } catch (error) {
      this.logger.error(`Failed to bulk delete stickers: ${error.message}`, error.stack);
      throw error;
    }
  }

  // === User Sticker Packs ===

  @Get('my-packs')
  @ApiOperation({
    summary: 'Get user sticker packs',
    description: 'Get all sticker packs available to the current user',
  })
  @ApiResponse({ status: 200, description: 'User sticker packs retrieved successfully' })
  async getUserStickerPacks(@GetUser() user: User): Promise<ApiResponseType<StickerPackInfo[]>> {
    try {
      this.logger.log(`Getting sticker packs for user ${user.id}`);

      const packs = await this.stickerService.getUserStickerPacks(BigInt(user.id));

      return {
        success: true,
        data: packs,
      };
    } catch (error) {
      this.logger.error(`Failed to get user sticker packs: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('packs/:id/add')
  @ApiOperation({
    summary: 'Add pack to user',
    description: "Add a sticker pack to the user's collection",
  })
  @ApiParam({ name: 'id', description: 'Sticker pack ID' })
  @ApiResponse({ status: 200, description: 'Sticker pack added to user collection' })
  @ApiResponse({ status: 400, description: 'Pack already added or other error' })
  @ApiResponse({ status: 403, description: 'Premium pack not purchased' })
  @ApiResponse({ status: 404, description: 'Sticker pack not found' })
  async addStickerPackToUser(
    @Param('id') id: string,
    @GetUser() user: User,
  ): Promise<ApiResponseType<void>> {
    try {
      this.logger.log(`Adding sticker pack ${id} to user ${user.id}`);

      await this.stickerService.addStickerPackToUser(BigInt(user.id), id);

      return {
        success: true,
        data: undefined,
        message: 'Sticker pack added to your collection',
      };
    } catch (error) {
      this.logger.error(`Failed to add sticker pack to user: ${error.message}`, error.stack);
      throw error;
    }
  }
}
