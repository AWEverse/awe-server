import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { faker } from '@faker-js/faker';
import { User } from 'generated/client';

// Test Setup and Utilities
import { createTestApp, createTestUser, cleanupDatabase } from '../setup/database-setup';

// Module and Services
import { UploadsModule } from '../../src/modules/uploads/uploads.module';
import { FileController } from '../../src/modules/uploads/file.controller';
import { R2Controller } from '../../src/modules/uploads/r2.controller';
import { ImageProcessingService } from '../../src/modules/uploads/services/image-processing.service';
import { FileValidationService } from '../../src/modules/uploads/services/file-validation.service';
import { FileMetadataService } from '../../src/modules/uploads/services/file-metadata.service';

// R2 Services and Types
import { R2StorageService } from '../../src/libs/cloudflare-r2/services/r2-storage.service';
import { R2BatchService } from '../../src/libs/cloudflare-r2/services/r2-batch.service';
import { R2MaintenanceService } from '../../src/libs/cloudflare-r2/services/r2-maintenance.service';
import { R2ClientService } from '../../src/libs/cloudflare-r2/client/r2-client.service';

describe('Uploads Module Integration Tests', () => {
  let app: INestApplication;
  let fileController: FileController;
  let r2Controller: R2Controller;
  let imageProcessingService: ImageProcessingService;
  let fileValidationService: FileValidationService;
  let fileMetadataService: FileMetadataService;
  let r2StorageService: R2StorageService;
  let r2BatchService: R2BatchService;
  let r2MaintenanceService: R2MaintenanceService;

  // Test users
  let testUser: User;
  let testUser2: User;

  // Mock services
  let mockR2StorageService: jest.Mocked<R2StorageService>;
  let mockR2ClientService: jest.Mocked<R2ClientService>;

  beforeAll(async () => {
    // Create test users
    testUser = await createTestUser({
      username: faker.internet.userName(),
      email: faker.internet.email(),
    });
    testUser2 = await createTestUser({
      username: faker.internet.userName(),
      email: faker.internet.email(),
    });

    // Create mock services with proper typing
    mockR2StorageService = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
      getFileMetadata: jest.fn(),
      listFiles: jest.fn(),
      getSignedDownloadUrl: jest.fn(),
      getSignedUploadUrl: jest.fn(),
      copyFile: jest.fn(),
      fileExists: jest.fn(),
      getPublicUrl: jest.fn(),
      validateFile: jest.fn(),
      getFileTypeConfig: jest.fn(),
      getSupportedFileTypes: jest.fn(),
    } as jest.Mocked<R2StorageService>;

    mockR2ClientService = {
      getClient: jest.fn(),
      getBucketName: jest.fn(),
      getPublicUrl: jest.fn(),
    } as jest.Mocked<R2ClientService>;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [UploadsModule],
    })
      .overrideProvider(R2StorageService)
      .useValue(mockR2StorageService)
      .overrideProvider(R2ClientService)
      .useValue(mockR2ClientService)
      .compile();

    app = await createTestApp(moduleFixture);

    // Get service instances
    fileController = moduleFixture.get<FileController>(FileController);
    r2Controller = moduleFixture.get<R2Controller>(R2Controller);
    imageProcessingService = moduleFixture.get<ImageProcessingService>(ImageProcessingService);
    fileValidationService = moduleFixture.get<FileValidationService>(FileValidationService);
    fileMetadataService = moduleFixture.get<FileMetadataService>(FileMetadataService);
    r2StorageService = moduleFixture.get<R2StorageService>(R2StorageService);
    r2BatchService = moduleFixture.get<R2BatchService>(R2BatchService);
    r2MaintenanceService = moduleFixture.get<R2MaintenanceService>(R2MaintenanceService);

    // Setup default mock responses
    mockR2StorageService.uploadFile.mockResolvedValue({
      url: faker.internet.url(),
      key: faker.string.uuid(),
      bucket: 'test-bucket',
      size: faker.number.int({ min: 1000, max: 100000 }),
      etag: faker.string.uuid(),
      lastModified: new Date(),
    });

    mockR2StorageService.getSignedDownloadUrl.mockResolvedValue(faker.internet.url());
    mockR2StorageService.fileExists.mockResolvedValue(true);
    mockR2StorageService.validateFile.mockReturnValue({
      isValid: true,
      suggestedBucket: 'images',
    });
    mockR2StorageService.getSupportedFileTypes.mockReturnValue([
      'avatar',
      'banner',
      'image_post',
      'document',
    ]);
    mockR2StorageService.getFileTypeConfig.mockReturnValue({
      bucket: 'images',
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxSize: 5 * 1024 * 1024,
      cacheControl: 'public, max-age=31536000',
    });
    mockR2ClientService.getBucketName.mockReturnValue('test-bucket');
  });

  afterAll(async () => {
    await cleanupDatabase();
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('FileValidationService', () => {
    describe('File Validation', () => {
      it('should validate file successfully', async () => {
        const buffer = Buffer.from('fake-image-data');
        const fileName = 'test-image.jpg';

        const result = await fileValidationService.validateFile(buffer, fileName);

        expect(result.isValid).toBe(true);
        expect(result.metadata.detectedMimeType).toBeDefined();
        expect(result.metadata.actualSize).toBe(buffer.length);
        expect(result.metadata.hash).toBeDefined();
      });

      it('should detect invalid file extension', async () => {
        const buffer = Buffer.from('malicious-content');
        const fileName = 'virus.exe';

        const result = await fileValidationService.validateFile(buffer, fileName);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Опасное расширение файла: exe');
      });

      it('should detect empty files', async () => {
        const buffer = Buffer.alloc(0);
        const fileName = 'empty.txt';

        const result = await fileValidationService.validateFile(buffer, fileName);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Файл пустой');
      });

      it('should detect oversized files', async () => {
        const buffer = Buffer.alloc(3 * 1024 * 1024 * 1024); // 3GB
        const fileName = 'huge-file.zip';

        const result = await fileValidationService.validateFile(buffer, fileName);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Файл слишком большой (максимум 2GB)');
      });

      it('should validate file name format', () => {
        const validName = 'document.pdf';
        const invalidName1 = '.hidden-file';
        const invalidName2 = 'file-with-trailing-dot.';
        const invalidName3 = 'file/with/slashes.txt';

        const validResult = fileValidationService.validateFileName(validName);
        expect(validResult.isValid).toBe(true);

        const invalidResult1 = fileValidationService.validateFileName(invalidName1);
        expect(invalidResult1.isValid).toBe(false);
        expect(invalidResult1.errors).toContain(
          'Имя файла не может начинаться или заканчиваться точкой',
        );

        const invalidResult2 = fileValidationService.validateFileName(invalidName2);
        expect(invalidResult2.isValid).toBe(false);

        const invalidResult3 = fileValidationService.validateFileName(invalidName3);
        expect(invalidResult3.isValid).toBe(false);
      });

      it('should provide optimization recommendations', () => {
        const largeImageBuffer = Buffer.alloc(7 * 1024 * 1024); // 7MB
        const fileName = 'large-image.png';
        const fileType = 'image/png';

        const recommendations = fileValidationService.getOptimizationRecommendations(
          largeImageBuffer,
          fileName,
          fileType,
        );

        expect(recommendations).toContain('Рекомендуется сжать изображение');
        expect(recommendations).toContain(
          'Рассмотрите конвертацию PNG в WebP для уменьшения размера',
        );
      });

      it('should check for file duplicates', async () => {
        const buffer = Buffer.from('duplicate-content');
        const userId = testUser.id.toString();

        const duplicateCheck = await fileValidationService.checkForDuplicates(buffer, userId);

        expect(duplicateCheck).toHaveProperty('isDuplicate');
        expect(typeof duplicateCheck.isDuplicate).toBe('boolean');
      });
    });

    describe('MIME Type Detection', () => {
      it('should detect JPEG files by magic numbers', async () => {
        const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
        const buffer = Buffer.concat([jpegHeader, Buffer.alloc(1000)]);

        const result = await fileValidationService.validateFile(buffer, 'test.jpg');

        expect(result.metadata.detectedMimeType).toBe('image/jpeg');
        expect(result.metadata.isImage).toBe(true);
      });

      it('should detect PNG files by magic numbers', async () => {
        const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        const buffer = Buffer.concat([pngHeader, Buffer.alloc(1000)]);

        const result = await fileValidationService.validateFile(buffer, 'test.png');

        expect(result.metadata.detectedMimeType).toBe('image/png');
        expect(result.metadata.isImage).toBe(true);
      });

      it('should detect video files', async () => {
        const buffer = Buffer.alloc(1000);
        const result = await fileValidationService.validateFile(buffer, 'video.mp4');

        expect(result.metadata.isVideo).toBe(true);
        expect(result.metadata.isImage).toBe(false);
      });
    });
  });

  describe('ImageProcessingService', () => {
    describe('Image Processing and Variants', () => {
      it('should process image and create variants', async () => {
        const buffer = Buffer.from('fake-image-data');
        const fileName = 'test-avatar.jpg';
        const fileType = 'avatar';
        const userId = testUser.id.toString();

        const results = await imageProcessingService.processImage(
          buffer,
          fileName,
          fileType,
          userId,
        );

        expect(results).toHaveLength(5); // original + 4 variants for avatar
        expect(results.find(r => r.variant === 'original')).toBeDefined();
        expect(results.find(r => r.variant === 'thumbnail')).toBeDefined();
        expect(results.find(r => r.variant === 'small')).toBeDefined();
        expect(results.find(r => r.variant === 'medium')).toBeDefined();
        expect(results.find(r => r.variant === 'large')).toBeDefined();

        // Verify R2 storage was called for each variant
        expect(mockR2StorageService.uploadFile).toHaveBeenCalledTimes(5);
      });

      it('should handle banner image processing', async () => {
        const buffer = Buffer.from('banner-image-data');
        const fileName = 'banner.jpg';
        const fileType = 'banner';
        const userId = testUser.id.toString();

        const results = await imageProcessingService.processImage(
          buffer,
          fileName,
          fileType,
          userId,
        );

        expect(results.length).toBeGreaterThan(1);
        expect(results.find(r => r.variant === 'original')).toBeDefined();

        // Verify each result has required properties
        results.forEach(result => {
          expect(result.variant).toBeDefined();
          expect(result.url).toBeDefined();
          expect(result.key).toBeDefined();
        });
      });

      it('should get variants for different file types', () => {
        const avatarVariants = imageProcessingService.getVariantsForFileType('avatar');
        expect(avatarVariants).toHaveLength(4);

        const bannerVariants = imageProcessingService.getVariantsForFileType('banner');
        expect(bannerVariants.length).toBeGreaterThan(0);

        const unknownVariants = imageProcessingService.getVariantsForFileType('unknown');
        expect(unknownVariants).toHaveLength(0);
      });

      it('should handle processing errors gracefully', async () => {
        mockR2StorageService.uploadFile.mockRejectedValueOnce(new Error('Upload failed'));

        const buffer = Buffer.from('image-data');
        const results = await imageProcessingService.processImage(
          buffer,
          'test.jpg',
          'avatar',
          testUser.id.toString(),
        );

        // Should still return original even if variants fail
        expect(results.find(r => r.variant === 'original')).toBeDefined();
      });

      it('should get image information', async () => {
        const buffer = Buffer.from('fake-image-data');

        // Mock the sharp library response
        const imageInfo = await imageProcessingService.getImageInfo(buffer);

        expect(imageInfo).toHaveProperty('width');
        expect(imageInfo).toHaveProperty('height');
        expect(imageInfo).toHaveProperty('format');
        expect(imageInfo).toHaveProperty('size');
        expect(imageInfo).toHaveProperty('channels');
        expect(imageInfo).toHaveProperty('hasAlpha');
      });
    });
  });

  describe('FileMetadataService', () => {
    describe('Metadata Management', () => {
      it('should save file metadata', async () => {
        const metadata = {
          userId: testUser.id.toString(),
          originalName: 'test-file.jpg',
          fileName: 'processed-file.jpg',
          fileType: 'avatar',
          mimeType: 'image/jpeg',
          size: 1024000,
          hash: 'abcd1234',
          bucket: 'images',
          key: 'avatar/test-file.jpg',
          url: 'https://example.com/test-file.jpg',
          tags: ['profile', 'user'],
          description: 'User avatar image',
          isPublic: true,
          downloadCount: 0,
        };

        const saved = await fileMetadataService.saveFileMetadata(metadata);

        expect(saved.id).toBeDefined();
        expect(saved.userId).toBe(metadata.userId);
        expect(saved.originalName).toBe(metadata.originalName);
        expect(saved.createdAt).toBeInstanceOf(Date);
        expect(saved.updatedAt).toBeInstanceOf(Date);
      });

      it('should retrieve file metadata by ID', async () => {
        const metadata = {
          userId: testUser.id.toString(),
          originalName: 'retrievable-file.pdf',
          fileName: 'document.pdf',
          fileType: 'document',
          mimeType: 'application/pdf',
          size: 500000,
          hash: 'efgh5678',
          bucket: 'documents',
          key: 'docs/document.pdf',
          url: 'https://example.com/document.pdf',
          isPublic: false,
          downloadCount: 0,
        };

        const saved = await fileMetadataService.saveFileMetadata(metadata);
        const retrieved = await fileMetadataService.getFileMetadata(saved.id);

        expect(retrieved).toBeDefined();
        expect(retrieved!.id).toBe(saved.id);
        expect(retrieved!.originalName).toBe(metadata.originalName);
      });

      it('should update file metadata', async () => {
        const metadata = {
          userId: testUser.id.toString(),
          originalName: 'updatable-file.jpg',
          fileName: 'image.jpg',
          fileType: 'image_post',
          mimeType: 'image/jpeg',
          size: 2048000,
          hash: 'ijkl9012',
          bucket: 'images',
          key: 'posts/image.jpg',
          url: 'https://example.com/image.jpg',
          tags: ['old-tag'],
          description: 'Original description',
          isPublic: true,
          downloadCount: 0,
        };

        const saved = await fileMetadataService.saveFileMetadata(metadata);

        const updates = {
          tags: ['new-tag', 'updated'],
          description: 'Updated description',
          isPublic: false,
        };

        const updated = await fileMetadataService.updateFileMetadata(saved.id, updates);

        expect(updated).toBeDefined();
        expect(updated!.tags).toEqual(['new-tag', 'updated']);
        expect(updated!.description).toBe('Updated description');
        expect(updated!.isPublic).toBe(false);
        expect(updated!.updatedAt.getTime()).toBeGreaterThan(saved.updatedAt.getTime());
      });

      it('should delete file metadata', async () => {
        const metadata = {
          userId: testUser.id.toString(),
          originalName: 'deletable-file.txt',
          fileName: 'text.txt',
          fileType: 'document',
          mimeType: 'text/plain',
          size: 1024,
          hash: 'mnop3456',
          bucket: 'documents',
          key: 'texts/text.txt',
          url: 'https://example.com/text.txt',
          isPublic: true,
          downloadCount: 0,
        };

        const saved = await fileMetadataService.saveFileMetadata(metadata);
        const deleted = await fileMetadataService.deleteFileMetadata(saved.id);

        expect(deleted).toBe(true);

        const retrieved = await fileMetadataService.getFileMetadata(saved.id);
        expect(retrieved).toBeNull();
      });

      it('should increment download count', async () => {
        const metadata = {
          userId: testUser.id.toString(),
          originalName: 'downloadable-file.pdf',
          fileName: 'document.pdf',
          fileType: 'document',
          mimeType: 'application/pdf',
          size: 1000000,
          hash: 'qrst7890',
          bucket: 'documents',
          key: 'docs/downloadable.pdf',
          url: 'https://example.com/downloadable.pdf',
          isPublic: true,
          downloadCount: 0,
        };

        const saved = await fileMetadataService.saveFileMetadata(metadata);

        await fileMetadataService.incrementDownloadCount(saved.id);
        await fileMetadataService.incrementDownloadCount(saved.id);

        const updated = await fileMetadataService.getFileMetadata(saved.id);
        expect(updated!.downloadCount).toBe(2);
      });
    });

    describe('Search and Statistics', () => {
      beforeEach(async () => {
        // Create test files for search
        await fileMetadataService.saveFileMetadata({
          userId: testUser.id.toString(),
          originalName: 'search-image1.jpg',
          fileName: 'image1.jpg',
          fileType: 'avatar',
          mimeType: 'image/jpeg',
          size: 1024000,
          hash: 'search1',
          bucket: 'images',
          key: 'avatar/image1.jpg',
          url: 'https://example.com/image1.jpg',
          tags: ['profile', 'avatar'],
          isPublic: true,
          downloadCount: 5,
        });

        await fileMetadataService.saveFileMetadata({
          userId: testUser.id.toString(),
          originalName: 'search-doc1.pdf',
          fileName: 'document1.pdf',
          fileType: 'document',
          mimeType: 'application/pdf',
          size: 2048000,
          hash: 'search2',
          bucket: 'documents',
          key: 'docs/document1.pdf',
          url: 'https://example.com/document1.pdf',
          tags: ['work', 'important'],
          isPublic: false,
          downloadCount: 10,
        });

        await fileMetadataService.saveFileMetadata({
          userId: testUser2.id.toString(),
          originalName: 'other-user-file.jpg',
          fileName: 'other.jpg',
          fileType: 'banner',
          mimeType: 'image/jpeg',
          size: 3072000,
          hash: 'search3',
          bucket: 'images',
          key: 'banner/other.jpg',
          url: 'https://example.com/other.jpg',
          tags: ['banner'],
          isPublic: true,
          downloadCount: 1,
        });
      });

      it('should search files by user ID', async () => {
        const query = {
          userId: testUser.id.toString(),
          limit: 10,
          offset: 0,
        };

        const result = await fileMetadataService.searchFiles(query);

        expect(result.files.length).toBe(2);
        expect(result.total).toBe(2);
        expect(result.hasMore).toBe(false);
        expect(result.files.every(file => file.userId === testUser.id.toString())).toBe(true);
      });

      it('should search files by file type', async () => {
        const query = {
          fileType: 'document',
          limit: 10,
          offset: 0,
        };

        const result = await fileMetadataService.searchFiles(query);

        expect(result.files.length).toBe(1);
        expect(result.files[0].fileType).toBe('document');
      });

      it('should search files by tags', async () => {
        const query = {
          tags: ['profile'],
          limit: 10,
          offset: 0,
        };

        const result = await fileMetadataService.searchFiles(query);

        expect(result.files.length).toBe(1);
        expect(result.files[0].tags).toContain('profile');
      });

      it('should search files by size range', async () => {
        const query = {
          minSize: 1500000,
          maxSize: 2500000,
          limit: 10,
          offset: 0,
        };

        const result = await fileMetadataService.searchFiles(query);

        expect(result.files.length).toBe(1);
        expect(result.files[0].size).toBeGreaterThanOrEqual(1500000);
        expect(result.files[0].size).toBeLessThanOrEqual(2500000);
      });

      it('should search files with pagination', async () => {
        const query = {
          limit: 1,
          offset: 0,
        };

        const firstPage = await fileMetadataService.searchFiles(query);
        expect(firstPage.files.length).toBe(1);
        expect(firstPage.hasMore).toBe(true);

        const secondPage = await fileMetadataService.searchFiles({ ...query, offset: 1 });
        expect(secondPage.files.length).toBe(1);
        expect(secondPage.files[0].id).not.toBe(firstPage.files[0].id);
      });

      it('should get user file statistics', async () => {
        const stats = await fileMetadataService.getUserFileStats(testUser.id.toString());

        expect(stats.totalFiles).toBe(2);
        expect(stats.totalSize).toBe(3072000); // 1024000 + 2048000
        expect(stats.byType).toHaveProperty('avatar');
        expect(stats.byType).toHaveProperty('document');
        expect(stats.byType.avatar.count).toBe(1);
        expect(stats.byType.document.count).toBe(1);
        expect(stats.recentFiles.length).toBeGreaterThan(0);
      });
    });

    describe('File Cleanup and Maintenance', () => {
      it('should cleanup expired files', async () => {
        // Create an expired file
        const expiredDate = new Date();
        expiredDate.setDate(expiredDate.getDate() - 1); // Yesterday

        await fileMetadataService.saveFileMetadata({
          userId: testUser.id.toString(),
          originalName: 'expired-file.jpg',
          fileName: 'expired.jpg',
          fileType: 'avatar',
          mimeType: 'image/jpeg',
          size: 1024000,
          hash: 'expired123',
          bucket: 'images',
          key: 'avatar/expired.jpg',
          url: 'https://example.com/expired.jpg',
          isPublic: true,
          downloadCount: 0,
          expiresAt: expiredDate,
        });

        const deletedCount = await fileMetadataService.cleanupExpiredFiles();

        expect(deletedCount).toBe(1);
        expect(mockR2StorageService.deleteFile).toHaveBeenCalled();
      });

      it('should export metadata for backup', async () => {
        const exportedData = await fileMetadataService.exportMetadata();

        expect(Array.isArray(exportedData)).toBe(true);
        expect(exportedData.length).toBeGreaterThan(0);
        expect(exportedData[0]).toHaveProperty('id');
        expect(exportedData[0]).toHaveProperty('userId');
        expect(exportedData[0]).toHaveProperty('originalName');
      });

      it('should import metadata from backup', async () => {
        const testMetadata = [
          {
            id: 'import-test-1',
            userId: testUser.id.toString(),
            originalName: 'imported-file.jpg',
            fileName: 'imported.jpg',
            fileType: 'avatar',
            mimeType: 'image/jpeg',
            size: 1024000,
            hash: 'import123',
            bucket: 'images',
            key: 'avatar/imported.jpg',
            url: 'https://example.com/imported.jpg',
            isPublic: true,
            downloadCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        const importedCount = await fileMetadataService.importMetadata(testMetadata);

        expect(importedCount).toBe(1);

        const retrieved = await fileMetadataService.getFileMetadata('import-test-1');
        expect(retrieved).toBeDefined();
        expect(retrieved!.originalName).toBe('imported-file.jpg');
      });
    });
  });

  describe('R2StorageService Integration', () => {
    describe('File Operations', () => {
      it('should upload file successfully', async () => {
        const buffer = Buffer.from('test-file-content');
        const fileName = 'test-upload.jpg';
        const fileType = 'avatar';

        const result = await r2StorageService.uploadFile(buffer, fileName, fileType);

        expect(result.url).toBeDefined();
        expect(result.key).toBeDefined();
        expect(result.bucket).toBe('test-bucket');
        expect(result.size).toBe(buffer.length);
        expect(mockR2StorageService.uploadFile).toHaveBeenCalledWith(
          buffer,
          fileName,
          fileType,
          undefined,
        );
      });

      it('should validate file before upload', () => {
        const buffer = Buffer.from('test-content');
        const fileName = 'test.jpg';
        const fileType = 'avatar';

        const result = r2StorageService.validateFile(buffer, fileName, fileType);

        expect(result.isValid).toBe(true);
        expect(result.suggestedBucket).toBe('images');
      });

      it('should get file metadata', async () => {
        const bucket = 'test-bucket';
        const key = 'test-file.jpg';

        await r2StorageService.getFileMetadata(bucket, key);

        expect(mockR2StorageService.getFileMetadata).toHaveBeenCalledWith(bucket, key);
      });

      it('should delete file', async () => {
        const options = {
          bucket: 'test-bucket',
          key: 'test-file.jpg',
        };

        await r2StorageService.deleteFile(options);

        expect(mockR2StorageService.deleteFile).toHaveBeenCalledWith(options);
      });

      it('should list files in bucket', async () => {
        const options = {
          bucket: 'test-bucket',
          prefix: 'avatar/',
          maxKeys: 100,
        };

        await r2StorageService.listFiles(options);

        expect(mockR2StorageService.listFiles).toHaveBeenCalledWith(options);
      });

      it('should check if file exists', async () => {
        const bucket = 'test-bucket';
        const key = 'existing-file.jpg';

        const exists = await r2StorageService.fileExists(bucket, key);

        expect(exists).toBe(true);
        expect(mockR2StorageService.fileExists).toHaveBeenCalledWith(bucket, key);
      });

      it('should get signed download URL', async () => {
        const options = {
          bucket: 'test-bucket',
          key: 'downloadable-file.jpg',
          expiresIn: 3600,
        };

        const url = await r2StorageService.getSignedDownloadUrl(options);

        expect(url).toBeDefined();
        expect(mockR2StorageService.getSignedDownloadUrl).toHaveBeenCalledWith(options);
      });

      it('should get supported file types', () => {
        const supportedTypes = r2StorageService.getSupportedFileTypes();

        expect(Array.isArray(supportedTypes)).toBe(true);
        expect(supportedTypes.length).toBeGreaterThan(0);
        expect(mockR2StorageService.getSupportedFileTypes).toHaveBeenCalled();
      });

      it('should get file type configuration', () => {
        const fileType = 'avatar';
        const config = r2StorageService.getFileTypeConfig(fileType);

        expect(config).toBeDefined();
        expect(config!.bucket).toBe('images');
        expect(config!.allowedMimeTypes).toContain('image/jpeg');
        expect(mockR2StorageService.getFileTypeConfig).toHaveBeenCalledWith(fileType);
      });
    });
  });

  describe('Performance and Load Testing', () => {
    describe('Concurrent Operations', () => {
      it('should handle concurrent file uploads', async () => {
        const uploadPromises = Array.from({ length: 10 }, (_, i) =>
          fileMetadataService.saveFileMetadata({
            userId: testUser.id.toString(),
            originalName: `concurrent-file-${i}.jpg`,
            fileName: `file-${i}.jpg`,
            fileType: 'avatar',
            mimeType: 'image/jpeg',
            size: 1024000 + i * 1000,
            hash: `concurrent-${i}`,
            bucket: 'images',
            key: `avatar/file-${i}.jpg`,
            url: `https://example.com/file-${i}.jpg`,
            isPublic: true,
            downloadCount: 0,
          }),
        );

        const results = await Promise.all(uploadPromises);

        expect(results).toHaveLength(10);
        results.forEach((result, index) => {
          expect(result.id).toBeDefined();
          expect(result.originalName).toBe(`concurrent-file-${index}.jpg`);
        });
      });

      it('should handle concurrent metadata updates', async () => {
        // First create a file
        const metadata = await fileMetadataService.saveFileMetadata({
          userId: testUser.id.toString(),
          originalName: 'concurrent-update.jpg',
          fileName: 'update-test.jpg',
          fileType: 'avatar',
          mimeType: 'image/jpeg',
          size: 1024000,
          hash: 'concurrent-update',
          bucket: 'images',
          key: 'avatar/update-test.jpg',
          url: 'https://example.com/update-test.jpg',
          tags: [],
          isPublic: true,
          downloadCount: 0,
        });

        // Perform concurrent updates
        const updatePromises = Array.from({ length: 5 }, (_, i) =>
          fileMetadataService.updateFileMetadata(metadata.id, {
            tags: [`tag-${i}`],
            description: `Description ${i}`,
          }),
        );

        const results = await Promise.all(updatePromises);

        // All updates should succeed, but only the last one should be reflected
        expect(results.every(result => result !== null)).toBe(true);
      });

      it('should handle concurrent image processing', async () => {
        const processingPromises = Array.from({ length: 5 }, (_, i) => {
          const buffer = Buffer.from(`image-data-${i}`);
          return imageProcessingService.processImage(
            buffer,
            `concurrent-image-${i}.jpg`,
            'avatar',
            testUser.id.toString(),
          );
        });

        const results = await Promise.all(processingPromises);

        expect(results).toHaveLength(5);
        results.forEach(result => {
          expect(result.find(r => r.variant === 'original')).toBeDefined();
        });

        // Verify total upload calls (5 images * 5 variants each)
        expect(mockR2StorageService.uploadFile).toHaveBeenCalledTimes(25);
      });
    });

    describe('Large Dataset Operations', () => {
      it('should handle search with large result sets', async () => {
        // Create many files for testing
        const createPromises = Array.from({ length: 100 }, (_, i) =>
          fileMetadataService.saveFileMetadata({
            userId: testUser.id.toString(),
            originalName: `bulk-file-${i}.jpg`,
            fileName: `bulk-${i}.jpg`,
            fileType: i % 2 === 0 ? 'avatar' : 'banner',
            mimeType: 'image/jpeg',
            size: 1024000 + i * 1000,
            hash: `bulk-${i}`,
            bucket: 'images',
            key: `bulk/bulk-${i}.jpg`,
            url: `https://example.com/bulk-${i}.jpg`,
            tags: [`tag-${i % 10}`],
            isPublic: i % 3 === 0,
            downloadCount: i,
          }),
        );

        await Promise.all(createPromises);

        // Test paginated search
        const query = {
          userId: testUser.id.toString(),
          limit: 20,
          offset: 0,
        };

        const result = await fileMetadataService.searchFiles(query);

        expect(result.files.length).toBe(20);
        expect(result.total).toBeGreaterThanOrEqual(100);
        expect(result.hasMore).toBe(true);
      });

      it('should efficiently get user statistics for many files', async () => {
        const stats = await fileMetadataService.getUserFileStats(testUser.id.toString());

        expect(stats.totalFiles).toBeGreaterThan(50);
        expect(stats.totalSize).toBeGreaterThan(50000000);
        expect(Object.keys(stats.byType).length).toBeGreaterThan(1);
      });
    });

    describe('Memory Management', () => {
      it('should handle large file validation efficiently', async () => {
        const largeBuffer = Buffer.alloc(50 * 1024 * 1024); // 50MB
        const fileName = 'large-file.jpg';

        const startTime = Date.now();
        const result = await fileValidationService.validateFile(largeBuffer, fileName);
        const endTime = Date.now();

        expect(result).toBeDefined();
        expect(result.metadata.actualSize).toBe(largeBuffer.length);
        expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      });

      it('should cleanup expired files efficiently', async () => {
        // Create multiple expired files
        const expiredDate = new Date();
        expiredDate.setDate(expiredDate.getDate() - 1);

        const createPromises = Array.from({ length: 20 }, (_, i) =>
          fileMetadataService.saveFileMetadata({
            userId: testUser.id.toString(),
            originalName: `expired-bulk-${i}.jpg`,
            fileName: `expired-${i}.jpg`,
            fileType: 'avatar',
            mimeType: 'image/jpeg',
            size: 1024000,
            hash: `expired-bulk-${i}`,
            bucket: 'images',
            key: `avatar/expired-${i}.jpg`,
            url: `https://example.com/expired-${i}.jpg`,
            isPublic: true,
            downloadCount: 0,
            expiresAt: expiredDate,
          }),
        );

        await Promise.all(createPromises);

        const startTime = Date.now();
        const deletedCount = await fileMetadataService.cleanupExpiredFiles();
        const endTime = Date.now();

        expect(deletedCount).toBe(20);
        expect(endTime - startTime).toBeLessThan(3000); // Should complete within 3 seconds
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    describe('Service Failures', () => {
      it('should handle R2 storage upload failures', async () => {
        mockR2StorageService.uploadFile.mockRejectedValueOnce(
          new Error('Storage service unavailable'),
        );

        const buffer = Buffer.from('test-content');

        await expect(
          r2StorageService.uploadFile(buffer, 'failing-file.jpg', 'avatar'),
        ).rejects.toThrow('Storage service unavailable');
      });

      it('should handle R2 storage delete failures', async () => {
        mockR2StorageService.deleteFile.mockRejectedValueOnce(new Error('Delete operation failed'));

        const options = {
          bucket: 'test-bucket',
          key: 'undeletable-file.jpg',
        };

        await expect(r2StorageService.deleteFile(options)).rejects.toThrow(
          'Delete operation failed',
        );
      });

      it('should handle metadata retrieval failures gracefully', async () => {
        const nonExistentId = 'non-existent-file-id';

        const result = await fileMetadataService.getFileMetadata(nonExistentId);

        expect(result).toBeNull();
      });

      it('should handle invalid file validation scenarios', async () => {
        const corruptedBuffer = Buffer.from([0x00, 0x01, 0x02]); // Invalid image data
        const fileName = 'corrupted.jpg';

        const result = await fileValidationService.validateFile(corruptedBuffer, fileName);

        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('Data Consistency', () => {
      it('should maintain consistency during failed uploads', async () => {
        const metadata = {
          userId: testUser.id.toString(),
          originalName: 'consistency-test.jpg',
          fileName: 'test.jpg',
          fileType: 'avatar',
          mimeType: 'image/jpeg',
          size: 1024000,
          hash: 'consistency123',
          bucket: 'images',
          key: 'avatar/consistency-test.jpg',
          url: 'https://example.com/consistency-test.jpg',
          isPublic: true,
          downloadCount: 0,
        };

        const saved = await fileMetadataService.saveFileMetadata(metadata);

        // Simulate R2 delete failure during cleanup
        mockR2StorageService.deleteFile.mockRejectedValueOnce(new Error('R2 delete failed'));

        // Metadata should still be deleted even if R2 delete fails
        const deleted = await fileMetadataService.deleteFileMetadata(saved.id);
        expect(deleted).toBe(true);
      });

      it('should handle concurrent access to same file metadata', async () => {
        const metadata = await fileMetadataService.saveFileMetadata({
          userId: testUser.id.toString(),
          originalName: 'concurrent-access.jpg',
          fileName: 'access-test.jpg',
          fileType: 'avatar',
          mimeType: 'image/jpeg',
          size: 1024000,
          hash: 'concurrent-access',
          bucket: 'images',
          key: 'avatar/access-test.jpg',
          url: 'https://example.com/access-test.jpg',
          isPublic: true,
          downloadCount: 0,
        });

        // Simulate concurrent increment operations
        const incrementPromises = Array.from({ length: 10 }, () =>
          fileMetadataService.incrementDownloadCount(metadata.id),
        );

        await Promise.all(incrementPromises);

        const updated = await fileMetadataService.getFileMetadata(metadata.id);
        expect(updated!.downloadCount).toBe(10);
      });
    });

    describe('Input Validation Edge Cases', () => {
      it('should handle empty file names', () => {
        const result = fileValidationService.validateFileName('');

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Имя файла не может быть пустым');
      });

      it('should handle files with multiple extensions', async () => {
        const buffer = Buffer.from('test-content');
        const fileName = 'document.backup.tar.gz';

        const result = await fileValidationService.validateFile(buffer, fileName);

        expect(result.metadata.detectedMimeType).toBeDefined();
      });

      it('should handle files with special characters in names', () => {
        const specialNames = [
          'файл с русскими символами.jpg',
          'file with spaces.pdf',
          'file-with-dashes.txt',
          'file_with_underscores.doc',
        ];

        specialNames.forEach(name => {
          const result = fileValidationService.validateFileName(name);
          expect(result.isValid).toBe(true);
        });
      });

      it('should reject files with prohibited characters', () => {
        const prohibitedNames = [
          'file/with/slashes.txt',
          'file\\with\\backslashes.txt',
          'file<with>brackets.txt',
          'file|with|pipes.txt',
        ];

        prohibitedNames.forEach(name => {
          const result = fileValidationService.validateFileName(name);
          expect(result.isValid).toBe(false);
        });
      });
    });
  });

  describe('Integration with External Services', () => {
    describe('R2 Client Integration', () => {
      it('should properly configure bucket names', () => {
        const bucketName = mockR2ClientService.getBucketName('images');

        expect(bucketName).toBe('test-bucket');
        expect(mockR2ClientService.getBucketName).toHaveBeenCalledWith('images');
      });

      it('should generate public URLs correctly', () => {
        const publicUrl = mockR2ClientService.getPublicUrl('test-bucket', 'test-file.jpg');

        expect(mockR2ClientService.getPublicUrl).toHaveBeenCalledWith(
          'test-bucket',
          'test-file.jpg',
        );
      });
    });

    describe('File Type Configuration Integration', () => {
      it('should validate against configured file types', () => {
        const supportedTypes = ['avatar', 'banner', 'image_post', 'document'];

        supportedTypes.forEach(fileType => {
          const config = r2StorageService.getFileTypeConfig(fileType);
          expect(config).toBeDefined();
          expect(config!.bucket).toBeDefined();
          expect(config!.allowedMimeTypes.length).toBeGreaterThan(0);
          expect(config!.maxSize).toBeGreaterThan(0);
        });
      });

      it('should handle unsupported file types gracefully', () => {
        const config = r2StorageService.getFileTypeConfig('unsupported-type');
        expect(config).toBeUndefined();
      });
    });
  });
});
