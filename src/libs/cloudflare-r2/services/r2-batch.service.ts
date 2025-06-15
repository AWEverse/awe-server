/**
 * Улучшенный сервис для пакетных операций с R2 хранилищем
 * Добавлена обработка ошибок, типизация, метрики
 */

import { Injectable, Logger } from '@nestjs/common';
import { R2StorageService } from './r2-storage.service';
import { R2ConfigService } from './r2-config.service';
import { R2UploadResult, R2DeleteOptions, R2BatchOperationResult } from '../types';
import { R2ErrorUtils, R2Error } from '../exceptions/r2-errors';

export interface BatchUploadItem {
  readonly buffer: Buffer;
  readonly fileName: string;
  readonly fileType: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface BatchDeleteItem {
  readonly bucket: string;
  readonly key: string;
  readonly versionId?: string;
}

export interface BatchOperationOptions {
  readonly concurrency?: number; // Количество одновременных операций (по умолчанию 5)
  readonly retryAttempts?: number; // Количество попыток повтора (по умолчанию 3)
  readonly retryDelay?: number; // Задержка между попытками в мс (по умолчанию 1000)
  readonly stopOnError?: boolean; // Останавливать ли выполнение при первой ошибке
}

@Injectable()
export class R2BatchService {
  private readonly logger = new Logger(R2BatchService.name);
  private readonly defaultOptions: BatchOperationOptions = {
    concurrency: 5,
    retryAttempts: 3,
    retryDelay: 1000,
    stopOnError: false,
  };

  constructor(
    private readonly r2Storage: R2StorageService,
    private readonly configService: R2ConfigService,
  ) {}

  /**
   * Пакетная загрузка файлов с улучшенной обработкой ошибок
   */
  async uploadBatch(
    items: readonly BatchUploadItem[],
    options: BatchOperationOptions = {},
  ): Promise<R2BatchOperationResult<R2UploadResult>> {
    const startTime = Date.now();
    const opts = { ...this.defaultOptions, ...options };

    this.logger.log(`Starting batch upload of ${items.length} files`, {
      itemCount: items.length,
      concurrency: opts.concurrency,
    });

    const result = await this.executeBatchOperation(
      items,
      async item => this.uploadSingleFile(item),
      opts,
    );

    const duration = Date.now() - startTime;
    this.logger.log(
      `Batch upload completed in ${duration}ms: ${result.successCount}/${items.length} successful`,
      {
        duration,
        successCount: result.successCount,
        failureCount: result.failureCount,
      },
    );

    return result;
  }

  /**
   * Пакетное удаление файлов с улучшенной обработкой ошибок
   */
  async deleteBatch(
    items: readonly BatchDeleteItem[],
    options: BatchOperationOptions = {},
  ): Promise<R2BatchOperationResult<{ key: string; deleted: boolean }>> {
    const startTime = Date.now();
    const opts = { ...this.defaultOptions, ...options };

    this.logger.log(`Starting batch delete of ${items.length} files`, {
      itemCount: items.length,
      concurrency: opts.concurrency,
    });

    const result = await this.executeBatchOperation(
      items,
      async item => this.deleteSingleFile(item),
      opts,
    );

    const duration = Date.now() - startTime;
    this.logger.log(
      `Batch delete completed in ${duration}ms: ${result.successCount}/${items.length} successful`,
      {
        duration,
        successCount: result.successCount,
        failureCount: result.failureCount,
      },
    );

    return result;
  }

  /**
   * Универсальный метод для выполнения пакетных операций
   */
  private async executeBatchOperation<TItem, TResult>(
    items: readonly TItem[],
    operation: (item: TItem) => Promise<TResult>,
    options: BatchOperationOptions,
  ): Promise<R2BatchOperationResult<TResult>> {
    const successful: TResult[] = [];
    const failed: Array<{ item: TItem; error: string; code?: string }> = [];

    // Разбиваем элементы на группы по размеру concurrency
    const chunks = this.chunkArray(items, options.concurrency!);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async item => {
        const result = await this.executeWithRetry(
          () => operation(item),
          options.retryAttempts!,
          options.retryDelay!,
        );

        if (result.success) {
          successful.push(result.data!);
        } else {
          failed.push({
            item,
            error: result.error!,
            code: result.code,
          });

          // Если stopOnError включен и произошла ошибка
          if (options.stopOnError) {
            throw new Error(`Batch operation stopped due to error: ${result.error}`);
          }
        }
      });

      await Promise.allSettled(chunkPromises);
    }

    return {
      successful,
      failed,
      totalProcessed: items.length,
      successCount: successful.length,
      failureCount: failed.length,
    };
  }

  /**
   * Выполняет операцию с повторными попытками
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number,
    delay: number,
  ): Promise<{ success: boolean; data?: T; error?: string; code?: string }> {
    let lastError: Error | R2Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation();
        return { success: true, data: result };
      } catch (error) {
        lastError = error as Error;

        // Если это R2Error и он не восстанавливаемый, не повторяем
        if (R2ErrorUtils.isR2Error(error) && !R2ErrorUtils.isRetryable(error)) {
          break;
        }

        // Если это последняя попытка, не ждем
        if (attempt < maxAttempts) {
          await this.sleep(delay * attempt); // Экспоненциальная задержка
        }
      }
    }

    const errorMessage = lastError?.message || 'Unknown error';
    const errorCode = R2ErrorUtils.isR2Error(lastError) ? lastError.code : undefined;

    return {
      success: false,
      error: errorMessage,
      code: errorCode,
    };
  }

  /**
   * Загружает один файл
   */
  private async uploadSingleFile(item: BatchUploadItem): Promise<R2UploadResult> {
    return this.r2Storage.uploadFile(item.buffer, item.fileName, item.fileType, {
      metadata: item.metadata,
    });
  }

  /**
   * Удаляет один файл
   */
  private async deleteSingleFile(
    item: BatchDeleteItem,
  ): Promise<{ key: string; deleted: boolean }> {
    const result = await this.r2Storage.deleteFile(item);
    return {
      key: item.key,
      deleted: result.deleted,
    };
  }

  /**
   * Разбивает массив на части
   */
  private chunkArray<T>(array: readonly T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize) as T[]);
    }
    return chunks;
  }

  /**
   * Асинхронная задержка
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Получает метрики производительности пакетных операций
   */
  async getBatchMetrics(): Promise<{
    averageUploadTime: number;
    averageDeleteTime: number;
    successRate: number;
    totalOperations: number;
  }> {
    // В реальном приложении эти метрики должны сохраняться в базе данных
    // Здесь возвращаем заглушку для демонстрации интерфейса
    return {
      averageUploadTime: 0,
      averageDeleteTime: 0,
      successRate: 0,
      totalOperations: 0,
    };
  }

  /**
   * Проверяет ограничения для пакетных операций
   */
  validateBatchSize(itemCount: number): void {
    const maxBatchSize = 1000; // Ограничение для безопасности

    if (itemCount > maxBatchSize) {
      throw new Error(`Batch size ${itemCount} exceeds maximum allowed size of ${maxBatchSize}`);
    }

    if (itemCount === 0) {
      throw new Error('Batch cannot be empty');
    }
  }
}
