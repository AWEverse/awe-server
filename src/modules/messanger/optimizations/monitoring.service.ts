// Система мониторинга и метрик для мессенджера
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../libs/db/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface PerformanceMetrics {
  timestamp: Date;
  responseTime: number;
  requestCount: number;
  errorCount: number;
  activeConnections: number;
  memoryUsage: number;
  cacheHitRate: number;
}

interface DatabaseMetrics {
  connectionCount: number;
  slowQueries: number;
  deadlocks: number;
  tablesSizes: Record<string, number>;
  indexUsage: Record<string, number>;
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private metrics: PerformanceMetrics[] = [];
  private readonly metricsRetentionDays = 7;
  private readonly performanceThresholds = {
    responseTime: 1000, // 1 секунда
    errorRate: 0.05, // 5%
    memoryUsage: 512 * 1024 * 1024, // 512MB
    connectionPoolUsage: 0.8, // 80%
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.setupMetricsCollection();
  }

  private setupMetricsCollection() {
    // Регистрируем обработчики событий для сбора метрик
    this.eventEmitter.on('message.sent', this.recordMessageEvent.bind(this));
    this.eventEmitter.on('websocket.connected', this.recordConnectionEvent.bind(this));
    this.eventEmitter.on('websocket.disconnected', this.recordDisconnectionEvent.bind(this));
    this.eventEmitter.on('cache.hit', this.recordCacheHit.bind(this));
    this.eventEmitter.on('cache.miss', this.recordCacheMiss.bind(this));
    this.eventEmitter.on('query.slow', this.recordSlowQuery.bind(this));
  }

  /**
   * Запись метрик производительности
   */
  recordPerformanceMetric(
    operation: string,
    startTime: Date,
    success: boolean,
    additionalData?: Record<string, any>,
  ) {
    const responseTime = Date.now() - startTime.getTime();

    // Логируем медленные операции
    if (responseTime > this.performanceThresholds.responseTime) {
      this.logger.warn(`Slow operation detected: ${operation} took ${responseTime}ms`, {
        operation,
        responseTime,
        additionalData,
      });
    }

    // Сохраняем метрику
    this.metrics.push({
      timestamp: new Date(),
      responseTime,
      requestCount: 1,
      errorCount: success ? 0 : 1,
      activeConnections: this.getCurrentConnectionCount(),
      memoryUsage: process.memoryUsage().heapUsed,
      cacheHitRate: this.calculateCurrentCacheHitRate(),
    });

    // Проверяем пороги
    this.checkThresholds();
  }

