import { Module } from '@nestjs/common';
import { CloudflareR2Module } from '../../libs/cloudflare-r2';
import { R2Controller } from './r2.controller';
import { FileController } from './file.controller';
import { ImageProcessingService } from './services/image-processing.service';
import { FileValidationService } from './services/file-validation.service';
import { FileMetadataService } from './services/file-metadata.service';

@Module({
  imports: [CloudflareR2Module],
  controllers: [R2Controller, FileController],
  providers: [ImageProcessingService, FileValidationService, FileMetadataService],
  exports: [CloudflareR2Module, ImageProcessingService, FileValidationService, FileMetadataService],
})
export class UploadsModule {}
