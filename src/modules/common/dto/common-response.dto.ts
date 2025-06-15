import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Базовый DTO для всех API ответов
 */
export class BaseResponseDto<T = any> {
  @ApiProperty({
    description: 'Успешность выполнения операции',
    example: true,
  })
  success: boolean;

  @ApiPropertyOptional({
    description: 'Сообщение о результате операции',
  })
  message?: string;

  @ApiPropertyOptional({
    description: 'Данные ответа',
  })
  data?: T;

  @ApiPropertyOptional({
    description: 'Информация об ошибке (если операция неуспешна)',
  })
  error?: {
    code?: string;
    details?: any;
  };

  @ApiProperty({
    description: 'Временная метка выполнения запроса',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T10:30:00.000Z',
  })
  timestamp: Date;

  @ApiPropertyOptional({
    description: 'Уникальный идентификатор запроса для отслеживания',
  })
  requestId?: string;
}

/**
 * DTO для пагинированных ответов
 */
export class PaginationMetaDto {
  @ApiProperty({
    description: 'Общее количество элементов',
    example: 250,
    minimum: 0,
  })
  totalCount: number;

  @ApiProperty({
    description: 'Количество страниц',
    example: 13,
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
    description: 'Количество элементов на странице',
    example: 20,
    minimum: 1,
  })
  pageSize: number;

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

  @ApiPropertyOptional({
    description: 'Номер первого элемента на странице',
    example: 1,
  })
  startIndex?: number;

  @ApiPropertyOptional({
    description: 'Номер последнего элемента на странице',
    example: 20,
  })
  endIndex?: number;
}

/**
 * Базовый DTO для пагинированных ответов
 */
export class PaginatedResponseDto<T = any> extends BaseResponseDto<T[]> {
  @ApiProperty({
    description: 'Метаинформация о пагинации',
    type: PaginationMetaDto,
  })
  meta: PaginationMetaDto;
}

/**
 * DTO для информации о файле
 */
export class FileInfoDto {
  @ApiProperty({
    description: 'Имя файла',
    example: 'document.pdf',
  })
  fileName: string;

  @ApiProperty({
    description: 'Оригинальное имя файла',
    example: 'My Important Document.pdf',
  })
  originalName: string;

  @ApiProperty({
    description: 'MIME тип файла',
    example: 'application/pdf',
  })
  mimeType: string;

  @ApiProperty({
    description: 'Размер файла в байтах',
    example: 1048576,
    minimum: 0,
  })
  size: number;

  @ApiProperty({
    description: 'URL для доступа к файлу',
    example: 'https://cdn.example.com/files/document.pdf',
    format: 'uri',
  })
  url: string;

  @ApiPropertyOptional({
    description: 'Хеш файла для проверки целостности',
    example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  })
  hash?: string;

  @ApiProperty({
    description: 'Дата загрузки файла',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T10:00:00.000Z',
  })
  uploadedAt: Date;

  @ApiPropertyOptional({
    description: 'Дата истечения срока действия файла',
    type: 'string',
    format: 'date-time',
    example: '2024-12-31T23:59:59.000Z',
  })
  expiresAt?: Date;
}

/**
 * DTO для результата загрузки файла
 */
export class FileUploadResponseDto extends BaseResponseDto<FileInfoDto> {
  @ApiProperty({
    description: 'Информация о загруженном файле',
    type: FileInfoDto,
  })
  declare data: FileInfoDto;
}

/**
 * DTO для ошибок валидации
 */
export class ValidationErrorDto {
  @ApiProperty({
    description: 'Поле с ошибкой',
    example: 'email',
  })
  field: string;

  @ApiProperty({
    description: 'Значение, которое вызвало ошибку',
    example: 'invalid-email',
  })
  value: any;

  @ApiProperty({
    description: 'Сообщение об ошибке',
    example: 'Email must be a valid email address',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Код ошибки',
    example: 'INVALID_EMAIL',
  })
  code?: string;
}

