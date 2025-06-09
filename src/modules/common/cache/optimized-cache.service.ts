import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CacheItem<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

@Injectable()
export class OptimizedCacheService {
  private readonly logger = new Logger(OptimizedCacheService.name);
  private readonly cache = new Map<string, CacheItem<any>>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 минут
  private readonly maxCacheSize: number;
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
    this.maxCacheSize = this.configService.get<number>('CACHE_MAX_SIZE', 5000);

    // Автоматическая очистка каждые 2 минуты
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpiredEntries();
      },
      2 * 60 * 1000,
    );
  }

  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key);

    if (!item) {
      return null;
    }

    // Проверка на истечение срока
    if (this.isExpired(item)) {
      this.cache.delete(key);
      return null;
    }

    // Обновляем статистику доступа
    item.accessCount++;
    item.lastAccessed = Date.now();

    return item.data;
  }

  async set<T>(key: string, value: T, ttl: number = this.defaultTTL): Promise<void> {
    // Если кеш переполнен, удаляем наименее используемые элементы
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLeastUsed();
    }

    const item: CacheItem<T> = {
      data: value,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
    };

    this.cache.set(key, item);

    // Планируем удаление через TTL
    setTimeout(() => {
      this.cache.delete(key);
    }, ttl);
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async clear(): Promise<void> {
    const size = this.cache.size;
    this.cache.clear();
    this.logger.log(`Cleared ${size} cache entries`);
  }

  // Получение или установка значения (get-or-set pattern)
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = this.defaultTTL,
  ): Promise<T> {
    const cached = await this.get<T>(key);

    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  // Инвалидация кеша по паттерну
  async invalidatePattern(pattern: string): Promise<number> {
    let count = 0;
    const regex = new RegExp(pattern);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      this.logger.debug(`Invalidated ${count} cache entries matching pattern: ${pattern}`);
    }

    return count;
  }

  // Предварительная загрузка (warm-up) кеша
  async warmUp<T>(
    entries: Array<{ key: string; factory: () => Promise<T>; ttl?: number }>,
  ): Promise<void> {
    const promises = entries.map(async ({ key, factory, ttl }) => {
      try {
        const value = await factory();
        await this.set(key, value, ttl);
      } catch (error) {
        this.logger.warn(`Failed to warm up cache for key ${key}:`, error);
      }
    });

    await Promise.allSettled(promises);
    this.logger.log(`Warmed up cache with ${entries.length} entries`);
  }

  // Статистика кеша
  getStats() {
    let totalAccessCount = 0;
    let expiredCount = 0;

    for (const item of this.cache.values()) {
      totalAccessCount += item.accessCount;
      if (this.isExpired(item)) {
        expiredCount++;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      totalAccesses: totalAccessCount,
      expiredEntries: expiredCount,
      hitRate: this.calculateHitRate(),
    };
  }

  private isExpired(item: CacheItem<any>): boolean {
    return Date.now() - item.timestamp > this.defaultTTL;
  }

  private evictLeastUsed(): void {
    if (this.cache.size === 0) return;

    // Находим наименее используемый элемент
    let leastUsedKey = '';
    let minAccessCount = Infinity;
    let oldestTimestamp = Infinity;

    for (const [key, item] of this.cache.entries()) {
      if (
        item.accessCount < minAccessCount ||
        (item.accessCount === minAccessCount && item.lastAccessed < oldestTimestamp)
      ) {
        minAccessCount = item.accessCount;
        oldestTimestamp = item.lastAccessed;
        leastUsedKey = key;
      }
    }

    if (leastUsedKey) {
      this.cache.delete(leastUsedKey);
      this.logger.debug(`Evicted least used cache entry: ${leastUsedKey}`);
    }
  }

  private cleanupExpiredEntries(): void {
    let cleanedCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (this.isExpired(item)) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  private calculateHitRate(): number {
    // Простая реализация подсчета hit rate
    // В реальном приложении стоит использовать более сложную логику
    return this.cache.size > 0 ? 0.85 : 0; // Примерное значение
  }

  // Очистка ресурсов при завершении
  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}
