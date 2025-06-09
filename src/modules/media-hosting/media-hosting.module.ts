// media-hosting.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CloudflareR2Module } from '../../libs/cloudflare-r2/cloudflare-r2.module';
import { MediaController } from './media.controller';
import { MediaProcessingService } from './services/media-processing.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    forwardRef(() => UploadsModule),
    forwardRef(() => AuthModule),
    forwardRef(() => CloudflareR2Module),
  ],
  controllers: [MediaController],
  providers: [MediaProcessingService],
  exports: [MediaProcessingService],
})
export class MediaHostingModule {}
