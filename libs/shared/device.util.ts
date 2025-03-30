import { createHash } from 'crypto';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

interface ClientData {
  screenResolution?: string; // e.g., "1920x1080"
  timezone?: string; // e.g., "America/New_York"
  colorDepth?: number; // e.g., 24
  plugins?: string; // e.g., "PDF,Flash"
  canvasFingerprint?: string; // Hash of canvas rendering
  webglFingerprint?: string; // Hash of WebGL rendering
  fonts?: string; // e.g., "Arial,Times New Roman"
  hardwareConcurrency?: number; // e.g., 4 (CPU cores)
  deviceMemory?: number; // e.g., 8 (GB of RAM)
  touchSupport?: boolean; // e.g., true for touch-enabled devices
  audioFingerprint?: string; // Hash of AudioContext output
  platform?: string; // e.g., "Win32"
}

export class DeviceUtil {
  private static readonly UNKNOWN = 'unknown';
  private static readonly HASH_ALGORITHM = 'sha256';
  private static readonly DELIMITER = '|'; // Distinct separator for clarity
  private static readonly VERSION = '2.0'; // Updated version for new attributes

  /**
   * Generates a base fingerprint using HTTP headers with minimal stable attributes.
   * Includes versioning and UUID fallback for low-entropy cases.
   * @param req Express Request object
   * @returns SHA-256 hash fingerprint
   */
  static generateFingerprint(req: Request): string {
    const headers = req.headers;
    const ip = this.getReliableIp(req);

    const data: Record<string, string> = {
      userAgent: this.normalizeHeader(headers['user-agent']),
      ip, // Optional stability consideration: could be excluded if volatile
      acceptLanguage: this.normalizeHeader(headers['accept-language']),
      acceptEncoding: this.normalizeHeader(headers['accept-encoding']),
      dnt: this.normalizeHeader(headers['dnt']) || '0', // Do Not Track
    };

    const allUnknown = Object.values(data).every((val) => val === DeviceUtil.UNKNOWN || val === '0');
    const entropySource = allUnknown ? `${DeviceUtil.DELIMITER}uuid=${uuidv4()}` : '';

    const raw = Buffer.from(
      `${DeviceUtil.VERSION}${DeviceUtil.DELIMITER}${Object.entries(data)
        .map(([key, value]) => `${key}=${value}`)
        .join(DeviceUtil.DELIMITER)}${entropySource}`
    );

    const fingerprint = createHash(DeviceUtil.HASH_ALGORITHM)
      .update(raw)
      .digest('hex');

    if (allUnknown && process.env.NODE_ENV !== 'production') {
      console.warn('Low entropy base fingerprint generated', {
        fingerprint,
        ip,
        userAgent: data.userAgent,
      });
    }

    return fingerprint;
  }

  /**
   * Generates an enhanced fingerprint with comprehensive server-side and client-side data.
   * Incorporates advanced attributes like canvas, WebGL, and audio fingerprints for high entropy.
   * @param req Express Request object
   * @param clientData Client-side collected data
   * @returns SHA-256 hash fingerprint
   */
  static generateEnhancedFingerprint(req: Request, clientData: ClientData = {}): string {
    const headers = req.headers;
    const ip = this.getReliableIp(req);

    const serverData: Record<string, string> = {
      userAgent: this.normalizeHeader(headers['user-agent']),
      acceptLanguage: this.normalizeHeader(headers['accept-language']),
      acceptEncoding: this.normalizeHeader(headers['accept-encoding']),
      connection: this.normalizeHeader(headers['connection']),
      dnt: this.normalizeHeader(headers['dnt']) || '0',
    };

    const clientDataNormalized: Record<string, string | number | boolean> = {
      screenResolution: clientData.screenResolution || DeviceUtil.UNKNOWN,
      timezone: clientData.timezone || DeviceUtil.UNKNOWN,
      colorDepth: clientData.colorDepth ?? 0,
      plugins: this.normalizePlugins(clientData.plugins),
      canvasFingerprint: clientData.canvasFingerprint || DeviceUtil.UNKNOWN,
      webglFingerprint: clientData.webglFingerprint || DeviceUtil.UNKNOWN,
      fonts: this.normalizeFonts(clientData.fonts),
      hardwareConcurrency: clientData.hardwareConcurrency ?? 0,
      deviceMemory: clientData.deviceMemory ?? 0,
      touchSupport: clientData.touchSupport ?? false,
      audioFingerprint: clientData.audioFingerprint || DeviceUtil.UNKNOWN,
      platform: clientData.platform || DeviceUtil.UNKNOWN,
    };

    const combinedData = { ...serverData, ...clientDataNormalized };
    const sortedKeys = Object.keys(combinedData).sort(); 
    const raw = Buffer.from(
      `${DeviceUtil.VERSION}${DeviceUtil.DELIMITER}${sortedKeys
        .map((key) => `${key}=${combinedData[key]}`)
        .join(DeviceUtil.DELIMITER)}`
    );

    return createHash(DeviceUtil.HASH_ALGORITHM)
      .update(raw)
      .digest('hex');
  }

  /**
   * Extracts a reliable IP address, handling proxies and load balancers
   */
  private static getReliableIp(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0];
      return ips.trim() || req.ip || DeviceUtil.UNKNOWN;
    }
    return req.ip || DeviceUtil.UNKNOWN;
  }

  /**
   * Normalizes header values for consistency
   */
  private static normalizeHeader(value: string | string[] | undefined): string {
    if (!value) return DeviceUtil.UNKNOWN;
    return Array.isArray(value) ? value[0].trim() : value.trim();
  }

  /**
   * Normalizes plugin list for consistent ordering
   */
  private static normalizePlugins(plugins: string | undefined): string {
    if (!plugins) return DeviceUtil.UNKNOWN;
    return plugins.split(',').map((p) => p.trim()).sort().join(',');
  }

  /**
   * Normalizes font list for consistent ordering
   */
  private static normalizeFonts(fonts: string | undefined): string {
    if (!fonts) return DeviceUtil.UNKNOWN;
    return fonts.split(',').map((f) => f.trim()).sort().join(',');
  }

  /**
   * Validates fingerprint format (SHA-256 hex)
   */
  static isValidFingerprint(fingerprint: string): boolean {
    return typeof fingerprint === 'string' && /^[0-9a-f]{64}$/i.test(fingerprint);
  }
}