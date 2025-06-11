import { Injectable, CanActivate, ExecutionContext, RequestTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUTH_CONSTANTS } from '../constants/auth.constants';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, RateLimitEntry>();

  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const key = this.generateKey(request);
    const limit = this.getLimit(request);
    const windowMs = this.getWindow(request);

    const now = Date.now();
    const entry = this.attempts.get(key);

    if (!entry || now > entry.resetTime) {
      // Reset or create new entry
      this.attempts.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return true;
    }

    if (entry.count >= limit) {
      const resetTime = Math.ceil((entry.resetTime - now) / 1000);
      throw new RequestTimeoutException(`Too many requests. Try again in ${resetTime} seconds.`);
    }

    entry.count++;
    return true;
  }

  private generateKey(request: any): string {
    const ip = request.ip || request.connection.remoteAddress;
    const endpoint = request.route?.path || request.url;
    const userId = request.user?.id || 'anonymous';

    return `${ip}:${endpoint}:${userId}`;
  }

  private getLimit(request: any): number {
    const endpoint = request.route?.path || request.url;

    if (endpoint.includes('/auth/login')) {
      return AUTH_CONSTANTS.RATE_LIMIT.LOGIN_ATTEMPTS;
    }
    if (endpoint.includes('/auth/register')) {
      return AUTH_CONSTANTS.RATE_LIMIT.REGISTRATION_ATTEMPTS;
    }
    if (endpoint.includes('/auth/forgot-password') || endpoint.includes('/auth/reset-password')) {
      return AUTH_CONSTANTS.RATE_LIMIT.PASSWORD_RESET_ATTEMPTS;
    }

    return 100; // Default limit
  }

  private getWindow(request: any): number {
    const endpoint = request.route?.path || request.url;

    if (endpoint.includes('/auth/login')) {
      return AUTH_CONSTANTS.RATE_LIMIT.LOGIN_WINDOW_MINUTES * 60 * 1000;
    }
    if (endpoint.includes('/auth/register')) {
      return AUTH_CONSTANTS.RATE_LIMIT.REGISTRATION_WINDOW_MINUTES * 60 * 1000;
    }
    if (endpoint.includes('/auth/forgot-password') || endpoint.includes('/auth/reset-password')) {
      return AUTH_CONSTANTS.RATE_LIMIT.PASSWORD_RESET_WINDOW_MINUTES * 60 * 1000;
    }

    return 15 * 60 * 1000; // Default 15 minutes
  }

  // Cleanup method to remove expired entries
  public cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.attempts.entries()) {
      if (now > entry.resetTime) {
        this.attempts.delete(key);
      }
    }
  }
}
