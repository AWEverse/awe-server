import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
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
    });

    // Настройка слушателей событий только для разработки
    if (process.env.NODE_ENV !== 'production') {
      this.$on('query', (e: any) => {
        if (parseInt(e.duration) > 1000) {
          // Логируем только медленные запросы
          this.logger.warn(`Slow query: ${e.query} - ${e.duration}ms`);
        }
      });

      this.$on('error', (e: any) => {
        this.logger.error('Prisma error:', e);
      });
    }
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
      // Настройка оптимальных параметров для PostgreSQL
      await this.$executeRaw`SET statement_timeout = '30s'`;
      await this.$executeRaw`SET lock_timeout = '10s'`;
      await this.$executeRaw`SET idle_in_transaction_session_timeout = '60s'`;

      // Оптимизация планировщика запросов
      await this.$executeRaw`SET random_page_cost = 1.1`;
      await this.$executeRaw`SET seq_page_cost = 1.0`;
      await this.$executeRaw`SET cpu_tuple_cost = 0.01`;
      await this.$executeRaw`SET effective_cache_size = '256MB'`;

      // Настройка для работы с BigInt
      await this.$executeRaw`SET timezone = 'UTC'`;

      this.logger.debug('Database connection optimized');
    } catch (error) {
      this.logger.warn('Failed to optimize database connection:', error);
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
