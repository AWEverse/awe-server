import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { SupabaseModule } from './libs/supabase/supabase.module';
import { PrismaModule } from './libs/db/prisma.service';
import { AuthModule } from './modules/auth/auth.module';
import { MessangerModule } from './modules/messanger/messanger.module';
import { UsersModule } from './modules/users/users.module';
import { ForumModule } from './modules/forum';
import { CommonModule } from './modules/common/common.module';
import { VideoHostingModule } from './modules/video-hosting/video-hosting.module';

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
    SupabaseModule,
    ScheduleModule.forRoot(),
    PrismaModule, // Global PrismaService
    CommonModule,
    AuthModule,
    MessangerModule,
    UsersModule,
    VideoHostingModule,
    ForumModule,
  ],
})
export class AppModule {}
