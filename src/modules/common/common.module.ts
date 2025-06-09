import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

// Services
import { MemoryOptimizationService } from './services/memory-optimization.service';
import { DatabaseOptimizationService } from './services/database-optimization.service';
import { OptimizedCacheService } from './cache/optimized-cache.service';

// Interceptors
import { PerformanceInterceptor } from './interceptors/performance.interceptor';
import { BigIntInterceptor } from './interceptors/bigint.interceptor';

@Global()
@Module({
  imports: [ConfigModule, ScheduleModule.forRoot()],
  providers: [
    // Optimization services
    MemoryOptimizationService,
    DatabaseOptimizationService,
    OptimizedCacheService,

    // Interceptors
    PerformanceInterceptor,
    BigIntInterceptor,
  ],
  exports: [
    MemoryOptimizationService,
    DatabaseOptimizationService,
    OptimizedCacheService,
    PerformanceInterceptor,
    BigIntInterceptor,
  ],
})
export class CommonModule {}
