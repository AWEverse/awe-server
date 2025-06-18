import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, Max, IsString, IsEnum } from 'class-validator';
import { Transform, Type } from 'class-transformer';

// Базовий DTO для пагінації
export class PaginationDto {
  @ApiProperty({
    description: 'Номер сторінки',
    minimum: 1,
    default: 1,
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Кількість елементів на сторінці',
    minimum: 1,
    maximum: 100,
    default: 10,
    example: 10,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

// DTO для пошуку з пагінацією
export class SearchPaginationDto extends PaginationDto {
  @ApiProperty({
    description: 'Пошуковий запит',
    required: false,
    example: 'приклад пошукового терміну',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Поле для сортування',
    required: false,
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sort?: string;
  @ApiProperty({
    description: 'Напрямок сортування',
    enum: ['asc', 'desc'],
    required: false,
    example: 'desc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}

// Базова відповідь з пагінацією
export class PaginatedResponseDto<T> {
  @ApiProperty({
    description: 'Дані',
    isArray: true,
  })
  data: T[];

  @ApiProperty({
    description: 'Метадані пагінації',
    type: 'object',
    properties: {
      total: { type: 'number', description: 'Загальна кількість елементів' },
      page: { type: 'number', description: 'Поточна сторінка' },
      limit: { type: 'number', description: 'Кількість елементів на сторінці' },
      pages: { type: 'number', description: 'Загальна кількість сторінок' },
    },
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

// Базова відповідь про успіх
export class SuccessResponseDto {
  @ApiProperty({
    description: 'Статус операції',
    example: true,
  })
  success: boolean;
  @ApiProperty({
    description: 'Повідомлення',
    example: 'Операція виконана успішно',
  })
  message: string;
}

// Базова відповідь з даними
export class DataResponseDto<T> extends SuccessResponseDto {
  @ApiProperty({
    description: 'Дані відповіді',
  })
  data: T;
}

// DTO для помилки
export class ErrorResponseDto {
  @ApiProperty({
    description: 'HTTP статус код',
    example: 400,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Повідомлення про помилку',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Помилка валідації',
  })
  message: string | string[];

  @ApiProperty({
    description: 'Тип помилки',
    example: 'Bad Request',
  })
  error: string;

  @ApiProperty({
    description: 'Часова мітка',
    example: '2025-06-18T10:00:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Шлях запиту',
    example: '/api/users',
  })
  path: string;
}

// DTO для завантаження файлу
export class FileUploadDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Файл для загрузки',
  })
  file: any;
}

// DTO для множественной загрузки файлов
export class MultipleFileUploadDto {
  @ApiProperty({
    type: 'array',
    items: {
      type: 'string',
      format: 'binary',
    },
    description: 'Файлы для загрузки',
  })
  files: any[];
}

// DTO для информации о файле
export class FileInfoDto {
  @ApiProperty({
    description: 'Имя файла',
    example: 'document.pdf',
  })
  filename: string;

  @ApiProperty({
    description: 'Оригинальное имя файла',
    example: 'my-document.pdf',
  })
  originalName: string;

  @ApiProperty({
    description: 'MIME тип',
    example: 'application/pdf',
  })
  mimeType: string;

  @ApiProperty({
    description: 'Размер файла в байтах',
    example: 1024000,
  })
  size: number;

  @ApiProperty({
    description: 'URL файла',
    example: 'https://cdn.example.com/files/document.pdf',
  })
  url: string;

  @ApiProperty({
    description: 'Дата создания',
    example: '2025-06-13T10:00:00.000Z',
  })
  createdAt: Date;
}
