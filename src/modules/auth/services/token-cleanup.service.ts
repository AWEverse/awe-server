import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from '../auth.service';

@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);

  constructor(private readonly authService: AuthService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredTokens() {
    this.logger.log('Starting scheduled cleanup of expired refresh tokens');
    try {
      await this.authService.cleanupExpiredTokens();
      this.logger.log('Completed scheduled cleanup of expired refresh tokens');
    } catch (error) {
      this.logger.error('Failed to cleanup expired tokens:', error.message);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async dailyTokenMaintenance() {
    this.logger.log('Starting daily token maintenance');
    try {
      // Clean up old blacklisted tokens
      await this.authService.cleanupExpiredTokens();

      // Log token statistics
      // TODO: Implement token usage statistics

      this.logger.log('Completed daily token maintenance');
    } catch (error) {
      this.logger.error('Failed daily token maintenance:', error.message);
    }
  }
}
