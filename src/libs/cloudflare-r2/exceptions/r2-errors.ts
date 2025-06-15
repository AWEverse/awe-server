/**
 * Иерархические классы ошибок для работы с R2 хранилищем
 * Обеспечивают типобезопасную и структурированную обработку ошибок
 */

export abstract class R2Error extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(
    message: string,
    public readonly context?: Record<string, any>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      context: this.context,
    };
  }
}

export class R2ValidationError extends R2Error {
  readonly code = 'R2_VALIDATION_ERROR';
  readonly statusCode = 400;
}

export class R2FileNotFoundError extends R2Error {
  readonly code = 'R2_FILE_NOT_FOUND';
  readonly statusCode = 404;
}

export class R2FileTooLargeError extends R2Error {
  readonly code = 'R2_FILE_TOO_LARGE';
  readonly statusCode = 413;
}

export class R2UnsupportedFileTypeError extends R2Error {
  readonly code = 'R2_UNSUPPORTED_FILE_TYPE';
  readonly statusCode = 415;
}

export class R2StorageError extends R2Error {
  readonly code = 'R2_STORAGE_ERROR';
  readonly statusCode = 500;
}

export class R2ConfigurationError extends R2Error {
  readonly code = 'R2_CONFIGURATION_ERROR';
  readonly statusCode = 500;
}

export class R2NetworkError extends R2Error {
  readonly code = 'R2_NETWORK_ERROR';
  readonly statusCode = 503;
}

export class R2QuotaExceededError extends R2Error {
  readonly code = 'R2_QUOTA_EXCEEDED';
  readonly statusCode = 429;
}

export class R2SecurityError extends R2Error {
  readonly code = 'R2_SECURITY_ERROR';
  readonly statusCode = 403;
}

export class R2DuplicateFileError extends R2Error {
  readonly code = 'R2_DUPLICATE_FILE';
  readonly statusCode = 409;
}

/**
 * Ошибка операций обслуживания
 */
export class R2MaintenanceError extends R2Error {
  readonly code = 'R2_MAINTENANCE_ERROR';
  readonly statusCode = 500;
}

/**
 * Утилиты для работы с ошибками R2
 */
export class R2ErrorUtils {
  /**
   * Преобразует AWS SDK ошибки в R2 ошибки
   */
  static fromAwsError(error: any, context?: Record<string, any>): R2Error {
    const message = error.message || 'Unknown AWS error';

    switch (error.name || error.code) {
      case 'NoSuchKey':
      case 'NotFound':
        return new R2FileNotFoundError(message, context);

      case 'EntityTooLarge':
      case 'MaxMessageLengthExceeded':
        return new R2FileTooLargeError(message, context);

      case 'InvalidRequest':
      case 'MalformedXML':
        return new R2ValidationError(message, context);

      case 'RequestTimeout':
      case 'ServiceUnavailable':
        return new R2NetworkError(message, context);

      case 'AccessDenied':
      case 'Forbidden':
        return new R2SecurityError(message, context);

      case 'ThrottlingException':
      case 'TooManyRequests':
        return new R2QuotaExceededError(message, context);

      default:
        return new R2StorageError(message, { ...context, originalError: error });
    }
  }

  /**
   * Проверяет, является ли ошибка R2 ошибкой
   */
  static isR2Error(error: any): error is R2Error {
    return error instanceof R2Error;
  }

  /**
   * Проверяет, является ли ошибка восстанавливаемой
   */
  static isRetryable(error: R2Error): boolean {
    return error instanceof R2NetworkError || error instanceof R2QuotaExceededError;
  }

  /**
   * Получает безопасное сообщение об ошибке для пользователя
   */
  static getSafeMessage(error: R2Error): string {
    switch (error.constructor) {
      case R2ValidationError:
        return error.message;
      case R2FileNotFoundError:
        return 'Файл не найден';
      case R2FileTooLargeError:
        return 'Файл слишком большой';
      case R2UnsupportedFileTypeError:
        return 'Неподдерживаемый тип файла';
      case R2SecurityError:
        return 'Недостаточно прав доступа';
      case R2QuotaExceededError:
        return 'Превышено ограничение на количество запросов';
      case R2DuplicateFileError:
        return 'Файл уже существует';
      default:
        return 'Ошибка хранилища файлов';
    }
  }
}
