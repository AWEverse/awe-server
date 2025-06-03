import { Module } from '@nestjs/common';
import { PrismaService } from '../../libs/supabase/db/prisma.service';
import { ProfileController } from './profile/profile.controller';
import { ProfileService } from './profile/profile.service';
import { SettingsController } from './settings/settings.controller';
import { SettingsService } from './settings/settings.service';

@Module({
  imports: [],
  controllers: [ProfileController, SettingsController],
  providers: [ProfileService, SettingsService, PrismaService],
  exports: [ProfileService, SettingsService],
})
export class UsersModule {}
