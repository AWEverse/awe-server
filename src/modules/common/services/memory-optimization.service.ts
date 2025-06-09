import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class MemoryOptimizationService implements OnModuleInit {
  private readonly logger = new Logger(MemoryOptimizationService.name);
  private readonly memoryThresholdMB = 800; // 800MB порог

  onModuleInit() {
    this.logMemoryUsage();
    this.setupMemoryWarnings();
  }

  private setupMemoryWarnings() {
    // Предупреждения о высоком использовании памяти
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;

      if (heapUsedMB > this.memoryThresholdMB) {
        this.logger.warn(`High memory usage detected: ${heapUsedMB.toFixed(2)}MB`);
        this.suggestGarbageCollection();
      }
    }, 30000); // Каждые 30 секунд
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  private async performMemoryCleanup() {
    try {
      // Принудительная сборка мусора если доступна
      if (global.gc) {
        const beforeMemory = process.memoryUsage().heapUsed;
        global.gc();
        const afterMemory = process.memoryUsage().heapUsed;
        const freedMB = (beforeMemory - afterMemory) / 1024 / 1024;

        if (freedMB > 10) {
          // Логируем только значительные очистки
          this.logger.debug(`Garbage collection freed ${freedMB.toFixed(2)}MB`);
        }
      }

      // Очистка неиспользуемых буферов
      if (Buffer.poolSize > 8192) {
        Buffer.allocUnsafeSlow(0); // Принудительно освобождает пул буферов
      }
    } catch (error) {
      this.logger.error('Error during memory cleanup:', error);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  private logMemoryUsage() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
    const externalMB = (memUsage.external / 1024 / 1024).toFixed(2);

    // Логируем только в режиме разработки или при высоком использовании
    if (process.env.NODE_ENV !== 'production' || parseFloat(heapUsedMB) > this.memoryThresholdMB) {
      this.logger.debug(`Memory: Heap ${heapUsedMB}/${heapTotalMB}MB, External: ${externalMB}MB`);
    }
  }

  private suggestGarbageCollection() {
    if (global.gc) {
      global.gc();
    } else {
      this.logger.warn(
        'Garbage collection not available. Run with --expose-gc flag for better memory management.',
      );
    }
  }

  // Метод для принудительной очистки памяти
  public forceMemoryCleanup(): void {
    this.performMemoryCleanup();
  }

  // Получение статистики памяти
  public getMemoryStats() {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
    };
  }
}
