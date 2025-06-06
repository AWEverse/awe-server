import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MediaProcessingService } from '../../src/modules/media-hosting/services/media-processing.service';
import { MediaHostingModule } from '../../src/modules/media-hosting/media-hosting.module';
import { R2StorageService } from '../../src/libs/cloudflare-r2/r2-storage.service';
import { ImageProcessingService } from '../../src/modules/uploads/services/image-processing.service';
import { FileValidationService } from '../../src/modules/uploads/services/file-validation.service';
import {
  createTestApp,
  cleanupDatabase,
  createTestUser,
  createTestDatabase,
} from '../setup/database-setup';
import { faker } from '@faker-js/faker';

// Mock services
const mockR2StorageService = {
  uploadFile: jest.fn(),
  getSignedDownloadUrl: jest.fn(),
  deleteFile: jest.fn(),
  listFiles: jest.fn(),
};

const mockImageProcessingService = {
  processImage: jest.fn(),
  getImageInfo: jest.fn(),
  generateThumbnail: jest.fn(),
};

const mockFileValidationService = {
  validateFile: jest.fn(),
  validateMimeType: jest.fn(),
  validateFileSize: jest.fn(),
};

describe('Media Hosting Module Integration Tests', () => {
  let app: INestApplication;
  let mediaProcessingService: MediaProcessingService;
  let testUser: any;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [MediaHostingModule],
    })
      .overrideProvider(R2StorageService)
      .useValue(mockR2StorageService)
      .overrideProvider(ImageProcessingService)
      .useValue(mockImageProcessingService)
      .overrideProvider(FileValidationService)
      .useValue(mockFileValidationService)
      .compile();

    app = await createTestApp(module);
    mediaProcessingService = app.get<MediaProcessingService>(MediaProcessingService);

    await createTestDatabase();
  });

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create test user
    testUser = {
      id: faker.string.uuid(),
      username: 'mediauser',
      email: 'mediauser@test.com',
    };

    // Setup default mock responses
    mockR2StorageService.uploadFile.mockResolvedValue({
      key: faker.string.uuid(),
      url: faker.internet.url(),
      size: faker.number.int({ min: 1000, max: 100000 }),
    });

    mockR2StorageService.getSignedDownloadUrl.mockResolvedValue(faker.internet.url());

    mockImageProcessingService.processImage.mockResolvedValue([
      {
        variant: 'thumbnail',
        key: faker.string.uuid(),
        url: faker.internet.url(),
        size: faker.number.int({ min: 1000, max: 10000 }),
      },
      {
        variant: 'medium',
        key: faker.string.uuid(),
        url: faker.internet.url(),
        size: faker.number.int({ min: 10000, max: 50000 }),
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('MediaProcessingService', () => {
    describe('Job Management', () => {
      it('should queue video transcoding job', async () => {
        const bucket = 'test-bucket';
        const fileKey = 'videos/test-video.mp4';
        const type = 'video_transcode';

        const jobId = await mediaProcessingService.queueMediaProcessing(
          bucket,
          fileKey,
          testUser.id,
          type,
        );

        expect(jobId).toBeDefined();
        expect(typeof jobId).toBe('string');
        expect(jobId).toMatch(/^job_/);

        const job = await mediaProcessingService.getJobStatus(jobId);
        expect(job).toBeDefined();
        expect(job!.id).toBe(jobId);
        expect(job!.userId).toBe(testUser.id);
        expect(job!.originalFileKey).toBe(fileKey);
        expect(job!.bucket).toBe(bucket);
        expect(job!.type).toBe(type);
        expect(job!.status).toBe('pending');
        expect(job!.progress).toBe(0);
      });

      it('should queue image optimization job', async () => {
        const bucket = 'test-bucket';
        const fileKey = 'images/test-image.jpg';
        const type = 'image_optimize';

        const jobId = await mediaProcessingService.queueMediaProcessing(
          bucket,
          fileKey,
          testUser.id,
          type,
        );

        expect(jobId).toBeDefined();

        const job = await mediaProcessingService.getJobStatus(jobId);
        expect(job!.type).toBe(type);
      });

      it('should queue audio compression job', async () => {
        const bucket = 'test-bucket';
        const fileKey = 'audio/test-audio.mp3';
        const type = 'audio_compress';

        const jobId = await mediaProcessingService.queueMediaProcessing(
          bucket,
          fileKey,
          testUser.id,
          type,
        );

        expect(jobId).toBeDefined();

        const job = await mediaProcessingService.getJobStatus(jobId);
        expect(job!.type).toBe(type);
      });

      it('should return null for non-existent job', async () => {
        const job = await mediaProcessingService.getJobStatus('non-existent-job');
        expect(job).toBeNull();
      });

      it('should get user jobs', async () => {
        // Create multiple jobs for the user
        const jobIds = await Promise.all([
          mediaProcessingService.queueMediaProcessing(
            'bucket1',
            'file1.mp4',
            testUser.id,
            'video_transcode',
          ),
          mediaProcessingService.queueMediaProcessing(
            'bucket1',
            'file2.jpg',
            testUser.id,
            'image_optimize',
          ),
          mediaProcessingService.queueMediaProcessing(
            'bucket1',
            'file3.mp3',
            testUser.id,
            'audio_compress',
          ),
        ]);

        const userJobs = await mediaProcessingService.getUserJobs(testUser.id);

        expect(userJobs).toHaveLength(3);
        userJobs.forEach(job => {
          expect(job.userId).toBe(testUser.id);
          expect(jobIds).toContain(job.id);
        });

        // Jobs should be sorted by creation time (newest first)
        for (let i = 1; i < userJobs.length; i++) {
          const prevJobTime = userJobs[i - 1].startedAt?.getTime() || 0;
          const currentJobTime = userJobs[i].startedAt?.getTime() || 0;
          expect(prevJobTime).toBeGreaterThanOrEqual(currentJobTime);
        }
      });

      it('should filter user jobs by other user', async () => {
        const otherUser = {
          id: faker.string.uuid(),
          username: 'otheruser',
        };

        // Create job for test user
        await mediaProcessingService.queueMediaProcessing(
          'bucket1',
          'file1.mp4',
          testUser.id,
          'video_transcode',
        );

        // Get jobs for other user
        const otherUserJobs = await mediaProcessingService.getUserJobs(otherUser.id);
        expect(otherUserJobs).toHaveLength(0);
      });
    });

    describe('Video Transcoding', () => {
      it('should process video transcoding job successfully', async () => {
        const jobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'videos/test-video.mp4',
          testUser.id,
          'video_transcode',
        );

        // Wait for processing to complete
        await new Promise(resolve => setTimeout(resolve, 2000));

        const job = await mediaProcessingService.getJobStatus(jobId);
        expect(job!.status).toBe('completed');
        expect(job!.progress).toBe(100);
        expect(job!.completedAt).toBeDefined();
        expect(job!.outputFiles.length).toBeGreaterThan(0);

        // Check that R2 storage was called for each resolution and format
        const videoPresets = mediaProcessingService.getVideoPresets();
        const standardPreset = videoPresets.standard;

        const expectedUploads =
          standardPreset.resolutions.length * standardPreset.formats.length +
          (standardPreset.generateThumbnails ? standardPreset.thumbnailCount : 0);

        expect(mockR2StorageService.uploadFile).toHaveBeenCalledTimes(expectedUploads);

        // Verify output files contain expected variants
        const variants = job!.outputFiles.map(f => f.variant);
        expect(variants).toContain('240p_mp4');
        expect(variants).toContain('360p_mp4');
        expect(variants).toContain('720p_webm');
        expect(variants).toContain('thumbnail_0');
      });

      it('should process video with custom preset', async () => {
        const customPreset = {
          resolutions: [
            { name: '720p', width: 1280, height: 720, bitrate: '2500k' },
            { name: '1080p', width: 1920, height: 1080, bitrate: '5000k' },
          ],
          formats: ['mp4'],
          generateThumbnails: true,
          thumbnailCount: 5,
        };

        const jobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'videos/hd-video.mp4',
          testUser.id,
          'video_transcode',
          customPreset,
        );

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1500));

        const job = await mediaProcessingService.getJobStatus(jobId);
        expect(job!.status).toBe('completed');

        const expectedUploads = 2 * 1 + 5; // 2 resolutions * 1 format + 5 thumbnails
        expect(mockR2StorageService.uploadFile).toHaveBeenCalledTimes(expectedUploads);

        const variants = job!.outputFiles.map(f => f.variant);
        expect(variants).toContain('720p_mp4');
        expect(variants).toContain('1080p_mp4');
        expect(variants.filter(v => v.startsWith('thumbnail_'))).toHaveLength(5);
      });

      it('should get video presets', async () => {
        const presets = mediaProcessingService.getVideoPresets();

        expect(presets).toBeDefined();
        expect(presets.standard).toBeDefined();
        expect(presets.mobile).toBeDefined();
        expect(presets.high_quality).toBeDefined();

        // Verify standard preset structure
        const standardPreset = presets.standard;
        expect(standardPreset.resolutions).toBeInstanceOf(Array);
        expect(standardPreset.formats).toBeInstanceOf(Array);
        expect(typeof standardPreset.generateThumbnails).toBe('boolean');
        expect(typeof standardPreset.thumbnailCount).toBe('number');

        // Verify resolution structure
        standardPreset.resolutions.forEach(resolution => {
          expect(resolution.name).toBeDefined();
          expect(resolution.width).toBeGreaterThan(0);
          expect(resolution.height).toBeGreaterThan(0);
          expect(resolution.bitrate).toMatch(/^\d+k$/);
        });
      });
    });

    describe('Image Optimization', () => {
      it('should process image optimization job successfully', async () => {
        const jobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'images/test-image.jpg',
          testUser.id,
          'image_optimize',
        );

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        const job = await mediaProcessingService.getJobStatus(jobId);
        expect(job!.status).toBe('completed');
        expect(job!.progress).toBe(100);
        expect(job!.outputFiles.length).toBeGreaterThan(0);

        // Verify image processing service was called
        expect(mockImageProcessingService.processImage).toHaveBeenCalledWith(
          expect.any(Buffer),
          expect.stringContaining('optimized_image.jpg'),
          'image_post',
          testUser.id,
        );

        // Verify output files match image processing results
        const variants = job!.outputFiles.map(f => f.variant);
        expect(variants).toContain('thumbnail');
        expect(variants).toContain('medium');
      });

      it('should handle image processing errors', async () => {
        mockImageProcessingService.processImage.mockRejectedValue(
          new Error('Image processing failed'),
        );

        const jobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'images/corrupt-image.jpg',
          testUser.id,
          'image_optimize',
        );

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        const job = await mediaProcessingService.getJobStatus(jobId);
        expect(job!.status).toBe('failed');
        expect(job!.error).toContain('Image processing failed');
      });
    });

    describe('Audio Compression', () => {
      it('should process audio compression job successfully', async () => {
        const jobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'audio/test-audio.mp3',
          testUser.id,
          'audio_compress',
        );

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1500));

        const job = await mediaProcessingService.getJobStatus(jobId);
        expect(job!.status).toBe('completed');
        expect(job!.progress).toBe(100);
        expect(job!.outputFiles.length).toBe(4); // 64k, 128k, 192k, 320k

        // Verify output files contain expected quality variants
        const variants = job!.outputFiles.map(f => f.variant);
        expect(variants).toContain('compressed_64k');
        expect(variants).toContain('compressed_128k');
        expect(variants).toContain('compressed_192k');
        expect(variants).toContain('compressed_320k');

        // Verify R2 storage was called for each quality
        expect(mockR2StorageService.uploadFile).toHaveBeenCalledTimes(4);
      });
    });

    describe('Auto Processing', () => {
      it('should auto-process video files', async () => {
        const jobId = await mediaProcessingService.autoProcessMedia(
          'test-bucket',
          'uploads/video.mp4',
          testUser.id,
          'video/mp4',
        );

        expect(jobId).toBeDefined();

        const job = await mediaProcessingService.getJobStatus(jobId!);
        expect(job!.type).toBe('video_transcode');
      });

      it('should auto-process image files', async () => {
        const jobId = await mediaProcessingService.autoProcessMedia(
          'test-bucket',
          'uploads/image.jpg',
          testUser.id,
          'image/jpeg',
        );

        expect(jobId).toBeDefined();

        const job = await mediaProcessingService.getJobStatus(jobId!);
        expect(job!.type).toBe('image_optimize');
      });

      it('should auto-process audio files', async () => {
        const jobId = await mediaProcessingService.autoProcessMedia(
          'test-bucket',
          'uploads/audio.mp3',
          testUser.id,
          'audio/mpeg',
        );

        expect(jobId).toBeDefined();

        const job = await mediaProcessingService.getJobStatus(jobId!);
        expect(job!.type).toBe('audio_compress');
      });

      it('should return null for unsupported file types', async () => {
        const jobId = await mediaProcessingService.autoProcessMedia(
          'test-bucket',
          'uploads/document.pdf',
          testUser.id,
          'application/pdf',
        );

        expect(jobId).toBeNull();
      });

      it('should return null for unknown MIME types', async () => {
        const jobId = await mediaProcessingService.autoProcessMedia(
          'test-bucket',
          'uploads/unknown.xyz',
          testUser.id,
          'application/octet-stream',
        );

        expect(jobId).toBeNull();
      });
    });

    describe('Job Cleanup', () => {
      it('should cleanup old completed jobs', async () => {
        // Create jobs and manually set completion time to past
        const oldJobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'old-file.mp4',
          testUser.id,
          'video_transcode',
        );

        const recentJobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'recent-file.mp4',
          testUser.id,
          'video_transcode',
        );

        // Wait for jobs to start
        await new Promise(resolve => setTimeout(resolve, 100));

        // Manually modify completion time for old job
        const oldJob = await mediaProcessingService.getJobStatus(oldJobId);
        if (oldJob) {
          oldJob.status = 'completed';
          oldJob.completedAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
        }

        const deletedCount = await mediaProcessingService.cleanupOldJobs();

        expect(deletedCount).toBe(1);

        // Verify old job is deleted and recent job remains
        const oldJobAfterCleanup = await mediaProcessingService.getJobStatus(oldJobId);
        const recentJobAfterCleanup = await mediaProcessingService.getJobStatus(recentJobId);

        expect(oldJobAfterCleanup).toBeNull();
        expect(recentJobAfterCleanup).toBeDefined();
      });

      it('should not cleanup jobs still processing', async () => {
        const processingJobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'processing-file.mp4',
          testUser.id,
          'video_transcode',
        );

        // Wait for job to start processing
        await new Promise(resolve => setTimeout(resolve, 100));

        const processingJob = await mediaProcessingService.getJobStatus(processingJobId);
        if (processingJob) {
          processingJob.status = 'processing';
          processingJob.startedAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
        }

        const deletedCount = await mediaProcessingService.cleanupOldJobs();

        // Processing job should not be deleted
        const jobAfterCleanup = await mediaProcessingService.getJobStatus(processingJobId);
        expect(jobAfterCleanup).toBeDefined();
      });
    });

    describe('Error Handling', () => {
      it('should handle R2 storage upload failures', async () => {
        mockR2StorageService.uploadFile.mockRejectedValue(new Error('Storage upload failed'));

        const jobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'failing-video.mp4',
          testUser.id,
          'video_transcode',
        );

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1500));

        const job = await mediaProcessingService.getJobStatus(jobId);
        expect(job!.status).toBe('failed');
        expect(job!.error).toContain('Storage upload failed');
      });

      it('should handle download URL generation failures', async () => {
        mockR2StorageService.getSignedDownloadUrl.mockRejectedValue(
          new Error('Download URL generation failed'),
        );

        const jobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'inaccessible-image.jpg',
          testUser.id,
          'image_optimize',
        );

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        const job = await mediaProcessingService.getJobStatus(jobId);
        expect(job!.status).toBe('failed');
        expect(job!.error).toContain('Download URL generation failed');
      });

      it('should handle processing timeouts gracefully', async () => {
        // Mock a very slow upload to simulate timeout
        mockR2StorageService.uploadFile.mockImplementation(
          () => new Promise(resolve => setTimeout(resolve, 5000)),
        );

        const jobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'slow-video.mp4',
          testUser.id,
          'video_transcode',
        );

        // Check status before timeout
        await new Promise(resolve => setTimeout(resolve, 100));

        const jobDuringProcessing = await mediaProcessingService.getJobStatus(jobId);
        expect(jobDuringProcessing!.status).toBe('processing');
        expect(jobDuringProcessing!.progress).toBeGreaterThanOrEqual(0);
      });

      it('should validate job exists before processing', async () => {
        const jobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'test-file.mp4',
          testUser.id,
          'video_transcode',
        );

        // Manually remove job from memory (simulating corruption)
        const privateService = mediaProcessingService as any;
        privateService.processingJobs.delete(jobId);

        // Job should not exist anymore
        const job = await mediaProcessingService.getJobStatus(jobId);
        expect(job).toBeNull();
      });
    });

    describe('Performance and Load Tests', () => {
      it('should handle concurrent job creation', async () => {
        const concurrentJobs = 20;
        const jobPromises = Array(concurrentJobs)
          .fill(null)
          .map((_, i) =>
            mediaProcessingService.queueMediaProcessing(
              'test-bucket',
              `concurrent-file-${i}.mp4`,
              testUser.id,
              'video_transcode',
            ),
          );

        const startTime = Date.now();
        const jobIds = await Promise.all(jobPromises);
        const endTime = Date.now();

        expect(jobIds).toHaveLength(concurrentJobs);
        expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second

        // Verify all jobs have unique IDs
        const uniqueIds = new Set(jobIds);
        expect(uniqueIds.size).toBe(concurrentJobs);

        // Verify all jobs exist
        const jobStatuses = await Promise.all(
          jobIds.map(id => mediaProcessingService.getJobStatus(id)),
        );

        jobStatuses.forEach((job, index) => {
          expect(job).toBeDefined();
          expect(job!.id).toBe(jobIds[index]);
        });
      });

      it('should handle multiple users processing jobs simultaneously', async () => {
        const users = Array(5)
          .fill(null)
          .map((_, i) => ({
            id: faker.string.uuid(),
            username: `user${i}`,
          }));

        const allJobPromises = users.flatMap(user =>
          Array(3)
            .fill(null)
            .map((_, i) =>
              mediaProcessingService.queueMediaProcessing(
                'test-bucket',
                `user-${user.id}-file-${i}.mp4`,
                user.id,
                'video_transcode',
              ),
            ),
        );

        const startTime = Date.now();
        const allJobIds = await Promise.all(allJobPromises);
        const endTime = Date.now();

        expect(allJobIds).toHaveLength(15); // 5 users * 3 jobs each
        expect(endTime - startTime).toBeLessThan(2000);

        // Verify user jobs are properly separated
        for (const user of users) {
          const userJobs = await mediaProcessingService.getUserJobs(user.id);
          expect(userJobs).toHaveLength(3);
          userJobs.forEach(job => {
            expect(job.userId).toBe(user.id);
          });
        }
      });

      it('should handle rapid status checks', async () => {
        const jobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'status-check-file.mp4',
          testUser.id,
          'video_transcode',
        );

        const statusCheckPromises = Array(50)
          .fill(null)
          .map(() => mediaProcessingService.getJobStatus(jobId));

        const startTime = Date.now();
        const statuses = await Promise.all(statusCheckPromises);
        const endTime = Date.now();

        expect(statuses).toHaveLength(50);
        expect(endTime - startTime).toBeLessThan(500); // Should complete within 500ms

        // All status checks should return the same job
        statuses.forEach(status => {
          expect(status).toBeDefined();
          expect(status!.id).toBe(jobId);
        });
      });

      it('should efficiently manage memory with many jobs', async () => {
        // Create many jobs to test memory management
        const largeJobCount = 100;
        const jobPromises = Array(largeJobCount)
          .fill(null)
          .map((_, i) =>
            mediaProcessingService.queueMediaProcessing(
              'test-bucket',
              `memory-test-${i}.jpg`,
              testUser.id,
              'image_optimize',
            ),
          );

        const jobIds = await Promise.all(jobPromises);

        // Verify all jobs exist
        expect(jobIds).toHaveLength(largeJobCount);

        // Check user jobs (should be efficient even with many jobs)
        const startTime = Date.now();
        const userJobs = await mediaProcessingService.getUserJobs(testUser.id);
        const endTime = Date.now();

        expect(userJobs).toHaveLength(largeJobCount);
        expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second

        // Cleanup and verify memory is freed
        const deletedCount = await mediaProcessingService.cleanupOldJobs();

        // Since jobs are still processing or haven't been completed for 24h, none should be deleted
        expect(deletedCount).toBe(0);
      });
    });

    describe('Job Progress Tracking', () => {
      it('should track video transcoding progress', async () => {
        const jobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'progress-video.mp4',
          testUser.id,
          'video_transcode',
        );

        // Check initial status
        let job = await mediaProcessingService.getJobStatus(jobId);
        expect(job!.status).toBe('pending');
        expect(job!.progress).toBe(0);

        // Wait and check progress during processing
        await new Promise(resolve => setTimeout(resolve, 500));

        job = await mediaProcessingService.getJobStatus(jobId);
        if (job!.status === 'processing') {
          expect(job!.progress).toBeGreaterThan(0);
          expect(job!.progress).toBeLessThan(100);
          expect(job!.startedAt).toBeDefined();
        }

        // Wait for completion
        await new Promise(resolve => setTimeout(resolve, 2000));

        job = await mediaProcessingService.getJobStatus(jobId);
        expect(job!.status).toBe('completed');
        expect(job!.progress).toBe(100);
        expect(job!.completedAt).toBeDefined();
      });

      it('should track image optimization progress', async () => {
        const jobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'progress-image.jpg',
          testUser.id,
          'image_optimize',
        );

        // Wait for processing to start and check intermediate progress
        await new Promise(resolve => setTimeout(resolve, 300));

        let job = await mediaProcessingService.getJobStatus(jobId);
        if (job!.status === 'processing') {
          expect(job!.progress).toBeGreaterThan(0);
        }

        // Wait for completion
        await new Promise(resolve => setTimeout(resolve, 1000));

        job = await mediaProcessingService.getJobStatus(jobId);
        expect(job!.status).toBe('completed');
        expect(job!.progress).toBe(100);
      });

      it('should track audio compression progress', async () => {
        const jobId = await mediaProcessingService.queueMediaProcessing(
          'test-bucket',
          'progress-audio.mp3',
          testUser.id,
          'audio_compress',
        );

        // Monitor progress during processing
        const progressChecks = [];
        const checkInterval = setInterval(async () => {
          const job = await mediaProcessingService.getJobStatus(jobId);
          if (job) {
            progressChecks.push({
              status: job.status,
              progress: job.progress,
              timestamp: Date.now(),
            });
          }
        }, 200);

        // Wait for completion
        await new Promise(resolve => setTimeout(resolve, 1500));
        clearInterval(checkInterval);

        const finalJob = await mediaProcessingService.getJobStatus(jobId);
        expect(finalJob!.status).toBe('completed');
        expect(finalJob!.progress).toBe(100);

        // Verify progress increased over time
        const processingChecks = progressChecks.filter(check => check.status === 'processing');

        if (processingChecks.length > 1) {
          expect(processingChecks[processingChecks.length - 1].progress).toBeGreaterThan(
            processingChecks[0].progress,
          );
        }
      });
    });

    describe('Integration with Storage and Processing Services', () => {
      it('should properly integrate with R2 storage service', async () => {
        const jobId = await mediaProcessingService.queueMediaProcessing(
          'integration-bucket',
          'integration/test-video.mp4',
          testUser.id,
          'video_transcode',
        );

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify R2 storage methods were called with correct parameters
        expect(mockR2StorageService.uploadFile).toHaveBeenCalled();

        const uploadCalls = mockR2StorageService.uploadFile.mock.calls;
        uploadCalls.forEach(call => {
          const [buffer, fileName, category, options] = call;

          expect(buffer).toBeInstanceOf(Buffer);
          expect(typeof fileName).toBe('string');
          expect(typeof category).toBe('string');
          expect(options.metadata).toBeDefined();
          expect(options.metadata.jobId).toBe(jobId);
          expect(options.metadata.originalKey).toBe('integration/test-video.mp4');
        });
      });

      it('should properly integrate with image processing service', async () => {
        const jobId = await mediaProcessingService.queueMediaProcessing(
          'integration-bucket',
          'integration/test-image.jpg',
          testUser.id,
          'image_optimize',
        );

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify image processing service was called
        expect(mockImageProcessingService.processImage).toHaveBeenCalledWith(
          expect.any(Buffer),
          'optimized_image.jpg',
          'image_post',
          testUser.id,
        );

        const job = await mediaProcessingService.getJobStatus(jobId);
        expect(job!.outputFiles).toHaveLength(2); // Based on mock response
      });

      it('should handle service integration failures gracefully', async () => {
        // Mock storage service failure
        mockR2StorageService.uploadFile.mockRejectedValueOnce(
          new Error('Storage service unavailable'),
        );

        const jobId = await mediaProcessingService.queueMediaProcessing(
          'failing-bucket',
          'failing-file.mp4',
          testUser.id,
          'video_transcode',
        );

        await new Promise(resolve => setTimeout(resolve, 1500));

        const job = await mediaProcessingService.getJobStatus(jobId);
        expect(job!.status).toBe('failed');
        expect(job!.error).toContain('Storage service unavailable');
      });
    });
  });
});
