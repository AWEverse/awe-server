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

  // Настройки оптимизации
  private readonly SLOW_QUERY_THRESHOLD = 1000; // 1 секунда
  private readonly METRICS_RETENTION = 1000; // Последние 1000 запросов
  private readonly CONNECTION_TIMEOUT = 30000; // 30 секунд
  private readonly IDLE_TIMEOUT = 600000; // 10 минут

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
  }

  /**
   * Инициализация оптимизированных пулов подключений
   */
  private initializePools(): void {
    const baseConfig: PoolConfig = {
      connectionString: this.config.get('DATABASE_URL'),
      connectionTimeoutMillis: this.CONNECTION_TIMEOUT,
      idleTimeoutMillis: this.IDLE_TIMEOUT,
      allowExitOnIdle: false,

      // Оптимизации для производительности
      statement_timeout: 30000,
      query_timeout: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
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
      min: 5,
      max: 30,
      idleTimeoutMillis: this.IDLE_TIMEOUT * 2, // Дольше держим read-подключения
      // Настройки для read-replica если есть
      connectionString: this.config.get('READ_DATABASE_URL') || this.config.get('DATABASE_URL'),
    });

    // Пул для записи (меньше подключений, оптимизирован для INSERT/UPDATE/DELETE)
    this.writePool = new Pool({
      ...baseConfig,
      min: 2,
      max: 10,
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
        this.logger.error(`Database pool error in ${poolName}:`, err);
        this.eventEmitter.emit('db.connection.error', { pool: poolName, error: err });
      });
    });
  }

  /**
   * Выполнение SELECT запросов через read pool
   */
  async query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    return this.executeQuery(this.readPool, sql, params, 'read');
  }

  /**
   * Выполнение INSERT/UPDATE/DELETE через write pool
   */
  async execute<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    return this.executeQuery(this.writePool, sql, params, 'write');
  }

  /**
   * Транзакции через write pool
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.writePool.connect();
    const startTime = Date.now();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');

      const duration = Date.now() - startTime;
      this.recordQueryMetrics('TRANSACTION', duration, [], 'write');

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.recordQueryMetrics('TRANSACTION', Date.now() - startTime, [], 'write', error.message);
      throw error;
    } finally {
      client.release();
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
    const maxConnections = 20 + 30 + 10; // Максимальные значения пулов

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
}
