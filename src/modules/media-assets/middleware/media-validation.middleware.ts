import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class MediaValidationMiddleware implements NestMiddleware {
  private readonly allowedMimeTypes = {
    sticker: ['image/png', 'image/webp', 'image/gif'],
    emoji: ['image/png', 'image/webp', 'image/gif'],
    gif: ['image/gif'],
  };

  private readonly maxFileSizes = {
    sticker: 2 * 1024 * 1024, // 2MB
    emoji: 512 * 1024, // 512KB
    gif: 8 * 1024 * 1024, // 8MB
  };

  use(req: Request, res: Response, next: NextFunction) {
    const file = req.file;
    if (!file) {
      return next();
    }

    // Determine media type from route
    const mediaType = this.getMediaTypeFromRoute(req.route?.path || req.path);
    if (!mediaType) {
      return next();
    }

    // Validate MIME type
    if (!this.allowedMimeTypes[mediaType].includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types for ${mediaType}: ${this.allowedMimeTypes[mediaType].join(', ')}`,
      );
    }

    // Validate file size
    if (file.size > this.maxFileSizes[mediaType]) {
      throw new BadRequestException(
        `File too large. Maximum size for ${mediaType}: ${this.maxFileSizes[mediaType] / (1024 * 1024)}MB`,
      );
    }

    // Additional security checks
    this.performSecurityChecks(file);

    next();
  }

  private getMediaTypeFromRoute(path: string): 'sticker' | 'emoji' | 'gif' | null {
    if (path.includes('/stickers')) return 'sticker';
    if (path.includes('/emojis')) return 'emoji';
    if (path.includes('/gifs')) return 'gif';
    return null;
  }

  private performSecurityChecks(file: Express.Multer.File) {
    // Check for suspicious file extensions in filename
    const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js'];
    const filename = file.originalname.toLowerCase();

    for (const ext of suspiciousExtensions) {
      if (filename.includes(ext)) {
        throw new BadRequestException('Suspicious file detected');
      }
    }

    // Check file header (magic bytes) matches MIME type
    if (!this.validateFileHeader(file.buffer, file.mimetype)) {
      throw new BadRequestException('File content does not match declared type');
    }
  }

  private validateFileHeader(buffer: Buffer, mimeType: string): boolean {
    if (!buffer || buffer.length < 4) return false;

    const header = buffer.subarray(0, 4);

    switch (mimeType) {
      case 'image/png':
        return header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;

      case 'image/gif':
        return (
          header[0] === 0x47 &&
          header[1] === 0x49 &&
          header[2] === 0x46 &&
          (header[3] === 0x38 || header[3] === 0x39)
        );

      case 'image/webp':
        return (
          buffer.length >= 12 &&
          header[0] === 0x52 &&
          header[1] === 0x49 &&
          header[2] === 0x46 &&
          header[3] === 0x46 &&
          buffer[8] === 0x57 &&
          buffer[9] === 0x45 &&
          buffer[10] === 0x42 &&
          buffer[11] === 0x50
        );

      default:
        return true; // Allow other types to pass through
    }
  }
}

@Injectable()
export class MediaRateLimitMiddleware implements NestMiddleware {
  private readonly uploadLimits = new Map<string, { count: number; resetTime: number }>();
  private readonly maxUploadsPerHour = 100;
  private readonly maxUploadsPerMinute = 10;
  use(req: Request, res: Response, next: NextFunction) {
    const userId = (req as any).user?.id;
    if (!userId) {
      return next(); // Skip rate limiting for non-authenticated requests
    }

    const now = Date.now();
    const hourKey = `${userId}-hour-${Math.floor(now / (60 * 60 * 1000))}`;
    const minuteKey = `${userId}-minute-${Math.floor(now / (60 * 1000))}`;

    // Check hourly limit
    const hourlyData = this.uploadLimits.get(hourKey) || {
      count: 0,
      resetTime: now + 60 * 60 * 1000,
    };
    if (hourlyData.count >= this.maxUploadsPerHour) {
      throw new BadRequestException('Upload limit exceeded. Please try again later.');
    }

    // Check per-minute limit
    const minuteData = this.uploadLimits.get(minuteKey) || { count: 0, resetTime: now + 60 * 1000 };
    if (minuteData.count >= this.maxUploadsPerMinute) {
      throw new BadRequestException('Upload rate limit exceeded. Please wait a moment.');
    }

    // Increment counters
    this.uploadLimits.set(hourKey, { ...hourlyData, count: hourlyData.count + 1 });
    this.uploadLimits.set(minuteKey, { ...minuteData, count: minuteData.count + 1 });

    // Clean up expired entries
    this.cleanupExpiredEntries(now);

    next();
  }

  private cleanupExpiredEntries(now: number) {
    for (const [key, data] of this.uploadLimits.entries()) {
      if (data.resetTime < now) {
        this.uploadLimits.delete(key);
      }
    }
  }
}
