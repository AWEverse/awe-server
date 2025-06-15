import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { R2StorageService } from '../../../libs/cloudflare-r2/services/r2-storage.service';
import { R2BatchService } from '../../../libs/cloudflare-r2/services/r2-batch.service';
import { MediaMetadata } from '../types';
import * as sharp from 'sharp';
import * as path from 'path';

interface UploadResult {
  url: string;
  previewUrl?: string;
  metadata: MediaMetadata;
  processingTime?: number;
  previewSize?: number;
  framesProcessed?: number;
}

@Injectable()
export class MediaUploadService {
  private readonly logger = new Logger(MediaUploadService.name);

  // Media type configurations
  private readonly mediaConfigs = {
    sticker: {
      maxSize: 1024 * 1024, // 1MB
      allowedTypes: ['image/png', 'image/webp'],
      maxDimensions: { width: 512, height: 512 },
      compression: { quality: 85, progressive: true },
    },
    emoji: {
      maxSize: 512 * 1024, // 512KB
      allowedTypes: ['image/png', 'image/webp'],
      maxDimensions: { width: 128, height: 128 },
      compression: { quality: 90, progressive: false },
    },
    gif: {
      maxSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: ['image/gif'],
      maxDimensions: { width: 1920, height: 1080 },
      compression: { quality: 80, progressive: false },
    },
  };

  constructor(
    private readonly r2Storage: R2StorageService,
    private readonly r2Batch: R2BatchService,
  ) {}

