import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Global, Module } from '@nestjs/common';
import { PrismaClient } from 'generated/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      // Оптимизированное логирование
      log:
        process.env.NODE_ENV === 'production'
          ? ['error']
          : [
              { emit: 'event', level: 'query' },
              { emit: 'event', level: 'error' },
              { emit: 'event', level: 'info' },
              { emit: 'event', level: 'warn' },
            ],
      // Fix prepared statement conflicts
      errorFormat: 'pretty',
      transactionOptions: {
        maxWait: 5000, // 5 seconds
        timeout: 10000, // 10 seconds
      },
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to database');

      // Оптимизация настроек подключения
      await this.optimizeConnection();
    } catch (error) {
      this.logger.error('Prisma connection failed:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('Prisma disconnected from database');
    } catch (error) {
      this.logger.error('Prisma disconnection failed:', error);
    }
  }

  private async optimizeConnection() {
    try {
      // Clear any existing prepared statements to avoid conflicts
      await this.$executeRaw`DEALLOCATE ALL`;

      // Безопасная настройка параметров с обработкой ошибок
      const optimizations = [
        { sql: `SET statement_timeout = '30s'` },
        { sql: `SET lock_timeout = '10s'` },
        { sql: `SET idle_in_transaction_session_timeout = '60s'` },
        { sql: `SET random_page_cost = 1.1` },
        { sql: `SET seq_page_cost = 1.0` },
        { sql: `SET cpu_tuple_cost = 0.01` },
        { sql: `SET effective_cache_size = '256MB'` },
        { sql: `SET timezone = 'UTC'` },
        { sql: `SET plan_cache_mode = 'auto'` },
        { sql: `SET work_mem = '16MB'` },
        { sql: `SET maintenance_work_mem = '64MB'` },
      ];

      for (const opt of optimizations) {
        try {
          await this.$executeRawUnsafe(opt.sql);
          this.logger.debug(`Successfully executed: ${opt.sql}`);
        } catch (error: any) {
          // Проверяем, требует ли параметр перезапуска сервера
          if (error.message?.includes('cannot be changed without restarting the server')) {
            this.logger.debug(`Parameter requires server restart, skipping: ${opt.sql}`);
          } else {
            this.logger.debug(`Failed to execute ${opt.sql}: ${error.message}`);
          }
          // Продолжаем выполнение других настроек
        }
      }

      this.logger.debug('Database connection optimized');
    } catch (error) {
      this.logger.warn('Failed to optimize database connection:', error);
    }
  }

  // Handle prepared statement conflicts
  private async handlePreparedStatementConflict() {
    try {
      await this.$executeRaw`DEALLOCATE ALL`;
      this.logger.debug('Cleared all prepared statements');
    } catch (error) {
      this.logger.warn('Failed to clear prepared statements:', error);
    }
  }

  // Метод для выполнения запросов с автоматическим retry
  async executeWithRetry<T>(operation: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Handle prepared statement conflicts specifically
        if (
          error.message?.includes('prepared statement') &&
          error.message?.includes('already exists')
        ) {
          this.logger.warn(
            `Prepared statement conflict on attempt ${attempt}, clearing statements...`,
          );
          await this.handlePreparedStatementConflict();

          // Short delay before retry for prepared statement conflicts
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }

        if (attempt === maxRetries) {
          this.logger.error(`Operation failed after ${maxRetries} attempts:`, error);
          throw lastError;
        }

        // Экспоненциальная задержка
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        this.logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  // Wrapper for database operations with prepared statement conflict handling
  async safeQuery<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      if (
        error.message?.includes('prepared statement') &&
        error.message?.includes('already exists')
      ) {
        this.logger.warn('Prepared statement conflict detected, clearing and retrying...');
        await this.handlePreparedStatementConflict();
        // Retry the operation
        return await operation();
      }
      throw error;
    }
  }

  // Проверка здоровья соединения
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
