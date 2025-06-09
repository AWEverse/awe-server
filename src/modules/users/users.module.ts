import { Module } from '@nestjs/common';
import { ProfileController } from './profile/profile.controller';
import { ProfileService } from './profile/profile.service';
import { SettingsController } from './settings/settings.controller';
import { SettingsService } from './settings/settings.service';

@Module({
  imports: [],
  controllers: [ProfileController, SettingsController],
  providers: [ProfileService, SettingsService],
  exports: [ProfileService, SettingsService],
})
export class UsersModule {}
