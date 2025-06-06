import { UseGuards, Request, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../auth/guards/optional-auth.guard';
import { ModeratorGuard } from '../../auth/guards/moderator.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';

/**
 * Base controller class providing common functionality for forum controllers
 */
export abstract class BaseForumController {
  /**
   * Extract user ID from request object
   */
  protected getUserId(req: any): string {
    return req.user?.id || req.user?.sub;
  }

  /**
   * Extract optional user ID from request object
   */
  protected getOptionalUserId(req?: any): string | undefined {
    return req?.user?.id || req?.user?.sub;
  }
}

/**
 * Decorator for authenticated endpoints
 */
export const AuthenticatedEndpoint = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard),
    ApiBearerAuth(),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
  );

/**
 * Decorator for endpoints with optional authentication
 */
export const OptionalAuthEndpoint = () => applyDecorators(UseGuards(OptionalAuthGuard));

/**
 * Decorator for moderator-only endpoints
 */
export const ModeratorEndpoint = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, ModeratorGuard),
    ApiBearerAuth(),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
    ApiResponse({ status: 403, description: 'Forbidden - moderator access required' }),
  );

/**
 * Decorator for admin-only endpoints
 */
export const AdminEndpoint = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, AdminGuard),
    ApiBearerAuth(),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
    ApiResponse({ status: 403, description: 'Forbidden - admin access required' }),
  );

/**
 * Standard error responses
 */
export const StandardErrorResponses = () =>
  applyDecorators(
    ApiResponse({ status: 400, description: 'Bad request' }),
    ApiResponse({ status: 404, description: 'Not found' }),
    ApiResponse({ status: 500, description: 'Internal server error' }),
  );

/**
 * Pagination query parameters
 */
export interface PaginationQuery {
  page?: number;
  limit?: number;
}

/**
 * Standard pagination response
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
