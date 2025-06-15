import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO для создания стикер-пака
 */
export class CreateStickerPackDto {
  @ApiProperty({
    description: 'Уникальное имя стикер-пака (используется в URL)',
    example: 'funny_cats_v2',
    minLength: 3,
    maxLength: 50,
    pattern: '^[a-z0-9_]+$',
  })
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiProperty({
    description: 'Отображаемое название стикер-пака',
    example: 'Funny Cats Volume 2',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  title: string;

  @ApiPropertyOptional({
    description: 'Описание стикер-пака',
    example: 'Collection of hilarious cat expressions',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Цена в центах (0 для бесплатного пака)',
    example: 299,
    minimum: 0,
    maximum: 100000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  @Type(() => Number)
  price: number = 0;

  @ApiProperty({
    description: 'Категория стикер-пака',
    example: 'animals',
    enum: ['animals', 'emotions', 'food', 'nature', 'people', 'objects', 'symbols', 'other'],
  })
  @IsString()
  category: string;

  @ApiPropertyOptional({
    description: 'Теги для поиска (разделенные запятыми)',
    example: 'cats,funny,animals,emotions',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) =>
    value
      ?.split(',')
      .map((tag: string) => tag.trim())
      .filter(Boolean),
  )
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Является ли пак премиальным',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isPremium: boolean = false;

  @ApiPropertyOptional({
    description: 'Содержит ли пак анимированные стикеры',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isAnimated: boolean = false;

  @ApiPropertyOptional({
    description: 'Является ли официальным паком платформы',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isOfficial: boolean = false;
}

/**
 * DTO для обновления стикер-пака
 */
export class UpdateStickerPackDto {
  @ApiPropertyOptional({
    description: 'Новое название стикер-пака',
    example: 'Funny Cats Volume 2 - Updated',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({
    description: 'Новое описание стикер-пака',
    example: 'Updated collection of hilarious cat expressions',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Новая цена в центах',
    example: 199,
    minimum: 0,
    maximum: 100000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  @Type(() => Number)
  price?: number;

  @ApiPropertyOptional({
    description: 'Новая категория',
    example: 'emotions',
    enum: ['animals', 'emotions', 'food', 'nature', 'people', 'objects', 'symbols', 'other'],
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Новые теги (разделенные запятыми)',
    example: 'cats,funny,updated,emotions',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) =>
    value
      ?.split(',')
      .map((tag: string) => tag.trim())
      .filter(Boolean),
  )
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Изменить статус премиума',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isPremium?: boolean;

  @ApiPropertyOptional({
    description: 'Обновить статус публикации',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isPublished?: boolean;
}

/**
 * DTO для создания отдельного стикера
 */
export class CreateStickerDto {
  @ApiProperty({
    description: 'Название стикера',
    example: 'happy_cat',
    minLength: 1,
    maxLength: 50,
  })
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiPropertyOptional({
    description: 'Эмоции/теги стикера (разделенные запятыми)',
    example: 'happy,smile,joy',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) =>
    value
      ?.split(',')
      .map((emoji: string) => emoji.trim())
      .filter(Boolean),
  )
  emojis?: string[];

  @ApiPropertyOptional({
    description: 'Позиция в наборе',
    example: 1,
    minimum: 0,
    maximum: 1000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  @Type(() => Number)
  position?: number;
}

/**
 * DTO для обновления стикера
 */
export class UpdateStickerDto {
  @ApiPropertyOptional({
    description: 'Новое название стикера',
    example: 'very_happy_cat',
    minLength: 1,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({
    description: 'Новые эмоции/теги (разделенные запятыми)',
    example: 'excited,very_happy,joy',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) =>
    value
      ?.split(',')
      .map((emoji: string) => emoji.trim())
      .filter(Boolean),
  )
  emojis?: string[];

  @ApiPropertyOptional({
    description: 'Новая позиция в наборе',
    example: 2,
    minimum: 0,
    maximum: 1000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  @Type(() => Number)
  position?: number;
}

/**
 * DTO для поиска стикер-паков
 */
export class StickerPackSearchDto {
  @ApiPropertyOptional({
    description: 'Поисковый запрос по названию и описанию',
    example: 'funny cats',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  query?: string;

  @ApiPropertyOptional({
    description: 'Фильтр по категории',
    example: 'animals',
    enum: ['animals', 'emotions', 'food', 'nature', 'people', 'objects', 'symbols', 'other'],
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Фильтр по тегам (разделенные запятыми)',
    example: 'cats,funny',
  })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({
    description: 'Только премиальные паки',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isPremium?: boolean;

  @ApiPropertyOptional({
    description: 'Только анимированные паки',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isAnimated?: boolean;

  @ApiPropertyOptional({
    description: 'Только официальные паки',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isOfficial?: boolean;

  @ApiPropertyOptional({
    description: 'Сортировка результатов',
    example: 'downloads',
    enum: ['newest', 'oldest', 'downloads', 'rating', 'name', 'price'],
  })
  @IsOptional()
  @IsString()
  sortBy?: 'newest' | 'oldest' | 'downloads' | 'rating' | 'name' | 'price';

  @ApiPropertyOptional({
    description: 'Порядок сортировки',
    example: 'desc',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({
    description: 'Номер страницы',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Количество паков на странице',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit: number = 20;
}

/**
 * DTO для массовой загрузки стикеров
 */
export class BulkUploadStickerDto {
  @ApiProperty({
    description: 'ID стикер-пака для загрузки',
    example: '11111111111111111111',
  })
  @IsString()
  packId: string;

  @ApiPropertyOptional({
    description: 'Настройки для обработки изображений',
    example: {
      autoResize: true,
      targetSize: 512,
      optimizeForWeb: true,
      generateAnimated: false,
    },
  })
  @IsOptional()
  processingOptions?: {
    autoResize?: boolean;
    targetSize?: number;
    optimizeForWeb?: boolean;
    generateAnimated?: boolean;
  };
}

/**
 * DTO для оценки стикер-пака
 */
export class RateStickerPackDto {
  @ApiProperty({
    description: 'Оценка от 1 до 5',
    example: 5,
    minimum: 1,
    maximum: 5,
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating: number;

  @ApiPropertyOptional({
    description: 'Комментарий к оценке',
    example: 'Отличные стикеры, очень смешные!',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
