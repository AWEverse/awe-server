import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { R2StorageService } from './r2-storage.service';
import { R2BucketType } from '../types';

export interface CleanupRule {
  bucket: R2BucketType;
  prefix?: string;
  olderThanDays: number;
  filePattern?: RegExp;
}

@Injectable()
export class R2MaintenanceService {
  private readonly logger = new Logger(R2MaintenanceService.name);

  // Правила очистки для разных типов файлов
  private readonly cleanupRules: CleanupRule[] = [
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

  constructor(private readonly r2Storage: R2StorageService) {}

  /**
   * Автоматическая очистка старых файлов (запускается каждый день в 2:00)
   */
  @Cron('0 2 * * *')
  async runScheduledCleanup(): Promise<void> {
    this.logger.log('Starting scheduled cleanup...');

    try {
      for (const rule of this.cleanupRules) {
        await this.cleanupByRule(rule);
      }

      this.logger.log('Scheduled cleanup completed successfully');
    } catch (error) {
      this.logger.error(`Scheduled cleanup failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Очистка по правилу
   */
  async cleanupByRule(rule: CleanupRule): Promise<number> {
    const bucketName = this.r2Storage['r2Client'].getBucketName(rule.bucket);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - rule.olderThanDays);

    this.logger.log(
      `Cleaning up files in ${bucketName}/${rule.prefix || ''} older than ${rule.olderThanDays} days`,
    );

    try {
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

      // Удаляем файлы пачками по 100
      const batchSize = 100;
      let deletedCount = 0;

      for (let i = 0; i < filesToDelete.length; i += batchSize) {
        const batch = filesToDelete.slice(i, i + batchSize);
        const deleteItems = batch.map(obj => ({
          bucket: bucketName,
          key: obj.key,
        }));

        const batchResult =
          (await this.r2Storage['r2BatchService']?.deleteBatch?.(deleteItems)) ||
          (await this.deleteBatchManual(deleteItems));

        deletedCount += batchResult.successful.length;

        if (batchResult.failed.length > 0) {
          this.logger.warn(`Failed to delete ${batchResult.failed.length} files in batch`);
        }
      }

      this.logger.log(
        `Cleanup completed for ${bucketName}/${rule.prefix || ''}: ${deletedCount} files deleted`,
      );
      return deletedCount;
    } catch (error) {
      this.logger.error(
        `Cleanup failed for ${bucketName}/${rule.prefix || ''}: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  /**
   * Ручное удаление пачки файлов (если batch service недоступен)
   */
  private async deleteBatchManual(
    items: Array<{ bucket: string; key: string }>,
  ): Promise<{ successful: string[]; failed: Array<{ key: string; error: string }> }> {
    const result = {
      successful: [] as string[],
      failed: [] as Array<{ key: string; error: string }>,
    };

    for (const item of items) {
      try {
        await this.r2Storage.deleteFile(item);
        result.successful.push(item.key);
      } catch (error) {
        result.failed.push({
          key: item.key,
          error: error.message,
        });
      }
    }

    return result;
  }

  /**
   * Ручной запуск очистки
   */
  async runManualCleanup(bucketType?: R2BucketType): Promise<number> {
    this.logger.log('Starting manual cleanup...');

    let totalDeleted = 0;
    const rulesToApply = bucketType
      ? this.cleanupRules.filter(rule => rule.bucket === bucketType)
      : this.cleanupRules;

    for (const rule of rulesToApply) {
      totalDeleted += await this.cleanupByRule(rule);
    }

    this.logger.log(`Manual cleanup completed: ${totalDeleted} files deleted`);
    return totalDeleted;
  }

  /**
   * Получение статистики использования хранилища
   */
  async getStorageStats(): Promise<Record<string, { count: number; totalSize: number }>> {
    const stats: Record<string, { count: number; totalSize: number }> = {};

    for (const bucketType of Object.values(R2BucketType)) {
      const bucketName = this.r2Storage['r2Client'].getBucketName(bucketType);

      try {
        const listResult = await this.r2Storage.listFiles({
          bucket: bucketName,
          maxKeys: 10000, // Увеличиваем лимит для более точной статистики
        });

        stats[bucketType] = {
          count: listResult.objects.length,
          totalSize: listResult.objects.reduce((sum, obj) => sum + obj.size, 0),
        };
      } catch (error) {
        this.logger.error(`Failed to get stats for bucket ${bucketName}: ${error.message}`);
        stats[bucketType] = { count: 0, totalSize: 0 };
      }
    }

    return stats;
  }

  /**
   * Проверка целостности файлов
   */
  async verifyFileIntegrity(
    bucket: string,
    prefix?: string,
  ): Promise<Array<{ key: string; status: 'ok' | 'corrupted' | 'missing' }>> {
    const results: Array<{ key: string; status: 'ok' | 'corrupted' | 'missing' }> = [];

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
          results.push({
            key: obj.key,
            status: 'missing',
          });
        }
      }
    } catch (error) {
      this.logger.error(`File integrity check failed: ${error.message}`, error.stack);
    }

    return results;
  }
}
