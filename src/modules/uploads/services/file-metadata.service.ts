import { Injectable, Logger } from '@nestjs/common';
import { R2StorageService } from 'src/libs/cloudflare-r2';

export interface FileMetadata {
  id: string;
  userId: string;
  originalName: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  size: number;
  hash: string;
  bucket: string;
  key: string;
  url: string;
  variants?: FileVariant[];
  tags?: string[];
  description?: string;
  isPublic: boolean;
  downloadCount: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface FileVariant {
  name: string;
  key: string;
  url: string;
  size: number;
  width?: number;
  height?: number;
  format?: string;
}

export interface SearchFilesQuery {
  userId?: string;
  fileType?: string;
  mimeType?: string;
  tags?: string[];
  minSize?: number;
  maxSize?: number;
  createdAfter?: Date;
  createdBefore?: Date;
  isPublic?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class FileMetadataService {
  private readonly logger = new Logger(FileMetadataService.name);

  // В реальном приложении это должно быть в базе данных
  private readonly fileMetadataStore = new Map<string, FileMetadata>();

  constructor(private readonly r2Storage: R2StorageService) {}

  /**
   * Сохранение метаданных файла
   */
  async saveFileMetadata(
    metadata: Omit<FileMetadata, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<FileMetadata> {
    const id = this.generateId();
    const now = new Date();

    const fileMetadata: FileMetadata = {
      ...metadata,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.fileMetadataStore.set(id, fileMetadata);

    this.logger.log(`File metadata saved: ${id} for user ${metadata.userId}`);

    return fileMetadata;
  }

  /**
   * Получение метаданных файла
   */
  async getFileMetadata(id: string): Promise<FileMetadata | null> {
    return this.fileMetadataStore.get(id) || null;
  }

  /**
   * Обновление метаданных файла
   */
  async updateFileMetadata(
    id: string,
    updates: Partial<Pick<FileMetadata, 'tags' | 'description' | 'isPublic'>>,
  ): Promise<FileMetadata | null> {
    const existing = this.fileMetadataStore.get(id);

    if (!existing) {
      return null;
    }

    const updated: FileMetadata = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    this.fileMetadataStore.set(id, updated);

    this.logger.log(`File metadata updated: ${id}`);

    return updated;
  }

  /**
   * Удаление метаданных файла
   */
  async deleteFileMetadata(id: string): Promise<boolean> {
    const deleted = this.fileMetadataStore.delete(id);

    if (deleted) {
      this.logger.log(`File metadata deleted: ${id}`);
    }

    return deleted;
  }

  /**
   * Поиск файлов по критериям
   */
  async searchFiles(query: SearchFilesQuery): Promise<{
    files: FileMetadata[];
    total: number;
    hasMore: boolean;
  }> {
    let files = Array.from(this.fileMetadataStore.values());

    // Фильтрация
    if (query.userId) {
      files = files.filter(f => f.userId === query.userId);
    }

    if (query.fileType) {
      files = files.filter(f => f.fileType === query.fileType);
    }

    if (query.mimeType) {
      files = files.filter(f => f.mimeType === query.mimeType);
    }

    if (query.tags && query.tags.length > 0) {
      files = files.filter(f => f.tags && query.tags!.some(tag => f.tags!.includes(tag)));
    }

    if (query.minSize !== undefined) {
      files = files.filter(f => f.size >= query.minSize!);
    }

    if (query.maxSize !== undefined) {
      files = files.filter(f => f.size <= query.maxSize!);
    }

    if (query.createdAfter) {
      files = files.filter(f => f.createdAt >= query.createdAfter!);
    }

    if (query.createdBefore) {
      files = files.filter(f => f.createdAt <= query.createdBefore!);
    }

    if (query.isPublic !== undefined) {
      files = files.filter(f => f.isPublic === query.isPublic);
    }

    if (query.search) {
      const searchLower = query.search.toLowerCase();
      files = files.filter(
        f =>
          f.originalName.toLowerCase().includes(searchLower) ||
          f.description?.toLowerCase().includes(searchLower) ||
          f.tags?.some(tag => tag.toLowerCase().includes(searchLower)),
      );
    }

    // Сортировка по дате создания (новые первыми)
    files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = files.length;
    const offset = query.offset || 0;
    const limit = query.limit || 50;

    const paginatedFiles = files.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return {
      files: paginatedFiles,
      total,
      hasMore,
    };
  }

  /**
   * Получение статистики файлов пользователя
   */
  async getUserFileStats(userId: string): Promise<{
    totalFiles: number;
    totalSize: number;
    byType: Record<string, { count: number; size: number }>;
    recentFiles: FileMetadata[];
  }> {
    const userFiles = Array.from(this.fileMetadataStore.values()).filter(f => f.userId === userId);

    const totalFiles = userFiles.length;
    const totalSize = userFiles.reduce((sum, f) => sum + f.size, 0);

    // Группировка по типам
    const byType: Record<string, { count: number; size: number }> = {};

    for (const file of userFiles) {
      if (!byType[file.fileType]) {
        byType[file.fileType] = { count: 0, size: 0 };
      }
      byType[file.fileType].count++;
      byType[file.fileType].size += file.size;
    }

    // Последние 10 файлов
    const recentFiles = userFiles
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);

    return {
      totalFiles,
      totalSize,
      byType,
      recentFiles,
    };
  }

  /**
   * Увеличение счетчика скачиваний
   */
  async incrementDownloadCount(id: string): Promise<void> {
    const metadata = this.fileMetadataStore.get(id);

    if (metadata) {
      metadata.downloadCount++;
      metadata.updatedAt = new Date();
      this.fileMetadataStore.set(id, metadata);
    }
  }

  /**
   * Получение популярных файлов
   */
  async getPopularFiles(limit: number = 10): Promise<FileMetadata[]> {
    return Array.from(this.fileMetadataStore.values())
      .filter(f => f.isPublic)
      .sort((a, b) => b.downloadCount - a.downloadCount)
      .slice(0, limit);
  }

  /**
   * Очистка истекших файлов
   */
  async cleanupExpiredFiles(): Promise<number> {
    const now = new Date();
    let deletedCount = 0;

    for (const [id, metadata] of this.fileMetadataStore.entries()) {
      if (metadata.expiresAt && metadata.expiresAt <= now) {
        // Удаляем файл из хранилища
        try {
          await this.r2Storage.deleteFile({
            bucket: metadata.bucket,
            key: metadata.key,
          });

          // Удаляем варианты файла
          if (metadata.variants) {
            for (const variant of metadata.variants) {
              await this.r2Storage.deleteFile({
                bucket: metadata.bucket,
                key: variant.key,
              });
            }
          }

          // Удаляем метаданные
          this.fileMetadataStore.delete(id);
          deletedCount++;

          this.logger.log(`Expired file deleted: ${id}`);
        } catch (error) {
          this.logger.error(`Failed to delete expired file ${id}: ${error.message}`);
        }
      }
    }

    return deletedCount;
  }

  /**
   * Добавление вариантов к файлу
   */
  async addFileVariants(id: string, variants: FileVariant[]): Promise<boolean> {
    const metadata = this.fileMetadataStore.get(id);

    if (!metadata) {
      return false;
    }

    metadata.variants = [...(metadata.variants || []), ...variants];
    metadata.updatedAt = new Date();

    this.fileMetadataStore.set(id, metadata);

    return true;
  }

  /**
   * Получение файлов по хешу (поиск дубликатов)
   */
  async getFilesByHash(hash: string): Promise<FileMetadata[]> {
    return Array.from(this.fileMetadataStore.values()).filter(f => f.hash === hash);
  }

  /**
   * Генерация уникального ID
   */
  private generateId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  /**
   * Экспорт метаданных для бэкапа
   */
  async exportMetadata(): Promise<FileMetadata[]> {
    return Array.from(this.fileMetadataStore.values());
  }

  /**
   * Импорт метаданных из бэкапа
   */
  async importMetadata(metadata: FileMetadata[]): Promise<number> {
    let importedCount = 0;

    for (const item of metadata) {
      this.fileMetadataStore.set(item.id, item);
      importedCount++;
    }

    this.logger.log(`Imported ${importedCount} file metadata records`);

    return importedCount;
  }
}
