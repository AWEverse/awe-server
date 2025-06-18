import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiResponse,
  ApiOperation,
  ApiTags,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
  ApiConsumes,
  ApiProduces,
  getSchemaPath,
} from '@nestjs/swagger';

// Загальні декоратори для успішних відповідей
export const ApiSuccessResponse = (
  description: string,
  type?: Type<unknown> | Function | [Function] | string,
) => {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description,
      ...(type && { type }),
    }),
  );
};

// Декоратор для відповідей зі створенням ресурсу
export const ApiCreatedResponse = (
  description: string,
  type?: Type<unknown> | Function | [Function] | string,
) => {
  return applyDecorators(
    ApiResponse({
      status: 201,
      description,
      ...(type && { type }),
    }),
  );
};

// Декоратор для помилок валідації
export const ApiValidationErrorResponse = () => {
  return applyDecorators(
    ApiResponse({
      status: 400,
      description: 'Помилка валідації вхідних даних',
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 400 },
          message: {
            type: 'array',
            items: { type: 'string' },
            example: ['поле не повинно бути порожнім', 'поле має бути рядком'],
          },
          error: { type: 'string', example: 'Bad Request' },
        },
      },
    }),
  );
};

// Декоратор для помилок авторизації
export const ApiUnauthorizedResponse = () => {
  return applyDecorators(
    ApiResponse({
      status: 401,
      description: 'Не авторизований',
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 401 },
          message: { type: 'string', example: 'Unauthorized' },
        },
      },
    }),
  );
};

// Декоратор для помилок доступу
export const ApiForbiddenResponse = () => {
  return applyDecorators(
    ApiResponse({
      status: 403,
      description: 'Доступ заборонений',
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 403 },
          message: { type: 'string', example: 'Forbidden resource' },
        },
      },
    }),
  );
};

// Декоратор для помилок "не знайдено"
export const ApiNotFoundResponse = (resource = 'Ресурс') => {
  return applyDecorators(
    ApiResponse({
      status: 404,
      description: `${resource} не знайдено`,
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 404 },
          message: { type: 'string', example: `${resource} не знайдено` },
        },
      },
    }),
  );
};

// Декоратор для серверних помилок
export const ApiInternalServerErrorResponse = () => {
  return applyDecorators(
    ApiResponse({
      status: 500,
      description: 'Внутрішня помилка сервера',
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 500 },
          message: { type: 'string', example: 'Internal server error' },
        },
      },
    }),
  );
};

// Комбінований декоратор для захищених ендпоінтів
export const ApiSecureEndpoint = (summary: string, description?: string, tags?: string[]) => {
  const decorators = [
    ApiOperation({ summary, description }),
    ApiBearerAuth('JWT-auth'),
    ApiUnauthorizedResponse(),
    ApiForbiddenResponse(),
    ApiInternalServerErrorResponse(),
  ];

  if (tags) {
    decorators.unshift(ApiTags(...tags));
  }

  return applyDecorators(...decorators);
};

// Декоратор для публічних ендпоінтів
export const ApiPublicEndpoint = (summary: string, description?: string, tags?: string[]) => {
  const decorators = [
    ApiOperation({ summary, description, security: [] }), // Вказуємо що не потребує аутентифікації
    ApiValidationErrorResponse(),
    ApiInternalServerErrorResponse(),
  ];

  if (tags) {
    decorators.unshift(ApiTags(...tags));
  }

  return applyDecorators(...decorators);
};

// Декоратор для ендпоінтів з завантаженням файлів
export const ApiFileUpload = (
  summary: string,
  description?: string,
  fieldName = 'file',
  isMultiple = false,
) => {
  return applyDecorators(
    ApiOperation({ summary, description }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          [fieldName]: {
            type: 'string',
            format: 'binary',
            ...(isMultiple && {
              type: 'array',
              items: { type: 'string', format: 'binary' },
            }),
          },
        },
      },
    }),
    ApiBearerAuth('JWT-auth'),
    ApiValidationErrorResponse(),
    ApiUnauthorizedResponse(),
    ApiInternalServerErrorResponse(),
  );
};

// Декоратор для пагінації
export const ApiPaginatedResponse = (description: string, dataType: Type<unknown>) => {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description,
      schema: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(dataType) },
          },
          meta: {
            type: 'object',
            properties: {
              total: { type: 'number', example: 100 },
              page: { type: 'number', example: 1 },
              limit: { type: 'number', example: 10 },
              pages: { type: 'number', example: 10 },
            },
          },
        },
      },
    }),
  );
};

// Декоратор для параметрів пагінації
export const ApiPaginationParams = () => {
  return applyDecorators(
    ApiQuery({
      name: 'page',
      required: false,
      type: Number,
      description: 'Номер сторінки',
      example: 1,
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description: 'Кількість елементів на сторінці',
      example: 10,
    }),
  );
};

// Декоратор для параметрів пошуку
export const ApiSearchParams = () => {
  return applyDecorators(
    ApiQuery({
      name: 'search',
      required: false,
      type: String,
      description: 'Пошуковий запит',
      example: 'приклад пошуку',
    }),
    ApiQuery({
      name: 'sort',
      required: false,
      type: String,
      description: 'Поле для сортування',
      example: 'createdAt',
    }),
    ApiQuery({
      name: 'order',
      required: false,
      type: String,
      enum: ['asc', 'desc'],
      description: 'Напрямок сортування',
      example: 'desc',
    }),
  );
};
