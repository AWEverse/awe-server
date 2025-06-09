import { Module, forwardRef } from '@nestjs/common';
import { CloudflareR2Module } from '../../libs/cloudflare-r2/cloudflare-r2.module';
import { R2Controller } from './r2.controller';
import { FileController } from './file.controller';
import { ImageProcessingService } from './services/image-processing.service';
import { FileValidationService } from './services/file-validation.service';
import { FileMetadataService } from './services/file-metadata.service';

@Module({
  imports: [forwardRef(() => CloudflareR2Module)],
  controllers: [R2Controller, FileController],
  providers: [ImageProcessingService, FileValidationService, FileMetadataService],
  exports: [ImageProcessingService, FileValidationService, FileMetadataService],
})
export class UploadsModule {}
