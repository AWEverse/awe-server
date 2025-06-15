import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../libs/db/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class DatabaseOptimizationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseOptimizationService.name);
  private connectionPool: Map<string, any> = new Map();
  private queryCache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 минут
  private readonly maxCacheSize = 1000; // Максимум 1000 кешированных запросов

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.optimizeDatabaseConnection();
    this.setupQueryOptimizations();
  }

  async onModuleDestroy() {
    await this.cleanup();
  }

  private async optimizeDatabaseConnection() {
    try {
      // Настройка оптимальных параметров подключения
      await this.prisma.$executeRaw`SET statement_timeout = '30s'`;
      await this.prisma.$executeRaw`SET lock_timeout = '10s'`;
      await this.prisma.$executeRaw`SET idle_in_transaction_session_timeout = '60s'`;

      // Оптимизация для частых запросов
      await this.prisma.$executeRaw`SET random_page_cost = 1.1`;
      await this.prisma.$executeRaw`SET effective_cache_size = '256MB'`;

      this.logger.log('Database connection optimized');
    } catch (error) {
      this.logger.error('Failed to optimize database connection:', error);
    }
  }

  private setupQueryOptimizations() {
    // Перехватываем запросы Prisma для кеширования
    const originalQuery = this.prisma.$queryRaw;
    this.prisma.$queryRaw = new Proxy(originalQuery, {
      apply: (target, thisArg, args) => {
        const queryKey = this.generateQueryKey(args);
        const cached = this.getCachedQuery(queryKey);

        if (cached) {
          this.logger.debug(`Cache hit for query: ${queryKey.substring(0, 50)}...`);
          return Promise.resolve(cached);
        }

        return target.apply(thisArg, args).then((result: any) => {
          this.setCachedQuery(queryKey, result);
          return result;
        });
      },
    });
  }

  private generateQueryKey(args: any[]): string {
    try {
      return JSON.stringify(args);
    } catch {
      return args.toString();
    }
  }

  private getCachedQuery(key: string): any | null {
    const cached = this.queryCache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.queryCache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setCachedQuery(key: string, data: any): void {
    // Ограничиваем размер кеша
    if (this.queryCache.size >= this.maxCacheSize) {
      const firstKey = this.queryCache.keys().next().value;
      this.queryCache.delete(firstKey);
    }

    this.queryCache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  private async cleanupExpiredCache() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, value] of this.queryCache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.queryCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned ${cleanedCount} expired cache entries`);
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  private async analyzeSlowQueries() {
    try {
      // Анализ медленных запросов
      const slowQueries = await this.prisma.$queryRaw`
        SELECT query, mean_exec_time, calls, total_exec_time
        FROM pg_stat_statements 
        WHERE mean_exec_time > 100 
        ORDER BY mean_exec_time DESC 
        LIMIT 10
      `;

      if (Array.isArray(slowQueries) && slowQueries.length > 0) {
        this.logger.warn(`Found ${slowQueries.length} slow queries`);
        slowQueries.forEach((query: any, index) => {
          this.logger.warn(
            `Slow query #${index + 1}: ${query.mean_exec_time}ms avg, ${query.calls} calls`,
          );
        });
      }
    } catch (error) {
      // pg_stat_statements может быть недоступен
      this.logger.debug('pg_stat_statements not available for slow query analysis');
    }
  }

  public async optimizeDatabase() {
    try {
      // Обновление статистики таблиц
      await this.prisma.$executeRaw`ANALYZE`;

      // Переиндексация критически важных таблиц
      const criticalTables = ['User', 'Message', 'Chat', 'ForumPost'];

      for (const table of criticalTables) {
        try {
          await this.prisma.$executeRaw`REINDEX TABLE ${table}`;
        } catch (error) {
          this.logger.warn(`Failed to reindex table ${table}:`, error);
        }
      }

      this.logger.log('Database optimization completed');
    } catch (error) {
      this.logger.error('Database optimization failed:', error);
    }
  }

  public clearQueryCache(): void {
    const size = this.queryCache.size;
    this.queryCache.clear();
    this.logger.log(`Cleared ${size} cached queries`);
  }

  public getCacheStats() {
    return {
      size: this.queryCache.size,
      maxSize: this.maxCacheSize,
      cacheTimeout: this.cacheTimeout,
    };
  }

  private async cleanup() {
    this.queryCache.clear();
    this.connectionPool.clear();
  }
}
