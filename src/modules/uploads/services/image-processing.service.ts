import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { R2StorageService } from '../../../libs/cloudflare-r2/services/r2-storage.service';

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  crop?: 'center' | 'top' | 'bottom' | 'left' | 'right';
}

export interface ImageVariant {
  name: string;
  options: ImageTransformOptions;
}

@Injectable()
export class ImageProcessingService {
  private readonly logger = new Logger(ImageProcessingService.name);

  // Предустановленные варианты изображений для разных типов контента
  private readonly imageVariants: Record<string, ImageVariant[]> = {
    avatar: [
      { name: 'thumbnail', options: { width: 64, height: 64, quality: 80, format: 'webp' } },
      { name: 'small', options: { width: 128, height: 128, quality: 85, format: 'webp' } },
      { name: 'medium', options: { width: 256, height: 256, quality: 90, format: 'webp' } },
      { name: 'large', options: { width: 512, height: 512, quality: 95, format: 'webp' } },
    ],
    banner: [
      { name: 'small', options: { width: 640, height: 240, quality: 80, format: 'webp' } },
      { name: 'medium', options: { width: 1280, height: 480, quality: 85, format: 'webp' } },
      { name: 'large', options: { width: 1920, height: 720, quality: 90, format: 'webp' } },
    ],
    image_post: [
      { name: 'thumbnail', options: { width: 320, height: 240, quality: 75, format: 'webp' } },
      { name: 'small', options: { width: 640, height: 480, quality: 80, format: 'webp' } },
      { name: 'medium', options: { width: 1280, height: 960, quality: 85, format: 'webp' } },
      { name: 'large', options: { width: 1920, height: 1440, quality: 90, format: 'webp' } },
    ],
    sticker: [
      { name: 'small', options: { width: 64, height: 64, quality: 90, format: 'webp' } },
      { name: 'medium', options: { width: 128, height: 128, quality: 95, format: 'webp' } },
      { name: 'large', options: { width: 256, height: 256, quality: 100, format: 'webp' } },
    ],
  };

  constructor(private readonly r2Storage: R2StorageService) {}

  /**
   * Обработка и создание вариантов изображения
   */
  async processImage(
    buffer: Buffer,
    fileName: string,
    fileType: string,
    userId: string,
  ): Promise<Array<{ variant: string; url: string; key: string }>> {
    const variants = this.imageVariants[fileType] || [];
    const results: Array<{ variant: string; url: string; key: string }> = [];

    // Сохраняем оригинал
    const originalResult = await this.r2Storage.uploadFile(buffer, fileName, fileType, {
      metadata: {
        variant: 'original',
        processedBy: userId,
        processedAt: new Date().toISOString(),
      },
    });

    results.push({
      variant: 'original',
      url: originalResult.url,
      key: originalResult.key,
    });

    // Создаем варианты
    for (const variant of variants) {
      try {
        const processedBuffer = await this.transformImage(buffer, variant.options);
        const variantFileName = this.generateVariantFileName(fileName, variant.name);

        const variantResult = await this.r2Storage.uploadFile(
          processedBuffer,
          variantFileName,
          fileType,
          {
            metadata: {
              variant: variant.name,
              originalKey: originalResult.key,
              processedBy: userId,
              processedAt: new Date().toISOString() ?? '',
              width: variant.options.width?.toString() ?? '',
              height: variant.options.height?.toString() ?? '',
              quality: variant.options.quality?.toString() ?? '',
              format: variant.options.format ?? 'webp',
            },
          },
        );

        results.push({
          variant: variant.name,
          url: variantResult.url,
          key: variantResult.key,
        });

        this.logger.log(`Created variant ${variant.name} for ${fileName}`);
      } catch (error) {
        this.logger.error(
          `Failed to create variant ${variant.name} for ${fileName}: ${error.message}`,
        );
      }
    }

    return results;
  }

  /**
   * Трансформация изображения
   */
  private async transformImage(buffer: Buffer, options: ImageTransformOptions): Promise<Buffer> {
    let transformer = sharp(buffer);

    // Изменение размера
    if (options.width || options.height) {
      transformer = transformer.resize({
        width: options.width,
        height: options.height,
        fit: options.crop ? sharp.fit.cover : sharp.fit.inside,
        position: this.getSharpPosition(options.crop),
      });
    }

    // Установка формата и качества
    switch (options.format) {
      case 'jpeg':
        transformer = transformer.jpeg({ quality: options.quality || 80 });
        break;
      case 'png':
        transformer = transformer.png({ quality: options.quality || 80 });
        break;
      case 'webp':
      default:
        transformer = transformer.webp({ quality: options.quality || 80 });
        break;
    }

    return await transformer.toBuffer();
  }

  /**
   * Преобразование crop опции в Sharp position
   */
  private getSharpPosition(crop?: string): string {
    switch (crop) {
      case 'top':
        return sharp.gravity.north.toString();
      case 'bottom':
        return sharp.gravity.south.toString();
      case 'left':
        return sharp.gravity.west.toString();
      case 'right':
        return sharp.gravity.east.toString();
      case 'center':
      default:
        return sharp.gravity.center.toString();
    }
  }

  /**
   * Генерация имени файла для варианта
   */
  private generateVariantFileName(originalFileName: string, variantName: string): string {
    const extension = originalFileName.split('.').pop();
    const nameWithoutExtension = originalFileName.replace(`.${extension}`, '');
    return `${nameWithoutExtension}_${variantName}.webp`;
  }

  /**
   * Получение вариантов для типа файла
   */
  getVariantsForFileType(fileType: string): ImageVariant[] {
    return this.imageVariants[fileType] || [];
  }

  /**
   * Автоматическое определение оптимального качества на основе размера файла
   */
  getOptimalQuality(fileSize: number): number {
    if (fileSize < 100 * 1024) return 95; // < 100KB - высокое качество
    if (fileSize < 500 * 1024) return 85; // < 500KB - среднее качество
    if (fileSize < 1024 * 1024) return 75; // < 1MB - низкое качество
    return 65; // > 1MB - очень низкое качество
  }

  /**
   * Получение информации об изображении
   */
  async getImageInfo(buffer: Buffer): Promise<{
    width: number;
    height: number;
    format: string;
    size: number;
    channels: number;
    hasAlpha: boolean;
  }> {
    const metadata = await sharp(buffer).metadata();

    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      size: buffer.length,
      channels: metadata.channels || 0,
      hasAlpha: metadata.hasAlpha || false,
    };
  }
}
