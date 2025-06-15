import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentStatus } from '@prisma/client';

/**
 * DTO для краткой информации об авторе видео
 */
export class VideoAuthorDto {
  @ApiProperty({
    description: 'Уникальный идентификатор пользователя',
    example: '12345678901234567890',
  })
  id: string;

  @ApiProperty({
    description: 'Имя пользователя',
    example: 'john_developer',
  })
  username: string;

  @ApiPropertyOptional({
    description: 'Полное имя пользователя',
    example: 'John Smith',
  })
  fullName?: string;

  @ApiPropertyOptional({
    description: 'URL аватара пользователя',
    example: 'https://example.com/avatars/john.jpg',
    format: 'uri',
  })
  avatarUrl?: string;

  @ApiProperty({
    description: 'Количество подписчиков',
    example: 15420,
    minimum: 0,
  })
  subscribersCount: number;

  @ApiProperty({
    description: 'Верифицирован ли канал',
    example: true,
  })
  verified: boolean;
}

/**
 * DTO для статистики видео
 */
export class VideoStatsDto {
  @ApiProperty({
    description: 'Количество просмотров',
    example: 125340,
    minimum: 0,
  })
  views: number;

  @ApiProperty({
    description: 'Количество лайков',
    example: 2341,
    minimum: 0,
  })
  likes: number;

  @ApiProperty({
    description: 'Количество дизлайков',
    example: 45,
    minimum: 0,
  })
  dislikes: number;

  @ApiProperty({
    description: 'Количество комментариев',
    example: 187,
    minimum: 0,
  })
  comments: number;

  @ApiProperty({
    description: 'Количество добавлений в избранное',
    example: 892,
    minimum: 0,
  })
  favorites: number;

  @ApiProperty({
    description: 'Количество репостов',
    example: 156,
    minimum: 0,
  })
  shares: number;
}

/**
 * DTO для качества видео
 */
export class VideoQualityDto {
  @ApiProperty({
    description: 'Разрешение видео',
    example: '1080p',
    enum: ['240p', '360p', '480p', '720p', '1080p', '1440p', '4k'],
  })
  resolution: string;

  @ApiProperty({
    description: 'URL видео файла',
    example: 'https://cdn.example.com/videos/1080p/video-123.mp4',
    format: 'uri',
  })
  url: string;

  @ApiProperty({
    description: 'Размер файла в байтах',
    example: 52428800,
    minimum: 0,
  })
  fileSize: number;

  @ApiProperty({
    description: 'Битрейт видео в kbps',
    example: 2500,
    minimum: 0,
  })
  bitrate: number;
}

/**
 * DTO для полной информации о видео
 */
export class VideoResponseDto {
  @ApiProperty({
    description: 'Уникальный идентификатор видео',
    example: '98765432101234567890',
  })
  id: string;

  @ApiProperty({
    description: 'Название видео',
    example: 'Как изучить TypeScript за 30 дней',
  })
  title: string;

  @ApiPropertyOptional({
    description: 'Описание видео',
    example: 'В этом видео мы подробно рассмотрим основы TypeScript...',
  })
  description?: string;

  @ApiProperty({
    description: 'URL превью изображения',
    example: 'https://cdn.example.com/thumbnails/video-123.jpg',
    format: 'uri',
  })
  thumbnailUrl: string;

  @ApiProperty({
    description: 'Длительность видео в секундах',
    example: 1845,
    minimum: 0,
  })
  duration: number;

  @ApiProperty({
    description: 'Статус публикации видео',
    enum: ContentStatus,
    example: ContentStatus.PUBLISHED,
  })
  status: ContentStatus;

  @ApiProperty({
    description: 'Теги видео',
    type: [String],
    example: ['typescript', 'programming', 'tutorial'],
  })
  tags: string[];

  @ApiProperty({
    description: 'Возрастное ограничение',
    example: false,
  })
  ageRestricted: boolean;

  @ApiProperty({
    description: 'Отключены ли комментарии',
    example: false,
  })
  commentsDisabled: boolean;

  @ApiProperty({
    description: 'Включена ли монетизация',
    example: true,
  })
  monetized: boolean;

  @ApiProperty({
    description: 'Информация об авторе',
    type: VideoAuthorDto,
  })
  author: VideoAuthorDto;

  @ApiProperty({
    description: 'Статистика видео',
    type: VideoStatsDto,
  })
  stats: VideoStatsDto;

  @ApiProperty({
    description: 'Доступные качества видео',
    type: [VideoQualityDto],
  })
  qualities: VideoQualityDto[];

  @ApiPropertyOptional({
    description: 'Время запланированной публикации',
    type: 'string',
    format: 'date-time',
    example: '2024-12-31T12:00:00.000Z',
  })
  scheduledAt?: Date;

  @ApiProperty({
    description: 'Время создания видео',
    type: 'string',
    format: 'date-time',
    example: '2024-06-01T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Время последнего обновления',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T15:30:00.000Z',
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'Время публикации',
    type: 'string',
    format: 'date-time',
    example: '2024-06-02T09:00:00.000Z',
  })
  publishedAt?: Date;
}

/**
 * DTO для списка видео с пагинацией
 */
export class PaginatedVideosResponseDto {
  @ApiProperty({
    description: 'Список видео',
    type: [VideoResponseDto],
  })
  videos: VideoResponseDto[];

  @ApiProperty({
    description: 'Общее количество видео',
    example: 1247,
    minimum: 0,
  })
  totalCount: number;

  @ApiProperty({
    description: 'Количество страниц',
    example: 63,
    minimum: 1,
  })
  totalPages: number;

  @ApiProperty({
    description: 'Текущая страница',
    example: 1,
    minimum: 1,
  })
  currentPage: number;

  @ApiProperty({
    description: 'Есть ли следующая страница',
    example: true,
  })
  hasNext: boolean;

  @ApiProperty({
    description: 'Есть ли предыдущая страница',
    example: false,
  })
  hasPrev: boolean;
}

/**
 * DTO для результата загрузки видео
 */
export class VideoUploadResponseDto {
  @ApiProperty({
    description: 'Уникальный идентификатор загруженного видео',
    example: '98765432101234567890',
  })
  id: string;

  @ApiProperty({
    description: 'Статус загрузки',
    example: 'processing',
    enum: ['uploaded', 'processing', 'completed', 'failed'],
  })
  uploadStatus: string;

  @ApiProperty({
    description: 'URL для отслеживания прогресса обработки',
    example: 'https://api.example.com/videos/98765432101234567890/processing-status',
    format: 'uri',
  })
  progressUrl: string;

  @ApiProperty({
    description: 'Процент завершения обработки',
    example: 45,
    minimum: 0,
    maximum: 100,
  })
  progress: number;

  @ApiPropertyOptional({
    description: 'Сообщение о статусе',
    example: 'Video is being transcoded to different qualities',
  })
  message?: string;

  @ApiProperty({
    description: 'Время создания записи',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T10:00:00.000Z',
  })
  createdAt: Date;
}
