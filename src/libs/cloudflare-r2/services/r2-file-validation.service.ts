/**
 * Улучшенный сервис валидации файлов
 * Строгая типизация, безопасность и производительность
 */

import { Injectable, Logger } from '@nestjs/common';
import { UploadValidationResult } from '../types';
import { FileUtils } from '../utils/file.utils';
import { R2ConfigService } from './r2-config.service';
import {
  R2ValidationError,
  R2FileTooLargeError,
  R2UnsupportedFileTypeError,
  R2SecurityError,
} from '../exceptions/r2-errors';

export interface SecurityScanResult {
  readonly isSafe: boolean;
  readonly threats: readonly string[];
  readonly confidence: number; // 0-100
  readonly scanDuration: number; // milliseconds
}

export interface FileValidationOptions {
  readonly fileType?: string;
  readonly expectedMimeType?: string;
  readonly skipSecurityScan?: boolean;
  readonly customMaxSize?: number;
}

@Injectable()
export class R2FileValidationService {
  private readonly logger = new Logger(R2FileValidationService.name);

  constructor(private readonly configService: R2ConfigService) {}

  /**
   * Выполняет полную валидацию файла
   */
  async validateFile(
    buffer: Buffer,
    fileName: string,
    options: FileValidationOptions = {},
  ): Promise<UploadValidationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Базовая валидация входных данных
      this.validateInputs(buffer, fileName);

      // Извлечение информации о файле
      const fileInfo = FileUtils.extractFileInfo(buffer, fileName);

      // Валидация имени файла
      const nameErrors = FileUtils.validateFileName(fileName);
      errors.push(...nameErrors);

      // Валидация типа файла и размера
      if (options.fileType) {
        const typeValidation = this.validateFileType(buffer, fileName, options.fileType);
        errors.push(...typeValidation.errors);
        warnings.push(...typeValidation.warnings);
      }

      // Валидация MIME типа
      if (options.expectedMimeType && fileInfo.mimeType !== options.expectedMimeType) {
        warnings.push(
          `MIME тип не соответствует ожидаемому: ${fileInfo.mimeType} vs ${options.expectedMimeType}`,
        );
      }

      // Сканирование безопасности
      if (!options.skipSecurityScan) {
        const securityResult = await this.scanForThreats(buffer, fileName);
        if (!securityResult.isSafe) {
          errors.push(...securityResult.threats);
        }
      }

