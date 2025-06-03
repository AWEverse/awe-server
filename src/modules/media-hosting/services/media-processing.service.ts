import { Injectable, Logger } from '@nestjs/common';
import { R2StorageService } from 'src/libs/cloudflare-r2';
import { FileValidationService } from 'src/modules/uploads/services/file-validation.service';
import { ImageProcessingService } from 'src/modules/uploads/services/image-processing.service';

export interface MediaProcessingJob {
  id: string;
  userId: string;
  originalFileKey: string;
  bucket: string;
  type: 'video_transcode' | 'image_optimize' | 'audio_compress';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  outputFiles: Array<{
    variant: string;
    key: string;
    url: string;
    size: number;
  }>;
}

export interface VideoTranscodeOptions {
  resolutions: Array<{
    name: string;
    width: number;
    height: number;
    bitrate: string;
  }>;
  formats: string[];
  generateThumbnails: boolean;
  thumbnailCount: number;
}

@Injectable()
export class MediaProcessingService {
  private readonly logger = new Logger(MediaProcessingService.name);
  private readonly processingJobs = new Map<string, MediaProcessingJob>();

  // Предустановленные настройки для видео
  private readonly videoPresets: Record<string, VideoTranscodeOptions> = {
    standard: {
      resolutions: [
        { name: '240p', width: 426, height: 240, bitrate: '400k' },
        { name: '360p', width: 640, height: 360, bitrate: '800k' },
        { name: '480p', width: 854, height: 480, bitrate: '1200k' },
        { name: '720p', width: 1280, height: 720, bitrate: '2500k' },
        { name: '1080p', width: 1920, height: 1080, bitrate: '5000k' },
      ],
      formats: ['mp4', 'webm'],
      generateThumbnails: true,
      thumbnailCount: 10,
    },
    mobile: {
      resolutions: [
        { name: '240p', width: 426, height: 240, bitrate: '300k' },
        { name: '360p', width: 640, height: 360, bitrate: '600k' },
        { name: '480p', width: 854, height: 480, bitrate: '1000k' },
      ],
      formats: ['mp4'],
      generateThumbnails: true,
      thumbnailCount: 5,
    },
    high_quality: {
      resolutions: [
        { name: '720p', width: 1280, height: 720, bitrate: '3000k' },
        { name: '1080p', width: 1920, height: 1080, bitrate: '6000k' },
        { name: '1440p', width: 2560, height: 1440, bitrate: '12000k' },
        { name: '2160p', width: 3840, height: 2160, bitrate: '20000k' },
      ],
      formats: ['mp4', 'webm'],
      generateThumbnails: true,
      thumbnailCount: 20,
    },
  };

  constructor(
    private readonly r2Storage: R2StorageService,
    private readonly imageProcessing: ImageProcessingService,
    private readonly fileValidation: FileValidationService,
  ) {}

  /**
   * Постановка задачи на обработку медиа
   */
  async queueMediaProcessing(
    bucket: string,
    fileKey: string,
    userId: string,
    type: MediaProcessingJob['type'],
    options?: any,
  ): Promise<string> {
    const jobId = this.generateJobId();

    const job: MediaProcessingJob = {
      id: jobId,
      userId,
      originalFileKey: fileKey,
      bucket,
      type,
      status: 'pending',
      progress: 0,
      outputFiles: [],
    };

    this.processingJobs.set(jobId, job);

    // Запускаем обработку в фоновом режиме
    this.processMediaAsync(jobId, options).catch(error => {
      this.logger.error(`Media processing failed for job ${jobId}: ${error.message}`);
      this.updateJobStatus(jobId, 'failed', error.message);
    });

    this.logger.log(`Media processing job queued: ${jobId} for user ${userId}`);

    return jobId;
  }

  /**
   * Получение статуса задачи
   */
  async getJobStatus(jobId: string): Promise<MediaProcessingJob | null> {
    return this.processingJobs.get(jobId) || null;
  }

