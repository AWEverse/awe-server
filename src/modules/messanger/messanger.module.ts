import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Core services
import { MessangerService } from './messanger.service';
import { MessangerController } from './messanger.controller';

// Real-time functionality
import { MessangerGateway } from './realtime/messanger.gateway';
import { WebSocketRateLimiter } from './realtime/websocket-rate-limiter.service';
import { WebSocketMonitor } from './realtime/websocket-monitor.service';

// Optimizations
import { DatabaseOptimizer } from './optimizations/database-optimization';
import { MonitoringService } from './optimizations/monitoring.service';
import { ServiceOptimizer } from './optimizations/service-optimization';
import { WebSocketOptimizer } from './optimizations/websocket-optimization';

// Notifications
import { NotificationService } from './notifications/notification.service';

// External dependencies
import { PushNotificationService } from './notifications/push-notification.service';
import { MemoryCacheService } from '../common/cache/memory-cache.service';
import { OptimizedDatabasePool } from '../common/database/optimized-pool.service';

@Module({
  imports: [
    ConfigModule,
    EventEmitterModule.forRoot({
      // Оптимизация для EventEmitter - минимальная конфигурация для производительности
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 20, // Уменьшено для экономии памяти
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: 'message-processing' },
      { name: 'notification-queue' },
      { name: 'chat-analytics' },
    ),
  ],
  controllers: [MessangerController],
  providers: [
    // Core services
    MessangerService,

    // Real-time
    MessangerGateway,
    WebSocketRateLimiter,
    WebSocketMonitor,

    // Optimizations
    DatabaseOptimizer,
    MonitoringService,
    ServiceOptimizer,
    WebSocketOptimizer,
    MemoryCacheService,
    OptimizedDatabasePool,

    // Notifications
    NotificationService,
    PushNotificationService,
  ],
  exports: [
    MessangerService,
    DatabaseOptimizer,
    MonitoringService,
    MemoryCacheService,
    OptimizedDatabasePool,
    NotificationService,
    PushNotificationService,
  ],
})
export class MessangerModule {}
