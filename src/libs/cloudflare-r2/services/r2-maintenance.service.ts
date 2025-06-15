/**
 * Улучшенный сервис обслуживания R2 хранилища
 * Рефакторинг: использование новых сервисов, типизация, обработка ошибок
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { R2StorageService } from './r2-storage.service';
import { R2ConfigService } from './r2-config.service';
import { R2BatchService } from './r2-batch.service';
import { R2BucketType } from '../types';
import { R2Error, R2ErrorUtils, R2MaintenanceError } from '../exceptions/r2-errors';

export interface CleanupRule {
  readonly bucket: R2BucketType;
  readonly prefix?: string;
  readonly olderThanDays: number;
  readonly filePattern?: RegExp;
}

export interface StorageStats {
  readonly [bucketType: string]: {
    readonly count: number;
    readonly totalSize: number;
  };
}

export interface FileIntegrityResult {
  readonly key: string;
  readonly status: 'ok' | 'corrupted' | 'missing';
}

@Injectable()
export class R2MaintenanceService {
  private readonly logger = new Logger(R2MaintenanceService.name);

  // Правила очистки для разных типов файлов
  private readonly cleanupRules: readonly CleanupRule[] = [
    // Временные файлы удаляем через 1 день
    {
      bucket: R2BucketType.DOCUMENTS,
      prefix: 'temp/',
      olderThanDays: 1,
    },

    // Неиспользуемые аватары удаляем через 30 дней
    {
      bucket: R2BucketType.IMAGES,
      prefix: 'avatar/temp/',
      olderThanDays: 30,
    },

    // Логи старше 90 дней
    {
      bucket: R2BucketType.DOCUMENTS,
      prefix: 'logs/',
      olderThanDays: 90,
    },
  ];

  constructor(
    private readonly r2Storage: R2StorageService,
    private readonly configService: R2ConfigService,
    private readonly batchService: R2BatchService,
  ) {}

  /**
   * Автоматическая очистка старых файлов (запускается каждый день в 2:00)
   */
  @Cron('0 2 * * *')
  async runScheduledCleanup(): Promise<void> {
    this.logger.log('Starting scheduled cleanup...');

    try {
      let totalCleaned = 0;

      for (const rule of this.cleanupRules) {
        const cleaned = await this.cleanupByRule(rule);
        totalCleaned += cleaned;
      }

      this.logger.log(
        `Scheduled cleanup completed successfully. Total files cleaned: ${totalCleaned}`,
      );
    } catch (error) {
      if (R2ErrorUtils.isR2Error(error)) {
        this.logger.error(`Scheduled cleanup failed: ${error.message}`, error.toJSON());
      } else {
        const r2Error = new R2MaintenanceError(`Scheduled cleanup failed: ${error.message}`, {
          error: error.message,
        });
        this.logger.error(`Scheduled cleanup failed: ${r2Error.message}`, r2Error.toJSON());
      }
    }
  }

  /**
   * Очистка по правилу
   */
  async cleanupByRule(rule: CleanupRule): Promise<number> {
    try {
      const bucketName = this.configService.getBucketName(rule.bucket);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - rule.olderThanDays);

      this.logger.log(
        `Cleaning up files in ${bucketName}/${rule.prefix || ''} older than ${rule.olderThanDays} days`,
      );

      const listResult = await this.r2Storage.listFiles({
        bucket: bucketName,
        prefix: rule.prefix,
        maxKeys: 1000,
      });

      const filesToDelete = listResult.objects.filter(obj => {
        // Проверка возраста файла
        if (obj.lastModified > cutoffDate) {
          return false;
        }

        // Проверка паттерна файла (если указан)
        if (rule.filePattern && !rule.filePattern.test(obj.key)) {
          return false;
        }

        return true;
      });

      if (filesToDelete.length === 0) {
        this.logger.log(`No files found for cleanup in ${bucketName}/${rule.prefix || ''}`);
        return 0;
      }

      // Используем batch service для удаления
      const deleteItems = filesToDelete.map(obj => ({
        bucket: bucketName,
        key: obj.key,
      }));

      const batchResult = await this.batchService.deleteBatch(deleteItems, {
        concurrency: 10,
        retryAttempts: 2,
        stopOnError: false,
      });

      const deletedCount = batchResult.successCount;

      if (batchResult.failureCount > 0) {
        this.logger.warn(`Failed to delete ${batchResult.failureCount} files in cleanup`, {
          failures: batchResult.failed,
        });
      }

      this.logger.log(
        `Cleanup completed for ${bucketName}/${rule.prefix || ''}: ${deletedCount} files deleted`,
      );
      return deletedCount;
    } catch (error) {
      if (R2ErrorUtils.isR2Error(error)) {
        this.logger.error(`Cleanup failed: ${error.message}`, error.toJSON());
        throw error;
      }

      const r2Error = new R2MaintenanceError(`Cleanup failed for rule: ${error.message}`, {
        rule,
        error: error.message,
      });
      this.logger.error(`Cleanup failed: ${r2Error.message}`, r2Error.toJSON());
      throw r2Error;
    }
  }

  /**
   * Ручной запуск очистки
   */
  async runManualCleanup(bucketType?: R2BucketType): Promise<number> {
    this.logger.log('Starting manual cleanup...');

    try {
      let totalDeleted = 0;
      const rulesToApply = bucketType
        ? this.cleanupRules.filter(rule => rule.bucket === bucketType)
        : this.cleanupRules;

      for (const rule of rulesToApply) {
        totalDeleted += await this.cleanupByRule(rule);
      }

      this.logger.log(`Manual cleanup completed. Total files deleted: ${totalDeleted}`);
      return totalDeleted;
    } catch (error) {
      if (R2ErrorUtils.isR2Error(error)) {
        this.logger.error(`Manual cleanup failed: ${error.message}`, error.toJSON());
        throw error;
      }

      const r2Error = new R2MaintenanceError(`Manual cleanup failed: ${error.message}`, {
        bucketType,
        error: error.message,
      });
      this.logger.error(`Manual cleanup failed: ${r2Error.message}`, r2Error.toJSON());
      throw r2Error;
    }
  }

  /**
   * Получение статистики использования хранилища
   */
  async getStorageStats(): Promise<StorageStats> {
    const stats: Record<string, { count: number; totalSize: number }> = {};

    try {
      for (const bucketType of Object.values(R2BucketType)) {
        try {
          const bucketName = this.configService.getBucketName(bucketType);

          const listResult = await this.r2Storage.listFiles({
            bucket: bucketName,
            maxKeys: 10000,
          });

          stats[bucketType] = {
            count: listResult.objects.length,
            totalSize: listResult.objects.reduce((sum, obj) => sum + obj.size, 0),
          };
        } catch (error) {
          this.logger.warn(`Failed to get stats for bucket ${bucketType}: ${error.message}`);
          stats[bucketType] = { count: 0, totalSize: 0 };
        }
      }

      return stats;
    } catch (error) {
      if (R2ErrorUtils.isR2Error(error)) {
        this.logger.error(`Storage stats failed: ${error.message}`, error.toJSON());
        throw error;
      }

      const r2Error = new R2MaintenanceError(`Storage stats failed: ${error.message}`, {
        error: error.message,
      });
      this.logger.error(`Storage stats failed: ${r2Error.message}`, r2Error.toJSON());
      throw r2Error;
    }
  }

  /**
   * Проверка целостности файлов
   */
  async verifyFileIntegrity(
    bucket: string,
    prefix?: string,
  ): Promise<readonly FileIntegrityResult[]> {
    const results: FileIntegrityResult[] = [];

    try {
      const listResult = await this.r2Storage.listFiles({
        bucket,
        prefix,
        maxKeys: 1000,
      });

      for (const obj of listResult.objects) {
        try {
          const metadata = await this.r2Storage.getFileMetadata(bucket, obj.key);

          // Проверяем соответствие размера и ETag
          const isIntact = metadata.contentLength === obj.size && metadata.etag === obj.etag;

          results.push({
            key: obj.key,
            status: isIntact ? 'ok' : 'corrupted',
          });
        } catch (error) {
          this.logger.debug(`File integrity check failed for ${obj.key}: ${error.message}`);
          results.push({
            key: obj.key,
            status: 'missing',
          });
        }
      }

      this.logger.log(
        `File integrity check completed for ${bucket}. ` +
          `Checked: ${results.length}, OK: ${results.filter(r => r.status === 'ok').length}`,
      );

      return results;
    } catch (error) {
      if (R2ErrorUtils.isR2Error(error)) {
        this.logger.error(`File integrity check failed: ${error.message}`, error.toJSON());
        throw error;
      }

      const r2Error = new R2MaintenanceError(`File integrity check failed: ${error.message}`, {
        bucket,
        prefix,
        error: error.message,
      });
      this.logger.error(`File integrity check failed: ${r2Error.message}`, r2Error.toJSON());
      throw r2Error;
    }
  }

  /**
   * Получение правил очистки
   */
  getCleanupRules(): readonly CleanupRule[] {
    return this.cleanupRules;
  }
}