      const duration = Date.now() - startTime;
      this.logger.debug(`File validation completed in ${duration}ms for ${fileName}`);

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        suggestedBucket: options.fileType
          ? this.configService.getFileTypeConfig(options.fileType)?.bucket
          : undefined,
        metadata: {
          detectedMimeType: fileInfo.mimeType,
          actualSize: fileInfo.size,
          hash: fileInfo.hash,
          isImage: FileUtils.isImageFile(fileInfo.mimeType),
          isVideo: FileUtils.isVideoFile(fileInfo.mimeType),
          isAudio: FileUtils.isAudioFile(fileInfo.mimeType),
          isDocument: FileUtils.isDocumentFile(fileInfo.mimeType),
        },
      };
    } catch (error) {
      this.logger.error(`File validation failed for ${fileName}: ${error.message}`);
      throw new R2ValidationError(`Validation failed: ${error.message}`, {
        fileName,
        error: error.message,
      });
    }
  }

  /**
   * Валидирует тип файла против конфигурации
   */
  validateFileType(
    buffer: Buffer,
    fileName: string,
    fileType: string,
  ): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const config = this.configService.getFileTypeConfig(fileType);
    if (!config) {
      errors.push(`Неподдерживаемый тип файла: ${fileType}`);
      return { errors, warnings };
    }

    // Валидация размера
    if (buffer.length > config.maxSize) {
      const maxSizeMB = Math.round(config.maxSize / (1024 * 1024));
      errors.push(`Файл слишком большой. Максимальный размер: ${maxSizeMB}MB`);
    }

    // Валидация MIME типа
    const detectedMimeType = FileUtils.detectMimeType(buffer, fileName);
    if (!config.allowedMimeTypes.includes(detectedMimeType)) {
      errors.push(
        `Неподдерживаемый MIME тип: ${detectedMimeType}. ` +
          `Разрешены: ${config.allowedMimeTypes.join(', ')}`,
      );
    }

    // Валидация расширения (если указано в конфигурации)
    if (config.allowedExtensions) {
      const extension = FileUtils.getFileExtension(fileName);
      if (!config.allowedExtensions.includes(extension)) {
        errors.push(
          `Неподдерживаемое расширение: ${extension}. ` +
            `Разрешены: ${config.allowedExtensions.join(', ')}`,
        );
      }
    }

    return { errors, warnings };
  }

  /**
   * Сканирует файл на предмет угроз безопасности
   */
  async scanForThreats(buffer: Buffer, fileName: string): Promise<SecurityScanResult> {
    const startTime = Date.now();
    const threats: string[] = [];
    let confidence = 100;

    try {
      // Проверка на подозрительные расширения
      const extension = FileUtils.getFileExtension(fileName);
      const dangerousExtensions = ['exe', 'bat', 'cmd', 'scr', 'vbs', 'js'];

      if (dangerousExtensions.includes(extension)) {
        threats.push(`Потенциально опасное расширение: ${extension}`);
        confidence -= 30;
      }

      // Проверка размера (слишком маленькие или большие файлы подозрительны)
      if (buffer.length < 10) {
        threats.push('Подозрительно маленький размер файла');
        confidence -= 20;
      }

      if (buffer.length > 2 * 1024 * 1024 * 1024) {
        // 2GB
        threats.push('Подозрительно большой размер файла');
        confidence -= 10;
      }

      // Проверка на бинарные паттерны в текстовых файлах
      if (fileName.match(/\.(txt|json|xml|html|css|js)$/i)) {
        const hasNullBytes = buffer.includes(0);
        if (hasNullBytes) {
          threats.push('Обнаружены нулевые байты в текстовом файле');
          confidence -= 25;
        }
      }

      // Проверка на подозрительное содержимое
      const content = buffer.toString('utf8', 0, Math.min(buffer.length, 1024));

      // Поиск подозрительных паттернов
      const suspiciousPatterns = [
        /eval\s*\(/gi,
        /document\.write/gi,
        /innerHTML\s*=/gi,
        /javascript:/gi,
        /<script[^>]*>/gi,
        /on\w+\s*=/gi, // onload, onclick, etc.
        /href\s*=\s*["']javascript:/gi,
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(content)) {
          threats.push('Обнаружен подозрительный JavaScript код');
          confidence -= 15;
          break;
        }
      }

      // Проверка на SQL инъекции
      const sqlPatterns = [
        /union\s+select/gi,
        /drop\s+table/gi,
        /insert\s+into/gi,
        /delete\s+from/gi,
        /update\s+set/gi,
      ];

      for (const pattern of sqlPatterns) {
        if (pattern.test(content)) {
          threats.push('Обнаружены подозрительные SQL команды');
          confidence -= 15;
          break;
        }
      }

      const scanDuration = Date.now() - startTime;
      const isSafe = threats.length === 0 && confidence >= 70;

      this.logger.debug(
        `Security scan completed in ${scanDuration}ms for ${fileName}. ` +
          `Safe: ${isSafe}, Confidence: ${confidence}%`,
      );

      return {
        isSafe,
        threats,
        confidence: Math.max(0, confidence),
        scanDuration,
      };
    } catch (error) {
      this.logger.error(`Security scan failed for ${fileName}: ${error.message}`);
      return {
        isSafe: false,
        threats: ['Ошибка сканирования безопасности'],
        confidence: 0,
        scanDuration: Date.now() - startTime,
      };
    }
  }

  /**
   * Проверяет дубликаты файлов по хешу
   */
  async checkForDuplicates(
    buffer: Buffer,
    userId: string,
    excludeIds: string[] = [],
  ): Promise<{ isDuplicate: boolean; existingFile?: any }> {
    // Эта функция должна быть реализована с использованием базы данных
    // Здесь только интерфейс для демонстрации
    const hash = FileUtils.calculateHash(buffer);

    this.logger.debug(`Checking for duplicates with hash: ${hash.substring(0, 16)}...`);

    // TODO: Реализовать проверку дубликатов через базу данных
    return { isDuplicate: false };
  }

  /**
   * Получает рекомендации по оптимизации файла
   */
  getOptimizationRecommendations(buffer: Buffer, fileName: string, fileType: string): string[] {
    const recommendations: string[] = [];
    const fileInfo = FileUtils.extractFileInfo(buffer, fileName);

    // Рекомендации для изображений
    if (FileUtils.isImageFile(fileInfo.mimeType)) {
      if (fileInfo.size > 5 * 1024 * 1024) {
        // 5MB
        recommendations.push('Рассмотрите сжатие изображения для уменьшения размера');
      }

      if (fileInfo.mimeType === 'image/png' && fileInfo.size > 1024 * 1024) {
        recommendations.push('Для больших изображений рекомендуется формат JPEG или WebP');
      }
    }

    // Рекомендации для видео
    if (FileUtils.isVideoFile(fileInfo.mimeType)) {
      if (fileInfo.size > 100 * 1024 * 1024) {
        // 100MB
        recommendations.push('Рассмотрите сжатие видео или разбиение на части');
      }
    }

    // Рекомендации для документов
    if (FileUtils.isDocumentFile(fileInfo.mimeType)) {
      if (fileInfo.size > 10 * 1024 * 1024) {
        // 10MB
        recommendations.push('Документ довольно большой, проверьте наличие встроенных изображений');
      }
    }

    return recommendations;
  }

  /**
   * Валидирует входные данные
   */
  private validateInputs(buffer: Buffer, fileName: string): void {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new R2ValidationError('Buffer is required and must be a valid Buffer instance');
    }

    if (!fileName || typeof fileName !== 'string') {
      throw new R2ValidationError('File name is required and must be a string');
    }

    if (buffer.length === 0) {
      throw new R2ValidationError('File cannot be empty');
    }
  }
}
