import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecurityMiddleware.name);

  constructor(private configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Security headers
    this.setSecurityHeaders(res);

    // Request logging for security auditing
    this.logRequest(req);

    // Request sanitization
    this.sanitizeRequest(req);

    next();
  }

  private setSecurityHeaders(res: Response): void {
    // Prevent XSS attacks
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Enforce HTTPS
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:; connect-src 'self' https:; frame-ancestors 'none';",
    );

    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permission Policy
    res.setHeader(
      'Permissions-Policy',
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
    );

    // Remove server information
    res.removeHeader('X-Powered-By');
  }

  private logRequest(req: Request): void {
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    const safeHeaders = { ...req.headers };

    sensitiveHeaders.forEach(header => {
      if (safeHeaders[header]) {
        safeHeaders[header] = '[REDACTED]';
      }
    });

    this.logger.debug(`${req.method} ${req.originalUrl}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      headers: safeHeaders,
      timestamp: new Date().toISOString(),
    });
  }

  private sanitizeRequest(req: Request): void {
    // Basic input sanitization
    if (req.body && typeof req.body === 'object') {
      this.sanitizeObject(req.body);
    }

    if (req.query && typeof req.query === 'object') {
      this.sanitizeObject(req.query);
    }
  }

  private sanitizeObject(obj: any): void {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Remove potential XSS characters
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.sanitizeObject(obj[key]);
      }
    }
  }
}
