/**
 * Модуль Cloudflare R2 хранилища
 * Рефакторинг: улучшенная архитектура, разделение ответственностей
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { R2ClientService } from './client/r2-client.service';
import { R2ConfigService } from './services/r2-config.service';
import { R2FileValidationService } from './services/r2-file-validation.service';
import { R2BatchService } from './services/r2-batch.service';
import { R2MaintenanceService } from './services/r2-maintenance.service';
import { R2StorageService } from './services/r2-storage.service';

@Module({
  imports: [ConfigModule],
  providers: [
    R2ConfigService,
    R2ClientService,
    R2FileValidationService,
    R2StorageService,
    R2BatchService,
    R2MaintenanceService,
  ],
  exports: [
    R2ConfigService,
    R2FileValidationService,
    R2StorageService,
    R2BatchService,
    R2MaintenanceService,
  ],
})
export class CloudflareR2Module {}
