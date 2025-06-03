import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as mimeTypes from 'mime-types';
import { createHash } from 'crypto';
import { R2StorageService } from 'src/libs/cloudflare-r2';

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata: {
    detectedMimeType: string;
    actualSize: number;
    hash: string;
    isImage: boolean;
    isVideo: boolean;
    isAudio: boolean;
    isDocument: boolean;
  };
}

export interface SecurityScanResult {
  isSafe: boolean;
  threats: string[];
  confidence: number;
}

@Injectable()
export class FileValidationService {
  private readonly logger = new Logger(FileValidationService.name);

  // Опасные расширения файлов
  private readonly dangerousExtensions = [
    'exe',
    'bat',
    'cmd',
    'com',
    'pif',
    'scr',
    'vbs',
    'js',
    'jar',
    'app',
    'deb',
    'pkg',
    'rpm',
    'dmg',
    'iso',
    'img',
    'msi',
    'msp',
    'dll',
  ];

  // Магические числа для определения типов файлов
  private readonly magicNumbers = {
    // Изображения
    'image/jpeg': [0xff, 0xd8, 0xff],
    'image/png': [0x89, 0x50, 0x4e, 0x47],
    'image/gif': [0x47, 0x49, 0x46],
    'image/webp': [0x52, 0x49, 0x46, 0x46],
    'image/bmp': [0x42, 0x4d],

    // Видео
    'video/mp4': [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70],
    'video/webm': [0x1a, 0x45, 0xdf, 0xa3],
    'video/avi': [0x52, 0x49, 0x46, 0x46],

    // Аудио
    'audio/mp3': [0xff, 0xfb],
    'audio/wav': [0x52, 0x49, 0x46, 0x46],
    'audio/ogg': [0x4f, 0x67, 0x67, 0x53],

    // Документы
    'application/pdf': [0x25, 0x50, 0x44, 0x46],
    'application/zip': [0x50, 0x4b, 0x03, 0x04],
    'application/x-rar': [0x52, 0x61, 0x72, 0x21],
  };

  constructor(private readonly r2Storage: R2StorageService) {}

  /**
   * Полная валидация файла
   */
  async validateFile(
    buffer: Buffer,
    fileName: string,
    expectedMimeType?: string,
  ): Promise<FileValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Базовая информация о файле
    const hash = this.calculateFileHash(buffer);
    const detectedMimeType = this.detectMimeType(buffer, fileName);
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';

    // Проверка расширения
    if (this.dangerousExtensions.includes(fileExtension)) {
      errors.push(`Опасное расширение файла: ${fileExtension}`);
    }

    // Проверка соответствия MIME типа
    if (expectedMimeType && detectedMimeType !== expectedMimeType) {
      warnings.push(
        `MIME тип не соответствует ожидаемому: ${detectedMimeType} vs ${expectedMimeType}`,
      );
    }

    // Проверка размера
    if (buffer.length === 0) {
      errors.push('Файл пустой');
    }

    if (buffer.length > 2 * 1024 * 1024 * 1024) {
      // 2GB
      errors.push('Файл слишком большой (максимум 2GB)');
    }

    // Проверка безопасности
    const securityResult = await this.scanForThreats(buffer, fileName);
    if (!securityResult.isSafe) {
      errors.push(...securityResult.threats);
    }

