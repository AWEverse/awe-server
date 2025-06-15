import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../../libs/db/prisma.service';
import { AUTH_CONSTANTS } from '../constants/auth.constants';

interface SessionData {
  userId: string;
  lastActivity: number;
  startTime: number;
  deviceId?: string;
  ipAddress?: string;
}

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SessionMiddleware.name);
  private readonly sessions = new Map<string, SessionData>();
  private readonly userSessions = new Map<string, Set<string>>();

  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user;

    if (!user) {
      return next();
    }

    try {
      await this.handleSession(req, user);
    } catch (error) {
      this.logger.error('Session handling error:', error);
    }

    next();
  }

  private async handleSession(req: Request, user: any): Promise<void> {
    const sessionId = this.generateSessionId(user.id, req);
    const now = Date.now();

    const existingSession = this.sessions.get(sessionId);

    if (existingSession) {
      // Check for idle timeout
      const idleTime = now - existingSession.lastActivity;
      const idleTimeoutMs = AUTH_CONSTANTS.SESSION.IDLE_TIMEOUT_MINUTES * 60 * 1000;

      if (idleTime > idleTimeoutMs) {
        this.logger.warn(`Session ${sessionId} expired due to inactivity`);
        this.removeSession(sessionId, user.id);
        throw new Error('Session expired due to inactivity');
      }

      // Check for absolute timeout
      const absoluteTime = now - existingSession.startTime;
      const absoluteTimeoutMs = AUTH_CONSTANTS.SESSION.ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000;

      if (absoluteTime > absoluteTimeoutMs) {
        this.logger.warn(`Session ${sessionId} expired due to absolute timeout`);
        this.removeSession(sessionId, user.id);
        throw new Error('Session expired');
      }

      // Update last activity
      existingSession.lastActivity = now;
    } else {
      // Create new session
      await this.createSession(sessionId, user, req, now);
    }

    // Update user's last seen
    await this.updateUserActivity(user.id);
  }

  private async createSession(
    sessionId: string,
    user: any,
    req: Request,
    now: number,
  ): Promise<void> {
    // Check concurrent session limit
    const userSessionSet = this.userSessions.get(user.id) || new Set();

    if (userSessionSet.size >= AUTH_CONSTANTS.SESSION.MAX_CONCURRENT_SESSIONS) {
      // Remove oldest session
      const oldestSessionId = Array.from(userSessionSet)[0];
      this.removeSession(oldestSessionId, user.id);
      this.logger.warn(`Removed oldest session for user ${user.id} due to limit`);
    }

    // Create session data
    const sessionData: SessionData = {
      userId: user.id,
      lastActivity: now,
      startTime: now,
      deviceId: this.extractDeviceId(req),
      ipAddress: req.ip,
    };

    // Store session
    this.sessions.set(sessionId, sessionData);
    userSessionSet.add(sessionId);
    this.userSessions.set(user.id, userSessionSet);

    this.logger.log(`Created new session ${sessionId} for user ${user.id}`);
  }

  private removeSession(sessionId: string, userId: string): void {
    this.sessions.delete(sessionId);

    const userSessionSet = this.userSessions.get(userId);
    if (userSessionSet) {
      userSessionSet.delete(sessionId);
      if (userSessionSet.size === 0) {
        this.userSessions.delete(userId);
      }
    }
  }

  private generateSessionId(userId: string, req: Request): string {
    const deviceId = this.extractDeviceId(req);
    const ip = req.ip;
    return `${userId}:${deviceId}:${ip}`;
  }

  private extractDeviceId(req: Request): string {
    // Try to extract device ID from headers or generate one
    const userAgent = req.get('User-Agent') || 'unknown';
    const deviceHeader = req.get('X-Device-ID');

    if (deviceHeader) {
      return deviceHeader;
    }

    // Generate a simple device fingerprint
    const fingerprint = Buffer.from(userAgent).toString('base64').substring(0, 16);
    return fingerprint;
  }

  private async updateUserActivity(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: BigInt(userId) },
        data: { lastSeen: new Date() },
      });
    } catch (error) {
      this.logger.error(`Failed to update user activity for ${userId}:`, error);
    }
  }

  // Public methods for session management
  public getActiveSessions(userId: string): string[] {
    const userSessionSet = this.userSessions.get(userId);
    return userSessionSet ? Array.from(userSessionSet) : [];
  }

  public revokeUserSessions(userId: string): void {
    const userSessionSet = this.userSessions.get(userId);
    if (userSessionSet) {
      userSessionSet.forEach(sessionId => {
        this.sessions.delete(sessionId);
      });
      this.userSessions.delete(userId);
      this.logger.log(`Revoked all sessions for user ${userId}`);
    }
  }

  public revokeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.removeSession(sessionId, session.userId);
      this.logger.log(`Revoked session ${sessionId}`);
      return true;
    }
    return false;
  }

  // Cleanup expired sessions
  public cleanupExpiredSessions(): void {
    const now = Date.now();
    const idleTimeoutMs = AUTH_CONSTANTS.SESSION.IDLE_TIMEOUT_MINUTES * 60 * 1000;
    const absoluteTimeoutMs = AUTH_CONSTANTS.SESSION.ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000;

    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const idleTime = now - session.lastActivity;
      const absoluteTime = now - session.startTime;

      if (idleTime > idleTimeoutMs || absoluteTime > absoluteTimeoutMs) {
        this.removeSession(sessionId, session.userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} expired sessions`);
    }
  }
}
