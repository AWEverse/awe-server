/**
 * Основной сервис для работы с R2 хранилищем
 * Рефакторинг: выделение ответственностей, строгая типизация, безопасность
 */

import { Injectable, Logger } from '@nestjs/common';
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
import { R2ConfigService } from './r2-config.service';
import { R2FileValidationService } from './r2-file-validation.service';
import { FileUtils } from '../utils/file.utils';
import {
  R2UploadOptions,
  R2UploadResult,
  R2DeleteOptions,
  R2DeleteResult,
  R2GetUrlOptions,
  R2ListOptions,
  R2ListResult,
  R2MetadataResult,
  R2CopyOptions,
  R2BucketType,
  FileTypeConfig,
  UploadValidationResult,
  R2StorageClass,
} from '../types';
import {
  R2Error,
  R2ErrorUtils,
  R2ValidationError,
  R2FileNotFoundError,
  R2StorageError,
} from '../exceptions/r2-errors';

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);

  constructor(
    private readonly r2Client: R2ClientService,
    private readonly configService: R2ConfigService,
    private readonly validationService: R2FileValidationService,
  ) {}

  /**
   * Загружает файл в R2 хранилище
   */
  async uploadFile(
    buffer: Buffer,
    fileName: string,
    fileType: string,
    options?: Partial<R2UploadOptions>,
  ): Promise<R2UploadResult> {
    try {
      // Валидация файла
      const validation = await this.validationService.validateFile(buffer, fileName, { fileType });

      if (!validation.isValid) {
        throw new R2ValidationError(`File validation failed: ${validation.errors.join(', ')}`, {
          fileName,
          fileType,
          errors: validation.errors,
        });
      }

      // Получение конфигурации типа файла
      const config = this.configService.getFileTypeConfig(fileType);
      if (!config) {
        throw new R2ValidationError(`Unsupported file type: ${fileType}`, { fileType });
      }

      // Подготовка параметров загрузки
      const uploadOptions = this.prepareUploadOptions(buffer, fileName, fileType, config, options);

      // Выполнение загрузки
      const result = await this.executeUpload(buffer, uploadOptions);

      this.logger.log(
        `File uploaded successfully: ${uploadOptions.key} to bucket ${uploadOptions.bucket}`,
        { fileType, size: buffer.length, bucket: uploadOptions.bucket },
      );

      return result;
    } catch (error) {
      if (R2ErrorUtils.isR2Error(error)) {
        throw error;
      }

      const r2Error = R2ErrorUtils.fromAwsError(error, { fileName, fileType });
      this.logger.error(`Upload failed: ${r2Error.message}`, r2Error.toJSON());
      throw r2Error;
    }
  }

  /**
   * Удаляет файл из R2 хранилища
   */
  async deleteFile(options: R2DeleteOptions): Promise<R2DeleteResult> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: options.bucket,
        Key: options.key,
        VersionId: options.versionId,
      });

      const result = await this.r2Client.getClient().send(command);

      this.logger.log(`File deleted successfully: ${options.key} from bucket ${options.bucket}`, {
        bucket: options.bucket,
        key: options.key,
      });

      return {
        deleted: true,
        versionId: result.VersionId,
        deleteMarker: result.DeleteMarker,
      };
    } catch (error) {
      const r2Error = R2ErrorUtils.fromAwsError(error, options);
      this.logger.error(`Delete failed: ${r2Error.message}`, r2Error.toJSON());
      throw r2Error;
    }
  }

  /**
   * Получает подписанный URL для загрузки файла
   */
  async getSignedUploadUrl(
    fileName: string,
    fileType: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    try {
      const config = this.configService.getFileTypeConfig(fileType);
      if (!config) {
        throw new R2ValidationError(`Unsupported file type: ${fileType}`, { fileType });
      }

      const bucket = this.r2Client.getBucketName(config.bucket);
      const key = FileUtils.generateFileKey(fileName, fileType);

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

      const url = await getSignedUrl(this.r2Client.getClient(), command, { expiresIn });

      this.logger.debug(`Signed upload URL generated for ${fileName}`, { fileType, expiresIn });

      return url;
    } catch (error) {
      if (R2ErrorUtils.isR2Error(error)) {
        throw error;
      }

      const r2Error = R2ErrorUtils.fromAwsError(error, { fileName, fileType });
      this.logger.error(`Signed URL generation failed: ${r2Error.message}`, r2Error.toJSON());
      throw r2Error;
    }
  }

  /**
   * Получает подписанный URL для скачивания файла
   */
  async getSignedDownloadUrl(options: R2GetUrlOptions): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: options.bucket,
        Key: options.key,
        VersionId: options.versionId,
      });

      const url = await getSignedUrl(this.r2Client.getClient(), command, {
        expiresIn: options.expiresIn || this.configService.getConfiguration().defaultExpiration,
      });

      this.logger.debug(`Signed download URL generated for ${options.key}`, {
        bucket: options.bucket,
        expiresIn: options.expiresIn,
      });

      return url;
    } catch (error) {
      const r2Error = R2ErrorUtils.fromAwsError(error, options);
      this.logger.error(
        `Signed download URL generation failed: ${r2Error.message}`,
        r2Error.toJSON(),
      );
      throw r2Error;
    }
  }

  /**
   * Получает метаданные файла
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
        versionId: result.VersionId,
        metadata: result.Metadata || {},
        cacheControl: result.CacheControl,
        expires: result.Expires,
        storageClass: (result.StorageClass as R2StorageClass) || 'STANDARD',
      };
    } catch (error) {
      const r2Error = R2ErrorUtils.fromAwsError(error, { bucket, key });

      if (r2Error instanceof R2FileNotFoundError) {
        this.logger.debug(`File not found: ${key} in bucket ${bucket}`);
      } else {
        this.logger.error(`Get metadata failed: ${r2Error.message}`, r2Error.toJSON());
      }

      throw r2Error;
    }
  }

  /**
   * Получает список файлов в bucket
   */
  async listFiles(options: R2ListOptions): Promise<R2ListResult> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: options.bucket,
        Prefix: options.prefix,
        MaxKeys: Math.min(options.maxKeys || 1000, 1000), // Ограничение безопасности
        ContinuationToken: options.continuationToken,
        Delimiter: options.delimiter,
      });

      const result = await this.r2Client.getClient().send(command);

      return {
        objects: (result.Contents || []).map(obj => ({
          key: obj.Key || '',
          size: obj.Size || 0,
          lastModified: obj.LastModified || new Date(),
          etag: obj.ETag?.replace(/"/g, '') || '',
          storageClass: (obj.StorageClass as R2StorageClass) || 'STANDARD',
          owner: obj.Owner
            ? {
                id: obj.Owner.ID || '',
                displayName: obj.Owner.DisplayName || '',
              }
            : undefined,
        })),
        isTruncated: result.IsTruncated || false,
        continuationToken: options.continuationToken,
        nextContinuationToken: result.NextContinuationToken,
        keyCount: result.KeyCount || 0,
        maxKeys: result.MaxKeys || 0,
        prefix: result.Prefix,
        delimiter: result.Delimiter,
        commonPrefixes: result.CommonPrefixes?.map(cp => cp.Prefix || '') || [],
      };
    } catch (error) {
      const r2Error = R2ErrorUtils.fromAwsError(error, options);
      this.logger.error(`List files failed: ${r2Error.message}`, r2Error.toJSON());
      throw r2Error;
    }
  }

  /**
   * Копирует файл
   */
  async copyFile(options: R2CopyOptions): Promise<R2UploadResult> {
    try {
      const command = new CopyObjectCommand({
        Bucket: options.destBucket,
        Key: options.destKey,
        CopySource: `${options.sourceBucket}/${options.sourceKey}`,
        Metadata: options.metadata,
        MetadataDirective: options.metadata ? 'REPLACE' : 'COPY',
        CacheControl: options.cacheControl,
      });

      const result = await this.r2Client.getClient().send(command);

      // Получаем метаданные скопированного файла
      const metadata = await this.getFileMetadata(options.destBucket, options.destKey);

      this.logger.log(`File copied successfully: ${options.sourceKey} -> ${options.destKey}`, {
        sourceBucket: options.sourceBucket,
        destBucket: options.destBucket,
      });

      return {
        url: this.r2Client.getPublicUrl(options.destBucket, options.destKey),
        key: options.destKey,
        bucket: options.destBucket,
        size: metadata.contentLength,
        etag: result.CopyObjectResult?.ETag?.replace(/"/g, '') || '',
        lastModified: result.CopyObjectResult?.LastModified || new Date(),
        versionId: result.VersionId,
      };
    } catch (error) {
      const r2Error = R2ErrorUtils.fromAwsError(error, options);
      this.logger.error(`Copy file failed: ${r2Error.message}`, r2Error.toJSON());
      throw r2Error;
    }
  }

  /**
   * Проверяет существование файла
   */
  async fileExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.getFileMetadata(bucket, key);
      return true;
    } catch (error) {
      if (error instanceof R2FileNotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Получает публичный URL файла
   */
  getPublicUrl(bucket: string, key: string): string {
    return this.r2Client.getPublicUrl(bucket, key);
  }

  /**
   * Получает конфигурацию типа файла
   */
  getFileTypeConfig(fileType: string): FileTypeConfig | null {
    return this.configService.getFileTypeConfig(fileType);
  }

  /**
   * Получает все поддерживаемые типы файлов
   */
  getSupportedFileTypes(): readonly string[] {
    return this.configService.getSupportedFileTypes();
  }

  /**
   * Подготавливает параметры для загрузки
   */
  private prepareUploadOptions(
    buffer: Buffer,
    fileName: string,
    fileType: string,
    config: FileTypeConfig,
    userOptions?: Partial<R2UploadOptions>,
  ): R2UploadOptions {
    const bucket = this.r2Client.getBucketName(config.bucket);
    const key = userOptions?.key || FileUtils.generateFileKey(fileName, fileType);
    const contentType =
      userOptions?.contentType || mimeTypes.lookup(fileName) || 'application/octet-stream';

    return {
      bucket,
      key,
      contentType,
      cacheControl: config.cacheControl,
      metadata: {
        originalName: fileName,
        fileType,
        uploadedAt: new Date().toISOString(),
        ...userOptions?.metadata,
      },
      acl: userOptions?.acl || 'public-read',
      storageClass: userOptions?.storageClass || 'STANDARD',
      expires: userOptions?.expires,
    };
  }

  /**
   * Выполняет загрузку файла
   */
  private async executeUpload(buffer: Buffer, options: R2UploadOptions): Promise<R2UploadResult> {
    const command = new PutObjectCommand({
      Bucket: options.bucket,
      Key: options.key,
      Body: buffer,
      ContentType: options.contentType,
      CacheControl: options.cacheControl,
      Metadata: options.metadata as Record<string, string>,
      ACL: options.acl,
      StorageClass: options.storageClass,
      Expires: options.expires,
    });

    const result = await this.r2Client.getClient().send(command);

    return {
      url: this.r2Client.getPublicUrl(options.bucket, options.key),
      key: options.key,
      bucket: options.bucket,
      size: buffer.length,
      etag: result.ETag?.replace(/"/g, '') || '',
      lastModified: new Date(),
      versionId: result.VersionId,
    };
  }
}