    // Определение типа контента
    const isImage = detectedMimeType.startsWith('image/');
    const isVideo = detectedMimeType.startsWith('video/');
    const isAudio = detectedMimeType.startsWith('audio/');
    const isDocument =
      detectedMimeType.startsWith('application/') || detectedMimeType.startsWith('text/');

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        detectedMimeType,
        actualSize: buffer.length,
        hash,
        isImage,
        isVideo,
        isAudio,
        isDocument,
      },
    };
  }

  /**
   * Определение MIME типа по содержимому файла
   */
  private detectMimeType(buffer: Buffer, fileName: string): string {
    // Проверяем магические числа
    for (const [mimeType, magic] of Object.entries(this.magicNumbers)) {
      if (this.checkMagicNumbers(buffer, magic)) {
        return mimeType;
      }
    }

    // Fallback к определению по расширению
    const mimeFromExtension = mimeTypes.lookup(fileName);
    return mimeFromExtension || 'application/octet-stream';
  }

  /**
   * Проверка магических чисел
   */
  private checkMagicNumbers(buffer: Buffer, magic: number[]): boolean {
    if (buffer.length < magic.length) return false;

    for (let i = 0; i < magic.length; i++) {
      if (buffer[i] !== magic[i]) return false;
    }

    return true;
  }

  /**
   * Вычисление хеша файла
   */
  private calculateFileHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Сканирование на угрозы безопасности
   */
  private async scanForThreats(buffer: Buffer, fileName: string): Promise<SecurityScanResult> {
    const threats: string[] = [];
    let confidence = 100;

    // Проверка на подозрительные паттерны в содержимом
    const content = buffer.toString('binary');

    // Проверка на скрипты
    const scriptPatterns = [
      /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /onload\s*=/gi,
      /onerror\s*=/gi,
    ];

    for (const pattern of scriptPatterns) {
      if (pattern.test(content)) {
        threats.push('Обнаружен подозрительный скрипт в содержимом файла');
        confidence -= 20;
      }
    }

    // Проверка на SQL инъекции
    const sqlPatterns = [
      /union\s+select/gi,
      /drop\s+table/gi,
      /insert\s+into/gi,
      /delete\s+from/gi,
    ];

    for (const pattern of sqlPatterns) {
      if (pattern.test(content)) {
        threats.push('Обнаружены подозрительные SQL команды');
        confidence -= 15;
      }
    }

    // Проверка на подозрительные URL
    const urlPatterns = [
      /https?:\/\/[^\s]+\.tk\//gi,
      /https?:\/\/[^\s]+\.ml\//gi,
      /https?:\/\/bit\.ly\//gi,
      /https?:\/\/tinyurl\.com\//gi,
    ];

    for (const pattern of urlPatterns) {
      if (pattern.test(content)) {
        threats.push('Обнаружены подозрительные короткие ссылки');
        confidence -= 10;
      }
    }

    // Проверка размера и структуры
    if (buffer.length > 100 * 1024 * 1024 && fileName.endsWith('.txt')) {
      threats.push('Подозрительно большой текстовый файл');
      confidence -= 10;
    }

    return {
      isSafe: threats.length === 0,
      threats,
      confidence: Math.max(0, confidence),
    };
  }

  /**
   * Проверка дубликатов файлов
   */
  async checkForDuplicates(
    buffer: Buffer,
    userId: string,
  ): Promise<{ isDuplicate: boolean; existingUrl?: string }> {
    const hash = this.calculateFileHash(buffer);

    try {
      // Проверяем все bucket'ы на наличие файла с таким же хешем
      // В реальном приложении это должно быть в базе данных
      const buckets = ['avatars', 'documents', 'videos', 'images'];

      for (const bucket of buckets) {
        const files = await this.r2Storage.listFiles({
          bucket,
          prefix: `user_${userId}/`,
          maxKeys: 1000,
        });

        for (const file of files.objects) {
          const metadata = await this.r2Storage.getFileMetadata(bucket, file.key);
          if (metadata.metadata?.hash === hash) {
            return {
              isDuplicate: true,
              existingUrl: this.r2Storage.getPublicUrl(bucket, file.key),
            };
          }
        }
      }

      return { isDuplicate: false };
    } catch (error) {
      this.logger.error(`Failed to check for duplicates: ${error.message}`);
      return { isDuplicate: false };
    }
  }

  /**
   * Валидация имени файла
   */
  validateFileName(fileName: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Проверка длины
    if (fileName.length > 255) {
      errors.push('Имя файла слишком длинное (максимум 255 символов)');
    }

    if (fileName.length === 0) {
      errors.push('Имя файла не может быть пустым');
    }

    // Проверка на недопустимые символы
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (invalidChars.test(fileName)) {
      errors.push('Имя файла содержит недопустимые символы');
    }

    // Проверка на зарезервированные имена Windows
    const reservedNames = [
      'CON',
      'PRN',
      'AUX',
      'NUL',
      'COM1',
      'COM2',
      'COM3',
      'COM4',
      'COM5',
      'COM6',
      'COM7',
      'COM8',
      'COM9',
      'LPT1',
      'LPT2',
      'LPT3',
      'LPT4',
      'LPT5',
      'LPT6',
      'LPT7',
      'LPT8',
      'LPT9',
    ];

    const nameWithoutExtension = fileName.split('.')[0].toUpperCase();
    if (reservedNames.includes(nameWithoutExtension)) {
      errors.push('Зарезервированное имя файла');
    }

    // Проверка на точки в начале и конце
    if (fileName.startsWith('.') || fileName.endsWith('.')) {
      errors.push('Имя файла не может начинаться или заканчиваться точкой');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Получение рекомендаций по оптимизации файла
   */
  getOptimizationRecommendations(buffer: Buffer, fileName: string, fileType: string): string[] {
    const recommendations: string[] = [];
    const size = buffer.length;
    const extension = fileName.split('.').pop()?.toLowerCase();

    // Рекомендации для изображений
    if (fileType.includes('image')) {
      if (size > 5 * 1024 * 1024) {
        // > 5MB
        recommendations.push('Рекомендуется сжать изображение');
      }

      if (extension === 'png' && size > 1024 * 1024) {
        recommendations.push('Рассмотрите конвертацию PNG в WebP для уменьшения размера');
      }

      if (extension === 'bmp') {
        recommendations.push('Рекомендуется конвертировать BMP в более эффективный формат');
      }
    }

    // Рекомендации для видео
    if (fileType.includes('video')) {
      if (size > 100 * 1024 * 1024) {
        // > 100MB
        recommendations.push('Рекомендуется сжать видео или разбить на части');
      }

      if (extension === 'avi' || extension === 'mov') {
        recommendations.push('Рекомендуется конвертировать в MP4 для лучшей совместимости');
      }
    }

    // Рекомендации для документов
    if (fileType.includes('document')) {
      if (extension === 'doc' || extension === 'xls' || extension === 'ppt') {
        recommendations.push('Рекомендуется обновить до современного формата (docx, xlsx, pptx)');
      }
    }

    return recommendations;
  }
}
