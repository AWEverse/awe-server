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

// Общие декораторы для успешных ответов
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

// Декоратор для ответов с созданием ресурса
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

// Декоратор для ошибок валидации
export const ApiValidationErrorResponse = () => {
  return applyDecorators(
    ApiResponse({
      status: 400,
      description: 'Ошибка валидации входных данных',
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 400 },
          message: {
            type: 'array',
            items: { type: 'string' },
            example: ['field should not be empty', 'field must be a string'],
          },
          error: { type: 'string', example: 'Bad Request' },
        },
      },
    }),
  );
};

// Декоратор для ошибок авторизации
export const ApiUnauthorizedResponse = () => {
  return applyDecorators(
    ApiResponse({
      status: 401,
      description: 'Не авторизован',
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

// Декоратор для ошибок доступа
export const ApiForbiddenResponse = () => {
  return applyDecorators(
    ApiResponse({
      status: 403,
      description: 'Доступ запрещен',
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

// Декоратор для ошибок "не найдено"
export const ApiNotFoundResponse = (resource = 'Ресурс') => {
  return applyDecorators(
    ApiResponse({
      status: 404,
      description: `${resource} не найден`,
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 404 },
          message: { type: 'string', example: `${resource} not found` },
        },
      },
    }),
  );
};

// Декоратор для серверных ошибок
export const ApiInternalServerErrorResponse = () => {
  return applyDecorators(
    ApiResponse({
      status: 500,
      description: 'Внутренняя ошибка сервера',
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

// Комбинированный декоратор для защищенных эндпоинтов
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

// Декоратор для публичных эндпоинтов
export const ApiPublicEndpoint = (summary: string, description?: string, tags?: string[]) => {
  const decorators = [
    ApiOperation({ summary, description, security: [] }), // Указываем что не требует аутентификации
    ApiValidationErrorResponse(),
    ApiInternalServerErrorResponse(),
  ];

  if (tags) {
    decorators.unshift(ApiTags(...tags));
  }

  return applyDecorators(...decorators);
};

// Декоратор для эндпоинтов с загрузкой файлов
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

// Декоратор для пагинации
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

// Декоратор для параметров пагинации
export const ApiPaginationParams = () => {
  return applyDecorators(
    ApiQuery({
      name: 'page',
      required: false,
      type: Number,
      description: 'Номер страницы',
      example: 1,
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description: 'Количество элементов на странице',
      example: 10,
    }),
  );
};

// Декоратор для параметров поиска
export const ApiSearchParams = () => {
  return applyDecorators(
    ApiQuery({
      name: 'search',
      required: false,
      type: String,
      description: 'Поисковый запрос',
      example: 'example search',
    }),
    ApiQuery({
      name: 'sort',
      required: false,
      type: String,
      description: 'Поле для сортировки',
      example: 'createdAt',
    }),
    ApiQuery({
      name: 'order',
      required: false,
      type: String,
      enum: ['asc', 'desc'],
      description: 'Направление сортировки',
      example: 'desc',
    }),
  );
};
