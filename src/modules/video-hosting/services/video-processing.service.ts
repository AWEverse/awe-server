import { Injectable, Logger } from '@nestjs/common';
import { VideoMetadata, VideoProcessingStatus, VideoQuality } from '../types';
import { PrismaService } from 'src/libs/db/prisma.service';
import { R2StorageService } from 'src/libs/cloudflare-r2/services/r2-storage.service';

@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2Service: R2StorageService,
  ) {}

  async uploadVideo(
    authorId: bigint,
    file: Express.Multer.File,
    metadata: Partial<VideoMetadata>,
  ): Promise<{ videoId: bigint; uploadUrl: string }> {
    try {
      // Генерируем уникальное имя файла
      const fileName = `videos/${authorId}/${Date.now()}-${file.originalname}`;

      // Загружаем оригинальный файл в R2
      const uploadResult = await this.r2Service.uploadFile(file.buffer, fileName, file.mimetype); // Создаем запись в базе данных
      const video = await this.prisma.content.create({
        data: {
          title: 'Untitled Video',
          authorId,
          type: 'VIDEO',
          status: 'DRAFT',
          metadata: {
            ...metadata,
            originalFile: fileName,
            processing: {
              status: 'pending',
              progress: 0,
            },
          },
        },
      });

      // Создаем attachment для видео файла
      await this.prisma.contentAttachment.create({
        data: {
          contentId: video.id,
          url: uploadResult.url,
          mimeType: file.mimetype,
          fileSize: BigInt(file.size),
          metadata: {
            fileName: fileName,
            originalName: file.originalname,
          },
        },
      });

      // Запускаем асинхронную обработку видео
      this.processVideoAsync(video.id, fileName).catch(error => {
        this.logger.error(`Failed to process video ${video.id}:`, error);
      });

      return {
        videoId: video.id,
        uploadUrl: uploadResult.url,
      };
    } catch (error) {
      this.logger.error('Failed to upload video:', error);
      throw error;
    }
  }

  private async processVideoAsync(videoId: bigint, fileName: string): Promise<void> {
    try {
      // Обновляем статус на "обработка"
      await this.updateProcessingStatus(videoId, {
        status: 'processing',
        progress: 10,
        qualities: [],
      });

      // В реальном приложении здесь был бы вызов внешнего сервиса обработки видео
      // Например, AWS MediaConvert, Cloudflare Stream, или собственный сервис
      const qualities = await this.generateVideoQualities(fileName);

      // Обновляем статус на "завершено"
      await this.updateProcessingStatus(videoId, {
        status: 'completed',
        progress: 100,
        qualities,
      });

      // Извлекаем метаданные видео
      const metadata = await this.extractVideoMetadata(fileName);

      // Обновляем метаданные в базе
      await this.prisma.content.update({
        where: { id: videoId },
        data: {
          metadata: JSON.stringify({
            ...metadata,
            processing: {
              status: 'completed',
              progress: 100,
            },
            qualities,
          }),
        },
      });

      this.logger.log(`Video ${videoId} processed successfully`);
    } catch (error) {
      this.logger.error(`Failed to process video ${videoId}:`, error);

      await this.updateProcessingStatus(videoId, {
        status: 'failed',
        progress: 0,
        qualities: [],
        error: error.message,
      });
    }
  }

  private async generateVideoQualities(fileName: string): Promise<VideoQuality[]> {
    // В реальном приложении здесь происходила бы генерация различных качеств видео
    // Пока возвращаем mock данные
    const baseUrl = `https://your-cdn.com/${fileName}`;

    return [
      {
        resolution: '360p',
        bitrate: 500000,
        url: `${baseUrl}_360p.mp4`,
        size: 10 * 1024 * 1024, // 10MB
      },
      {
        resolution: '720p',
        bitrate: 1500000,
        url: `${baseUrl}_720p.mp4`,
        size: 30 * 1024 * 1024, // 30MB
      },
      {
        resolution: '1080p',
        bitrate: 3000000,
        url: `${baseUrl}_1080p.mp4`,
        size: 60 * 1024 * 1024, // 60MB
      },
    ];
  }

  private async extractVideoMetadata(fileName: string): Promise<VideoMetadata> {
    // В реальном приложении здесь использовался бы ffprobe или аналогичный инструмент
    // Пока возвращаем mock данные
    return {
      duration: 300, // 5 минут
      width: 1920,
      height: 1080,
      bitrate: 3000000,
      codec: 'h264',
      fps: 30,
      size: 60 * 1024 * 1024, // 60MB
    };
  }

  private async updateProcessingStatus(
    videoId: bigint,
    status: VideoProcessingStatus,
  ): Promise<void> {
    const video = await this.prisma.content.findUnique({
      where: { id: videoId },
      select: { metadata: true },
    });

    if (!video) {
      throw new Error(`Video ${videoId} not found`);
    }

    const currentMetadata = (video.metadata as any) || {};

    await this.prisma.content.update({
      where: { id: videoId },
      data: {
        metadata: {
          ...currentMetadata,
          processing: status,
        },
      },
    });
  }

  async getProcessingStatus(videoId: bigint): Promise<VideoProcessingStatus> {
    const video = await this.prisma.content.findUnique({
      where: { id: videoId },
      select: { metadata: true },
    });

    if (!video) {
      throw new Error(`Video ${videoId} not found`);
    }

    const metadata = (video.metadata as any) || {};
    return (
      metadata.processing || {
        status: 'pending',
        progress: 0,
        qualities: [],
      }
    );
  }
  async generateThumbnail(videoId: bigint, timeStamp: number = 10): Promise<string> {
    // В реальном приложении здесь происходила бы генерация превью из видео
    // Пока возвращаем placeholder
    const video = await this.prisma.content.findUnique({
      where: { id: videoId },
      select: { id: true },
    });

    if (!video) {
      throw new Error(`Video ${videoId} not found`);
    }

    // Mock thumbnail URL
    const thumbnailUrl = `https://your-cdn.com/thumbnails/${videoId}_${timeStamp}.jpg`;

    // Обновляем thumbnailUrl в базе данных
    await this.prisma.content.update({
      where: { id: videoId },
      data: { thumbnailUrl },
    });

    return thumbnailUrl;
  }
  async deleteVideoFiles(videoId: bigint): Promise<void> {
    const video = await this.prisma.content.findUnique({
      where: { id: videoId },
      select: {
        metadata: true,
        thumbnailUrl: true,
        attachments: {
          select: {
            url: true,
          },
        },
      },
    });

    if (!video) {
      return;
    }

    const metadata = (video.metadata as any) || {};
    const qualities = metadata.qualities || [];

    // Удаляем все файлы связанные с видео
    const filesToDelete = [
      video.thumbnailUrl,
      ...video.attachments.map(att => att.url),
      ...qualities.map((q: VideoQuality) => q.url),
    ].filter(Boolean);

    await Promise.all(
      filesToDelete.map(async url => {
        try {
          // Извлекаем имя файла из URL и удаляем из R2
          const fileName = url.split('/').pop();
          if (fileName) {
            await this.r2Service.deleteFile(fileName);
          }
        } catch (error) {
          this.logger.warn(`Failed to delete file ${url}:`, error);
        }
      }),
    );

    this.logger.log(`Deleted video files for video ${videoId}`);
  }

  async retryProcessing(videoId: bigint): Promise<void> {
    const video = await this.prisma.content.findUnique({
      where: { id: videoId },
      select: { metadata: true },
    });

    if (!video) {
      throw new Error(`Video ${videoId} not found`);
    }

    const metadata = (video.metadata as any) || {};
    const originalFile = metadata.originalFile;

    if (!originalFile) {
      throw new Error('Original file not found for video');
    }

    // Сбрасываем статус обработки
    await this.updateProcessingStatus(videoId, {
      status: 'pending',
      progress: 0,
      qualities: [],
    });

    // Запускаем повторную обработку
    this.processVideoAsync(videoId, originalFile).catch(error => {
      this.logger.error(`Failed to retry processing video ${videoId}:`, error);
    });
  }

  async getVideoQualities(videoId: bigint): Promise<VideoQuality[]> {
    const video = await this.prisma.content.findUnique({
      where: { id: videoId },
      select: { metadata: true },
    });

    if (!video) {
      throw new Error(`Video ${videoId} not found`);
    }

    const metadata = (video.metadata as any) || {};
    return metadata.qualities || [];
  }
}
