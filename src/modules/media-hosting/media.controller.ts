import { Controller, Post, Get, Body, Param, Query, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';

import { User } from 'generated/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { MediaProcessingService } from './services/media-processing.service';

export class ProcessMediaDto {
  @ApiProperty({ description: 'S3/R2 bucket name' })
  @IsString()
  bucket: string;

  @ApiProperty({ description: 'File key in the bucket' })
  @IsString()
  fileKey: string;

  @ApiProperty({
    description: 'Type of media processing',
    enum: ['video_transcode', 'image_optimize', 'audio_compress'],
  })
  @IsEnum(['video_transcode', 'image_optimize', 'audio_compress'])
  type: 'video_transcode' | 'image_optimize' | 'audio_compress';

  @ApiProperty({ description: 'Preset name for processing', required: false })
  @IsOptional()
  @IsString()
  preset?: string;

  @ApiProperty({ description: 'Custom processing options', required: false })
  @IsOptional()
  @IsObject()
  customOptions?: any;
}

@ApiTags('Media Processing')
@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(private readonly mediaProcessing: MediaProcessingService) {}

  @Post('process')
  @ApiOperation({ summary: 'Запуск обработки медиа файла' })
  async processMedia(@Body() body: ProcessMediaDto, @GetUser() user: User) {
    let options = body.customOptions;

    // Если указана предустановка для видео
    if (body.type === 'video_transcode' && body.preset) {
      const presets = this.mediaProcessing.getVideoPresets();
      options = presets[body.preset] || options;
    }

    const jobId = await this.mediaProcessing.queueMediaProcessing(
      body.bucket,
      body.fileKey,
      user.id.toString(),
      body.type,
      options,
    );

    this.logger.log(`Media processing queued by user ${user.username}: ${jobId}`);

    return {
      success: true,
      data: { jobId },
    };
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Получение статуса задачи обработки' })
  async getJobStatus(@Param('jobId') jobId: string) {
    const job = await this.mediaProcessing.getJobStatus(jobId);

    if (!job) {
      return {
        success: false,
        message: 'Задача не найдена',
      };
    }

    return {
      success: true,
      data: job,
    };
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Получение всех задач пользователя' })
  async getUserJobs(@GetUser() user: User, @Query('status') status?: string) {
    let jobs = await this.mediaProcessing.getUserJobs(user.id.toString());

    if (status) {
      jobs = jobs.filter(job => job.status === status);
    }

    return {
      success: true,
      data: jobs,
    };
  }

  @Get('presets/video')
  @ApiOperation({ summary: 'Получение предустановок для видео' })
  async getVideoPresets() {
    const presets = this.mediaProcessing.getVideoPresets();

    return {
      success: true,
      data: presets,
    };
  }

  @Post('auto-process')
  @ApiOperation({ summary: 'Автоматическая обработка файла' })
  async autoProcessMedia(
    @Body() body: { bucket: string; fileKey: string; mimeType: string },
    @GetUser() user: User,
  ) {
    const jobId = await this.mediaProcessing.autoProcessMedia(
      body.bucket,
      body.fileKey,
      user.id.toString(),
      body.mimeType,
    );

    if (!jobId) {
      return {
        success: false,
        message: 'Автоматическая обработка недоступна для данного типа файла',
      };
    }

    return {
      success: true,
      data: { jobId },
    };
  }

  @Post('cleanup')
  @ApiOperation({ summary: 'Очистка старых задач' })
  async cleanupOldJobs() {
    const deletedCount = await this.mediaProcessing.cleanupOldJobs();

    return {
      success: true,
      data: { deletedCount },
    };
  }
}
