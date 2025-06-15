/**
 * Конфигурационный сервис для R2 хранилища
 * Централизованное управление конфигурацией с валидацией
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { R2BucketType, FileTypeConfig } from '../types';
import { FILE_TYPE_CONFIGS } from '../constants/file-types.constant';
import { R2ConfigurationError } from '../exceptions/r2-errors';

export interface R2Configuration {
  readonly region: string;
  readonly endpoint: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly buckets: Readonly<Record<R2BucketType, string>>;
  readonly defaultExpiration: number;
  readonly maxRetries: number;
  readonly requestTimeout: number;
  readonly enableMetrics: boolean;
  readonly enableAudit: boolean;
}

@Injectable()
export class R2ConfigService {
  private readonly logger = new Logger(R2ConfigService.name);
  private readonly configuration: R2Configuration;

  constructor(private readonly configService: ConfigService) {
    this.configuration = this.loadAndValidateConfiguration();
    this.logger.log('R2 configuration loaded and validated');
  }

  /**
   * Получает полную конфигурацию R2
   */
  getConfiguration(): R2Configuration {
    return this.configuration;
  }

  /**
   * Получает имя bucket'а по типу
   */
  getBucketName(bucketType: R2BucketType): string {
    const bucketName = this.configuration.buckets[bucketType];
    if (!bucketName) {
      throw new R2ConfigurationError(`Bucket name not configured for type: ${bucketType}`, {
        bucketType,
      });
    }
    return bucketName;
  }

  /**
   * Получает конфигурацию типа файла
   */
  getFileTypeConfig(fileType: string): FileTypeConfig | null {
    return FILE_TYPE_CONFIGS[fileType] || null;
  }

  /**
   * Получает все поддерживаемые типы файлов
   */
  getSupportedFileTypes(): readonly string[] {
    return Object.keys(FILE_TYPE_CONFIGS);
  }

  /**
   * Проверяет, поддерживается ли тип файла
   */
  isFileTypeSupported(fileType: string): boolean {
    return fileType in FILE_TYPE_CONFIGS;
  }

  /**
   * Получает публичный URL файла
   */
  getPublicUrl(bucket: string, key: string): string {
    const endpoint = this.configuration.endpoint;
    const domain = endpoint.replace(/https?:\/\//, '');
    return `https://${domain}/${bucket}/${key}`;
  }

  /**
   * Проверяет, включены ли метрики
   */
  isMetricsEnabled(): boolean {
    return this.configuration.enableMetrics;
  }

  /**
   * Проверяет, включен ли аудит
   */
  isAuditEnabled(): boolean {
    return this.configuration.enableAudit;
  }

  /**
   * Загружает и валидирует конфигурацию
   */
  private loadAndValidateConfiguration(): R2Configuration {
    const config: R2Configuration = {
      region: this.getRequiredConfig('R2_REGION', 'auto'),
      endpoint: this.getRequiredConfig('R2_ENDPOINT'),
      accessKeyId: this.getRequiredConfig('R2_ACCESS_KEY_ID'),
      secretAccessKey: this.getRequiredConfig('R2_SECRET_ACCESS_KEY'),
      buckets: {
        [R2BucketType.AVATARS]: this.getRequiredConfig('R2_BUCKET_AVATARS'),
        [R2BucketType.DOCUMENTS]: this.getRequiredConfig('R2_BUCKET_DOCS'),
        [R2BucketType.VIDEOS]: this.getRequiredConfig('R2_BUCKET_VIDEOS'),
        [R2BucketType.IMAGES]: this.getRequiredConfig('R2_BUCKET_IMAGES'),
      },
      defaultExpiration: this.getOptionalConfig('R2_DEFAULT_EXPIRATION', 3600),
      maxRetries: this.getOptionalConfig('R2_MAX_RETRIES', 3),
      requestTimeout: this.getOptionalConfig('R2_REQUEST_TIMEOUT', 30000),
      enableMetrics: this.getOptionalConfig('R2_ENABLE_METRICS', true),
      enableAudit: this.getOptionalConfig('R2_ENABLE_AUDIT', false),
    };

    this.validateConfiguration(config);
    return config;
  }

  /**
   * Получает обязательный параметр конфигурации
   */
  private getRequiredConfig(key: string, defaultValue?: string): string {
    const value =
      defaultValue !== undefined
        ? this.configService.get<string>(key, defaultValue)
        : this.configService.get<string>(key);
    if (!value) {
      throw new R2ConfigurationError(`Required configuration missing: ${key}`, { configKey: key });
    }
    return value;
  }

  /**
   * Получает опциональный параметр конфигурации
   */
  private getOptionalConfig<T>(key: string, defaultValue: T): T {
    const value = this.configService.get<T>(key, defaultValue);
    return value ?? defaultValue;
  }

  /**
   * Валидирует конфигурацию
   */
  private validateConfiguration(config: R2Configuration): void {
    const errors: string[] = [];

    // Валидация endpoint
    if (!this.isValidUrl(config.endpoint)) {
      errors.push('Invalid R2 endpoint URL');
    }

    // Валидация credentials
    if (!config.accessKeyId || config.accessKeyId.length < 10) {
      errors.push('Invalid R2 access key ID');
    }

    if (!config.secretAccessKey || config.secretAccessKey.length < 20) {
      errors.push('Invalid R2 secret access key');
    }

    // Валидация bucket names
    for (const [type, bucketName] of Object.entries(config.buckets)) {
      if (!this.isValidBucketName(bucketName)) {
        errors.push(`Invalid bucket name for ${type}: ${bucketName}`);
      }
    }

    // Валидация числовых параметров
    if (config.defaultExpiration < 1 || config.defaultExpiration > 604800) {
      errors.push('Default expiration must be between 1 and 604800 seconds');
    }

    if (config.maxRetries < 0 || config.maxRetries > 10) {
      errors.push('Max retries must be between 0 and 10');
    }

    if (config.requestTimeout < 1000 || config.requestTimeout > 300000) {
      errors.push('Request timeout must be between 1000 and 300000 milliseconds');
    }

    if (errors.length > 0) {
      throw new R2ConfigurationError(`Configuration validation failed: ${errors.join(', ')}`, {
        errors,
      });
    }
  }

  /**
   * Проверяет валидность URL
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Проверяет валидность имени bucket'а
   */
  private isValidBucketName(name: string): boolean {
    // AWS S3/R2 bucket naming rules
    const bucketNameRegex = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
    return (
      name.length >= 3 &&
      name.length <= 63 &&
      bucketNameRegex.test(name) &&
      !name.includes('..') &&
      !name.match(/^\d+\.\d+\.\d+\.\d+$/) // не IP адрес
    );
  }
}
