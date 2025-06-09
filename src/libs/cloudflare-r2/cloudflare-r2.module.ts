import { Module } from '@nestjs/common';

import { R2ClientService } from './client/r2-client.service';
import { R2StorageService } from './services/r2-storage.service';
import { R2BatchService } from './services/r2-batch.service';
import { R2MaintenanceService } from './services/r2-maintenance.service';

@Module({
  imports: [],
  providers: [R2ClientService, R2StorageService, R2BatchService, R2MaintenanceService],
  exports: [R2StorageService, R2BatchService, R2MaintenanceService],
})
export class CloudflareR2Module {}
