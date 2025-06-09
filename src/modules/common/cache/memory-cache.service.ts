// Высокопроизводительный кэш в памяти с TTL и сжатием
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as zlib from 'zlib';

interface CacheEntry<T> {
  data: T | null;
  compressed?: Buffer;
  size: number;
  hits: number;
  lastAccess: number;
  expires: number;
  isCompressed: boolean;
}

interface CacheStats {
  totalEntries: number;
  totalSize: number;
  compressedEntries: number;
  compressedSize: number;
  hitRate: number;
  memoryUsage: number;
}

@Injectable()
export class MemoryCacheService {
  private readonly logger = new Logger(MemoryCacheService.name);
  private readonly cache = new Map<string, CacheEntry<any>>();

  // Оптимизированные настройки
  private readonly MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB
  private readonly MAX_ENTRIES = 10000;
  private readonly DEFAULT_TTL = 300000; // 5 минут
  private readonly COMPRESSION_THRESHOLD = 1024; // 1KB
  private readonly CLEANUP_INTERVAL = 60000; // 1 минута

  // Статистика
  private totalHits = 0;
  private totalMisses = 0;
  private totalSize = 0;

  constructor() {
    // Автоматическая очистка каждые 5 минут
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);

    // Принудительная сборка мусора при достижении лимитов
    setInterval(() => this.forceGC(), 300000);
  }

  /**
   * Получение значения из кэша с автоматической декомпрессией
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      this.totalMisses++;
      return null;
    }

    // Проверка истечения TTL
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      this.totalSize -= entry.size;
      this.totalMisses++;
      return null;
    }

    // Обновляем статистику
    entry.hits++;
    entry.lastAccess = Date.now();
    this.totalHits++;

    // Возвращаем данные (декомпрессия если нужно)
    if (entry.isCompressed && entry.compressed) {
      try {
        const decompressed = zlib.gunzipSync(entry.compressed);
        return JSON.parse(decompressed.toString());
      } catch (error) {
        this.logger.error(`Decompression failed for key ${key}:`, error);
        this.cache.delete(key);
        return null;
      }
    }

    return entry.data;
  }

  /**
   * Сохранение значения в кэш с автоматическим сжатием
   */
  async set<T>(key: string, value: T, ttl: number = this.DEFAULT_TTL): Promise<boolean> {
    try {
      // Сериализация данных
      const serialized = JSON.stringify(value);
      const dataSize = Buffer.byteLength(serialized, 'utf8');

      let compressed: Buffer | undefined;
      let isCompressed = false;
      let finalSize = dataSize;

      // Сжимаем если данные больше порога
      if (dataSize > this.COMPRESSION_THRESHOLD) {
        try {
          compressed = zlib.gzipSync(serialized, { level: 1 }); // Быстрое сжатие
          if (compressed.length < dataSize * 0.8) {
            // Сжимаем только если экономия > 20%
            isCompressed = true;
            finalSize = compressed.length;
          }
        } catch (error) {
          this.logger.warn(`Compression failed for key ${key}:`, error);
        }
      }

      // Проверка лимитов
      if (!this.canStore(finalSize)) {
        await this.evictLRU(finalSize);
      }

      // Удаляем старую запись если существует
      const oldEntry = this.cache.get(key);
      if (oldEntry) {
        this.totalSize -= oldEntry.size;
      }

      // Создаем новую запись
      const entry: CacheEntry<T> = {
        data: isCompressed ? null : value,
        compressed: isCompressed ? compressed : undefined,
        size: finalSize,
        hits: 0,
        lastAccess: Date.now(),
        expires: Date.now() + ttl,
        isCompressed,
      };

      this.cache.set(key, entry);
      this.totalSize += finalSize;

      return true;
    } catch (error) {
      this.logger.error(`Failed to set cache key ${key}:`, error);
      return false;
    }
  }

  /**
   * Удаление записи из кэша
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.totalSize -= entry.size;
      return this.cache.delete(key);
    }
    return false;
  }

  /**
   * Очистка всего кэша
   */
  clear(): void {
    this.cache.clear();
    this.totalSize = 0;
    this.totalHits = 0;
    this.totalMisses = 0;
  }

  /**
   * Получение статистики кэша
   */
  getStats(): CacheStats {
    let compressedEntries = 0;
    let compressedSize = 0;

    for (const entry of this.cache.values()) {
      if (entry.isCompressed) {
        compressedEntries++;
        compressedSize += entry.size;
      }
    }

    const hitRate =
      this.totalHits + this.totalMisses > 0
        ? this.totalHits / (this.totalHits + this.totalMisses)
        : 0;

    return {
      totalEntries: this.cache.size,
      totalSize: this.totalSize,
      compressedEntries,
      compressedSize,
      hitRate,
      memoryUsage: process.memoryUsage().heapUsed,
    };
  }

  /**
   * Автоматическая очистка устаревших записей
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    let cleanedSize = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        keysToDelete.push(key);
        cleanedSize += entry.size;
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    this.totalSize -= cleanedSize;

    if (keysToDelete.length > 0) {
      this.logger.debug(
        `Cleaned up ${keysToDelete.length} expired entries, freed ${cleanedSize} bytes`,
      );
    }
  }

  /**
   * Проверка возможности сохранения
   */
  private canStore(size: number): boolean {
    return this.totalSize + size <= this.MAX_CACHE_SIZE && this.cache.size < this.MAX_ENTRIES;
  }

  /**
   * Eviction policy: LRU с учетом частоты использования
   */
  private async evictLRU(neededSize: number): Promise<void> {
    // Сортируем по алгоритму LFU + LRU
    const entries = Array.from(this.cache.entries()).sort((a, b) => {
      const scoreA = a[1].hits / Math.max(1, (Date.now() - a[1].lastAccess) / 60000);
      const scoreB = b[1].hits / Math.max(1, (Date.now() - b[1].lastAccess) / 60000);
      return scoreA - scoreB;
    });

    let freedSize = 0;
    const toDelete: string[] = [];

    for (const [key, entry] of entries) {
      toDelete.push(key);
      freedSize += entry.size;

      if (freedSize >= neededSize || this.cache.size - toDelete.length < this.MAX_ENTRIES * 0.8) {
        break;
      }
    }

    for (const key of toDelete) {
      this.cache.delete(key);
    }

    this.totalSize -= freedSize;
    this.logger.debug(`Evicted ${toDelete.length} entries, freed ${freedSize} bytes`);
  }

  /**
   * Принудительная сборка мусора
   */
  private forceGC(): void {
    if (global.gc && this.totalSize > this.MAX_CACHE_SIZE * 0.8) {
      const before = process.memoryUsage().heapUsed;
      global.gc();
      const after = process.memoryUsage().heapUsed;
      this.logger.debug(`GC freed ${before - after} bytes`);
    }
  }

  /**
   * Метод для предварительной загрузки данных
   */
  async preload<T>(key: string, loader: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await loader();
    await this.set(key, data, ttl);
    return data;
  }

  /**
   * Batch операции для множественных ключей
   */
  async mget<T>(keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();

    for (const key of keys) {
      const value = await this.get<T>(key);
      if (value !== null) {
        results.set(key, value);
      }
    }

    return results;
  }

  /**
   * Batch установка значений
   */
  async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<number> {
    let successCount = 0;

    for (const { key, value, ttl } of entries) {
      if (await this.set(key, value, ttl)) {
        successCount++;
      }
    }

    return successCount;
  }
}