  /**
   * Получение метрик базы данных
   */
  async getDatabaseMetrics(): Promise<DatabaseMetrics> {
    try {
      // Количество активных подключений
      const connections = await this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*) as count FROM pg_stat_activity WHERE state = 'active'
      `;

      // Медленные запросы (требует pg_stat_statements)
      const slowQueries = await this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*) as count 
        FROM pg_stat_statements 
        WHERE mean_exec_time > 1000
      `;

      // Размеры таблиц
      const tableSizes = await this.prisma.$queryRaw<
        Array<{
          table_name: string;
          size_bytes: number;
        }>
      >`
        SELECT 
          schemaname||'.'||tablename as table_name,
          pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY size_bytes DESC
        LIMIT 10
      `;

      // Использование индексов
      const indexUsage = await this.prisma.$queryRaw<
        Array<{
          index_name: string;
          scans: number;
        }>
      >`
        SELECT 
          indexrelname as index_name,
          idx_scan as scans
        FROM pg_stat_user_indexes
        ORDER BY idx_scan DESC
        LIMIT 10
      `;

      return {
        connectionCount: connections[0]?.count || 0,
        slowQueries: slowQueries[0]?.count || 0,
        deadlocks: 0, // Можно добавить запрос для получения deadlocks
        tablesSizes: Object.fromEntries(tableSizes.map(t => [t.table_name, t.size_bytes])),
        indexUsage: Object.fromEntries(indexUsage.map(i => [i.index_name, i.scans])),
      };
    } catch (error) {
      this.logger.error('Failed to get database metrics:', error);
      return {
        connectionCount: 0,
        slowQueries: 0,
        deadlocks: 0,
        tablesSizes: {},
        indexUsage: {},
      };
    }
  }

  /**
   * Получение статистики мессенджера
   */ async getMessengerStatistics(period: 'hour' | 'day' | 'week' | 'month' = 'day') {
    const intervals = {
      hour: '1 hour',
      day: '1 day',
      week: '7 days',
      month: '30 days',
    };

    const interval = intervals[period];

    const stats = await this.prisma.$queryRaw`
      SELECT 
        COUNT(DISTINCT c.id) as total_chats,
        COUNT(DISTINCT CASE WHEN c."createdAt" >= NOW() - INTERVAL ${interval} THEN c.id END) as new_chats,
        COUNT(DISTINCT m.id) as total_messages,
        COUNT(DISTINCT CASE WHEN m."createdAt" >= NOW() - INTERVAL ${interval} THEN m.id END) as new_messages,
        COUNT(DISTINCT u.id) as total_users,
        COUNT(DISTINCT CASE WHEN u."lastSeen" >= NOW() - INTERVAL ${interval} THEN u.id END) as active_users,
        AVG(CASE WHEN c."createdAt" >= NOW() - INTERVAL ${interval} THEN c."memberCount" END) as avg_chat_size
      FROM "Chat" c
      LEFT JOIN "Message" m ON c.id = m."chatId" AND m."deletedAt" IS NULL
      LEFT JOIN "User" u ON TRUE
      WHERE c."deletedAt" IS NULL
    `;

    return (stats as any[])[0] || {};
  }

  /**
   * Проверка здоровья системы
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    checks: Record<string, boolean>;
    metrics: any;
  }> {
    const checks = {
      database: false,
      cache: false,
      websocket: false,
      performance: false,
    };

    try {
      // Проверка базы данных
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
    }

    try {
      // Проверка кэша (если доступен Redis)
      // await this.redis.ping();
      checks.cache = true; // Временно true
    } catch (error) {
      this.logger.error('Cache health check failed:', error);
    }

    // Проверка WebSocket соединений
    checks.websocket = this.getCurrentConnectionCount() >= 0;

    // Проверка производительности
    const recentMetrics = this.getRecentMetrics(5); // Последние 5 минут
    const avgResponseTime =
      recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length;
    checks.performance =
      !recentMetrics.length || avgResponseTime < this.performanceThresholds.responseTime;

    // Определение общего статуса
    const healthyCount = Object.values(checks).filter(Boolean).length;
    let status: 'healthy' | 'warning' | 'critical';

    if (healthyCount === Object.keys(checks).length) {
      status = 'healthy';
    } else if (healthyCount >= Object.keys(checks).length * 0.75) {
      status = 'warning';
    } else {
      status = 'critical';
    }

    return {
      status,
      checks,
      metrics: {
        averageResponseTime: avgResponseTime || 0,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
      },
    };
  }

  /**
   * Генерация отчета о производительности
   */
  async generatePerformanceReport(period: 'day' | 'week' | 'month' = 'day') {
    const now = new Date();
    const startDate = new Date();

    switch (period) {
      case 'day':
        startDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
    }

    const metrics = this.metrics.filter(m => m.timestamp >= startDate);
    const dbMetrics = await this.getDatabaseMetrics();
    const messengerStats = await this.getMessengerStatistics(period);

    const report = {
      period,
      startDate,
      endDate: now,
      summary: {
        totalRequests: metrics.reduce((sum, m) => sum + m.requestCount, 0),
        totalErrors: metrics.reduce((sum, m) => sum + m.errorCount, 0),
        averageResponseTime:
          metrics.reduce((sum, m) => sum + m.responseTime, 0) / metrics.length || 0,
        peakMemoryUsage: Math.max(...metrics.map(m => m.memoryUsage), 0),
        averageCacheHitRate:
          metrics.reduce((sum, m) => sum + m.cacheHitRate, 0) / metrics.length || 0,
      },
      database: dbMetrics,
      messenger: messengerStats,
      recommendations: this.generateRecommendations(metrics, dbMetrics),
    };

    this.logger.log(`Performance report generated for ${period}:`, report.summary);
    return report;
  }

  /**
   * Генерация рекомендаций по оптимизации
   */
  private generateRecommendations(
    metrics: PerformanceMetrics[],
    dbMetrics: DatabaseMetrics,
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.length === 0) {
      return ['Insufficient data for recommendations'];
    }

    const avgResponseTime = metrics.reduce((sum, m) => sum + m.responseTime, 0) / metrics.length;
    const errorRate =
      metrics.reduce((sum, m) => sum + m.errorCount, 0) /
      metrics.reduce((sum, m) => sum + m.requestCount, 0);
    const avgMemoryUsage = metrics.reduce((sum, m) => sum + m.memoryUsage, 0) / metrics.length;
    const avgCacheHitRate = metrics.reduce((sum, m) => sum + m.cacheHitRate, 0) / metrics.length;

    if (avgResponseTime > this.performanceThresholds.responseTime) {
      recommendations.push(
        `High response time detected (${avgResponseTime}ms). Consider optimizing database queries or adding caching.`,
      );
    }

    if (errorRate > this.performanceThresholds.errorRate) {
      recommendations.push(
        `High error rate detected (${(errorRate * 100).toFixed(2)}%). Review error logs and implement better error handling.`,
      );
    }

    if (avgMemoryUsage > this.performanceThresholds.memoryUsage) {
      recommendations.push(
        `High memory usage detected (${(avgMemoryUsage / 1024 / 1024).toFixed(2)}MB). Consider memory optimization and garbage collection tuning.`,
      );
    }

    if (avgCacheHitRate < 0.8) {
      recommendations.push(
        `Low cache hit rate (${(avgCacheHitRate * 100).toFixed(2)}%). Review caching strategy and TTL settings.`,
      );
    }

    if (dbMetrics.slowQueries > 10) {
      recommendations.push(
        `${dbMetrics.slowQueries} slow queries detected. Review and optimize database queries.`,
      );
    }

    if (dbMetrics.connectionCount > 50) {
      recommendations.push(
        `High database connection count (${dbMetrics.connectionCount}). Consider connection pooling optimization.`,
      );
    }

    return recommendations;
  }

  // Cron задачи для мониторинга
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupOldMetrics() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.metricsRetentionDays);

    this.metrics = this.metrics.filter(m => m.timestamp > cutoffDate);
    this.logger.debug(`Cleaned up metrics older than ${this.metricsRetentionDays} days`);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async logSystemStatus() {
    const health = await this.healthCheck();
    this.logger.log(`System health: ${health.status}`, health.metrics);

    if (health.status === 'critical') {
      // Отправка алертов
      this.eventEmitter.emit('system.critical', health);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateDailyReport() {
    const report = await this.generatePerformanceReport('day');
    this.logger.log('Daily performance report generated', report.summary);

    // Сохранение отчета или отправка администраторам
    this.eventEmitter.emit('report.daily', report);
  }

  // Вспомогательные методы
  private recordMessageEvent(data: any) {
    // Запись события отправки сообщения
    this.logger.debug('Message sent event recorded', data);
  }

  private recordConnectionEvent(data: any) {
    // Запись события подключения
    this.logger.debug('Connection event recorded', data);
  }

  private recordDisconnectionEvent(data: any) {
    // Запись события отключения
    this.logger.debug('Disconnection event recorded', data);
  }

  private recordCacheHit(data: any) {
    // Запись попадания в кэш
  }

  private recordCacheMiss(data: any) {
    // Запись промаха кэша
  }

  private recordSlowQuery(data: any) {
    this.logger.warn('Slow query detected', data);
  }

  private getCurrentConnectionCount(): number {
    // Возвращает текущее количество WebSocket подключений
    return 0; // Заглушка, нужна интеграция с WebSocket gateway
  }

  private calculateCurrentCacheHitRate(): number {
    // Вычисляет текущий cache hit rate
    return 0.85; // Заглушка
  }

  private getRecentMetrics(minutes: number): PerformanceMetrics[] {
    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - minutes);
    return this.metrics.filter(m => m.timestamp > cutoff);
  }

  private checkThresholds() {
    const recentMetrics = this.getRecentMetrics(5);
    if (recentMetrics.length === 0) return;

    const avgResponseTime =
      recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length;

    if (avgResponseTime > this.performanceThresholds.responseTime * 2) {
      this.eventEmitter.emit('alert.performance', {
        type: 'high_response_time',
        value: avgResponseTime,
        threshold: this.performanceThresholds.responseTime,
      });
    }
  }
}
