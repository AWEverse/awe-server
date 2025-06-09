import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { SupabaseModule } from './libs/supabase/supabase.module';
import { AuthModule } from './modules/auth/auth.module';
import { MessangerModule } from './modules/messanger/messanger.module';
import { UsersModule } from './modules/users/users.module';
import { ForumModule } from './modules/forum/forum.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { MediaHostingModule } from './modules/media-hosting/media-hosting.module';
import { CommonModule } from './modules/common/common.module';

// Performance optimizations
import { PerformanceInterceptor } from './modules/common/interceptors/performance.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production' ? '.env' : '.env.development.local',
      cache: true, // Кешируем конфигурацию для производительности
    }),
    CommonModule, // Должен быть первым для глобальных провайдеров
    AuthModule,
    MessangerModule,
    UsersModule,
    ForumModule,
    UploadsModule,
    MediaHostingModule,
    SupabaseModule,
  ],
  providers: [
    // Глобальные интерцепторы для оптимизации
    {
      provide: APP_INTERCEPTOR,
      useClass: PerformanceInterceptor,
    },
  ],
})
export class AppModule {}