  async uploadMedia(
    buffer: Buffer,
    fileName: string,
    mediaType: 'sticker' | 'emoji' | 'gif',
    options: {
      generatePreview?: boolean;
      optimize?: boolean;
      metadata?: Record<string, string>;
    } = {},
  ): Promise<UploadResult> {
    const startTime = Date.now();

    try {
      // Validate file
      await this.validateMedia(buffer, fileName, mediaType);

      // Get media configuration
      const config = this.mediaConfigs[mediaType];

      // Process media based on type
      let processedBuffer = buffer;
      let previewBuffer: Buffer | null = null;
      let metadata: MediaMetadata;
      let framesProcessed = 0;

      if (mediaType === 'gif') {
        const result = await this.processGif(buffer, options);
        processedBuffer = result.buffer;
        previewBuffer = result.previewBuffer ?? null;
        metadata = result.metadata;
        framesProcessed = result.framesProcessed;
      } else {
        const result = await this.processImage(buffer, mediaType, options);
        processedBuffer = result.buffer;
        metadata = result.metadata;
      }

      // Generate file keys
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2);
      const baseName = path.parse(fileName).name;
      const ext = this.getFileExtension(mediaType);

      const mainKey = `${mediaType}/${timestamp}_${randomSuffix}_${baseName}${ext}`;
      const previewKey = previewBuffer
        ? `${mediaType}/previews/${timestamp}_${randomSuffix}_${baseName}_preview.jpg`
        : undefined;

      // Upload files
      const uploads: Array<{
        buffer: Buffer;
        fileName: string;
        fileType: string;
        metadata?: Record<string, string>;
      }> = [
        {
          buffer: processedBuffer,
          fileName: mainKey,
          fileType: mediaType,
          metadata: {
            originalName: fileName,
            mediaType,
            width: metadata.width.toString(),
            height: metadata.height.toString(),
            ...options.metadata,
          },
        },
      ];

      if (previewBuffer && previewKey) {
        uploads.push({
          buffer: previewBuffer,
          fileName: previewKey,
          fileType: 'image',
          metadata: {
            originalName: fileName,
            mediaType: 'preview',
            parentKey: mainKey,
          },
        });
      }

      // Batch upload
      const uploadResult = await this.r2Batch.uploadBatch(uploads);

      if (uploadResult.failed.length > 0) {
        throw new BadRequestException(`Upload failed: ${uploadResult.failed[0].error}`);
      }

      const mainUpload = uploadResult.successful[0];
      const previewUpload = uploadResult.successful[1];

      const processingTime = Date.now() - startTime;

      return {
        url: mainUpload.url,
        previewUrl: previewUpload?.url,
        metadata,
        processingTime,
        previewSize: previewBuffer?.length,
        framesProcessed: framesProcessed || undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to upload media: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteMedia(url: string): Promise<void> {
    try {
      // Extract key from URL
      const urlParts = url.split('/');
      const key = urlParts.slice(-2).join('/'); // Get last two parts (folder/filename)

      await this.r2Storage.deleteFile({
        bucket: this.getBucketForMediaType(this.getMediaTypeFromKey(key)),
        key,
      });

      this.logger.log(`Deleted media file: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete media: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getMediaMetadata(
    buffer: Buffer,
    mediaType: 'sticker' | 'emoji' | 'gif',
  ): Promise<MediaMetadata> {
    try {
      if (mediaType === 'gif') {
        return await this.getGifMetadata(buffer);
      } else {
        return await this.getImageMetadata(buffer);
      }
    } catch (error) {
      this.logger.error(`Failed to get media metadata: ${error.message}`, error.stack);
      throw error;
    }
  }

  // === Private Methods ===

  private async validateMedia(
    buffer: Buffer,
    fileName: string,
    mediaType: 'sticker' | 'emoji' | 'gif',
  ): Promise<void> {
    const config = this.mediaConfigs[mediaType];

    // Check file size
    if (buffer.length > config.maxSize) {
      throw new BadRequestException(
        `File too large. Maximum size for ${mediaType}: ${config.maxSize / 1024 / 1024}MB`,
      );
    }

    // Check file type
    const metadata = await this.getMediaMetadata(buffer, mediaType);
    const detectedType = metadata.mimeType;

    if (!config.allowedTypes.includes(detectedType)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types for ${mediaType}: ${config.allowedTypes.join(', ')}`,
      );
    }

    // Check dimensions
    if (
      metadata.width > config.maxDimensions.width ||
      metadata.height > config.maxDimensions.height
    ) {
      throw new BadRequestException(
        `Image dimensions too large. Maximum for ${mediaType}: ${config.maxDimensions.width}x${config.maxDimensions.height}`,
      );
    }

    // Additional GIF validations
    if (mediaType === 'gif' && metadata.duration) {
      if (metadata.duration > 30) {
        throw new BadRequestException('GIF duration cannot exceed 30 seconds');
      }
    }
  }

  private async processImage(
    buffer: Buffer,
    mediaType: 'sticker' | 'emoji',
    options: { optimize?: boolean } = {},
  ): Promise<{ buffer: Buffer; metadata: MediaMetadata }> {
    try {
      const config = this.mediaConfigs[mediaType];
      let sharpInstance = sharp(buffer);

      if (options.optimize) {
        // Optimize based on media type
        if (mediaType === 'sticker') {
          sharpInstance = sharpInstance.png({
            quality: config.compression.quality,
            progressive: config.compression.progressive,
            compressionLevel: 9,
          });
        } else if (mediaType === 'emoji') {
          sharpInstance = sharpInstance.png({
            quality: config.compression.quality,
            compressionLevel: 9,
          });
        }
      }

      const processedBuffer = await sharpInstance.toBuffer();
      const metadata = await this.getImageMetadata(processedBuffer);

      return { buffer: processedBuffer, metadata };
    } catch (error) {
      this.logger.error(`Failed to process image: ${error.message}`, error.stack);
      throw new BadRequestException(`Image processing failed: ${error.message}`);
    }
  }

  private async processGif(
    buffer: Buffer,
    options: { generatePreview?: boolean; optimize?: boolean } = {},
  ): Promise<{
    buffer: Buffer;
    previewBuffer?: Buffer;
    metadata: MediaMetadata;
    framesProcessed: number;
  }> {
    try {
      // For now, return the original buffer with metadata
      // In production, you would use ffmpeg or similar to process GIFs
      const metadata = await this.getGifMetadata(buffer);

      let previewBuffer: Buffer | undefined;

      if (options.generatePreview) {
        // Generate a static preview from the first frame
        try {
          previewBuffer = await sharp(buffer, { animated: false })
            .jpeg({ quality: 80 })
            .resize(320, 240, { fit: 'inside', withoutEnlargement: true })
            .toBuffer();
        } catch (error) {
          this.logger.warn(`Failed to generate GIF preview: ${error.message}`);
        }
      }

      return {
        buffer,
        previewBuffer,
        metadata,
        framesProcessed: 1, // Placeholder
      };
    } catch (error) {
      this.logger.error(`Failed to process GIF: ${error.message}`, error.stack);
      throw new BadRequestException(`GIF processing failed: ${error.message}`);
    }
  }

  private async getImageMetadata(buffer: Buffer): Promise<MediaMetadata> {
    try {
      const metadata = await sharp(buffer).metadata();

      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        fileSize: buffer.length,
        mimeType: `image/${metadata.format}` || 'image/png',
      };
    } catch (error) {
      throw new BadRequestException(`Failed to read image metadata: ${error.message}`);
    }
  }

  private async getGifMetadata(buffer: Buffer): Promise<MediaMetadata> {
    try {
      const metadata = await sharp(buffer, { animated: true }).metadata();

      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        fileSize: buffer.length,
        mimeType: 'image/gif',
        duration: undefined, // Would need ffprobe or similar to get actual duration
      };
    } catch (error) {
      throw new BadRequestException(`Failed to read GIF metadata: ${error.message}`);
    }
  }

