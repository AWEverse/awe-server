import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../../../libs/db/prisma.service';
import { MemoryOptimizationService } from '../services/memory-optimization.service';
import { OptimizedCacheService } from '../cache/optimized-cache.service';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  database: {
    status: 'connected' | 'disconnected';
    responseTime?: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  cache: {
    size: number;
    maxSize: number;
    hitRate: number;
  };
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memoryService: MemoryOptimizationService,
    private readonly cacheService: OptimizedCacheService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Check application health status' })
  @ApiResponse({ status: 200, description: 'Health status retrieved successfully' })
  async getHealth(): Promise<HealthStatus> {
    const startTime = Date.now();

    // Проверка базы данных
    const dbHealthy = await this.prisma.healthCheck();
    const dbResponseTime = Date.now() - startTime;

    // Статистика памяти
    const memoryStats = this.memoryService.getMemoryStats();

    // Статистика кеша
    const cacheStats = this.cacheService.getStats();

    // Определение общего статуса
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (!dbHealthy) {
      status = 'unhealthy';
    } else if (dbResponseTime > 1000 || memoryStats.heapUsed > 800) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      database: {
        status: dbHealthy ? 'connected' : 'disconnected',
        responseTime: dbResponseTime,
      },
      memory: memoryStats,
      cache: cacheStats,
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Check if application is ready to serve requests' })
  @ApiResponse({ status: 200, description: 'Application is ready' })
  @ApiResponse({ status: 503, description: 'Application is not ready' })
  async getReadiness() {
    const dbHealthy = await this.prisma.healthCheck();

    if (!dbHealthy) {
      throw new Error('Database not ready');
    }

    return { ready: true, timestamp: new Date().toISOString() };
  }

  @Get('live')
  @ApiOperation({ summary: 'Check if application is alive' })
  @ApiResponse({ status: 200, description: 'Application is alive' })
  async getLiveness() {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: process.uptime(),
    };
  }
}
