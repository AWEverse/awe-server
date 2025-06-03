import { Injectable, Logger } from '@nestjs/common';
import { R2StorageService } from './r2-storage.service';
import { R2UploadResult } from '../types';

export interface BatchUploadItem {
  buffer: Buffer;
  fileName: string;
  fileType: string;
  metadata?: Record<string, string>;
}

export interface BatchUploadResult {
  successful: R2UploadResult[];
  failed: Array<{
    fileName: string;
    error: string;
  }>;
}

@Injectable()
export class R2BatchService {
  private readonly logger = new Logger(R2BatchService.name);

  constructor(private readonly r2Storage: R2StorageService) {}

  /**
   * Пакетная загрузка файлов
   */
  async uploadBatch(items: BatchUploadItem[]): Promise<BatchUploadResult> {
    const result: BatchUploadResult = {
      successful: [],
      failed: [],
    };

    const uploadPromises = items.map(async item => {
      try {
        const uploadResult = await this.r2Storage.uploadFile(
          item.buffer,
          item.fileName,
          item.fileType,
          { metadata: item.metadata },
        );
        result.successful.push(uploadResult);
      } catch (error) {
        this.logger.error(`Failed to upload ${item.fileName}: ${error.message}`);
        result.failed.push({
          fileName: item.fileName,
          error: error.message,
        });
      }
    });

    await Promise.allSettled(uploadPromises);

    this.logger.log(
      `Batch upload completed: ${result.successful.length} successful, ${result.failed.length} failed`,
    );

    return result;
  }

  /**
   * Пакетное удаление файлов
   */
  async deleteBatch(
    items: Array<{ bucket: string; key: string }>,
  ): Promise<{ successful: string[]; failed: Array<{ key: string; error: string }> }> {
    const result = {
      successful: [] as string[],
      failed: [] as Array<{ key: string; error: string }>,
    };

    const deletePromises = items.map(async item => {
      try {
        await this.r2Storage.deleteFile(item);
        result.successful.push(item.key);
      } catch (error) {
        this.logger.error(`Failed to delete ${item.key}: ${error.message}`);
        result.failed.push({
          key: item.key,
          error: error.message,
        });
      }
    });

    await Promise.allSettled(deletePromises);

    this.logger.log(
      `Batch delete completed: ${result.successful.length} successful, ${result.failed.length} failed`,
    );

    return result;
  }
}