/**
 * DTO для ответа с ошибками валидации
 */
export class ValidationErrorResponseDto extends BaseResponseDto {
  @ApiProperty({
    description: 'Успешность операции (всегда false для ошибок)',
    example: false,
  })
  success: false = false;

  @ApiProperty({
    description: 'Общее сообщение об ошибке',
    example: 'Validation failed',
  })
  message: string = 'Validation failed';

  @ApiProperty({
    description: 'Список ошибок валидации',
    type: [ValidationErrorDto],
  })
  errors: ValidationErrorDto[];
}

/**
 * DTO для статистики использования API
 */
export class ApiUsageStatsDto {
  @ApiProperty({
    description: 'Общее количество запросов',
    example: 15420,
    minimum: 0,
  })
  totalRequests: number;

  @ApiProperty({
    description: 'Количество успешных запросов',
    example: 14892,
    minimum: 0,
  })
  successfulRequests: number;

  @ApiProperty({
    description: 'Количество неудачных запросов',
    example: 528,
    minimum: 0,
  })
  failedRequests: number;

  @ApiProperty({
    description: 'Среднее время ответа в миллисекундах',
    example: 245.7,
    minimum: 0,
  })
  averageResponseTime: number;

  @ApiProperty({
    description: 'Использованная пропускная способность в байтах',
    example: 104857600,
    minimum: 0,
  })
  bandwidthUsed: number;

  @ApiProperty({
    description: 'Период статистики (начало)',
    type: 'string',
    format: 'date-time',
    example: '2024-06-01T00:00:00.000Z',
  })
  periodStart: Date;

  @ApiProperty({
    description: 'Период статистики (конец)',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T23:59:59.000Z',
  })
  periodEnd: Date;
}

/**
 * DTO для настроек кэширования
 */
export class CacheInfoDto {
  @ApiProperty({
    description: 'Ключ кэша',
    example: 'user:profile:12345',
  })
  key: string;

  @ApiProperty({
    description: 'Время жизни в секундах',
    example: 3600,
    minimum: 0,
  })
  ttl: number;

  @ApiProperty({
    description: 'Размер данных в байтах',
    example: 2048,
    minimum: 0,
  })
  size: number;

  @ApiProperty({
    description: 'Время создания записи в кэше',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Время истечения записи в кэше',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T11:00:00.000Z',
  })
  expiresAt: Date;

  @ApiProperty({
    description: 'Количество обращений к записи',
    example: 15,
    minimum: 0,
  })
  hitCount: number;
}

/**
 * DTO для bulk операций
 */
export class BulkOperationResultDto {
  @ApiProperty({
    description: 'Общее количество обработанных элементов',
    example: 100,
    minimum: 0,
  })
  totalProcessed: number;

  @ApiProperty({
    description: 'Количество успешных операций',
    example: 95,
    minimum: 0,
  })
  successCount: number;

  @ApiProperty({
    description: 'Количество неудачных операций',
    example: 5,
    minimum: 0,
  })
  failureCount: number;

  @ApiProperty({
    description: 'Идентификаторы успешно обработанных элементов',
    type: [String],
    example: ['id1', 'id2', 'id3'],
  })
  successfulIds: string[];

  @ApiProperty({
    description: 'Информация о неудачных операциях',
    type: [Object],
    example: [
      { id: 'id4', error: 'Validation failed' },
      { id: 'id5', error: 'Resource not found' },
    ],
  })
  failures: Array<{ id: string; error: string }>;

  @ApiProperty({
    description: 'Время выполнения операции в миллисекундах',
    example: 1250,
    minimum: 0,
  })
  executionTime: number;

  @ApiProperty({
    description: 'Время начала операции',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T10:00:00.000Z',
  })
  startedAt: Date;

  @ApiProperty({
    description: 'Время завершения операции',
    type: 'string',
    format: 'date-time',
    example: '2024-06-13T10:00:01.250Z',
  })
  completedAt: Date;
}
