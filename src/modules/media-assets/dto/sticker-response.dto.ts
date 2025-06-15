import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO для информации о стикере
 */
export class StickerDto {
  @ApiProperty({
    description: 'Уникальный идентификатор стикера',
    example: '12345678901234567890',
  })
  id: string;

  @ApiProperty({
    description: 'Название стикера',
    example: 'happy_cat',
  })
  name: string;

  @ApiProperty({
    description: 'URL стикера',
    example: 'https://cdn.example.com/stickers/happy_cat.webp',
    format: 'uri',
  })
  url: string;

  @ApiPropertyOptional({
    description: 'URL анимированной версии (для анимированных стикеров)',
    example: 'https://cdn.example.com/stickers/happy_cat.gif',
    format: 'uri',
  })
  animatedUrl?: string;

  @ApiProperty({
    description: 'Ширина стикера в пикселях',
    example: 512,
    minimum: 1,
  })
  width: number;

  @ApiProperty({
    description: 'Высота стикера в пикселях',
    example: 512,
    minimum: 1,
  })
  height: number;

  @ApiProperty({
    description: 'Размер файла в байтах',
    example: 48576,
    minimum: 0,
  })
  fileSize: number;

  @ApiProperty({
    description: 'Является ли стикер анимированным',
    example: false,
  })
  isAnimated: boolean;

  @ApiProperty({
    description: 'Эмоции/теги стикера',
    type: [String],
    example: ['happy', 'cat', 'smile'],
  })
  emojis: string[];

  @ApiProperty({
    description: 'Позиция в наборе',
    example: 1,
    minimum: 0,
  })
  position: number;

  @ApiProperty({
    description: 'Дата создания',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Дата последнего обновления',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T12:30:00.000Z',
  })
  updatedAt: Date;
}

/**
 * DTO для создателя стикер-пака
 */
export class StickerPackCreatorDto {
  @ApiProperty({
    description: 'Уникальный идентификатор пользователя',
    example: '98765432101234567890',
  })
  id: string;

  @ApiProperty({
    description: 'Имя пользователя',
    example: 'artist_bob',
  })
  username: string;

  @ApiPropertyOptional({
    description: 'Полное имя',
    example: 'Bob Artist',
  })
  fullName?: string;

  @ApiPropertyOptional({
    description: 'URL аватара',
    example: 'https://cdn.example.com/avatars/artist_bob.jpg',
    format: 'uri',
  })
  avatarUrl?: string;

  @ApiProperty({
    description: 'Верифицированный ли создатель',
    example: true,
  })
  verified: boolean;
}

/**
 * DTO для полной информации о стикер-паке
 */
export class StickerPackResponseDto {
  @ApiProperty({
    description: 'Уникальный идентификатор стикер-пака',
    example: '11111111111111111111',
  })
  id: string;

  @ApiProperty({
    description: 'Уникальное имя пака (используется в URL)',
    example: 'funny_cats_v2',
  })
  name: string;

  @ApiProperty({
    description: 'Отображаемое название пака',
    example: 'Funny Cats Volume 2',
  })
  title: string;

  @ApiPropertyOptional({
    description: 'Описание стикер-пака',
    example: 'Collection of hilarious cat expressions',
  })
  description?: string;

  @ApiProperty({
    description: 'URL превью пака',
    example: 'https://cdn.example.com/sticker-packs/funny_cats_v2_thumb.jpg',
    format: 'uri',
  })
  thumbnailUrl: string;

  @ApiProperty({
    description: 'Количество стикеров в паке',
    example: 24,
    minimum: 0,
  })
  stickerCount: number;

  @ApiProperty({
    description: 'Цена в центах (0 для бесплатных)',
    example: 299,
    minimum: 0,
  })
  price: number;

  @ApiProperty({
    description: 'Категория стикер-пака',
    example: 'animals',
  })
  category: string;

  @ApiProperty({
    description: 'Теги для поиска',
    type: [String],
    example: ['cats', 'funny', 'animals', 'emotions'],
  })
  tags: string[];

  @ApiProperty({
    description: 'Является ли пак премиальным',
    example: false,
  })
  isPremium: boolean;

  @ApiProperty({
    description: 'Содержит ли анимированные стикеры',
    example: false,
  })
  isAnimated: boolean;

  @ApiProperty({
    description: 'Официальный ли пак',
    example: false,
  })
  isOfficial: boolean;

  @ApiProperty({
    description: 'Опубликован ли пак',
    example: true,
  })
  isPublished: boolean;

  @ApiProperty({
    description: 'Информация о создателе',
    type: StickerPackCreatorDto,
  })
  creator: StickerPackCreatorDto;

