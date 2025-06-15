import { Injectable, Logger } from '@nestjs/common';
import { WEBSOCKET_CONFIG } from './websocket.config';

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

@Injectable()
export class WebSocketRateLimiter {
  private readonly logger = new Logger(WebSocketRateLimiter.name);
  private readonly limits = new Map<string, Map<string, RateLimitInfo>>();

  constructor() {
    // Cleanup old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  checkLimit(userId: string, action: 'message' | 'reaction' | 'typing'): boolean {
    const limit = this.getLimitForAction(action);
    const key = `${userId}:${action}`;
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    if (!this.limits.has(userId)) {
      this.limits.set(userId, new Map());
    }

    const userLimits = this.limits.get(userId)!;
    const limitInfo = userLimits.get(action);

    if (!limitInfo || limitInfo.resetTime <= now) {
      // Reset or create new limit
      userLimits.set(action, {
        count: 1,
        resetTime: now + 60000, // Reset after 1 minute
      });
      return true;
    }

    if (limitInfo.count >= limit) {
      this.logger.warn(`Rate limit exceeded for user ${userId} action ${action}`);
      return false;
    }

    limitInfo.count++;
    return true;
  }

  private getLimitForAction(action: 'message' | 'reaction' | 'typing'): number {
    switch (action) {
      case 'message':
        return WEBSOCKET_CONFIG.MESSAGES_PER_MINUTE;
      case 'reaction':
        return WEBSOCKET_CONFIG.REACTIONS_PER_MINUTE;
      case 'typing':
        return WEBSOCKET_CONFIG.TYPING_EVENTS_PER_MINUTE;
      default:
        return 30; // Default limit
    }
  }

  private cleanup() {
    const now = Date.now();

    for (const [userId, userLimits] of this.limits.entries()) {
      for (const [action, limitInfo] of userLimits.entries()) {
        if (limitInfo.resetTime <= now) {
          userLimits.delete(action);
        }
      }

      if (userLimits.size === 0) {
        this.limits.delete(userId);
      }
    }
  }
}
