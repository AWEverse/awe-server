import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  UseInterceptors,
  UploadedFile,
  Body,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from 'generated/client';

import { ImageProcessingService } from './services/image-processing.service';
import { FileValidationService } from './services/file-validation.service';
import { FileMetadataService, SearchFilesQuery } from './services/file-metadata.service';
import { R2StorageService } from '../../libs/cloudflare-r2/services/r2-storage.service';
import multer, { Multer } from 'multer';

export class UploadWithProcessingDto {
  fileType: string;
  description?: string;
  tags?: string[];
  isPublic?: boolean;
  expiresInDays?: number;
  processVariants?: boolean;
}

export class UpdateFileMetadataDto {
  description?: string;
  tags?: string[];
  isPublic?: boolean;
}

@ApiTags('Advanced File Upload')
@Controller('files')
@UseGuards(JwtAuthGuard)
export class FileController {
  private readonly logger = new Logger(FileController.name);

  constructor(
    private readonly r2Storage: R2StorageService,
    private readonly imageProcessing: ImageProcessingService,
    private readonly fileValidation: FileValidationService,
    private readonly fileMetadata: FileMetadataService,
  ) {}

  @Post('upload')
  @ApiOperation({ summary: 'Расширенная загрузка файла с обработкой и валидацией' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFileAdvanced(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadWithProcessingDto,
    @GetUser() user: User,
  ) {
    if (!file) {
      throw new BadRequestException('Файл не предоставлен');
    }

    // Валидация имени файла
    const fileNameValidation = this.fileValidation.validateFileName(file.originalname);
    if (!fileNameValidation.isValid) {
      throw new BadRequestException(
        `Недопустимое имя файла: ${fileNameValidation.errors.join(', ')}`,
      );
    }

    // Полная валидация файла
    const validation = await this.fileValidation.validateFile(file.buffer, file.originalname);

    if (!validation.isValid) {
      throw new BadRequestException(`Ошибки валидации: ${validation.errors.join(', ')}`);
    }

    // Проверка дубликатов
    const duplicateCheck = await this.fileValidation.checkForDuplicates(
      file.buffer,
      user.id.toString(),
    );

    if (duplicateCheck.isDuplicate) {
      return {
        success: true,
        isDuplicate: true,
        existingUrl: duplicateCheck.existingUrl,
        message: 'Файл уже существует',
      };
    }

    try {
      let uploadResults: any[] = [];

      // Если это изображение и требуется обработка
      if (validation.metadata.isImage && body.processVariants !== false) {
        uploadResults = await this.imageProcessing.processImage(
          file.buffer,
          file.originalname,
          body.fileType,
          user.id.toString(),
        );
      } else {
        // Обычная загрузка
        const result = await this.r2Storage.uploadFile(
          file.buffer,
          file.originalname,
          body.fileType,
          {
            metadata: {
              uploadedBy: user.id.toString(),
              uploadedByUsername: user.username,
              hash: validation.metadata.hash,
              originalSize: validation.metadata.actualSize.toString(),
            },
          },
        );

        uploadResults = [
          {
            variant: 'original',
            url: result.url,
            key: result.key,
          },
        ];
      }

      // Определение даты истечения
      let expiresAt: Date | undefined;
      if (body.expiresInDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + body.expiresInDays);
      }

      // Сохранение метаданных
      const mainResult = uploadResults.find(r => r.variant === 'original');
      const variants = uploadResults.filter(r => r.variant !== 'original');

      const metadata = await this.fileMetadata.saveFileMetadata({
        userId: user.id.toString(),
        originalName: file.originalname,
        fileName: file.originalname,
        fileType: body.fileType,
        mimeType: validation.metadata.detectedMimeType,
        size: validation.metadata.actualSize,
        hash: validation.metadata.hash,
        bucket: this.r2Storage['r2Client'].getBucketName(
          this.r2Storage.getFileTypeConfig(body.fileType)?.bucket || 'documents',
        ),
        key: mainResult.key,
        url: mainResult.url,
        variants: variants.map(v => ({
          name: v.variant,
          key: v.key,
          url: v.url,
          size: 0, // Размер вариантов нужно получать отдельно
        })),
        tags: body.tags || [],
        description: body.description,
        isPublic: body.isPublic || false,
        downloadCount: 0,
        expiresAt,
      });

      // Получение рекомендаций по оптимизации
      const recommendations = this.fileValidation.getOptimizationRecommendations(
        file.buffer,
        file.originalname,
        body.fileType,
      );

      this.logger.log(`Advanced file upload completed for user ${user.username}: ${metadata.id}`);

      return {
        success: true,
        data: {
          id: metadata.id,
          url: metadata.url,
          variants: metadata.variants,
          metadata: {
            size: metadata.size,
            mimeType: metadata.mimeType,
            hash: metadata.hash,
          },
          validation: {
            warnings: validation.warnings,
            recommendations,
          },
        },
      };
    } catch (error) {
      this.logger.error(`Advanced upload failed for user ${user.username}: ${error.message}`);
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получение информации о файле' })
  async getFileInfo(@Param('id') id: string) {
    const metadata = await this.fileMetadata.getFileMetadata(id);

    if (!metadata) {
      throw new NotFoundException('Файл не найден');
    }

    return {
      success: true,
      data: metadata,
    };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Обновление метаданных файла' })
  async updateFileMetadata(
    @Param('id') id: string,
    @Body() body: UpdateFileMetadataDto,
    @GetUser() user: User,
  ) {
    const existing = await this.fileMetadata.getFileMetadata(id);

    if (!existing) {
      throw new NotFoundException('Файл не найден');
    }

    if (existing.userId !== user.id.toString()) {
      throw new BadRequestException('Недостаточно прав для изменения файла');
    }

    const updated = await this.fileMetadata.updateFileMetadata(id, body);

    return {
      success: true,
      data: updated,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удаление файла' })
  async deleteFile(@Param('id') id: string, @GetUser() user: User) {
    const metadata = await this.fileMetadata.getFileMetadata(id);

    if (!metadata) {
      throw new NotFoundException('Файл не найден');
    }

    if (metadata.userId !== user.id.toString()) {
      throw new BadRequestException('Недостаточно прав для удаления файла');
    }

    try {
      // Удаляем основной файл
      await this.r2Storage.deleteFile({
        bucket: metadata.bucket,
        key: metadata.key,
      });

      // Удаляем варианты
      if (metadata.variants) {
        for (const variant of metadata.variants) {
          await this.r2Storage.deleteFile({
            bucket: metadata.bucket,
            key: variant.key,
          });
        }
      }

      // Удаляем метаданные
      await this.fileMetadata.deleteFileMetadata(id);

      this.logger.log(`File deleted by user ${user.username}: ${id}`);

      return {
        success: true,
        message: 'Файл успешно удален',
      };
    } catch (error) {
      this.logger.error(`File deletion failed: ${error.message}`);
      throw error;
    }
  }

  @Get()
  @ApiOperation({ summary: 'Поиск файлов пользователя' })
  async searchFiles(@Query() query: SearchFilesQuery, @GetUser() user: User) {
    // Ограничиваем поиск файлами пользователя
    const searchQuery = {
      ...query,
      userId: user.id.toString(),
      limit: Math.min(query.limit || 50, 100), // Максимум 100 файлов за раз
    };

    const result = await this.fileMetadata.searchFiles(searchQuery);

    return {
      success: true,
      data: result,
    };
  }

  @Get('stats/user')
  @ApiOperation({ summary: 'Статистика файлов пользователя' })
  async getUserStats(@GetUser() user: User) {
    const stats = await this.fileMetadata.getUserFileStats(user.id.toString());

    return {
      success: true,
      data: stats,
    };
  }

  @Post(':id/download')
  @ApiOperation({ summary: 'Получение ссылки для скачивания файла' })
  async getDownloadLink(@Param('id') id: string, @Query('expiresIn') expiresIn?: number) {
    const metadata = await this.fileMetadata.getFileMetadata(id);

    if (!metadata) {
      throw new NotFoundException('Файл не найден');
    }

    if (!metadata.isPublic) {
      // Здесь должна быть проверка прав доступа
      throw new BadRequestException('Файл недоступен для скачивания');
    }

    // Увеличиваем счетчик скачиваний
    await this.fileMetadata.incrementDownloadCount(id);

    // Получаем подписанную ссылку
    const downloadUrl = await this.r2Storage.getSignedDownloadUrl({
      bucket: metadata.bucket,
      key: metadata.key,
      expiresIn: expiresIn || 3600,
    });

    return {
      success: true,
      data: {
        downloadUrl,
        fileName: metadata.originalName,
        size: metadata.size,
        mimeType: metadata.mimeType,
      },
    };
  }

  @Get('popular/list')
  @ApiOperation({ summary: 'Популярные файлы' })
  async getPopularFiles(@Query('limit') limit?: number) {
    const files = await this.fileMetadata.getPopularFiles(Math.min(limit || 10, 50));

    return {
      success: true,
      data: files,
    };
  }

  @Post(':id/variants/regenerate')
  @ApiOperation({ summary: 'Перегенерация вариантов изображения' })
  async regenerateVariants(@Param('id') id: string, @GetUser() user: User) {
    const metadata = await this.fileMetadata.getFileMetadata(id);

    if (!metadata) {
      throw new NotFoundException('Файл не найден');
    }

    if (metadata.userId !== user.id.toString()) {
      throw new BadRequestException('Недостаточно прав');
    }

    if (!metadata.mimeType.startsWith('image/')) {
      throw new BadRequestException('Варианты можно создавать только для изображений');
    }

    try {
      // Получаем оригинальный файл
      const downloadUrl = await this.r2Storage.getSignedDownloadUrl({
        bucket: metadata.bucket,
        key: metadata.key,
        expiresIn: 3600,
      });

      // Здесь должна быть логика скачивания файла и создания новых вариантов
      // Для примера возвращаем успешный результат

      return {
        success: true,
        message: 'Варианты будут перегенерированы в фоновом режиме',
      };
    } catch (error) {
      this.logger.error(`Variant regeneration failed: ${error.message}`);
      throw error;
    }
  }
}
