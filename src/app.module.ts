import { Module } from '@nestjs/common';

import { SupabaseModule } from './libs/supabase/supabase.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { MessangerModule } from './modules/messanger/messanger.module';
import { UsersModule } from './modules/users/users.module';
import { ForumModule } from './modules/forum/forum.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { MediaHostingModule } from './modules/media-hosting/media-hosting.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production' ? '.env' : '.env.development.local',
    }),
    AuthModule,
    MessangerModule,
    UsersModule,
    ForumModule,
    UploadsModule,
    MediaHostingModule,
    SupabaseModule,
  ],
})
export class AppModule {}
