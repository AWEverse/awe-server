/**
 * Утилиты для работы с файлами
 * Набор чистых функций для общих операций с файлами
 */

import * as crypto from 'crypto';
import * as mimeTypes from 'mime-types';
import { R2ValidationError } from '../exceptions/r2-errors';

export interface FileInfo {
  readonly name: string;
  readonly extension: string;
  readonly baseName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly hash: string;
}

export interface FileValidationOptions {
  readonly maxSize?: number;
  readonly allowedMimeTypes?: readonly string[];
  readonly allowedExtensions?: readonly string[];
}

/**
 * Класс для работы с файловыми утилитами
 */
export class FileUtils {
  private static readonly DANGEROUS_EXTENSIONS = new Set([
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
  ]);

  private static readonly RESERVED_NAMES = new Set([
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
  ]);

  /**
   * Извлекает информацию о файле
   */
  static extractFileInfo(buffer: Buffer, fileName: string): FileInfo {
    const extension = this.getFileExtension(fileName);
    const baseName = this.getBaseName(fileName);
    const mimeType = this.detectMimeType(buffer, fileName);
    const hash = this.calculateHash(buffer);

    return {
      name: fileName,
      extension,
      baseName,
      mimeType,
      size: buffer.length,
      hash,
    };
  }

  /**
   * Валидирует имя файла
   */
  static validateFileName(fileName: string): string[] {
    const errors: string[] = [];

    if (!fileName || fileName.trim().length === 0) {
      errors.push('Имя файла не может быть пустым');
      return errors;
    }

    if (fileName.length > 255) {
      errors.push('Имя файла слишком длинное (максимум 255 символов)');
    }

    // Проверка на недопустимые символы
    if (/[<>:"/\\|?*\x00-\x1f]/.test(fileName)) {
      errors.push('Имя файла содержит недопустимые символы');
    }

    // Проверка на зарезервированные имена
    const baseName = this.getBaseName(fileName).toUpperCase();
    if (this.RESERVED_NAMES.has(baseName)) {
      errors.push('Зарезервированное имя файла');
    }

    // Проверка на точки в начале и конце
    if (fileName.startsWith('.') || fileName.endsWith('.')) {
      errors.push('Имя файла не может начинаться или заканчиваться точкой');
    }

    return errors;
  }

  /**
   * Валидирует файл по заданным критериям
   */
  static validateFile(
    buffer: Buffer,
    fileName: string,
    options: FileValidationOptions = {},
  ): string[] {
    const errors: string[] = [];

    // Валидация имени файла
    errors.push(...this.validateFileName(fileName));

    // Валидация размера
    if (buffer.length === 0) {
      errors.push('Файл пустой');
    }

    if (options.maxSize && buffer.length > options.maxSize) {
      const maxSizeMB = Math.round(options.maxSize / (1024 * 1024));
      errors.push(`Файл слишком большой (максимум ${maxSizeMB}MB)`);
    }

    // Валидация расширения
    const extension = this.getFileExtension(fileName);
    if (this.DANGEROUS_EXTENSIONS.has(extension)) {
      errors.push(`Опасное расширение файла: ${extension}`);
    }

    if (options.allowedExtensions && !options.allowedExtensions.includes(extension)) {
      errors.push(`Неподдерживаемое расширение: ${extension}`);
    }

    // Валидация MIME типа
    const mimeType = this.detectMimeType(buffer, fileName);
    if (options.allowedMimeTypes && !options.allowedMimeTypes.includes(mimeType)) {
      errors.push(`Неподдерживаемый MIME тип: ${mimeType}`);
    }

    return errors;
  }

  /**
   * Генерирует уникальный ключ для файла
   */
  static generateFileKey(fileName: string, prefix?: string): string {
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const sanitizedName = this.sanitizeFileName(fileName);

    const parts = [prefix, timestamp, randomSuffix, sanitizedName].filter(Boolean);

    return parts.join('_');
  }

  /**
   * Очищает имя файла от опасных символов
   */
  static sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
  }

  /**
   * Получает расширение файла
   */
  static getFileExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    return lastDotIndex === -1 ? '' : fileName.slice(lastDotIndex + 1).toLowerCase();
  }

  /**
   * Получает базовое имя файла без расширения
   */
  static getBaseName(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    return lastDotIndex === -1 ? fileName : fileName.slice(0, lastDotIndex);
  }

  /**
   * Определяет MIME тип файла
   */
  static detectMimeType(buffer: Buffer, fileName: string): string {
    // Сначала пытаемся определить по магическим числам
    const detectedByMagic = this.detectMimeTypeByMagicNumbers(buffer);
    if (detectedByMagic) {
      return detectedByMagic;
    }

    // Затем по расширению файла
    return mimeTypes.lookup(fileName) || 'application/octet-stream';
  }

  /**
   * Определяет MIME тип по магическим числам
   */
  private static detectMimeTypeByMagicNumbers(buffer: Buffer): string | null {
    const magicNumbers: Record<string, number[]> = {
      'image/jpeg': [0xff, 0xd8, 0xff],
      'image/png': [0x89, 0x50, 0x4e, 0x47],
      'image/gif': [0x47, 0x49, 0x46],
      'image/webp': [0x52, 0x49, 0x46, 0x46],
      'image/bmp': [0x42, 0x4d],
      'video/mp4': [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70],
      'video/webm': [0x1a, 0x45, 0xdf, 0xa3],
      'audio/mp3': [0xff, 0xfb],
      'audio/wav': [0x52, 0x49, 0x46, 0x46],
      'audio/ogg': [0x4f, 0x67, 0x67, 0x53],
      'application/pdf': [0x25, 0x50, 0x44, 0x46],
      'application/zip': [0x50, 0x4b, 0x03, 0x04],
      'application/x-rar': [0x52, 0x61, 0x72, 0x21],
    };

    for (const [mimeType, magic] of Object.entries(magicNumbers)) {
      if (this.checkMagicNumbers(buffer, magic)) {
        return mimeType;
      }
    }

    return null;
  }

  /**
   * Проверяет магические числа
   */
  private static checkMagicNumbers(buffer: Buffer, magic: number[]): boolean {
    if (buffer.length < magic.length) {
      return false;
    }

    return magic.every((byte, index) => buffer[index] === byte);
  }

  /**
   * Вычисляет хеш файла
   */
  static calculateHash(buffer: Buffer, algorithm: string = 'sha256'): string {
    return crypto.createHash(algorithm).update(buffer).digest('hex');
  }

  /**
   * Форматирует размер файла в человекочитаемый вид
   */
  static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
  }

  /**
   * Проверяет, является ли файл изображением
   */
  static isImageFile(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Проверяет, является ли файл видео
   */
  static isVideoFile(mimeType: string): boolean {
    return mimeType.startsWith('video/');
  }

  /**
   * Проверяет, является ли файл аудио
   */
  static isAudioFile(mimeType: string): boolean {
    return mimeType.startsWith('audio/');
  }

  /**
   * Проверяет, является ли файл документом
   */
  static isDocumentFile(mimeType: string): boolean {
    return mimeType.startsWith('application/') || mimeType.startsWith('text/');
  }
}
