/**
 * Клиентский сервис для работы с R2 хранилищем
 * Обеспечивает безопасное подключение и базовые операции с S3-совместимым API
 */

import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { R2ConfigService } from '../services/r2-config.service';
import { R2BucketType } from '../types';
import { R2ConfigurationError, R2NetworkError } from '../exceptions/r2-errors';

@Injectable()
export class R2ClientService implements OnModuleDestroy {
  private readonly logger = new Logger(R2ClientService.name);
  private readonly s3Client: S3Client;
  private readonly config: R2ConfigService;

  constructor(configService: R2ConfigService) {
    this.config = configService;
    this.s3Client = this.createS3Client();
    this.logger.log('R2 Client service initialized');
  }

  /**
   * Получает экземпляр S3 клиента
   */
  getClient(): S3Client {
    return this.s3Client;
  }

  /**
   * Получает имя bucket'а по типу
   */
  getBucketName(bucketType: R2BucketType | string): string {
    if (
      typeof bucketType === 'string' &&
      Object.values(R2BucketType).includes(bucketType as R2BucketType)
    ) {
      return this.config.getBucketName(bucketType as R2BucketType);
    }

    if (Object.values(R2BucketType).includes(bucketType as R2BucketType)) {
      return this.config.getBucketName(bucketType as R2BucketType);
    }

    // Если передан кастомный bucket name
    if (typeof bucketType === 'string') {
      return bucketType;
    }

    throw new R2ConfigurationError(`Invalid bucket type: ${bucketType}`, { bucketType });
  }

  /**
   * Получает публичный URL файла
   */
  getPublicUrl(bucket: string, key: string): string {
    if (!bucket || !key) {
      throw new R2ConfigurationError('Bucket and key are required for public URL generation', {
        bucket,
        key,
      });
    }

    return this.config.getPublicUrl(bucket, key);
  }

  /**
   * Проверяет доступность R2 сервиса
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Пытаемся выполнить простой запрос к сервису
      const { HeadBucketCommand } = await import('@aws-sdk/client-s3');

      // Берем первый доступный bucket для проверки
      const buckets = this.config.getConfiguration().buckets;
      const firstBucket = Object.values(buckets)[0];

      if (!firstBucket) {
        this.logger.warn('No buckets configured for health check');
        return false;
      }

      const command = new HeadBucketCommand({ Bucket: firstBucket });
      await this.s3Client.send(command);

      return true;
    } catch (error) {
      this.logger.error(`R2 health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Получает информацию о конфигурации (безопасную для логирования)
   */
  getConnectionInfo(): Record<string, any> {
    const config = this.config.getConfiguration();

    return {
      region: config.region,
      endpoint: config.endpoint,
      buckets: Object.keys(config.buckets),
      metricsEnabled: config.enableMetrics,
      auditEnabled: config.enableAudit,
    };
  }

  /**
   * Очистка ресурсов при завершении модуля
   */
  async onModuleDestroy(): Promise<void> {
    try {
      this.s3Client.destroy();
      this.logger.log('R2 Client service destroyed');
    } catch (error) {
      this.logger.error(`Error destroying R2 client: ${error.message}`);
    }
  }

  /**
   * Создает и настраивает S3 клиент
   */
  private createS3Client(): S3Client {
    const configuration = this.config.getConfiguration();

    const clientConfig: S3ClientConfig = {
      region: configuration.region,
      endpoint: configuration.endpoint,
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      },
      forcePathStyle: true, // Обязательно для R2
      maxAttempts: configuration.maxRetries,
      requestHandler: {
        requestTimeout: configuration.requestTimeout,
      },
    };

    try {
      const client = new S3Client(clientConfig);
      this.logger.log('S3 client created successfully');
      return client;
    } catch (error) {
      throw new R2ConfigurationError(`Failed to create S3 client: ${error.message}`, {
        error: error.message,
      });
    }
  }
}
