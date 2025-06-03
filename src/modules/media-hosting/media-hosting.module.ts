import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { AuthModule } from '../auth/auth.module';
import { MediaController } from './media.controller';
import { MediaProcessingService } from './services/media-processing.service';

@Module({
  imports: [UploadsModule, AuthModule],
  controllers: [MediaController],
  providers: [MediaProcessingService],
  exports: [MediaProcessingService],
})
export class MediaHostingModule {}
