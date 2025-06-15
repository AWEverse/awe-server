/**
 * Типы и интерфейсы для работы с R2 хранилищем
 * Обеспечивают строгую типизацию всех операций
 */

// Базовые типы
export type R2ACL = 'public-read' | 'private' | 'authenticated-read';
export type R2StorageClass = 'STANDARD' | 'REDUCED_REDUNDANCY' | 'GLACIER';

// Енумы
export enum R2BucketType {
  AVATARS = 'avatars',
  DOCUMENTS = 'documents',
  VIDEOS = 'videos',
  IMAGES = 'images',
}

export enum R2OperationType {
  UPLOAD = 'upload',
  DOWNLOAD = 'download',
  DELETE = 'delete',
  LIST = 'list',
  COPY = 'copy',
  METADATA = 'metadata',
}

// Интерфейсы операций
export interface R2UploadOptions {
  readonly bucket: string;
  readonly key: string;
  readonly contentType?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly cacheControl?: string;
  readonly expires?: Date;
  readonly acl?: R2ACL;
  readonly storageClass?: R2StorageClass;
}

export interface R2UploadResult {
  readonly url: string;
  readonly key: string;
  readonly bucket: string;
  readonly size: number;
  readonly etag: string;
  readonly lastModified: Date;
  readonly versionId?: string;
}

export interface R2DeleteOptions {
  readonly bucket: string;
  readonly key: string;
  readonly versionId?: string;
}

export interface R2DeleteResult {
  readonly deleted: boolean;
  readonly versionId?: string;
  readonly deleteMarker?: boolean;
}

export interface R2GetUrlOptions {
  readonly bucket: string;
  readonly key: string;
  readonly expiresIn?: number; // seconds, default 3600
  readonly versionId?: string;
}

export interface R2CopyOptions {
  readonly sourceBucket: string;
  readonly sourceKey: string;
  readonly destBucket: string;
  readonly destKey: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly cacheControl?: string;
}

export interface R2ListOptions {
  readonly bucket: string;
  readonly prefix?: string;
  readonly maxKeys?: number; // default 1000, max 1000
  readonly continuationToken?: string;
  readonly delimiter?: string;
}

export interface R2Object {
  readonly key: string;
  readonly size: number;
  readonly lastModified: Date;
  readonly etag: string;
  readonly storageClass: R2StorageClass;
  readonly owner?: {
    readonly id: string;
    readonly displayName: string;
  };
}

export interface R2ListResult {
  readonly objects: readonly R2Object[];
  readonly isTruncated: boolean;
  readonly continuationToken?: string;
  readonly nextContinuationToken?: string;
  readonly keyCount: number;
  readonly maxKeys: number;
  readonly prefix?: string;
  readonly delimiter?: string;
  readonly commonPrefixes?: readonly string[];
}

export interface R2MetadataResult {
  readonly contentType: string;
  readonly contentLength: number;
  readonly lastModified: Date;
  readonly etag: string;
  readonly versionId?: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly cacheControl?: string;
  readonly expires?: Date;
  readonly storageClass: R2StorageClass;
}

// Конфигурация типов файлов
export interface FileTypeConfig {
  readonly bucket: R2BucketType;
  readonly allowedMimeTypes: readonly string[];
  readonly maxSize: number; // bytes
  readonly cacheControl: string;
  readonly requiresAuth?: boolean;
  readonly allowedExtensions?: readonly string[];
}

// Результаты валидации
export interface UploadValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly suggestedBucket?: R2BucketType;
  readonly metadata: {
    readonly detectedMimeType: string;
    readonly actualSize: number;
    readonly hash: string;
    readonly isImage: boolean;
    readonly isVideo: boolean;
    readonly isAudio: boolean;
    readonly isDocument: boolean;
  };
}

// Batch операции
export interface R2BatchOperationResult<T> {
  readonly successful: readonly T[];
  readonly failed: readonly {
    readonly item: any;
    readonly error: string;
    readonly code?: string;
  }[];
  readonly totalProcessed: number;
  readonly successCount: number;
  readonly failureCount: number;
}

// Метрики и статистика
export interface R2StorageMetrics {
  readonly bucket: string;
  readonly objectCount: number;
  readonly totalSize: number;
  readonly lastUpdated: Date;
  readonly sizeByType: Readonly<Record<string, number>>;
  readonly countByType: Readonly<Record<string, number>>;
}

// События аудита
export interface R2AuditEvent {
  readonly id: string;
  readonly timestamp: Date;
  readonly operation: R2OperationType;
  readonly bucket: string;
  readonly key?: string;
  readonly userId?: string;
  readonly success: boolean;
  readonly error?: string;
  readonly metadata?: Readonly<Record<string, any>>;
}
