import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthService } from '../../../libs/supabase/auth/supabase-auth.service';
import { PrismaService } from '../../../libs/db/prisma.service';
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
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly userCache = new Map<string, { user: any; timestamp: number }>();

  constructor(
    private configService: ConfigService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly prisma: PrismaService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is not defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtSecret,
      passReqToCallback: true, // This allows us to access the original JWT token
    });
  }

  async validate(req: any, payload: JwtPayload) {
    try {
      this.logger.debug(`Validating JWT for user: ${payload.sub}`);

      // Extract the JWT token from the Authorization header
      const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      // Check token expiration manually for better error handling
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        throw new UnauthorizedException('Token has expired');
      }

      // Get user from cache first
      const cachedUser = this.getUserFromCache(payload.sub);
      if (cachedUser) {
        this.logger.debug(`User found in cache: ${payload.sub}`);
        return this.formatUserResponse(cachedUser, token);
      }

      // Validate token with Supabase for additional security
      const supabaseUser = await this.supabaseAuth.getUser(token);

      if (!supabaseUser) {
        throw new UnauthorizedException('Invalid token');
      } // Get user from database using supabaseId instead of id
      const dbUser = await this.prisma.user.findUnique({
        where: { supabaseId: payload.sub },
        include: {
          role: true,
          userSettings: true,
        },
      });

      if (!dbUser) {
        throw new UnauthorizedException('User not found in database');
      }

      // Check if user is active
      if (dbUser.status !== 'ACTIVE') {
        throw new UnauthorizedException('User account is not active');
      }

      // Cache the user
      this.cacheUser(payload.sub, dbUser);

      this.logger.debug(`User validated successfully: ${payload.sub}`);
      return this.formatUserResponse(dbUser, token, supabaseUser);
    } catch (error) {
      this.logger.error(`Token validation failed for ${payload.sub}:`, error.message);

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Token validation failed');
    }
  }

  private getUserFromCache(userId: string): any {
    const now = Date.now();
    const cached = this.userCache.get(userId);

    if (cached && now - cached.timestamp < AUTH_CONSTANTS.CACHE_TTL.USER_PROFILE * 1000) {
      return cached.user;
    }

    return null;
  }

  private cacheUser(userId: string, user: any): void {
    this.userCache.set(userId, {
      user,
      timestamp: Date.now(),
    });

    // Simple cleanup to prevent memory leaks
    if (this.userCache.size > 1000) {
      const cutoff = Date.now() - AUTH_CONSTANTS.CACHE_TTL.USER_PROFILE * 2 * 1000;
      for (const [key, value] of this.userCache.entries()) {
        if (value.timestamp < cutoff) {
          this.userCache.delete(key);
        }
      }
    }
  }

  private formatUserResponse(dbUser: any, token: string, supabaseUser?: any) {
    return {
      id: dbUser.id.toString(),
      sub: dbUser.id.toString(),
      email: dbUser.email,
      username: dbUser.username,
      fullName: dbUser.fullName,
      role: dbUser.role,
      flags: dbUser.flags,
      status: dbUser.status,
      access_token: token,
      supabaseUser,
      lastSeen: dbUser.lastSeen,
      createdAt: dbUser.createdAt,
    };
  }

  // Method to clear user cache when needed
  public clearUserCache(userId: string): void {
    this.userCache.delete(userId);
  }
}
