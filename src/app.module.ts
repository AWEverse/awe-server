import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { SupabaseModule } from './libs/supabase/supabase.module';
import { PrismaModule } from './libs/supabase/db/prisma.service';
import { AuthModule } from './modules/auth/auth.module';
import { MessangerModule } from './modules/messanger/messanger.module';
import { UsersModule } from './modules/users/users.module';
import { ForumModule } from './modules/forum/forum.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { MediaHostingModule } from './modules/media-hosting/media-hosting.module';
import { CommonModule } from './modules/common/common.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV}.local`,
        `.env.${process.env.NODE_ENV}`,
        '.env.local',
        '.env',
      ],
      cache: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule, // Global PrismaService
    CommonModule,
    AuthModule,
    MessangerModule,
    UsersModule,
    // ForumModule, // Uncomment if you want to enable forum module
    UploadsModule,
    MediaHostingModule,
    SupabaseModule,
  ],
})
export class AppModule {}
