import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Core services
import { MessangerService } from './messanger.service';
import { MessangerController } from './messanger.controller';
import { MessangerRepository } from './messanger.repository';

// Real-time functionality
import { MessangerGateway } from './realtime/messanger.gateway';

// Optimizations
import { DatabaseOptimizer } from './optimizations/database-optimization';
import { MonitoringService } from './optimizations/monitoring.service';
import { ServiceOptimizer } from './optimizations/service-optimization';
import { WebSocketOptimizer } from './optimizations/websocket-optimization';

// Notifications
import { NotificationService } from './notifications/notification.service';

// External dependencies
import { PrismaService } from '../../libs/supabase/db/prisma.service';
import { PushNotificationService } from './notifications/push-notification.service';

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
    ScheduleModule.forRoot(),
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
    MessangerRepository,
    PrismaService,

    // Real-time
    MessangerGateway,

    // Optimizations
    DatabaseOptimizer,
    MonitoringService,
    ServiceOptimizer,
    WebSocketOptimizer,

    // Notifications
    NotificationService,
    PushNotificationService,
  ],
  exports: [
    MessangerService,
    MessangerRepository,
    DatabaseOptimizer,
    MonitoringService,
    NotificationService,
    PushNotificationService,
  ],
})
export class MessangerModule {}
