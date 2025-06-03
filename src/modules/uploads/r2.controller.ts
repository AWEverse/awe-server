import {
  Controller,
  Post,
  Get,
  Delete,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Body,
  Param,
  Query,
  BadRequestException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import {
  R2StorageService,
  R2BatchService,
  R2MaintenanceService,
  BatchUploadItem,
} from 'src/libs/cloudflare-r2';

export class UploadFileDto {
  fileType: string;
  metadata?: Record<string, string>;
}

export class BatchUploadDto {
  uploads: Array<{
    fileType: string;
    metadata?: Record<string, string>;
  }>;
}

export class GetUrlDto {
  bucket: string;
  key: string;
  expiresIn?: number;
}

@ApiTags('R2 Storage')
@Controller('r2')
@UseGuards(JwtAuthGuard)
export class R2Controller {
  private readonly logger = new Logger(R2Controller.name);

  constructor(
    private readonly r2Storage: R2StorageService,
    private readonly r2Batch: R2BatchService,
    private readonly r2Maintenance: R2MaintenanceService,
  ) {}

  @Post('upload')
  @ApiOperation({ summary: 'Загрузка одного файла' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Файл для загрузки',
    type: UploadFileDto,
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadFileDto,
    @GetUser() user: User,
  ) {
    if (!file) {
      throw new BadRequestException('Файл не предоставлен');
    }

    if (!body.fileType) {
      throw new BadRequestException('Тип файла не указан');
    }

    const supportedTypes = this.r2Storage.getSupportedFileTypes();
    if (!supportedTypes.includes(body.fileType)) {
      throw new BadRequestException(
        `Неподдерживаемый тип файла. Поддерживаются: ${supportedTypes.join(', ')}`,
      );
    }

    const metadata = {
      ...body.metadata,
      uploadedBy: user.id.toString(),
      uploadedByUsername: user.username,
    };

    try {
      const result = await this.r2Storage.uploadFile(
        file.buffer,
        file.originalname,
        body.fileType,
        { metadata },
      );

      this.logger.log(`File uploaded by user ${user.username}: ${result.key}`);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Upload failed for user ${user.username}: ${error.message}`);
      throw error;
    }
  }

  @Post('upload/batch')
  @ApiOperation({ summary: 'Пакетная загрузка файлов' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(AnyFilesInterceptor())
  async uploadBatch(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: BatchUploadDto,
    @GetUser() user: User,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Файлы не предоставлены');
    }

    if (!body.uploads || body.uploads.length !== files.length) {
      throw new BadRequestException('Количество файлов и описаний не совпадает');
    }

    const batchItems: BatchUploadItem[] = files.map((file, index) => {
      const uploadInfo = body.uploads[index];

      return {
        buffer: file.buffer,
        fileName: file.originalname,
        fileType: uploadInfo.fileType,
        metadata: {
          ...uploadInfo.metadata,
          uploadedBy: user.id.toString(),
          uploadedByUsername: user.username,
        },
      };
    });

    try {
      const result = await this.r2Batch.uploadBatch(batchItems);

      this.logger.log(
        `Batch upload by user ${user.username}: ${result.successful.length} successful, ${result.failed.length} failed`,
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Batch upload failed for user ${user.username}: ${error.message}`);
      throw error;
    }
  }

  @Post('upload/presigned-url')
  @ApiOperation({ summary: 'Получение подписанного URL для загрузки' })
  async getPresignedUploadUrl(
    @Body() body: { fileName: string; fileType: string; expiresIn?: number },
    @GetUser() user: User,
  ) {
    try {
      const url = await this.r2Storage.getSignedUploadUrl(
        body.fileName,
        body.fileType,
        body.expiresIn || 3600,
      );

      this.logger.log(`Presigned upload URL generated for user ${user.username}: ${body.fileName}`);

      return {
        success: true,
        data: { uploadUrl: url },
      };
    } catch (error) {
      this.logger.error(`Presigned URL generation failed: ${error.message}`);
      throw error;
    }
  }

  @Post('download/presigned-url')
  @ApiOperation({ summary: 'Получение подписанного URL для скачивания' })
  async getPresignedDownloadUrl(@Body() body: GetUrlDto, @GetUser() user: User) {
    try {
      const url = await this.r2Storage.getSignedDownloadUrl({
        bucket: body.bucket,
        key: body.key,
        expiresIn: body.expiresIn || 3600,
      });

      this.logger.log(`Presigned download URL generated for user ${user.username}: ${body.key}`);

      return {
        success: true,
        data: { downloadUrl: url },
      };
    } catch (error) {
      this.logger.error(`Presigned download URL generation failed: ${error.message}`);
      throw error;
    }
  }

  @Delete('file/:bucket/:key')
  @ApiOperation({ summary: 'Удаление файла' })
  async deleteFile(
    @Param('bucket') bucket: string,
    @Param('key') key: string,
    @GetUser() user: User,
  ) {
    try {
      await this.r2Storage.deleteFile({ bucket, key });

      this.logger.log(`File deleted by user ${user.username}: ${key} from ${bucket}`);

      return {
        success: true,
        message: 'Файл успешно удален',
      };
    } catch (error) {
      this.logger.error(`File deletion failed: ${error.message}`);
      throw error;
    }
  }

  @Get('file/:bucket/:key/metadata')
  @ApiOperation({ summary: 'Получение метаданных файла' })
  async getFileMetadata(@Param('bucket') bucket: string, @Param('key') key: string) {
    try {
      const metadata = await this.r2Storage.getFileMetadata(bucket, key);

      return {
        success: true,
        data: metadata,
      };
    } catch (error) {
      this.logger.error(`Failed to get file metadata: ${error.message}`);
      throw error;
    }
  }

  @Get('files/:bucket')
  @ApiOperation({ summary: 'Список файлов в bucket' })
  async listFiles(
    @Param('bucket') bucket: string,
    @Query('prefix') prefix?: string,
    @Query('maxKeys') maxKeys?: number,
    @Query('continuationToken') continuationToken?: string,
  ) {
    try {
      const result = await this.r2Storage.listFiles({
        bucket,
        prefix,
        maxKeys: maxKeys ? parseInt(maxKeys.toString()) : undefined,
        continuationToken,
      });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Failed to list files: ${error.message}`);
      throw error;
    }
  }

  @Get('file-types')
  @ApiOperation({ summary: 'Получение поддерживаемых типов файлов' })
  async getSupportedFileTypes() {
    const supportedTypes = this.r2Storage.getSupportedFileTypes();
    const typeConfigs = supportedTypes.reduce(
      (acc, type) => {
        acc[type] = this.r2Storage.getFileTypeConfig(type);
        return acc;
      },
      {} as Record<string, any>,
    );

    return {
      success: true,
      data: {
        supportedTypes,
        configurations: typeConfigs,
      },
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Статистика использования хранилища' })
  async getStorageStats() {
    try {
      const stats = await this.r2Maintenance.getStorageStats();

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error(`Failed to get storage stats: ${error.message}`);
      throw error;
    }
  }

  @Post('maintenance/cleanup')
  @ApiOperation({ summary: 'Ручной запуск очистки файлов' })
  async runManualCleanup(@Body() body: { bucketType?: string }, @GetUser() user: User) {
    try {
      const deletedCount = await this.r2Maintenance.runManualCleanup(body.bucketType as any);

      this.logger.log(
        `Manual cleanup initiated by user ${user.username}: ${deletedCount} files deleted`,
      );

      return {
        success: true,
        data: { deletedCount },
      };
    } catch (error) {
      this.logger.error(`Manual cleanup failed: ${error.message}`);
      throw error;
    }
  }

  @Get('maintenance/verify/:bucket')
  @ApiOperation({ summary: 'Проверка целостности файлов' })
  async verifyFileIntegrity(@Param('bucket') bucket: string, @Query('prefix') prefix?: string) {
    try {
      const result = await this.r2Maintenance.verifyFileIntegrity(bucket, prefix);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`File integrity verification failed: ${error.message}`);
      throw error;
    }
  }
}
