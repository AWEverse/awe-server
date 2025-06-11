import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../libs/supabase/db/prisma.service';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { AUTH_CONSTANTS } from '../constants/auth.constants';

interface JwtPayload {
  sub: string;
  email: string;
  username?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class ThrottledAuthGuard implements CanActivate {
  private readonly userCache = new Map<string, { user: any; timestamp: number }>();
  private readonly blockedTokens = new Set<string>();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Access token is required');
    }

    // Check if token is blacklisted
    if (this.blockedTokens.has(token)) {
      throw new UnauthorizedException('Token has been revoked');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      // Get user from cache or database
      const user = await this.getUserWithCache(payload.sub);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Check if user is active
      if (user.status !== 'ACTIVE') {
        throw new UnauthorizedException('User account is not active');
      }

      // Attach user to request
      request.user = {
        id: user.id.toString(),
        sub: user.id.toString(),
        email: user.email,
        username: user.username,
        role: user.role,
        flags: user.flags,
      };

      return true;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Access token has expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid access token');
      }
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  private async getUserWithCache(userId: string): Promise<any> {
    const now = Date.now();
    const cached = this.userCache.get(userId);

    // Return cached user if still valid (5 minutes TTL)
    if (cached && now - cached.timestamp < AUTH_CONSTANTS.CACHE_TTL.USER_PROFILE * 1000) {
      return cached.user;
    }

    // Fetch from database
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      include: { role: true },
    });

    if (user) {
      this.userCache.set(userId, { user, timestamp: now });

      // Clean up old cache entries (simple cleanup)
      if (this.userCache.size > 1000) {
        const cutoff = now - AUTH_CONSTANTS.CACHE_TTL.USER_PROFILE * 2 * 1000;
        for (const [key, value] of this.userCache.entries()) {
          if (value.timestamp < cutoff) {
            this.userCache.delete(key);
          }
        }
      }
    }

    return user;
  }

  // Method to manually invalidate user cache
  public invalidateUserCache(userId: string): void {
    this.userCache.delete(userId);
  }

  // Method to block token
  public blockToken(token: string): void {
    this.blockedTokens.add(token);

    // Clean up old blocked tokens (simple cleanup)
    if (this.blockedTokens.size > 10000) {
      const tokensArray = Array.from(this.blockedTokens);
      const keepTokens = tokensArray.slice(-5000); // Keep last 5000
      this.blockedTokens.clear();
      keepTokens.forEach(token => this.blockedTokens.add(token));
    }
  }
}
