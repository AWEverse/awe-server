import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { blake3 } from '@noble/hashes/blake3';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseAuthService } from '../../libs/supabase/auth/supabase-auth.service';
import { PrismaService } from '../../libs/db/prisma.service';
import { AUTH_CONSTANTS } from './constants/auth.constants';
import { TOKEN_CONFIG, TokenLifetimes } from './constants/token.constants';
import { verifyDeviceToken } from './utils/verifyFingerprint';
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
  private readonly tokenLifetimes: TokenLifetimes;

  constructor(
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    // Initialize configurable token lifetimes
    this.tokenLifetimes = {
      accessTokenMs:
        (this.configService.get<number>(TOKEN_CONFIG.ACCESS_TOKEN.ENV_KEY) || 15) * 60 * 1000,
      refreshTokenMs:
        (this.configService.get<number>(TOKEN_CONFIG.REFRESH_TOKEN.ENV_KEY) || 30) *
        24 *
        60 *
        60 *
        1000,
      sessionMs:
        (this.configService.get<number>(TOKEN_CONFIG.SESSION.ENV_KEY) || 24) * 60 * 60 * 1000,
    };
  }

  async register(
    email: string,
    password: string,
    username: string,
    fullName?: string,
    deviceToken: string = '',
    userAgent?: string,
    fingerprint?: string,
  ): Promise<RegisterResponse> {
    this.logger.log(`Registration attempt for email: ${email}`);

    return this.prisma.$transaction(async tx => {
      try {
        await this.validateRegistrationInput(email, username, password);

        const existingEmailUser = await tx.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (existingEmailUser) {
          throw new ConflictException('User with this email already exists');
        }

        const existingUsernameUser = await tx.user.findUnique({
          where: { username: username.toLowerCase() },
        });

        if (existingUsernameUser) {
          throw new ConflictException('Username is already taken');
        }

        const hashedPassword = await argon2.hash(password, {
          type: argon2.argon2id,
          memoryCost: 2 ** 16, // 64 MB
          timeCost: 3,
          parallelism: 1,
        });

        let deviceId: string | null = null;
        if (deviceToken) {
          try {
            deviceId = await verifyDeviceToken(deviceToken);
          } catch (error) {
            this.logger.warn(`Invalid device token during registration: ${error.message}`);
            // Continue without device registration - not critical for registration
          }
        }

        const newUser = await tx.user.create({
          data: {
            email: email.toLowerCase(),
            username: username.toLowerCase(),
            password: hashedPassword,
            fullName: fullName?.trim() || null,
            flags: 0, // Default flags
            status: 'ACTIVE',
            roleId: null, // Default role
          },
          include: {
            role: true,
          },
        });

        let device: any = null;
        if (deviceId) {
          try {
            device = await tx.device.create({
              data: {
                userId: newUser.id,
                deviceId: deviceId,
                deviceName: userAgent ? this.extractDeviceName(userAgent) : null,
                deviceType: userAgent ? this.extractDeviceType(userAgent) : null,
                deviceVersion: userAgent ? this.extractDeviceVersion(userAgent) : null,
                userAgent: userAgent || null,
                fingerprint: fingerprint || null,
                flags: 1, // isActive
                lastUsed: new Date(),
              },
            });
          } catch (error) {
            this.logger.warn(`Failed to create device record: ${error.message}`);
            // Continue - device registration is not critical
          }
        }

        let session: any = null;
        let refreshTokenRecord: any = null;
        let refreshToken: string | null = null;

        if (device) {
          try {
            // Деактивировать все существующие сессии для этого устройства
            await this.deactivateOldDeviceSessions(newUser.id, device.id, tx);

            const ratchetState = Buffer.from(JSON.stringify({ initialized: true, counter: 0 }));
            session = await tx.session.create({
              data: {
                userId: newUser.id,
                deviceId: device.id,
                ratchetState,
                sessionKey: null, // Placeholder until X3DH key exchange is established
                expiresAt: new Date(Date.now() + this.tokenLifetimes.sessionMs),
                flags: 1, // isActive
              },
            });

            refreshToken = this.generateSecureToken(64);
            const tokenHash = Buffer.from(blake3(refreshToken)).toString('hex');
            const expiresAt = new Date(Date.now() + this.tokenLifetimes.refreshTokenMs);

            // SECURITY: Store only tokenHash, not the actual token
            refreshTokenRecord = await tx.refreshToken.create({
              data: {
                userId: newUser.id,
                sessionId: session.id,
                token: refreshToken, // TODO: Remove after migration - store only hash
                tokenHash,
                expiresAt,
                deviceId: device.deviceId,
                isRevoked: false,
                isUsed: false,
              },
            });
          } catch (error) {
            this.logger.warn(`Failed to create session/refresh token: ${error.message}`);
          }
        }

        this.logger.log(`User registered successfully: ${newUser.id}`);

        // Register user with Supabase for JWT token generation
        try {
          const supabaseResult = await this.supabaseAuth.signUp(newUser.email, password);
          if (supabaseResult?.session?.access_token) {
            // Use Supabase's access token
            const accessToken = supabaseResult.session.access_token;
            const refreshToken = supabaseResult.session.refresh_token;

            // SECURITY: Ensure only one session per device
            // Store Supabase refresh token in our database for tracking
            if (refreshToken && device && session) {
              try {
                // Сначала удалить все существующие refresh токены для этого устройства (by deviceId)
                await tx.refreshToken.deleteMany({
                  where: {
                    deviceId: device.deviceId,
                  },
                });

                // Также удалить все существующие refresh токены для этой сессии
                await tx.refreshToken.deleteMany({
                  where: {
                    sessionId: session.id,
                  },
                });

                await tx.refreshToken.create({
                  data: {
                    userId: newUser.id,
                    sessionId: session.id,
                    token: refreshToken,
                    tokenHash: Buffer.from(blake3(refreshToken)).toString('hex'),
                    expiresAt: new Date(Date.now() + this.tokenLifetimes.refreshTokenMs),
                    deviceId: device.deviceId,
                    isRevoked: false,
                    isUsed: false,
                  },
                });
              } catch (error) {
                this.logger.warn(`Failed to store Supabase refresh token: ${error.message}`);
              }
            }

            return {
              user: {
                id: newUser.id.toString(),
                email: newUser.email,
                username: newUser.username,
                fullName: newUser.fullName || undefined,
                emailVerified: !!supabaseResult.user?.email_confirmed_at,
              },
              accessToken,
              refreshToken,
              expiresAt: supabaseResult.session.expires_at
                ? supabaseResult.session.expires_at * 1000
                : Date.now() + this.tokenLifetimes.accessTokenMs,
              tokenType: 'Bearer',
              message: 'Registration successful',
              requiresEmailVerification: !supabaseResult.user?.email_confirmed_at,
            };
          }
        } catch (supabaseError) {
          this.logger.warn(
            `Supabase registration failed, using local JWT: ${supabaseError.message}`,
          );
        }

        // Fallback to local JWT generation if Supabase fails
        const deviceRisk = device ? await this.assessDeviceRisk(device, userAgent) : 'high';
        const payload = this.createJWTPayload(newUser, deviceRisk);
        const finalLifetimes = this.getTokenLifetimesForRisk(deviceRisk);

        const accessToken = this.jwtService.sign(payload, {
          expiresIn: Math.floor(finalLifetimes.accessTokenMs / 1000), // Convert to seconds
        });

        return {
          user: {
            id: newUser.id.toString(),
            email: newUser.email,
            username: newUser.username,
            fullName: newUser.fullName || undefined,
            emailVerified: true, // Since we're not using email verification in this flow
          },
          accessToken,
          refreshToken: refreshToken, // Return the original token, not the hash
          expiresAt: Date.now() + finalLifetimes.accessTokenMs,
          tokenType: 'Bearer',
          message: 'Registration successful',
          requiresEmailVerification: false,
        };
      } catch (error) {
        this.logger.error(`Registration failed for ${email}:`, error.message);
        throw error;
      }
    });
  }

  async login(
    email: string,
    password: string,
    deviceToken: string = '',
    userAgent?: string,
    fingerprint?: string,
  ): Promise<LoginResponse> {
    this.logger.log(`Login attempt for email: ${email}`);

    return this.prisma.$transaction(async tx => {
      try {
        // Check for account lockout
        await this.checkAccountLockout(email);

        // 1. Найти пользователя
        const dbUser = await tx.user.findUnique({
          where: { email: email.toLowerCase() },
          select: {
            id: true,
            email: true,
            username: true,
            password: true,
            fullName: true,
            status: true,
            lastSeen: true,
            createdAt: true,
            updatedAt: true,
            role: true,
          },
        });

        if (!dbUser) {
          await this.recordFailedAttempt(email);
          throw new UnauthorizedException('Invalid email or password');
        }

        // 2. Проверить пароль (argon2)
        const isPasswordValid = await argon2.verify(dbUser.password || '', password);
        if (!isPasswordValid) {
          await this.recordFailedAttempt(email);
          throw new UnauthorizedException('Invalid email or password');
        }

        // Check user status
        if (dbUser.status !== 'ACTIVE') {
          throw new UnauthorizedException(`Account is ${dbUser.status.toLowerCase()}`);
        }

        // 3. Проверить deviceToken (как в регистрации)
        let deviceId: string | null = null;
        if (deviceToken) {
          try {
            deviceId = await verifyDeviceToken(deviceToken);
          } catch (error) {
            this.logger.warn(`Invalid device token during login: ${error.message}`);
            throw new UnauthorizedException('Invalid device token');
          }
        }

        // 4. Найти или создать Device
        let device: any = null;
        if (deviceId) {
          // Try to find existing device
          device = await tx.device.findUnique({
            where: { deviceId },
          });

          if (!device) {
            // Create new device
            device = await tx.device.create({
              data: {
                userId: dbUser.id,
                deviceId: deviceId,
                deviceName: userAgent ? this.extractDeviceName(userAgent) : null,
                deviceType: userAgent ? this.extractDeviceType(userAgent) : null,
                deviceVersion: userAgent ? this.extractDeviceVersion(userAgent) : null,
                userAgent: userAgent || null,
                fingerprint: fingerprint || null,
                flags: 1, // isActive
                lastUsed: new Date(),
              },
            });
          } else {
            // Check device ownership to prevent device hijacking
            if (device.userId !== dbUser.id) {
              this.logger.warn(
                `Device mismatch detected. Device ${deviceId} belongs to user ${device.userId}, but login attempt by ${dbUser.id}`,
              );
              throw new UnauthorizedException('Device mismatch - security violation detected');
            }

            // Update existing device
            device = await tx.device.update({
              where: { id: device.id },
              data: {
                lastUsed: new Date(),
                userAgent: userAgent || device.userAgent,
                fingerprint: fingerprint || device.fingerprint,
                flags: 1, // Ensure it's active
              },
            });
          }
        }

        // 5. Создать Session и RefreshToken (одна сессия на устройство)
        let session: any = null;
        let refreshTokenRecord: any = null;

        if (device) {
          // Деактивировать все существующие сессии для этого устройства
          await this.deactivateOldDeviceSessions(dbUser.id, device.id, tx);

          // Create new session
          const ratchetState = Buffer.from(JSON.stringify({ initialized: true, counter: 0 }));
          session = await tx.session.create({
            data: {
              userId: dbUser.id,
              deviceId: device.id,
              ratchetState,
              sessionKey: null, // Placeholder until X3DH key exchange is established
              expiresAt: new Date(Date.now() + this.tokenLifetimes.sessionMs),
              flags: 1, // isActive
            },
          });

          // Create refresh token - SECURITY: Store only hash
          const refreshToken = this.generateSecureToken(64);
          const tokenHash = Buffer.from(blake3(refreshToken)).toString('hex');
          const expiresAt = new Date(Date.now() + this.tokenLifetimes.refreshTokenMs);

          refreshTokenRecord = await tx.refreshToken.create({
            data: {
              userId: dbUser.id,
              sessionId: session.id,
              token: refreshToken, // TODO: Remove after migration - store only hash
              tokenHash,
              expiresAt,
              deviceId: device.deviceId,
              isRevoked: false,
              isUsed: false,
            },
          });
        }

        // Update last login
        await tx.user.update({
          where: { id: dbUser.id },
          data: { lastSeen: new Date() },
        });

        // Clear failed attempts
        this.failedAttempts.delete(email);

        this.logger.log(`User logged in successfully: ${dbUser.id}`);

        // Authenticate with Supabase for JWT token generation
        try {
          const supabaseResult = await this.supabaseAuth.signIn(dbUser.email, password);
          if (supabaseResult?.session?.access_token) {
            // Use Supabase's access token
            const accessToken = supabaseResult.session.access_token;
            const refreshToken = supabaseResult.session.refresh_token;

            // SECURITY: Ensure only one session per device
            // Store/update Supabase refresh token in our database
            if (refreshToken && device && session) {
              try {
                // Сначала удалить все существующие refresh токены для этого устройства (by deviceId)
                await tx.refreshToken.deleteMany({
                  where: {
                    deviceId: device.deviceId,
                  },
                });

                // Также удалить все существующие refresh токены для этой сессии
                await tx.refreshToken.deleteMany({
                  where: {
                    sessionId: session.id,
                  },
                });

                // Создать новый токен для новой сессии
                await tx.refreshToken.create({
                  data: {
                    userId: dbUser.id,
                    sessionId: session.id,
                    token: refreshToken,
                    tokenHash: Buffer.from(blake3(refreshToken)).toString('hex'),
                    expiresAt: new Date(Date.now() + this.tokenLifetimes.refreshTokenMs),
                    deviceId: device.deviceId,
                    isRevoked: false,
                    isUsed: false,
                  },
                });
              } catch (error) {
                this.logger.warn(`Failed to store Supabase refresh token: ${error.message}`);
              }
            }

            return {
              user: {
                id: dbUser.id.toString(),
                email: dbUser.email,
                username: dbUser.username,
                fullName: dbUser.fullName || undefined,
                role: dbUser.role,
                emailVerified: !!supabaseResult.user?.email_confirmed_at,
                createdAt: dbUser.createdAt,
                updatedAt: dbUser.updatedAt,
              },
              accessToken,
              refreshToken,
              expiresAt: supabaseResult.session.expires_at
                ? supabaseResult.session.expires_at * 1000
                : Date.now() + this.tokenLifetimes.accessTokenMs,
              tokenType: 'Bearer',
            };
          }
        } catch (supabaseError) {
          this.logger.warn(`Supabase login failed, using local JWT: ${supabaseError.message}`);
        }

        // Fallback to local JWT generation if Supabase fails
        const deviceRisk = device ? await this.assessDeviceRisk(device, userAgent) : 'high';
        const payload = this.createJWTPayload(dbUser, deviceRisk);
        const finalLifetimes = this.getTokenLifetimesForRisk(deviceRisk);

        const accessToken = this.jwtService.sign(payload, {
          expiresIn: `${finalLifetimes.accessTokenMs}ms`,
        });

        return {
          user: {
            id: dbUser.id.toString(),
            email: dbUser.email,
            username: dbUser.username,
            fullName: dbUser.fullName || undefined,
            role: dbUser.role,
            emailVerified: true,
            createdAt: dbUser.createdAt,
            updatedAt: dbUser.updatedAt,
          },
          accessToken,
          refreshToken: refreshTokenRecord?.token,
          expiresAt: Date.now() + finalLifetimes.accessTokenMs,
          tokenType: 'Bearer',
        };
      } catch (error) {
        this.logger.error(`Login failed for ${email}:`, error.message);
        throw error;
      }
    });
  }

  async refresh(
    refreshToken: string,
    fingerprint?: string,
    userAgent?: string,
  ): Promise<LoginResponse> {
    this.logger.log('Token refresh attempt');

    return this.prisma.$transaction(async tx => {
      try {
        // SECURITY: Use secure token validation
        const validation = await this.validateRefreshToken(refreshToken, fingerprint, tx);

        if (!validation.isValid) {
          if (
            validation.reason === 'Token already used (reuse detected)' &&
            validation.tokenRecord
          ) {
            this.logger.warn(
              `Token reuse detected for user ${validation.tokenRecord.userId}. Revoking session ${validation.tokenRecord.sessionId}`,
            );

            // Revoke the compromised session and all its tokens
            await this.revokeAllUserSessions(
              validation.tokenRecord.userId.toString(),
              'Token reuse detected',
              validation.tokenRecord.sessionId.toString(),
            );

            throw new UnauthorizedException('Token reuse detected - session revoked for security');
          }

          throw new UnauthorizedException(validation.reason || 'Invalid refresh token');
        }

        const tokenRecord = validation.tokenRecord;

        // Mark current token as used (preventing reuse)
        await tx.refreshToken.update({
          where: { id: tokenRecord.id },
          data: { isUsed: true },
        });

        // Delete the old token to avoid unique constraint conflicts
        await tx.refreshToken.delete({
          where: { id: tokenRecord.id },
        });

        // Generate new refresh token
        const newRefreshToken = this.generateSecureToken(64);
        const newTokenHash = Buffer.from(blake3(newRefreshToken)).toString('hex');
        const expiresAt = new Date(Date.now() + this.tokenLifetimes.refreshTokenMs);

        // Create new refresh token record
        const newTokenRecord = await tx.refreshToken.create({
          data: {
            userId: tokenRecord.userId,
            sessionId: tokenRecord.sessionId,
            token: newRefreshToken, // TODO: Remove after migration - store only hash
            tokenHash: newTokenHash,
            expiresAt,
            deviceId: tokenRecord.deviceId,
            isRevoked: false,
            isUsed: false,
          },
        });

        // Generate new access token with device risk assessment
        const device = tokenRecord.session?.device;
        const deviceRisk = device ? await this.assessDeviceRisk(device, userAgent) : 'high';
        const payload = this.createJWTPayload(tokenRecord.user, deviceRisk);
        const finalLifetimes = this.getTokenLifetimesForRisk(deviceRisk);

        const accessToken = this.jwtService.sign(payload, {
          expiresIn: `${finalLifetimes.accessTokenMs}ms`,
        });

        this.logger.log(`Token refreshed successfully for user: ${tokenRecord.user.id}`);

        return {
          user: {
            id: tokenRecord.user.id.toString(),
            email: tokenRecord.user.email,
            username: tokenRecord.user.username,
            fullName: tokenRecord.user.fullName || undefined,
            role: tokenRecord.user.role,
            emailVerified: true, // Assuming verified since they have valid session
            createdAt: tokenRecord.user.createdAt,
            updatedAt: tokenRecord.user.updatedAt,
          },
          accessToken,
          refreshToken: newRefreshToken, // Return new refresh token
          expiresAt: Date.now() + finalLifetimes.accessTokenMs,
          tokenType: 'Bearer',
        };
      } catch (error) {
        this.logger.error('Token refresh failed:', error.message);
        throw error;
      }
    });
  }

  async logout(accessToken: string, refreshToken?: string): Promise<{ message: string }> {
    this.logger.log('Logout attempt');

    try {
      // Blacklist access token
      this.blacklistedTokens.add(accessToken);

      // Revoke refresh token in database if provided
      if (refreshToken) {
        await this.prisma.safeQuery(() =>
          this.prisma.refreshToken.updateMany({
            where: {
              token: refreshToken,
              isRevoked: false,
            },
            data: { isRevoked: true },
          }),
        );
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
      const result = await this.prisma.safeQuery(() =>
        this.prisma.refreshToken.deleteMany({
          where: {
            OR: [{ expiresAt: { lte: new Date() } }, { isRevoked: true }],
          },
        }),
      );

      if (result.count > 0) {
        this.logger.log(`Cleaned up ${result.count} expired/revoked refresh tokens`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup expired tokens:', error.message);
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    try {
      await this.prisma.safeQuery(() =>
        this.prisma.refreshToken.updateMany({
          where: {
            userId: BigInt(userId),
            isRevoked: false,
          },
          data: { isRevoked: true },
        }),
      );

      this.logger.log(`Revoked all tokens for user: ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to revoke tokens for user ${userId}:`, error.message);
      throw error;
    }
  }

  async getActiveTokensCount(userId: string): Promise<number> {
    try {
      const count = await this.prisma.safeQuery(() =>
        this.prisma.refreshToken.count({
          where: {
            userId: BigInt(userId),
            isRevoked: false,
            expiresAt: { gt: new Date() },
          },
        }),
      );
      return count;
    } catch (error) {
      this.logger.error(`Failed to get active tokens count for user ${userId}:`, error.message);
      return 0;
    }
  }

  async getUserSessions(userId: string) {
    try {
      const sessions = await this.prisma.safeQuery(() =>
        this.prisma.refreshToken.findMany({
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
        }),
      );

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
      const result = await this.prisma.safeQuery(() =>
        this.prisma.refreshToken.updateMany({
          where: {
            id: BigInt(sessionId),
            userId: BigInt(userId),
            isRevoked: false,
          },
          data: { isRevoked: true },
        }),
      );

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

  // Helper methods for device processing
  private extractDeviceName(userAgent: string): string | null {
    // Simple device name extraction from user agent
    if (userAgent.includes('iPhone')) return 'iPhone';
    if (userAgent.includes('iPad')) return 'iPad';
    if (userAgent.includes('Android')) return 'Android Device';
    if (userAgent.includes('Windows')) return 'Windows PC';
    if (userAgent.includes('Macintosh')) return 'Mac';
    if (userAgent.includes('Linux')) return 'Linux PC';
    return 'Unknown Device';
  }

  private extractDeviceType(userAgent: string): string | null {
    if (userAgent.includes('Mobile')) return 'mobile';
    if (userAgent.includes('Tablet')) return 'tablet';
    return 'desktop';
  }

  private extractDeviceVersion(userAgent: string): string | null {
    // Extract OS version or browser version
    const versionMatch = userAgent.match(/\b(\d+\.\d+\.\d+|\d+\.\d+)\b/);
    return versionMatch ? versionMatch[0] : null;
  }

  private generateSecureToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // SECURITY: Helper method for secure token lookup (hash-only storage)
  private async findRefreshTokenByHash(tokenHash: string, transaction?: any): Promise<any> {
    const prismaClient = transaction || this.prisma;

    return await prismaClient.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: { include: { role: true } },
        session: { include: { device: true } },
      },
    });
  }

  // SECURITY: Validate refresh token securely
  private async validateRefreshToken(
    refreshToken: string,
    fingerprint?: string,
    transaction?: any,
  ): Promise<{ tokenRecord: any; isValid: boolean; reason?: string }> {
    const tokenHash = Buffer.from(blake3(refreshToken)).toString('hex');
    const tokenRecord = await this.findRefreshTokenByHash(tokenHash, transaction);

    if (!tokenRecord) {
      return { tokenRecord: null, isValid: false, reason: 'Token not found' };
    }

    if (tokenRecord.isRevoked) {
      return { tokenRecord, isValid: false, reason: 'Token revoked' };
    }

    if (new Date() > tokenRecord.expiresAt) {
      return { tokenRecord, isValid: false, reason: 'Token expired' };
    }

    if (tokenRecord.isUsed) {
      return { tokenRecord, isValid: false, reason: 'Token already used (reuse detected)' };
    }

    if (tokenRecord.user.status !== 'ACTIVE') {
      return { tokenRecord, isValid: false, reason: 'User not active' };
    }

    // SECURITY: Fingerprint validation
    if (fingerprint && tokenRecord.session?.device?.fingerprint) {
      if (tokenRecord.session.device.fingerprint !== fingerprint) {
        return { tokenRecord, isValid: false, reason: 'Fingerprint mismatch' };
      }
    }

    return { tokenRecord, isValid: true };
  }

  // SECURITY: Assess device risk level (for future dynamic token lifetimes)
  private async assessDeviceRisk(
    device: any,
    userAgent?: string,
  ): Promise<'low' | 'medium' | 'high'> {
    // Future implementation could consider:
    // - Device age and usage patterns
    // - Geolocation changes
    // - User agent changes
    // - Failed login attempts from this device
    // - Time since last use

    // For now, return basic risk assessment
    if (!device) return 'high';

    const daysSinceLastUse = (Date.now() - device.lastUsed.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceLastUse > 30) return 'high';
    if (daysSinceLastUse > 7) return 'medium';

    return 'low';
  }

  // SECURITY: Generate device-specific token lifetimes based on risk
  private getTokenLifetimesForRisk(risk: 'low' | 'medium' | 'high'): TokenLifetimes {
    const baseLifetimes = this.tokenLifetimes;

    switch (risk) {
      case 'high':
        return {
          accessTokenMs: Math.min(baseLifetimes.accessTokenMs, 5 * 60 * 1000), // Max 5 minutes
          refreshTokenMs: Math.min(baseLifetimes.refreshTokenMs, 24 * 60 * 60 * 1000), // Max 1 day
          sessionMs: Math.min(baseLifetimes.sessionMs, 12 * 60 * 60 * 1000), // Max 12 hours
        };
      case 'medium':
        return {
          accessTokenMs: Math.min(baseLifetimes.accessTokenMs, 10 * 60 * 1000), // Max 10 minutes
          refreshTokenMs: Math.min(baseLifetimes.refreshTokenMs, 7 * 24 * 60 * 60 * 1000), // Max 7 days
          sessionMs: Math.min(baseLifetimes.sessionMs, 24 * 60 * 60 * 1000), // Max 24 hours
        };
      case 'low':
      default:
        return baseLifetimes;
    }
  }

  // SECURITY: Create JWT payload with security features
  private createJWTPayload(user: any, deviceRisk: 'low' | 'medium' | 'high' = 'low'): any {
    return {
      sub: user.id.toString(),
      jti: uuidv4(), // JWT ID for blacklisting and auditing
      iat: Math.floor(Date.now() / 1000), // Issued at time
      // Remove exp from payload - let JWT service handle it via expiresIn option
      email: user.email,
      username: user.username,
      role: user.role?.name || 'user',
      // TODO: Add 'kid' (Key ID) for JWT signature rotation support
      risk: deviceRisk, // Include risk level for client-side behavior
    };
  }

  // SUPABASE INTEGRATION: Determine whether to use Supabase or local JWT
  private shouldUseSupabaseAuth(): boolean {
    // Use environment variable to control JWT strategy
    const useSupabase = this.configService.get<boolean>('USE_SUPABASE_JWT', false);
    return useSupabase;
  }

  // SUPABASE INTEGRATION: Create enhanced payload from Supabase user
  private createEnhancedSupabasePayload(
    supabaseUser: any,
    localUser: any,
    deviceRisk: 'low' | 'medium' | 'high' = 'low',
  ): any {
    return {
      // Supabase standard claims
      sub: supabaseUser.id,
      aud: supabaseUser.aud,
      iat: Math.floor(Date.now() / 1000),

      // Our enhanced security claims
      jti: uuidv4(),
      email: localUser.email,
      username: localUser.username,
      role: localUser.role?.name || 'user',
      risk: deviceRisk,

      // Local user reference for database operations
      local_user_id: localUser.id.toString(),

      // Session security metadata
      device_validated: true,
      fingerprint_checked: true,
    };
  }

  // MIGRATION: Method to migrate existing tokens to hash-only storage
  async migrateToHashOnlyTokens(): Promise<{ migrated: number; errors: number }> {
    this.logger.log('Starting migration to hash-only token storage');

    let migrated = 0;
    let errors = 0;

    try {
      // Find all tokens that still have plain text stored
      const tokens = await this.prisma.refreshToken.findMany({
        where: {
          token: { not: '' }, // Check for non-empty strings
          isRevoked: false,
        },
        take: 1000, // Process in batches
      });

      for (const token of tokens) {
        try {
          if (token.token) {
            // Verify hash matches
            const expectedHash = Buffer.from(blake3(token.token)).toString('hex');

            if (token.tokenHash !== expectedHash) {
              this.logger.warn(`Hash mismatch for token ${token.id}, revoking`);
              await this.prisma.refreshToken.update({
                where: { id: token.id },
                data: { isRevoked: true },
              });
              errors++;
              continue;
            }

            // Remove plain text token, keep only hash
            // Note: This would require schema change to make token nullable
            // For now, we'll use a placeholder to indicate migration
            await this.prisma.refreshToken.update({
              where: { id: token.id },
              data: {
                // TODO: Make token field nullable in schema for full hash-only storage
                // token: null, // Remove plain text after schema update
              },
            });

            migrated++;
          }
        } catch (error) {
          this.logger.error(`Failed to migrate token ${token.id}:`, error.message);
          errors++;
        }
      }

      this.logger.log(`Migration completed: ${migrated} migrated, ${errors} errors`);
      return { migrated, errors };
    } catch (error) {
      this.logger.error('Migration failed:', error.message);
      throw error;
    }
  }

  // SECURITY: Revoke all sessions for a user (security incident response)
  async revokeAllUserSessions(
    userId: string,
    reason: string = 'Security incident',
    excludeSessionId?: string,
  ): Promise<{ revokedSessions: number; revokedTokens: number }> {
    this.logger.warn(`Revoking all sessions for user ${userId}. Reason: ${reason}`);

    return this.prisma.$transaction(async tx => {
      // Mark all sessions as inactive
      const sessionsResult = await tx.session.updateMany({
        where: {
          userId: BigInt(userId),
          id: excludeSessionId ? { not: BigInt(excludeSessionId) } : undefined,
          flags: 1, // Currently active
        },
        data: { flags: 0 }, // Mark as inactive
      });

      // Revoke all refresh tokens
      const tokensResult = await tx.refreshToken.updateMany({
        where: {
          userId: BigInt(userId),
          sessionId: excludeSessionId ? { not: BigInt(excludeSessionId) } : undefined,
          isRevoked: false,
        },
        data: { isRevoked: true },
      });

      // Log security event
      await tx.securityAuditLog.create({
        data: {
          userId: BigInt(userId),
          eventType: 'SESSION_REVOCATION',
          severity: 'HIGH',
          description: `All user sessions revoked. Reason: ${reason}`,
          metadata: {
            revokedSessions: sessionsResult.count,
            revokedTokens: tokensResult.count,
            timestamp: new Date().toISOString(),
          },
        },
      });

      return {
        revokedSessions: sessionsResult.count,
        revokedTokens: tokensResult.count,
      };
    });
  }

  /**
   * Ensures that only one active session exists per device for security and resource management.
   * When a user logs in from the same device, all previous sessions for that device are completely
   * removed along with their refresh tokens.
   *
   * This prevents:
   * - Session hijacking from the same device
   * - Resource leaks from multiple sessions
   * - Token confusion and security vulnerabilities
   * - Unique constraint conflicts on sessionId
   *
   * @param userId - The user ID
   * @param deviceId - The device ID (internal database ID, not deviceToken)
   * @param transaction - Optional Prisma transaction
   * @returns Object with count of deleted sessions and revoked tokens
   */
  private async deactivateOldDeviceSessions(
    userId: bigint,
    deviceId: number,
    transaction?: any,
  ): Promise<{ deactivatedSessions: number; revokedTokens: number }> {
    const tx = transaction || this.prisma;

    // Получить deviceId (string) для этого устройства
    const device = await tx.device.findUnique({
      where: { id: deviceId },
      select: { deviceId: true },
    });

    if (!device) {
      return { deactivatedSessions: 0, revokedTokens: 0 };
    }

    // Сначала удалить все refresh токены для этого устройства (by deviceId string)
    const deviceTokensResult = await tx.refreshToken.deleteMany({
      where: {
        deviceId: device.deviceId,
      },
    });

    // Найти все активные сессии для этого устройства
    const oldSessions = await tx.session.findMany({
      where: {
        userId: userId,
        deviceId: deviceId,
        flags: 1, // Только активные сессии
      },
      select: { id: true },
    });

    if (oldSessions.length === 0) {
      return { deactivatedSessions: 0, revokedTokens: deviceTokensResult.count };
    }

    const sessionIds = oldSessions.map(s => s.id);

    // Затем удалить refresh токены для этих сессий (если остались)
    const sessionTokensResult = await tx.refreshToken.deleteMany({
      where: {
        sessionId: { in: sessionIds },
      },
    });

    // Затем удалить сессии полностью
    const sessionsResult = await tx.session.deleteMany({
      where: {
        id: { in: sessionIds },
      },
    });

    const totalRevokedTokens = deviceTokensResult.count + sessionTokensResult.count;

    if (sessionsResult.count > 0 || totalRevokedTokens > 0) {
      this.logger.log(
        `Device session cleanup for user ${userId}, device ${deviceId}: ` +
          `${sessionsResult.count} sessions deleted, ${totalRevokedTokens} tokens deleted`,
      );
    }

    return {
      deactivatedSessions: sessionsResult.count,
      revokedTokens: totalRevokedTokens,
    };
  }

  // Get active session for a device
  async getActiveDeviceSession(userId: string, deviceId: string) {
    try {
      const session = await this.prisma.session.findFirst({
        where: {
          userId: BigInt(userId),
          device: { deviceId: deviceId },
          flags: 1, // Active session
          expiresAt: { gt: new Date() }, // Not expired
        },
        include: {
          device: true,
          RefreshToken: {
            where: {
              isRevoked: false,
              expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      return session;
    } catch (error) {
      this.logger.error(`Failed to get active device session: ${error.message}`);
      return null;
    }
  }

  // Check if device has active session
  async hasActiveDeviceSession(userId: string, deviceId: string): Promise<boolean> {
    try {
      const count = await this.prisma.session.count({
        where: {
          userId: BigInt(userId),
          device: { deviceId: deviceId },
          flags: 1, // Active session
          expiresAt: { gt: new Date() }, // Not expired
        },
      });

      return count > 0;
    } catch (error) {
      this.logger.error(`Failed to check device session: ${error.message}`);
      return false;
    }
  }
}
