import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Services
import { MemoryOptimizationService } from './services/memory-optimization.service';
import { DatabaseOptimizationService } from './services/database-optimization.service';
import { OptimizedCacheService } from './cache/optimized-cache.service';

// Interceptors
import { PerformanceInterceptor } from './interceptors/performance.interceptor';
import { BigIntInterceptor } from './interceptors/bigint.interceptor';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    MemoryOptimizationService,
    DatabaseOptimizationService,
    OptimizedCacheService,
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
