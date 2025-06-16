import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Services
import { MemoryOptimizationService } from './services/memory-optimization.service';
import { DatabaseOptimizationService } from './services/database-optimization.service';
import { OptimizedCacheService } from './cache/optimized-cache.service';

// Interceptors
import { PerformanceInterceptor } from './interceptors/performance.interceptor';
import { BigIntInterceptor } from './interceptors/bigint.interceptor';

// Guards
import { WsJwtGuard } from './guards/WsJwtGuard.guard';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    MemoryOptimizationService,
    DatabaseOptimizationService,
    OptimizedCacheService,
    PerformanceInterceptor,
    BigIntInterceptor,
    WsJwtGuard,
  ],
  exports: [
    MemoryOptimizationService,
    DatabaseOptimizationService,
    OptimizedCacheService,
    PerformanceInterceptor,
    BigIntInterceptor,
    WsJwtGuard,
  ],
})
export class CommonModule {}
