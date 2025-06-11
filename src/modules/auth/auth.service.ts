import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthService } from '../../libs/supabase/auth/supabase-auth.service';
import { PrismaService } from '../../libs/supabase/db/prisma.service';
import { AUTH_CONSTANTS } from './constants/auth.constants';
import {
  LoginResponse,
  RegisterResponse,
  ProfileResponse,
  PasswordResetResponse,
} from './types/auth-response.types';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly blacklistedTokens = new Set<string>();
  private readonly failedAttempts = new Map<string, { count: number; lockedUntil?: number }>();

  constructor(
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async register(
    email: string,
    password: string,
    username: string,
    fullName?: string,
  ): Promise<RegisterResponse> {
    this.logger.log(`Registration attempt for email: ${email}`);

    // Use Prisma transaction for consistency
    return this.prisma.$transaction(async tx => {
      try {
        // Validate input
        await this.validateRegistrationInput(email, username, password);

        // Check for existing user by email
        const existingEmailUser = await tx.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (existingEmailUser) {
          throw new ConflictException('User with this email already exists');
        }

        // Check for existing username
        const existingUsernameUser = await tx.user.findUnique({
          where: { username: username.toLowerCase() },
        });
        if (existingUsernameUser) {
          throw new ConflictException('Username is already taken');
        }

        // Register with Supabase first
        const result = await this.supabaseAuth.signUp(email, password);
        if (!result || !result.user) {
          throw new BadRequestException('Failed to register user with authentication provider');
        }

        // Create user in database with Supabase ID
        const newUser = await tx.user.create({
          data: {
            email: email.toLowerCase(),
            username: username.toLowerCase(),
            fullName: fullName?.trim() || null,
            supabaseId: result.user.id,
            flags: 0, // Default flags
            status: 'ACTIVE',
            roleId: 1, // Default role
          },
          include: {
            role: true,
          },
        });

        this.logger.log(`User registered successfully: ${newUser.id}`);

        return {
          user: {
            id: newUser.id.toString(),
            email: newUser.email,
            username: newUser.username,
            fullName: newUser.fullName || undefined,
            emailVerified: !!result.user.email_confirmed_at,
          },
          message: 'Registration successful',
          requiresEmailVerification: !result.user.email_confirmed_at,
        };
      } catch (error) {
        this.logger.error(`Registration failed for ${email}:`, error.message);
        throw error;
      }
    });
  }

  async login(email: string, password: string, rememberMe = false): Promise<LoginResponse> {
    this.logger.log(`Login attempt for email: ${email}`);

    try {
      // Check for account lockout
      await this.checkAccountLockout(email);

      // Authenticate with Supabase
      const result = await this.supabaseAuth.signIn(email, password);
      if (!result || !result.user || !result.session) {
        await this.recordFailedAttempt(email);
        throw new UnauthorizedException('Invalid email or password');
      }

      // Get user from database
      const dbUser = await this.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        include: { role: true },
      });

      if (!dbUser) {
        throw new UnauthorizedException('User not found');
      }

      // Check user status
      if (dbUser.status !== 'ACTIVE') {
        throw new UnauthorizedException(`Account is ${dbUser.status.toLowerCase()}`);
      }

      // Store refresh token in database
      const refreshTokenRecord = await this.storeRefreshToken(
        dbUser.id.toString(),
        result.session.refresh_token,
        rememberMe,
      );

      // Update last login
      await this.prisma.user.update({
        where: { id: dbUser.id },
        data: { lastSeen: new Date() },
      });

      // Clear failed attempts
      this.failedAttempts.delete(email);

      this.logger.log(`User logged in successfully: ${dbUser.id}`);

      const expiresAt = result.session.expires_at
        ? new Date(result.session.expires_at * 1000).getTime()
        : Date.now() + 15 * 60 * 1000; // Default 15 minutes

      return {
        user: {
          id: dbUser.id.toString(),
          email: dbUser.email,
          username: dbUser.username,
          fullName: dbUser.fullName || undefined,
          role: dbUser.role,
          emailVerified: !!result.user.email_confirmed_at,
          createdAt: dbUser.createdAt,
          updatedAt: dbUser.updatedAt,
        },
        accessToken: result.session.access_token,
        refreshToken: result.session.refresh_token,
        expiresAt,
        tokenType: 'Bearer',
      };
    } catch (error) {
      this.logger.error(`Login failed for ${email}:`, error.message);
      throw error;
    }
  }

  async refresh(refreshToken: string): Promise<LoginResponse> {
    this.logger.log('Token refresh attempt');

    try {
      // Check if refresh token exists in database and is not revoked
      const tokenRecord = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: { include: { role: true } } },
      });

      if (!tokenRecord || tokenRecord.isRevoked || new Date() > tokenRecord.expiresAt) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // Check user status
      if (tokenRecord.user.status !== 'ACTIVE') {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Refresh session with Supabase
      const result = await this.supabaseAuth.refreshSession(refreshToken);
      if (!result || !result.session) {
        throw new UnauthorizedException('Failed to refresh session');
      }

      // Revoke old refresh token and store new one
      await this.prisma.$transaction(async tx => {
        // Revoke old token
        await tx.refreshToken.update({
          where: { id: tokenRecord.id },
          data: { isRevoked: true },
        });

        // Store new refresh token
        await this.storeRefreshToken(
          tokenRecord.userId.toString(),
          result.session!.refresh_token,
          false,
          tx,
        );
      });

      this.logger.log(`Token refreshed successfully for user: ${tokenRecord.user.id}`);

      const expiresAt = result.session!.expires_at
        ? new Date(result.session!.expires_at * 1000).getTime()
        : Date.now() + 15 * 60 * 1000; // Default 15 minutes

      return {
        user: {
          id: tokenRecord.user.id.toString(),
          email: tokenRecord.user.email,
          username: tokenRecord.user.username,
          fullName: tokenRecord.user.fullName || undefined,
          role: tokenRecord.user.role,
          emailVerified: !!result.user?.email_confirmed_at,
          createdAt: tokenRecord.user.createdAt,
          updatedAt: tokenRecord.user.updatedAt,
        },
        accessToken: result.session!.access_token,
        refreshToken: result.session!.refresh_token,
        expiresAt,
        tokenType: 'Bearer',
      };
    } catch (error) {
      this.logger.error('Token refresh failed:', error.message);
      throw error;
    }
  }

  async logout(accessToken: string, refreshToken?: string): Promise<{ message: string }> {
    this.logger.log('Logout attempt');

    try {
      // Blacklist access token
      this.blacklistedTokens.add(accessToken);

      // Revoke refresh token in database if provided
      if (refreshToken) {
        await this.prisma.refreshToken.updateMany({
          where: {
            token: refreshToken,
            isRevoked: false,
          },
          data: { isRevoked: true },
        });
      }

      // Sign out from Supabase
      await this.supabaseAuth.signOut(accessToken);

      this.logger.log('User logged out successfully');
      return { message: 'Logout successful' };
    } catch (error) {
      this.logger.error('Logout failed:', error.message);
      return { message: 'Logout completed' }; // Don't fail logout
    }
  }

  async getUserProfile(userId: string): Promise<ProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id.toString(),
      email: user.email,
      username: user.username,
      fullName: user.fullName || undefined,
      avatarUrl: user.avatarUrl || undefined,
      role: user.role,
      emailVerified: true,
      twoFactorEnabled: false, // TODO: Implement 2FA
      lastLoginAt: user.lastSeen || undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async forgotPassword(email: string): Promise<PasswordResetResponse> {
    this.logger.log(`Password reset request for: ${email}`);

    try {
      // Check if user exists
      const user = await this.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!user) {
        // Don't reveal if user exists or not
        return {
          message: 'If an account with that email exists, you will receive a password reset link.',
          success: true,
        };
      }

      // Send password reset email via Supabase
      const result = await this.supabaseAuth.resetPasswordForEmail(
        email,
        `${this.configService.get('FRONTEND_URL')}/auth/reset-password`,
      );

      if (result) {
        this.logger.log(`Password reset email sent for: ${email}`);
        return {
          message: 'Password reset link has been sent to your email.',
          success: true,
        };
      }

      return {
        message: 'If an account with that email exists, you will receive a password reset link.',
        success: true,
      };
    } catch (error) {
      this.logger.error(`Password reset failed for ${email}:`, error.message);
      throw new BadRequestException('Failed to process password reset request');
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<PasswordResetResponse> {
    this.logger.log(`Password change request for user: ${userId}`);

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: BigInt(userId) },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Verify current password by trying to sign in with it
      const verifyResult = await this.supabaseAuth.signIn(user.email, currentPassword);
      if (!verifyResult || !verifyResult.user) {
        throw new UnauthorizedException('Current password is incorrect');
      }

      // Update password using Supabase
      const updateResult = await this.supabaseAuth.updatePassword(
        verifyResult.session?.access_token || '',
        newPassword,
      );

      if (!updateResult) {
        throw new BadRequestException('Failed to update password');
      }

      this.logger.log(`Password changed successfully for user: ${userId}`);

      return {
        message: 'Password changed successfully',
        success: true,
      };
    } catch (error) {
      this.logger.error(`Password change failed for user ${userId}:`, error.message);
      throw error;
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<PasswordResetResponse> {
    this.logger.log('Password reset with token attempt');

    try {
      // Use Supabase to verify OTP and update password
      const result = await this.supabaseAuth.verifyOtp('', token, 'recovery');
      if (!result || !result.user) {
        throw new BadRequestException('Invalid or expired reset token');
      }

      // Update password using Supabase session
      const updateResult = await this.supabaseAuth.updatePassword(
        result.session?.access_token || '',
        newPassword,
      );

      if (!updateResult) {
        throw new BadRequestException('Failed to reset password');
      }

      this.logger.log('Password reset successfully completed');

      return {
        message: 'Password reset successfully',
        success: true,
      };
    } catch (error) {
      this.logger.error('Password reset failed:', error.message);
      throw error;
    }
  }

  async cleanupExpiredTokens(): Promise<void> {
    try {
      const result = await this.prisma.refreshToken.deleteMany({
        where: {
          OR: [{ expiresAt: { lte: new Date() } }, { isRevoked: true }],
        },
      });

      if (result.count > 0) {
        this.logger.log(`Cleaned up ${result.count} expired/revoked refresh tokens`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup expired tokens:', error.message);
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    try {
      await this.prisma.refreshToken.updateMany({
        where: {
          userId: BigInt(userId),
          isRevoked: false,
        },
        data: { isRevoked: true },
      });

      this.logger.log(`Revoked all tokens for user: ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to revoke tokens for user ${userId}:`, error.message);
      throw error;
    }
  }

  async getActiveTokensCount(userId: string): Promise<number> {
    try {
      const count = await this.prisma.refreshToken.count({
        where: {
          userId: BigInt(userId),
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
      });
      return count;
    } catch (error) {
      this.logger.error(`Failed to get active tokens count for user ${userId}:`, error.message);
      return 0;
    }
  }

  async getUserSessions(userId: string) {
    try {
      const sessions = await this.prisma.refreshToken.findMany({
        where: {
          userId: BigInt(userId),
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          deviceId: true,
          ipAddress: true,
          userAgent: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return sessions.map(session => ({
        ...session,
        id: session.id.toString(),
      }));
    } catch (error) {
      this.logger.error(`Failed to get user sessions for user ${userId}:`, error.message);
      return [];
    }
  }

  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    try {
      const result = await this.prisma.refreshToken.updateMany({
        where: {
          id: BigInt(sessionId),
          userId: BigInt(userId),
          isRevoked: false,
        },
        data: { isRevoked: true },
      });

      return result.count > 0;
    } catch (error) {
      this.logger.error(`Failed to revoke session ${sessionId} for user ${userId}:`, error.message);
      return false;
    }
  }

  // Email verification methods
  async resendEmailVerification(email: string): Promise<{ message: string; success: boolean }> {
    try {
      const result = await this.supabaseAuth.resendConfirmation(email);
      if (result) {
        return {
          message: 'Verification email sent successfully',
          success: true,
        };
      }
      return {
        message: 'Failed to send verification email',
        success: false,
      };
    } catch (error) {
      this.logger.error(`Failed to resend verification email for ${email}:`, error.message);
      throw new BadRequestException('Failed to send verification email');
    }
  }

  async verifyEmail(token: string, email: string): Promise<{ message: string; success: boolean }> {
    try {
      const result = await this.supabaseAuth.verifyOtp(email, token, 'signup');
      if (result && result.user) {
        // Update user verification status in database if needed
        await this.prisma.user.updateMany({
          where: { email: email.toLowerCase() },
          data: {
            flags: { set: 1 }, // Set verified flag
          },
        });

        return {
          message: 'Email verified successfully',
          success: true,
        };
      }

      return {
        message: 'Invalid or expired verification token',
        success: false,
      };
    } catch (error) {
      this.logger.error(`Email verification failed for ${email}:`, error.message);
      throw new BadRequestException('Email verification failed');
    }
  }

  // Helper methods

  private async validateRegistrationInput(
    email: string,
    username: string,
    password: string,
  ): Promise<void> {
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('Invalid email format');
    }

    // Username validation
    if (
      username.length < AUTH_CONSTANTS.USERNAME.MIN_LENGTH ||
      username.length > AUTH_CONSTANTS.USERNAME.MAX_LENGTH
    ) {
      throw new BadRequestException(
        `Username must be between ${AUTH_CONSTANTS.USERNAME.MIN_LENGTH} and ${AUTH_CONSTANTS.USERNAME.MAX_LENGTH} characters`,
      );
    }

    if (!AUTH_CONSTANTS.USERNAME.ALLOWED_PATTERN.test(username)) {
      throw new BadRequestException('Username can only contain letters, numbers, and underscores');
    }

    // Password validation
    if (
      password.length < AUTH_CONSTANTS.PASSWORD.MIN_LENGTH ||
      password.length > AUTH_CONSTANTS.PASSWORD.MAX_LENGTH
    ) {
      throw new BadRequestException(
        `Password must be between ${AUTH_CONSTANTS.PASSWORD.MIN_LENGTH} and ${AUTH_CONSTANTS.PASSWORD.MAX_LENGTH} characters`,
      );
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (!passwordRegex.test(password)) {
      throw new BadRequestException(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      );
    }
  }

  private async storeRefreshToken(
    userId: string,
    refreshToken: string,
    rememberMe = false,
    transaction?: any,
  ): Promise<any> {
    const expiresAt = new Date();
    if (rememberMe) {
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days
    } else {
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
    }

    const prismaClient = transaction || this.prisma;

    return await prismaClient.refreshToken.create({
      data: {
        userId: BigInt(userId),
        token: refreshToken,
        expiresAt,
      },
    });
  }

  private async checkAccountLockout(email: string): Promise<void> {
    const attempts = this.failedAttempts.get(email);
    if (attempts?.lockedUntil && Date.now() < attempts.lockedUntil) {
      const remainingTime = Math.ceil((attempts.lockedUntil - Date.now()) / 1000 / 60);
      throw new UnauthorizedException(`Account is locked. Try again in ${remainingTime} minutes.`);
    }
  }

  private async recordFailedAttempt(email: string): Promise<void> {
    const attempts = this.failedAttempts.get(email) || { count: 0 };
    attempts.count++;

    if (attempts.count >= AUTH_CONSTANTS.RATE_LIMIT.LOGIN_ATTEMPTS) {
      attempts.lockedUntil =
        Date.now() + AUTH_CONSTANTS.RATE_LIMIT.LOGIN_WINDOW_MINUTES * 60 * 1000;
    }

    this.failedAttempts.set(email, attempts);
  }

  // Public methods for token management
  public isTokenBlacklisted(token: string): boolean {
    return this.blacklistedTokens.has(token);
  }

  public blacklistToken(token: string): void {
    this.blacklistedTokens.add(token);
  }
}
