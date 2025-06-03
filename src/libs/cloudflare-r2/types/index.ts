export interface R2UploadOptions {
  bucket: string;
  key: string;
  contentType?: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
  expires?: Date;
  acl?: 'public-read' | 'private';
}

export interface R2UploadResult {
  url: string;
  key: string;
  bucket: string;
  size: number;
  etag: string;
  lastModified: Date;
}

export interface R2DeleteOptions {
  bucket: string;
  key: string;
}

export interface R2GetUrlOptions {
  bucket: string;
  key: string;
  expiresIn?: number; // seconds
}

export interface R2ListOptions {
  bucket: string;
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
}

export interface R2Object {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  storageClass: string;
}

export interface R2ListResult {
  objects: R2Object[];
  isTruncated: boolean;
  continuationToken?: string;
  nextContinuationToken?: string;
}

export interface R2MetadataResult {
  contentType: string;
  contentLength: number;
  lastModified: Date;
  etag: string;
  metadata: Record<string, string>;
}

export enum R2BucketType {
  AVATARS = 'avatars',
  DOCUMENTS = 'documents',
  VIDEOS = 'videos',
  IMAGES = 'images',
}

export interface FileTypeConfig {
  bucket: R2BucketType;
  allowedMimeTypes: string[];
  maxSize: number; // bytes
  cacheControl: string;
}

export interface UploadValidationResult {
  isValid: boolean;
  error?: string;
  suggestedBucket?: R2BucketType;
}
