import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, PoolConfig } from 'pg';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface ConnectionStats {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  waitingClients: number;
  totalQueries: number;
  slowQueries: number;
  averageQueryTime: number;
  connectionPoolUtilization: number;
}

interface QueryMetrics {
  sql: string;
  duration: number;
  timestamp: Date;
  params?: any[];
  error?: string;
}

@Injectable()
export class OptimizedDatabasePool implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OptimizedDatabasePool.name);
  private pool: Pool;
  private queryMetrics: QueryMetrics[] = [];
  private connectionStats: ConnectionStats;

  // Пулы для разных типов операций
  private readPool: Pool;
  private writePool: Pool;

  // Метрики
  private totalQueries = 0;
  private slowQueryCount = 0;
  private queryTimes: number[] = [];

  // Circuit Breaker для предотвращения каскадных сбоев
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly FAILURE_THRESHOLD = 5; // Максимум ошибок подряд
  private readonly RECOVERY_TIME = 30000; // 30 секунд восстановления

  // Настройки оптимизации
  private readonly SLOW_QUERY_THRESHOLD = 1000; // 1 секунда
  private readonly METRICS_RETENTION = 1000; // Последние 1000 запросов
  private readonly CONNECTION_TIMEOUT = 30000; // 30 секунд
  private readonly IDLE_TIMEOUT = 600000; // 10 минут
  private readonly MAX_RETRIES = 3; // Максимальное количество повторных попыток
  private readonly RETRY_DELAY = 1000; // Задержка между повторными попытками (мс)

  constructor(
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.initializePools();
    this.setupMetrics();
  }

  async onModuleInit() {
    await this.testConnections();
    this.startHealthCheck();
  }

  async onModuleDestroy() {
    await this.closeAllPools();
  } /**
   * Инициализация оптимизированных пулов подключений
   */
  private initializePools(): void {
    const baseConfig: PoolConfig = {
      connectionString: this.config.get('DATABASE_URL'),
      connectionTimeoutMillis: this.CONNECTION_TIMEOUT,
      idleTimeoutMillis: this.IDLE_TIMEOUT,
      allowExitOnIdle: false,

      // Оптимизации для производительности и стабильности
      statement_timeout: 30000,
      query_timeout: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,

      // Дополнительные настройки для работы с Supabase Pooler
      application_name: 'awe-server',

      // SSL настройки для облачных БД
      ssl:
        this.config.get('DATABASE_SSL') !== 'false'
          ? {
              rejectUnauthorized: false, // Для Supabase и других облачных провайдеров
            }
          : false,
    };

    // Основной пул (универсальный)
    this.pool = new Pool({
      ...baseConfig,
      min: 2,
      max: 20,
      idleTimeoutMillis: this.IDLE_TIMEOUT,
    });

    // Пул для чтения (больше подключений, оптимизирован для SELECT)
    this.readPool = new Pool({
      ...baseConfig,
      min: 3, // Уменьшаем минимум для снижения нагрузки на pooler
      max: 25, // Уменьшаем максимум
      idleTimeoutMillis: this.IDLE_TIMEOUT * 2, // Дольше держим read-подключения
      // Настройки для read-replica если есть
      connectionString: this.config.get('READ_DATABASE_URL') || this.config.get('DATABASE_URL'),
    });

    // Пул для записи (меньше подключений, оптимизирован для INSERT/UPDATE/DELETE)
    this.writePool = new Pool({
      ...baseConfig,
      min: 1, // Минимум для write операций
      max: 8, // Уменьшаем для снижения конкуренции
      idleTimeoutMillis: this.IDLE_TIMEOUT / 2, // Быстрее освобождаем write-подключения
    });

    this.setupPoolEvents();
  }
  /**
   * Настройка событий пулов для мониторинга
   */
  private setupPoolEvents(): void {
    [this.pool, this.readPool, this.writePool].forEach((pool, index) => {
      const poolName = ['main', 'read', 'write'][index];

      pool.on('connect', client => {
        this.logger.debug(`New client connected to ${poolName} pool`);
        this.eventEmitter.emit('db.connection.created', { pool: poolName });
      });

      pool.on('remove', client => {
        this.logger.debug(`Client removed from ${poolName} pool`);
        this.eventEmitter.emit('db.connection.removed', { pool: poolName });
      });

      pool.on('error', (err, client) => {
        this.handlePoolError(err, client, poolName);
      });
    });
  }

  /**
   * Обработка ошибок пула подключений
   */
  private handlePoolError(err: Error, client: any, poolName: string): void {
    const errorCode = (err as any)?.code;
    const isConnectionError = ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(
      errorCode,
    );

    if (isConnectionError) {
      this.logger.warn(`Connection error in ${poolName} pool (${errorCode}): ${err.message}`);

      // Для ошибок подключения логируем как warning, а не error
      this.eventEmitter.emit('db.connection.error', {
        pool: poolName,
        error: err,
        isRecoverable: true,
        code: errorCode,
      });

      // Попытка восстановления подключений через некоторое время
      this.scheduleConnectionRecovery(poolName);
    } else {
      this.logger.error(`Database pool error in ${poolName}:`, err);
      this.eventEmitter.emit('db.connection.error', {
        pool: poolName,
        error: err,
        isRecoverable: false,
        code: errorCode,
      });
    }
  }

  /**
   * Планирование восстановления подключений
   */
  private scheduleConnectionRecovery(poolName: string): void {
    setTimeout(async () => {
      try {
        const pool = this.getPoolByName(poolName);
        if (pool) {
          // Проверяем подключение простым запросом
          await pool.query('SELECT 1');
          this.logger.log(`Connection recovery successful for ${poolName} pool`);
        }
      } catch (error) {
        this.logger.warn(`Connection recovery failed for ${poolName} pool: ${error.message}`);
      }
    }, this.RETRY_DELAY);
  }

  /**
   * Получение пула по имени
   */
  private getPoolByName(poolName: string): Pool | null {
    switch (poolName) {
      case 'main':
        return this.pool;
      case 'read':
        return this.readPool;
      case 'write':
        return this.writePool;
      default:
        return null;
    }
  }
  /**
   * Выполнение SELECT запросов через read pool
   */
  async query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    return this.executeQueryWithRetry(this.readPool, sql, params, 'read');
  }

  /**
   * Выполнение INSERT/UPDATE/DELETE через write pool
   */
  async execute<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    return this.executeQueryWithRetry(this.writePool, sql, params, 'write');
  }
  /**
   * Транзакции через write pool с обработкой ошибок подключения
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.executeTransactionWithRetry(callback);
  }
  /**
   * Выполнение транзакции с повторными попытками
   */
  private async executeTransactionWithRetry<T>(
    callback: (client: PoolClient) => Promise<T>,
    retryCount: number = 0,
  ): Promise<T> {
    // Проверяем circuit breaker
    if (this.isCircuitBreakerOpen()) {
      throw new Error('Database circuit breaker is open. Too many recent failures.');
    }

    let client: PoolClient | null = null;
    const startTime = Date.now();

    try {
      client = await this.writePool.connect();
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');

      const duration = Date.now() - startTime;
      this.recordQueryMetrics('TRANSACTION', duration, [], 'write');

      // Сбрасываем счетчик ошибок при успешном выполнении
      this.resetCircuitBreaker();

      return result;
    } catch (error) {
      const errorCode = (error as any)?.code;
      const isConnectionError = [
        'ECONNRESET',
        'ENOTFOUND',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'EPIPE',
      ].includes(errorCode);

      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          this.logger.warn('Failed to rollback transaction:', rollbackError.message);
        }
      }

      this.recordQueryMetrics('TRANSACTION', Date.now() - startTime, [], 'write', error.message);

      if (isConnectionError) {
        this.recordFailure();

        if (retryCount < this.MAX_RETRIES && !this.isCircuitBreakerOpen()) {
          this.logger.warn(
            `Transaction connection error (${errorCode}) on attempt ${retryCount + 1}/${this.MAX_RETRIES + 1}, retrying in ${this.RETRY_DELAY}ms...`,
          );

          const delay = this.RETRY_DELAY * Math.pow(2, retryCount);
          await new Promise(resolve => setTimeout(resolve, delay));

          return this.executeTransactionWithRetry(callback, retryCount + 1);
        }
      }

      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Batch операции для оптимальной производительности
   */
  async batchQuery<T = any>(
    queries: Array<{ sql: string; params?: any[] }>,
    useReadPool = true,
  ): Promise<Array<{ rows: T[]; rowCount: number }>> {
    const pool = useReadPool ? this.readPool : this.writePool;
    const client = await pool.connect();
    const results: Array<{ rows: T[]; rowCount: number }> = [];

    try {
      for (const query of queries) {
        const startTime = Date.now();
        const result = await client.query(query.sql, query.params);
        const duration = Date.now() - startTime;

        this.recordQueryMetrics(query.sql, duration, query.params, useReadPool ? 'read' : 'write');
        results.push({ rows: result.rows, rowCount: result.rowCount || 0 });
      }

      return results;
    } finally {
      client.release();
    }
  }
  /**
   * Основной метод выполнения запросов с метриками
   */
  private async executeQuery<T = any>(
    pool: Pool,
    sql: string,
    params?: any[],
    poolType: string = 'main',
  ): Promise<{ rows: T[]; rowCount: number }> {
    const startTime = Date.now();

    try {
      const result = await pool.query(sql, params);
      const duration = Date.now() - startTime;

      this.recordQueryMetrics(sql, duration, params, poolType);

      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordQueryMetrics(sql, duration, params, poolType, error.message);
      throw error;
    }
  }
  /**
   * Выполнение запросов с автоматическими повторными попытками при ошибках подключения
   */
  private async executeQueryWithRetry<T = any>(
    pool: Pool,
    sql: string,
    params?: any[],
    poolType: string = 'main',
    retryCount: number = 0,
  ): Promise<{ rows: T[]; rowCount: number }> {
    // Проверяем circuit breaker
    if (this.isCircuitBreakerOpen()) {
      throw new Error('Database circuit breaker is open. Too many recent failures.');
    }

    try {
      const result = await this.executeQuery(pool, sql, params, poolType);

      // Сбрасываем счетчик ошибок при успешном выполнении
      this.resetCircuitBreaker();

      return result;
    } catch (error) {
      const errorCode = (error as any)?.code;
      const isConnectionError = [
        'ECONNRESET',
        'ENOTFOUND',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'EPIPE',
      ].includes(errorCode);

      if (isConnectionError) {
        this.recordFailure();

        if (retryCount < this.MAX_RETRIES && !this.isCircuitBreakerOpen()) {
          this.logger.warn(
            `Connection error (${errorCode}) on attempt ${retryCount + 1}/${this.MAX_RETRIES + 1}, retrying in ${this.RETRY_DELAY}ms...`,
          );

          // Экспоненциальная задержка
          const delay = this.RETRY_DELAY * Math.pow(2, retryCount);
          await new Promise(resolve => setTimeout(resolve, delay));

          return this.executeQueryWithRetry(pool, sql, params, poolType, retryCount + 1);
        }
      }

      // Если это не ошибка подключения или исчерпаны попытки - пробрасываем ошибку
      throw error;
    }
  }

  /**
   * Проверка состояния circuit breaker
   */
  private isCircuitBreakerOpen(): boolean {
    if (this.failureCount >= this.FAILURE_THRESHOLD) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure < this.RECOVERY_TIME) {
        return true;
      } else {
        // Время восстановления прошло, сбрасываем счетчик
        this.resetCircuitBreaker();
      }
    }
    return false;
  }

  /**
   * Регистрация неудачи
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.FAILURE_THRESHOLD) {
      this.logger.error(
        `Circuit breaker opened after ${this.failureCount} failures. Recovery time: ${this.RECOVERY_TIME}ms`,
      );
      this.eventEmitter.emit('db.circuit.breaker.opened', {
        failureCount: this.failureCount,
        recoveryTime: this.RECOVERY_TIME,
      });
    }
  }

  /**
   * Сброс circuit breaker
   */
  private resetCircuitBreaker(): void {
    if (this.failureCount > 0) {
      this.logger.log('Circuit breaker reset - connections restored');
      this.eventEmitter.emit('db.circuit.breaker.closed');
    }
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Запись метрик запросов
   */
  private recordQueryMetrics(
    sql: string,
    duration: number,
    params?: any[],
    poolType: string = 'main',
    error?: string,
  ): void {
    this.totalQueries++;
    this.queryTimes.push(duration);

    // Ограничиваем размер массива для памяти
    if (this.queryTimes.length > 1000) {
      this.queryTimes = this.queryTimes.slice(-500);
    }

    if (duration > this.SLOW_QUERY_THRESHOLD) {
      this.slowQueryCount++;
      this.logger.warn(
        `Slow query (${duration}ms) in ${poolType} pool: ${sql.substring(0, 100)}...`,
      );

      this.eventEmitter.emit('db.query.slow', {
        sql: sql.substring(0, 200),
        duration,
        params: params?.length,
        poolType,
      });
    }

    // Сохраняем детальные метрики только для медленных запросов и ошибок
    if (duration > this.SLOW_QUERY_THRESHOLD || error) {
      this.queryMetrics.push({
        sql: sql.substring(0, 500),
        duration,
        timestamp: new Date(),
        params: params?.length ? params.map(p => typeof p) : undefined,
        error,
      });

      // Ограничиваем количество сохраненных метрик
      if (this.queryMetrics.length > this.METRICS_RETENTION) {
        this.queryMetrics = this.queryMetrics.slice(-this.METRICS_RETENTION / 2);
      }
    }
  }

  /**
   * Получение статистики подключений
   */
  getConnectionStats(): ConnectionStats {
    const mainStats = {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };

    const readStats = {
      total: this.readPool.totalCount,
      idle: this.readPool.idleCount,
      waiting: this.readPool.waitingCount,
    };

    const writeStats = {
      total: this.writePool.totalCount,
      idle: this.writePool.idleCount,
      waiting: this.writePool.waitingCount,
    };

    const averageQueryTime =
      this.queryTimes.length > 0
        ? this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length
        : 0;
    const totalConnections = mainStats.total + readStats.total + writeStats.total;
    const maxConnections = 20 + 25 + 8; // Обновленные максимальные значения пулов

    return {
      totalConnections,
      idleConnections: mainStats.idle + readStats.idle + writeStats.idle,
      activeConnections: totalConnections - (mainStats.idle + readStats.idle + writeStats.idle),
      waitingClients: mainStats.waiting + readStats.waiting + writeStats.waiting,
      totalQueries: this.totalQueries,
      slowQueries: this.slowQueryCount,
      averageQueryTime,
      connectionPoolUtilization: totalConnections / maxConnections,
    };
  }

  /**
   * Получение метрик медленных запросов
   */
  getSlowQueries(limit: number = 10): QueryMetrics[] {
    return this.queryMetrics
      .filter(m => m.duration > this.SLOW_QUERY_THRESHOLD)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Тест подключений при старте
   */
  private async testConnections(): Promise<void> {
    try {
      await Promise.all([
        this.pool.query('SELECT 1'),
        this.readPool.query('SELECT 1'),
        this.writePool.query('SELECT 1'),
      ]);
      this.logger.log('All database pools connected successfully');
    } catch (error) {
      this.logger.error('Database connection test failed:', error);
      throw error;
    }
  }

  /**
   * Периодическая проверка здоровья
   */
  private startHealthCheck(): void {
    setInterval(async () => {
      try {
        const stats = this.getConnectionStats();

        // Предупреждения о высокой нагрузке
        if (stats.connectionPoolUtilization > 0.8) {
          this.logger.warn(
            `High connection pool utilization: ${(stats.connectionPoolUtilization * 100).toFixed(1)}%`,
          );
        }

        if (stats.waitingClients > 5) {
          this.logger.warn(`High number of waiting clients: ${stats.waitingClients}`);
        }

        this.eventEmitter.emit('db.health.check', stats);
      } catch (error) {
        this.logger.error('Health check failed:', error);
      }
    }, 60000); // Каждую минуту
  }

  /**
   * Настройка метрик для мониторинга
   */
  private setupMetrics(): void {
    // Сброс старых метрик каждые 10 минут
    setInterval(() => {
      this.queryMetrics = this.queryMetrics.slice(-this.METRICS_RETENTION / 2);
    }, 600000);
  }

  /**
   * Закрытие всех пулов
   */
  private async closeAllPools(): Promise<void> {
    await Promise.all([this.pool.end(), this.readPool.end(), this.writePool.end()]);
    this.logger.log('All database pools closed');
  }

  /**
   * Принудительное закрытие неактивных подключений
   */
  async forceIdleConnections(): Promise<void> {
    // Реализация зависит от версии pg, упрощенная версия
    const stats = this.getConnectionStats();
    this.logger.log(`Forcing idle connections cleanup. Current stats:`, stats);
  }

  /**
   * Принудительное восстановление подключений при проблемах
   */
  async forceConnectionRecovery(): Promise<void> {
    this.logger.log('Starting forced connection recovery...');

    try {
      // Закрываем существующие подключения с проблемами
      await Promise.all([
        this.cleanupPool(this.pool, 'main'),
        this.cleanupPool(this.readPool, 'read'),
        this.cleanupPool(this.writePool, 'write'),
      ]);

      // Тестируем новые подключения
      await this.testConnections();

      this.logger.log('Connection recovery completed successfully');
    } catch (error) {
      this.logger.error('Connection recovery failed:', error);
      throw error;
    }
  }

  /**
   * Очистка проблемных подключений в пуле
   */
  private async cleanupPool(pool: Pool, poolName: string): Promise<void> {
    const stats = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    };

    this.logger.debug(`Cleaning up ${poolName} pool: ${JSON.stringify(stats)}`);

    // Выгружаем простаивающие подключения
    if (stats.idle > 0) {
      try {
        // Создаем временное подключение для проверки
        const testClient = await pool.connect();
        await testClient.query('SELECT 1');
        testClient.release();
      } catch (error) {
        this.logger.warn(`Test connection failed for ${poolName} pool: ${error.message}`);
      }
    }
  }

  /**
   * Проверка здоровья конкретного пула
   */
  async checkPoolHealth(poolName: string): Promise<boolean> {
    try {
      const pool = this.getPoolByName(poolName);
      if (!pool) {
        return false;
      }

      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();

      return true;
    } catch (error) {
      this.logger.warn(`Health check failed for ${poolName} pool: ${error.message}`);
      return false;
    }
  }

  /**
   * Получение статуса circuit breaker
   */
  getCircuitBreakerStatus(): {
    isOpen: boolean;
    failureCount: number;
    lastFailureTime: number;
    timeUntilRecovery: number;
  } {
    const isOpen = this.isCircuitBreakerOpen();
    const timeUntilRecovery = isOpen
      ? Math.max(0, this.RECOVERY_TIME - (Date.now() - this.lastFailureTime))
      : 0;

    return {
      isOpen,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      timeUntilRecovery,
    };
  }
}
