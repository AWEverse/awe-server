import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as mimeTypes from 'mime-types';
import { R2ClientService } from '../client/r2-client.service';
import {
  R2UploadOptions,
  R2UploadResult,
  R2DeleteOptions,
  R2GetUrlOptions,
  R2ListOptions,
  R2ListResult,
  R2MetadataResult,
  R2BucketType,
  FileTypeConfig,
  UploadValidationResult,
} from '../types';

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);

  // Конфигурация типов файлов из схемы
  private readonly fileTypeConfigs: Record<string, FileTypeConfig> = {
    // Аватары пользователей
    avatar: {
      bucket: R2BucketType.IMAGES,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      maxSize: 5 * 1024 * 1024, // 5MB
      cacheControl: 'public, max-age=31536000', // 1 year
    },

    // Баннеры пользователей
    banner: {
      bucket: R2BucketType.IMAGES,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxSize: 10 * 1024 * 1024, // 10MB
      cacheControl: 'public, max-age=31536000',
    },

    // Видео контент
    video: {
      bucket: R2BucketType.VIDEOS,
      allowedMimeTypes: [
        'video/mp4',
        'video/webm',
        'video/ogg',
        'video/avi',
        'video/mov',
        'video/wmv',
        'video/flv',
        'video/mkv',
      ],
      maxSize: 2 * 1024 * 1024 * 1024, // 2GB
      cacheControl: 'public, max-age=604800', // 1 week
    },

    // Короткие видео
    short_video: {
      bucket: R2BucketType.VIDEOS,
      allowedMimeTypes: ['video/mp4', 'video/webm'],
      maxSize: 100 * 1024 * 1024, // 100MB
      cacheControl: 'public, max-age=604800',
    },

    // Изображения в постах
    image_post: {
      bucket: R2BucketType.IMAGES,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      maxSize: 20 * 1024 * 1024, // 20MB
      cacheControl: 'public, max-age=604800',
    },

    // Вложения в сообщениях
    message_attachment: {
      bucket: R2BucketType.DOCUMENTS,
      allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'video/mp4',
        'video/webm',
        'audio/mpeg',
        'audio/wav',
        'audio/ogg',
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/zip',
        'application/x-rar-compressed',
      ],
      maxSize: 50 * 1024 * 1024, // 50MB
      cacheControl: 'private, max-age=86400', // 1 day
    },

    // Стикеры
    sticker: {
      bucket: R2BucketType.IMAGES,
      allowedMimeTypes: ['image/png', 'image/webp'],
      maxSize: 1 * 1024 * 1024, // 1MB
      cacheControl: 'public, max-age=31536000',
    },

    // GIF файлы
    gif: {
      bucket: R2BucketType.IMAGES,
      allowedMimeTypes: ['image/gif'],
      maxSize: 10 * 1024 * 1024, // 10MB
      cacheControl: 'public, max-age=31536000',
    },

    // Эмоджи
    emoji: {
      bucket: R2BucketType.IMAGES,
      allowedMimeTypes: ['image/png', 'image/webp'],
      maxSize: 512 * 1024, // 512KB
      cacheControl: 'public, max-age=31536000',
    },

    // Голосовые сообщения
    voice: {
      bucket: R2BucketType.DOCUMENTS,
      allowedMimeTypes: ['audio/ogg', 'audio/mpeg', 'audio/wav'],
      maxSize: 10 * 1024 * 1024, // 10MB
      cacheControl: 'private, max-age=86400',
    },

    // Аудио файлы
    audio: {
      bucket: R2BucketType.DOCUMENTS,
      allowedMimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac'],
      maxSize: 100 * 1024 * 1024, // 100MB
      cacheControl: 'public, max-age=604800',
    },

    // Документы
    document: {
      bucket: R2BucketType.DOCUMENTS,
      allowedMimeTypes: [
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ],
      maxSize: 50 * 1024 * 1024, // 50MB
      cacheControl: 'private, max-age=86400',
    },

    // Архивы
    archive: {
      bucket: R2BucketType.DOCUMENTS,
      allowedMimeTypes: [
        'application/zip',
        'application/x-rar-compressed',
        'application/x-7z-compressed',
      ],
      maxSize: 100 * 1024 * 1024, // 100MB
      cacheControl: 'private, max-age=86400',
    },
  };

  constructor(private readonly r2Client: R2ClientService) {}

  /**
   * Валидация файла перед загрузкой
   */
  validateFile(
    buffer: Buffer,
    fileName: string,
    fileType: string,
    mimeType?: string,
  ): UploadValidationResult {
    const config = this.fileTypeConfigs[fileType];

    if (!config) {
      return {
        isValid: false,
        error: `Неподдерживаемый тип файла: ${fileType}`,
      };
    }

    // Проверка размера
    if (buffer.length > config.maxSize) {
      return {
        isValid: false,
        error: `Файл слишком большой. Максимальный размер: ${config.maxSize / 1024 / 1024}MB`,
      };
    }

    // Определение MIME типа
    const detectedMimeType = mimeType || mimeTypes.lookup(fileName) || 'application/octet-stream';

    // Проверка MIME типа
    if (!config.allowedMimeTypes.includes(detectedMimeType)) {
      return {
        isValid: false,
        error: `Неподдерживаемый MIME тип: ${detectedMimeType}. Разрешены: ${config.allowedMimeTypes.join(', ')}`,
      };
    }

    return {
      isValid: true,
      suggestedBucket: config.bucket,
    };
  }

  /**
   * Загрузка файла
   */
  async uploadFile(
    buffer: Buffer,
    fileName: string,
    fileType: string,
    options?: Partial<R2UploadOptions>,
  ): Promise<R2UploadResult> {
    const validation = this.validateFile(buffer, fileName, fileType, options?.contentType);

    if (!validation.isValid) {
      throw new BadRequestException(validation.error);
    }

    const config = this.fileTypeConfigs[fileType];
    const bucket = this.r2Client.getBucketName(validation.suggestedBucket);

    // Генерация уникального ключа
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2);
    const key = options?.key || `${fileType}/${timestamp}_${randomSuffix}_${fileName}`;

    const uploadOptions: R2UploadOptions = {
      bucket,
      key,
      contentType: options?.contentType || mimeTypes.lookup(fileName) || 'application/octet-stream',
      cacheControl: config.cacheControl,
      metadata: {
        originalName: fileName,
        fileType,
        uploadedAt: new Date().toISOString(),
        ...options?.metadata,
      },
      ...options,
    };

    try {
      const command = new PutObjectCommand({
        Bucket: uploadOptions.bucket,
        Key: uploadOptions.key,
        Body: buffer,
        ContentType: uploadOptions.contentType,
        CacheControl: uploadOptions.cacheControl,
        Metadata: uploadOptions.metadata,
        ACL: uploadOptions.acl || 'public-read',
      });

      const result = await this.r2Client.getClient().send(command);

      this.logger.log(
        `File uploaded successfully: ${uploadOptions.key} to bucket ${uploadOptions.bucket}`,
      );

      return {
        url: this.r2Client.getPublicUrl(uploadOptions.bucket, uploadOptions.key),
        key: uploadOptions.key,
        bucket: uploadOptions.bucket,
        size: buffer.length,
        etag: result.ETag?.replace(/"/g, '') || '',
        lastModified: new Date(),
      };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`, error.stack);
      throw new Error(`Ошибка загрузки файла: ${error.message}`);
    }
  }

  /**
   * Получение подписанного URL для загрузки
   */
  async getSignedUploadUrl(
    fileName: string,
    fileType: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const config = this.fileTypeConfigs[fileType];

    if (!config) {
      throw new BadRequestException(`Неподдерживаемый тип файла: ${fileType}`);
    }

    const bucket = this.r2Client.getBucketName(config.bucket);
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2);
    const key = `${fileType}/${timestamp}_${randomSuffix}_${fileName}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: mimeTypes.lookup(fileName) || 'application/octet-stream',
      CacheControl: config.cacheControl,
      Metadata: {
        originalName: fileName,
        fileType,
        uploadedAt: new Date().toISOString(),
      },
    });

    return await getSignedUrl(this.r2Client.getClient(), command, { expiresIn });
  }

  /**
   * Получение подписанного URL для скачивания
   */
  async getSignedDownloadUrl(options: R2GetUrlOptions): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: options.bucket,
      Key: options.key,
    });

    return await getSignedUrl(this.r2Client.getClient(), command, {
      expiresIn: options.expiresIn || 3600,
    });
  }

  /**
   * Удаление файла
   */
  async deleteFile(options: R2DeleteOptions): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: options.bucket,
        Key: options.key,
      });

      await this.r2Client.getClient().send(command);
      this.logger.log(`File deleted successfully: ${options.key} from bucket ${options.bucket}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`, error.stack);
      throw new Error(`Ошибка удаления файла: ${error.message}`);
    }
  }

  /**
   * Получение метаданных файла
   */
  async getFileMetadata(bucket: string, key: string): Promise<R2MetadataResult> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const result = await this.r2Client.getClient().send(command);

      return {
        contentType: result.ContentType || 'application/octet-stream',
        contentLength: result.ContentLength || 0,
        lastModified: result.LastModified || new Date(),
        etag: result.ETag?.replace(/"/g, '') || '',
        metadata: result.Metadata || {},
      };
    } catch (error) {
      this.logger.error(`Failed to get file metadata: ${error.message}`, error.stack);
      throw new Error(`Ошибка получения метаданных файла: ${error.message}`);
    }
  }

  /**
   * Список файлов в bucket
   */
  async listFiles(options: R2ListOptions): Promise<R2ListResult> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: options.bucket,
        Prefix: options.prefix,
        MaxKeys: options.maxKeys || 1000,
        ContinuationToken: options.continuationToken,
      });

      const result = await this.r2Client.getClient().send(command);

      return {
        objects: (result.Contents || []).map(obj => ({
          key: obj.Key || '',
          size: obj.Size || 0,
          lastModified: obj.LastModified || new Date(),
          etag: obj.ETag?.replace(/"/g, '') || '',
          storageClass: obj.StorageClass || 'STANDARD',
        })),
        isTruncated: result.IsTruncated || false,
        continuationToken: options.continuationToken,
        nextContinuationToken: result.NextContinuationToken,
      };
    } catch (error) {
      this.logger.error(`Failed to list files: ${error.message}`, error.stack);
      throw new Error(`Ошибка получения списка файлов: ${error.message}`);
    }
  }

  /**
   * Копирование файла
   */
  async copyFile(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string,
  ): Promise<void> {
    try {
      const command = new CopyObjectCommand({
        Bucket: destBucket,
        Key: destKey,
        CopySource: `${sourceBucket}/${sourceKey}`,
      });

      await this.r2Client.getClient().send(command);
      this.logger.log(`File copied successfully: ${sourceKey} -> ${destKey}`);
    } catch (error) {
      this.logger.error(`Failed to copy file: ${error.message}`, error.stack);
      throw new Error(`Ошибка копирования файла: ${error.message}`);
    }
  }

  /**
   * Проверка существования файла
   */
  async fileExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.getFileMetadata(bucket, key);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Получение публичного URL файла
   */
  getPublicUrl(bucket: string, key: string): string {
    return this.r2Client.getPublicUrl(bucket, key);
  }

  /**
   * Получение конфигурации для типа файла
   */
  getFileTypeConfig(fileType: string): FileTypeConfig | undefined {
    return this.fileTypeConfigs[fileType];
  }

  /**
   * Получение всех поддерживаемых типов файлов
   */
  getSupportedFileTypes(): string[] {
    return Object.keys(this.fileTypeConfigs);
  }
}
