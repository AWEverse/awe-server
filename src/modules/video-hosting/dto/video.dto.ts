import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsInt,
  Min,
  Max,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentType, ContentStatus } from '@prisma/client';

/**
 * DTO для создания нового видео
 * @description Содержит все необходимые данные для создания видео контента
 */
export class CreateVideoDto {
  @ApiProperty({
    description: 'Название видео',
    example: 'Как изучить TypeScript за 30 дней',
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @Length(1, 200)
  title: string;

  @ApiPropertyOptional({
    description: 'Описание видео с поддержкой Markdown',
    example: 'В этом видео мы рассмотрим основы TypeScript...',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @Length(0, 5000)
  description?: string;

  @ApiPropertyOptional({
    description: 'URL превью изображения для видео',
    example: 'https://example.com/thumbnails/video-123.jpg',
    format: 'uri',
  })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional({
    description: 'Теги для категоризации видео',
    example: ['typescript', 'programming', 'tutorial'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Статус публикации видео',
    enum: ContentStatus,
    example: ContentStatus.DRAFT,
    default: ContentStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus = ContentStatus.DRAFT;

  @ApiPropertyOptional({
    description: 'Отметка о возрастном ограничении (18+)',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  ageRestricted?: boolean;

  @ApiPropertyOptional({
    description: 'Отключение комментариев к видео',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  commentsDisabled?: boolean;

  @ApiPropertyOptional({
    description: 'Включение монетизации видео',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  monetized?: boolean;

  @ApiPropertyOptional({
    description: 'Время запланированной публикации видео',
    type: 'string',
    format: 'date-time',
    example: '2024-12-31T12:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  scheduledAt?: Date;
}

/**
 * DTO для обновления существующего видео
 * @description Все поля опциональны для частичного обновления
 */
export class UpdateVideoDto {
  @ApiPropertyOptional({
    description: 'Новое название видео',
    example: 'Как изучить TypeScript за 30 дней (Обновлено)',
    minLength: 1,
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiPropertyOptional({
    description: 'Новое описание видео',
    example: 'В этом обновленном видео мы рассмотрим...',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @Length(0, 5000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Новый URL превью изображения',
    example: 'https://example.com/thumbnails/video-123-updated.jpg',
    format: 'uri',
  })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional({
    description: 'Обновленные теги',
    example: ['typescript', 'advanced', 'tutorial'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Новый статус публикации',
    enum: ContentStatus,
    example: ContentStatus.PUBLISHED,
  })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @ApiPropertyOptional({
    description: 'Изменение возрастного ограничения',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  ageRestricted?: boolean;

  @ApiPropertyOptional({
    description: 'Изменение настройки комментариев',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  commentsDisabled?: boolean;

  @ApiPropertyOptional({
    description: 'Изменение настройки монетизации',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  monetized?: boolean;

  @ApiPropertyOptional({
    description: 'Изменение времени публикации',
    type: 'string',
    format: 'date-time',
    example: '2024-12-31T15:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  scheduledAt?: Date;
}

/**
 * DTO для поиска видео
 * @description Параметры для поиска и фильтрации видео контента
 */
export class VideoSearchDto {
  @ApiPropertyOptional({
    description: 'Поисковый запрос по названию и описанию',
    example: 'TypeScript tutorial',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  query?: string;
  @ApiPropertyOptional({
    description: 'Фильтр по длительности видео',
    enum: ['short', 'medium', 'long'],
    example: 'medium',
  })
  @IsOptional()
  @IsEnum(['short', 'medium', 'long'])
  duration?: 'short' | 'medium' | 'long';

  @ApiPropertyOptional({
    description: 'Фильтр по дате загрузки',
    enum: ['hour', 'today', 'week', 'month', 'year'],
    example: 'week',
  })
  @IsOptional()
  @IsEnum(['hour', 'today', 'week', 'month', 'year'])
  uploadDate?: 'hour' | 'today' | 'week' | 'month' | 'year';

  @ApiPropertyOptional({
    description: 'Фильтр по качеству видео',
    enum: ['720p', '1080p', '4k'],
    example: '1080p',
  })
  @IsOptional()
  @IsEnum(['720p', '1080p', '4k'])
  quality?: '720p' | '1080p' | '4k';

  @ApiPropertyOptional({
    description: 'Сортировка результатов',
    enum: ['relevance', 'upload_date', 'view_count', 'rating'],
    example: 'view_count',
  })
  @IsOptional()
  @IsEnum(['relevance', 'upload_date', 'view_count', 'rating'])
  sortBy?: 'relevance' | 'upload_date' | 'view_count' | 'rating';

  @ApiPropertyOptional({
    description: 'Номер страницы для пагинации',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Количество видео на странице',
    example: 20,
    minimum: 1,
    maximum: 50,
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

/**
 * DTO для взаимодействия с видео (лайки/дизлайки)
 * @description Действия пользователя в отношении видео контента
 */
export class VideoInteractionDto {
  @ApiProperty({
    description: 'Действие пользователя с видео',
    enum: ['like', 'dislike', 'none'],
    example: 'like',
  })
  @IsEnum(['like', 'dislike', 'none'])
  action: 'like' | 'dislike' | 'none';
}
