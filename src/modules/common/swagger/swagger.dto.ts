import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, Max, IsString, IsEnum } from 'class-validator';
import { Transform, Type } from 'class-transformer';

// Базовый DTO для пагинации
export class PaginationDto {
  @ApiProperty({
    description: 'Номер страницы',
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
    description: 'Количество элементов на странице',
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

// DTO для поиска с пагинацией
export class SearchPaginationDto extends PaginationDto {
  @ApiProperty({
    description: 'Поисковый запрос',
    required: false,
    example: 'example search term',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Поле для сортировки',
    required: false,
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiProperty({
    description: 'Направление сортировки',
    enum: ['asc', 'desc'],
    required: false,
    example: 'desc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}

// Базовый ответ с пагинацией
export class PaginatedResponseDto<T> {
  @ApiProperty({
    description: 'Данные',
    isArray: true,
  })
  data: T[];

  @ApiProperty({
    description: 'Метаданные пагинации',
    type: 'object',
    properties: {
      total: { type: 'number', description: 'Общее количество элементов' },
      page: { type: 'number', description: 'Текущая страница' },
      limit: { type: 'number', description: 'Количество элементов на странице' },
      pages: { type: 'number', description: 'Общее количество страниц' },
    },
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

// Базовый ответ об успехе
export class SuccessResponseDto {
  @ApiProperty({
    description: 'Статус операции',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Сообщение',
    example: 'Operation completed successfully',
  })
  message: string;
}

// Базовый ответ с данными
export class DataResponseDto<T> extends SuccessResponseDto {
  @ApiProperty({
    description: 'Данные ответа',
  })
  data: T;
}

// DTO для ошибки
export class ErrorResponseDto {
  @ApiProperty({
    description: 'HTTP статус код',
    example: 400,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Сообщение об ошибке',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Validation failed',
  })
  message: string | string[];

  @ApiProperty({
    description: 'Тип ошибки',
    example: 'Bad Request',
  })
  error: string;

  @ApiProperty({
    description: 'Временная метка',
    example: '2025-06-13T10:00:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Путь запроса',
    example: '/api/users',
  })
  path: string;
}

// DTO для загрузки файла
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