  @ApiProperty({
    description: 'Стикеры в паке',
    type: [StickerDto],
  })
  stickers: StickerDto[];

  @ApiProperty({
    description: 'Количество загрузок',
    example: 15420,
    minimum: 0,
  })
  downloadCount: number;

  @ApiProperty({
    description: 'Средний рейтинг (1-5)',
    example: 4.7,
    minimum: 1,
    maximum: 5,
  })
  rating: number;

  @ApiProperty({
    description: 'Количество оценок',
    example: 892,
    minimum: 0,
  })
  ratingCount: number;

  @ApiProperty({
    description: 'Дата создания',
    type: 'string',
    format: 'date-time',
    example: '2024-06-01T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Дата последнего обновления',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T15:30:00.000Z',
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'Дата публикации',
    type: 'string',
    format: 'date-time',
    example: '2024-06-02T09:00:00.000Z',
  })
  publishedAt?: Date;
}

/**
 * DTO для пагинированного списка стикер-паков
 */
export class PaginatedStickerPacksResponseDto {
  @ApiProperty({
    description: 'Список стикер-паков',
    type: [StickerPackResponseDto],
  })
  packs: StickerPackResponseDto[];

  @ApiProperty({
    description: 'Общее количество паков',
    example: 156,
    minimum: 0,
  })
  totalCount: number;

  @ApiProperty({
    description: 'Количество страниц',
    example: 8,
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
 * DTO для результата загрузки стикера
 */
export class StickerUploadResponseDto {
  @ApiProperty({
    description: 'Уникальный идентификатор загруженного стикера',
    example: '22222222222222222222',
  })
  id: string;

  @ApiProperty({
    description: 'Название файла',
    example: 'happy_cat.webp',
  })
  fileName: string;

  @ApiProperty({
    description: 'URL загруженного стикера',
    example: 'https://cdn.example.com/stickers/happy_cat.webp',
    format: 'uri',
  })
  url: string;

  @ApiProperty({
    description: 'Статус обработки',
    example: 'processed',
    enum: ['uploaded', 'processing', 'processed', 'failed'],
  })
  processingStatus: string;

  @ApiProperty({
    description: 'Размер файла в байтах',
    example: 48576,
    minimum: 0,
  })
  fileSize: number;

  @ApiProperty({
    description: 'Ширина в пикселях',
    example: 512,
  })
  width: number;

  @ApiProperty({
    description: 'Высота в пикселях',
    example: 512,
  })
  height: number;

  @ApiProperty({
    description: 'Время создания',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T10:00:00.000Z',
  })
  createdAt: Date;
}

/**
 * DTO для массовой загрузки стикеров
 */
export class BulkStickerUploadResponseDto {
  @ApiProperty({
    description: 'Общее количество загруженных файлов',
    example: 12,
    minimum: 0,
  })
  totalUploaded: number;

  @ApiProperty({
    description: 'Количество успешно обработанных стикеров',
    example: 10,
    minimum: 0,
  })
  successCount: number;

  @ApiProperty({
    description: 'Количество неудачных загрузок',
    example: 2,
    minimum: 0,
  })
  failedCount: number;

  @ApiProperty({
    description: 'Успешно загруженные стикеры',
    type: [StickerUploadResponseDto],
  })
  successful: StickerUploadResponseDto[];

  @ApiProperty({
    description: 'Неудачные загрузки с ошибками',
    type: [Object],
    example: [
      { fileName: 'broken_image.jpg', error: 'Invalid file format' },
      { fileName: 'too_large.png', error: 'File size exceeds limit' },
    ],
  })
  failed: Array<{ fileName: string; error: string }>;

  @ApiProperty({
    description: 'Время выполнения операции',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T10:30:00.000Z',
  })
  processedAt: Date;
}

/**
 * DTO для статистики стикеров
 */
export class StickerStatsResponseDto {
  @ApiProperty({
    description: 'Общее количество стикер-паков пользователя',
    example: 5,
    minimum: 0,
  })
  totalPacks: number;

  @ApiProperty({
    description: 'Общее количество стикеров',
    example: 120,
    minimum: 0,
  })
  totalStickers: number;

  @ApiProperty({
    description: 'Количество опубликованных паков',
    example: 3,
    minimum: 0,
  })
  publishedPacks: number;

  @ApiProperty({
    description: 'Общее количество загрузок всех паков',
    example: 45230,
    minimum: 0,
  })
  totalDownloads: number;

  @ApiProperty({
    description: 'Общий заработок в центах',
    example: 125000,
    minimum: 0,
  })
  totalEarnings: number;

  @ApiProperty({
    description: 'Средний рейтинг всех паков',
    example: 4.6,
    minimum: 1,
    maximum: 5,
  })
  averageRating: number;
}