  private getFileExtension(mediaType: 'sticker' | 'emoji' | 'gif'): string {
    switch (mediaType) {
      case 'sticker':
      case 'emoji':
        return '.png';
      case 'gif':
        return '.gif';
      default:
        return '.png';
    }
  }

  private getBucketForMediaType(mediaType: string): string {
    switch (mediaType) {
      case 'sticker':
      case 'emoji':
      case 'gif':
        return 'images'; // All media assets go to images bucket
      default:
        return 'images';
    }
  }

  private getMediaTypeFromKey(key: string): string {
    return key.split('/')[0]; // First part of the key is the media type
  }

  // === Utility Methods ===

  async validateFileType(buffer: Buffer, allowedTypes: string[]): Promise<string> {
    try {
      const metadata = await sharp(buffer).metadata();
      const mimeType = `image/${metadata.format}`;

      if (!allowedTypes.includes(mimeType)) {
        throw new BadRequestException(
          `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
        );
      }

      return mimeType;
    } catch (error) {
      throw new BadRequestException(`Invalid image file: ${error.message}`);
    }
  }

  async resizeImage(
    buffer: Buffer,
    width: number,
    height: number,
    options: { fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside' } = {},
  ): Promise<Buffer> {
    try {
      return await sharp(buffer)
        .resize(width, height, {
          fit: options.fit || 'inside',
          withoutEnlargement: true,
        })
        .toBuffer();
    } catch (error) {
      throw new BadRequestException(`Image resize failed: ${error.message}`);
    }
  }

  async compressImage(
    buffer: Buffer,
    format: 'png' | 'jpg' | 'webp',
    quality = 80,
  ): Promise<Buffer> {
    try {
      let sharpInstance = sharp(buffer);

      switch (format) {
        case 'png':
          sharpInstance = sharpInstance.png({ quality, compressionLevel: 9 });
          break;
        case 'jpg':
          sharpInstance = sharpInstance.jpeg({ quality, progressive: true });
          break;
        case 'webp':
          sharpInstance = sharpInstance.webp({ quality });
          break;
      }

      return await sharpInstance.toBuffer();
    } catch (error) {
      throw new BadRequestException(`Image compression failed: ${error.message}`);
    }
  }

  async generateThumbnail(buffer: Buffer, size = 150): Promise<Buffer> {
    try {
      return await sharp(buffer)
        .resize(size, size, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch (error) {
      throw new BadRequestException(`Thumbnail generation failed: ${error.message}`);
    }
  }
}