  /**
   * Получение всех задач пользователя
   */
  async getUserJobs(userId: string): Promise<MediaProcessingJob[]> {
    return Array.from(this.processingJobs.values())
      .filter(job => job.userId === userId)
      .sort((a, b) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0));
  }

  /**
   * Асинхронная обработка медиа
   */
  private async processMediaAsync(jobId: string, options?: any): Promise<void> {
    const job = this.processingJobs.get(jobId);
    if (!job) return;

    try {
      this.updateJobStatus(jobId, 'processing');
      job.startedAt = new Date();

      switch (job.type) {
        case 'video_transcode':
          await this.transcodeVideo(job, options);
          break;
        case 'image_optimize':
          await this.optimizeImage(job, options);
          break;
        case 'audio_compress':
          await this.compressAudio(job, options);
          break;
      }

      this.updateJobStatus(jobId, 'completed');
      job.completedAt = new Date();
      job.progress = 100;
    } catch (error) {
      this.updateJobStatus(jobId, 'failed', error.message);
    }
  }

  /**
   * Транскодирование видео
   */
  private async transcodeVideo(
    job: MediaProcessingJob,
    options?: VideoTranscodeOptions,
  ): Promise<void> {
    const preset = options || this.videoPresets.standard;

    this.logger.log(`Starting video transcoding for job ${job.id}`);

    // В реальном приложении здесь будет вызов FFmpeg или облачного сервиса
    // Для демонстрации используем симуляцию

    for (let i = 0; i < preset.resolutions.length; i++) {
      const resolution = preset.resolutions[i];

      // Симулируем прогресс
      job.progress = Math.round((i / preset.resolutions.length) * 80);

      // Симулируем время обработки
      await this.delay(1000);

      for (const format of preset.formats) {
        const outputKey = this.generateOutputKey(
          job.originalFileKey,
          `${resolution.name}_${format}`,
        );

        // Здесь должно быть реальное транскодирование
        // const transcodedBuffer = await this.ffmpegTranscode(originalBuffer, resolution, format);

        // Для демонстрации создаем пустой файл
        const mockBuffer = Buffer.from(`Transcoded video: ${resolution.name} ${format}`);

        const uploadResult = await this.r2Storage.uploadFile(
          mockBuffer,
          `video_${resolution.name}.${format}`,
          'video',
          {
            metadata: {
              originalKey: job.originalFileKey,
              resolution: resolution.name,
              format,
              bitrate: resolution.bitrate,
              jobId: job.id,
            },
          },
        );

        job.outputFiles.push({
          variant: `${resolution.name}_${format}`,
          key: uploadResult.key,
          url: uploadResult.url,
          size: uploadResult.size,
        });
      }
    }

    // Генерация превью изображений
    if (preset.generateThumbnails) {
      job.progress = 85;

      for (let i = 0; i < preset.thumbnailCount; i++) {
        const thumbnailKey = this.generateOutputKey(job.originalFileKey, `thumbnail_${i}`);

        // Здесь должна быть генерация превью
        const mockThumbnail = Buffer.from(`Thumbnail ${i}`);

        const uploadResult = await this.r2Storage.uploadFile(
          mockThumbnail,
          `thumbnail_${i}.jpg`,
          'image_post',
          {
            metadata: {
              originalKey: job.originalFileKey,
              thumbnailIndex: i.toString(),
              jobId: job.id,
            },
          },
        );

        job.outputFiles.push({
          variant: `thumbnail_${i}`,
          key: uploadResult.key,
          url: uploadResult.url,
          size: uploadResult.size,
        });
      }
    }

    this.logger.log(`Video transcoding completed for job ${job.id}`);
  }

  /**
   * Оптимизация изображения
   */
  private async optimizeImage(job: MediaProcessingJob, options?: any): Promise<void> {
    this.logger.log(`Starting image optimization for job ${job.id}`);

    // Получаем оригинальный файл
    const downloadUrl = await this.r2Storage.getSignedDownloadUrl({
      bucket: job.bucket,
      key: job.originalFileKey,
      expiresIn: 3600,
    });

    // В реальном приложении здесь должно быть скачивание файла
    // const response = await fetch(downloadUrl);
    // const buffer = Buffer.from(await response.arrayBuffer());

    // Для демонстрации создаем mock buffer
    const mockBuffer = Buffer.from('Mock image data');

    job.progress = 30;

    // Используем сервис обработки изображений
    const variants = await this.imageProcessing.processImage(
      mockBuffer,
      'optimized_image.jpg',
      'image_post',
      job.userId,
    );

    job.progress = 80;

    // Сохраняем результаты
    for (const variant of variants) {
      job.outputFiles.push({
        variant: variant.variant,
        key: variant.key,
        url: variant.url,
        size: 0, // Размер нужно получать отдельно
      });
    }

    this.logger.log(`Image optimization completed for job ${job.id}`);
  }

  /**
   * Сжатие аудио
   */
  private async compressAudio(job: MediaProcessingJob, options?: any): Promise<void> {
    this.logger.log(`Starting audio compression for job ${job.id}`);

    const qualities = ['64k', '128k', '192k', '320k'];

    for (let i = 0; i < qualities.length; i++) {
      const quality = qualities[i];
      job.progress = Math.round((i / qualities.length) * 90);

      await this.delay(500);

      const outputKey = this.generateOutputKey(job.originalFileKey, `compressed_${quality}`);

      // Здесь должно быть реальное сжатие аудио
      const mockBuffer = Buffer.from(`Compressed audio: ${quality}`);

      const uploadResult = await this.r2Storage.uploadFile(
        mockBuffer,
        `audio_${quality}.mp3`,
        'audio',
        {
          metadata: {
            originalKey: job.originalFileKey,
            quality,
            jobId: job.id,
          },
        },
      );

      job.outputFiles.push({
        variant: `compressed_${quality}`,
        key: uploadResult.key,
        url: uploadResult.url,
        size: uploadResult.size,
      });
    }

    this.logger.log(`Audio compression completed for job ${job.id}`);
  }

  /**
   * Автоматическая обработка при загрузке
   */
  async autoProcessMedia(
    bucket: string,
    fileKey: string,
    userId: string,
    mimeType: string,
  ): Promise<string | null> {
    // Определяем тип обработки по MIME типу
    let processingType: MediaProcessingJob['type'] | null = null;
    let options: any = null;

    if (mimeType.startsWith('video/')) {
      processingType = 'video_transcode';
      options = this.videoPresets.standard;
    } else if (mimeType.startsWith('image/')) {
      processingType = 'image_optimize';
    } else if (mimeType.startsWith('audio/')) {
      processingType = 'audio_compress';
    }

    if (!processingType) {
      return null;
    }

    return await this.queueMediaProcessing(bucket, fileKey, userId, processingType, options);
  }

  /**
   * Получение предустановок видео
   */
  getVideoPresets(): Record<string, VideoTranscodeOptions> {
    return this.videoPresets;
  }

  /**
   * Очистка завершенных задач старше 24 часов
   */
  async cleanupOldJobs(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 24);

    let deletedCount = 0;

    for (const [jobId, job] of this.processingJobs.entries()) {
      const jobDate = job.completedAt || job.startedAt;

      if (jobDate && jobDate < cutoffDate && job.status !== 'processing') {
        this.processingJobs.delete(jobId);
        deletedCount++;
      }
    }

    this.logger.log(`Cleaned up ${deletedCount} old processing jobs`);
    return deletedCount;
  }

  /**
   * Вспомогательные методы
   */
  private updateJobStatus(
    jobId: string,
    status: MediaProcessingJob['status'],
    error?: string,
  ): void {
    const job = this.processingJobs.get(jobId);
    if (job) {
      job.status = status;
      if (error) job.error = error;
    }
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private generateOutputKey(originalKey: string, suffix: string): string {
    const parts = originalKey.split('/');
    const fileName = parts.pop()?.split('.')[0] || 'output';
    return `${parts.join('/')}/processed/${fileName}_${suffix}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
