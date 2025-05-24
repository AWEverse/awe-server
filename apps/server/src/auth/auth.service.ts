import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { totp, generateSecret } from 'speakeasy';
import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import DeviceUtil from 'src/_common/device.util';
import { Request } from 'express';
import {
  JWT_ACCESS_EXPIRE_IN,
  JWT_REFRESH_EXPIRE_IN,
  USER_IN_PROCCESS_ID,
} from './contants';
import { RegisterDto, LoginDto, TwoFactorDto } from './dtos';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Registers a new user with Signal protocol keys, ensuring atomicity with a transaction.
   * @param dto User registration data including Signal keys
   * @param req HTTP request for device fingerprinting
   * @returns Access and refresh tokens
   */
  async register(
    dto: RegisterDto,
    req: Request,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const {
      username,
      email,
      password,
      identityKeyPublic,
      signedPrekey,
      oneTimePrekeys,
    } = dto;

    // Validate basic inputs
    if (!username || !email || !password) {
      throw new BadRequestException(
        'Username, email, and password are required',
      );
    }

    // Validate Signal protocol key material
    if (
      !identityKeyPublic ||
      !signedPrekey?.id ||
      !signedPrekey?.public ||
      !signedPrekey?.signature ||
      !oneTimePrekeys?.length
    ) {
      throw new BadRequestException(
        'Invalid or missing Signal protocol key material',
      );
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });

    if (existingUser) {
      throw new BadRequestException('Username or email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const defaultRole = await this.prisma.roleGlobally.findFirst({
      where: { role_name: 'USER' },
    });

    if (!defaultRole) {
      throw new BadRequestException('Default role not found');
    }

    const fingerprint = DeviceUtil.generateFingerprint(req);

    const ipAddress = req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const [user] = await this.prisma
      .$transaction([
        this.prisma.user.create({
          data: {
            username,
            email,
            password_hash: passwordHash,
            role_id: defaultRole.role_id,
            identity_key_public: identityKeyPublic,
            signed_prekey_id: signedPrekey.id,
          },
        }),
        this.prisma.signedPrekey.create({
          data: {
            user_id: USER_IN_PROCCESS_ID,
            prekey_id: signedPrekey.id,
            prekey_public: signedPrekey.public,
            signature: signedPrekey.signature,
          },
        }),
        this.prisma.oneTimePrekey.createMany({
          data: oneTimePrekeys.map((prekey) => ({
            user_id: USER_IN_PROCCESS_ID,
            prekey_id: Number(prekey.id),
            prekey_public: prekey.public,
          })),
        }),
        this.prisma.device.create({
          data: {
            user_id: USER_IN_PROCCESS_ID,
            fingerprint,
            ip_address: ipAddress,
            user_agent: userAgent,
            is_trusted: false,
          },
        }),
        this.prisma.authLog.create({
          data: {
            user_id: USER_IN_PROCCESS_ID,
            ip_address: ipAddress,
            user_agent: userAgent,
            success: true,
          },
        }),
      ])
      .then(([user, signedPrekey, , device, authLog]) => {
        return Promise.all([
          Promise.resolve(user),
          this.prisma.signedPrekey.update({
            where: { id: signedPrekey.id },
            data: { user_id: user.id },
          }),
          this.prisma.oneTimePrekey.updateMany({
            where: { user_id: USER_IN_PROCCESS_ID },
            data: { user_id: user.id },
          }),
          this.prisma.device.update({
            where: { id: device.id },
            data: { user_id: user.id },
          }),
          this.prisma.authLog.update({
            where: { id: authLog.id },
            data: { user_id: user.id },
          }),
        ]);
      });

    const { accessToken, refreshToken } = await this.generateTokens(
      user.id.toString(),
      fingerprint,
    );

    return { accessToken, refreshToken };
  }

  async login(
    dto: LoginDto,
    req: Request,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    twoFactorRequired?: boolean;
  }> {
    const { usernameOrEmail, password } = dto;

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
      },
      include: { role: true },
    });

    if (!user || !user.password_hash) {
      await this.logAuthAttempt(usernameOrEmail, req, false);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      await this.logAuthAttempt(user.id.toString(), req, false);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active');
    }

    const fingerprint = DeviceUtil.generateFingerprint(req);
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    let device = await this.prisma.device.findUnique({
      where: { fingerprint },
    });

    if (!device) {
      device = await this.prisma.device.create({
        data: {
          user_id: user.id,
          fingerprint,
          ip_address: ipAddress,
          user_agent: userAgent,
          is_trusted: false,
        },
      });
    } else {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { last_seen: new Date() },
      });
    }

    if (user.two_factor_enabled && !device.is_trusted) {
      await this.logAuthAttempt(user.id.toString(), req, false, '2FA required');
      return { accessToken: '', refreshToken: '', twoFactorRequired: true };
    }

    await this.logAuthAttempt(user.id.toString(), req, true);
    const { accessToken, refreshToken } = await this.generateTokens(
      user.id.toString(),
      fingerprint,
    );

    return { accessToken, refreshToken };
  }

  async verifyTwoFactor(
    userId: string,
    dto: TwoFactorDto,
    req: Request,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
    });

    if (!user || !user.two_factor_enabled || !user.two_factor_secret) {
      throw new UnauthorizedException('2FA not enabled');
    }

    const verified = totp.verify({
      secret: user.two_factor_secret,
      encoding: 'base32',
      token: dto.token,
      window: 1,
    });

    if (!verified) {
      await this.logAuthAttempt(userId, req, false, 'Invalid 2FA token');
      throw new UnauthorizedException('Invalid 2FA token');
    }

    const fingerprint = DeviceUtil.generateFingerprint(req);
    await this.prisma.device.updateMany({
      where: { user_id: BigInt(userId), fingerprint },
      data: { is_trusted: true },
    });

    await this.logAuthAttempt(userId, req, true, '2FA verified');
    return this.generateTokens(userId, fingerprint);
  }

  /**
   * Enables 2FA for a user, marking all devices as untrusted for re-verification.
   * @param userId User ID
   * @returns Secret and QR code URL for TOTP setup
   */
  async enableTwoFactor(
    userId: string,
  ): Promise<{ secret: string; qrCodeUrl: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.two_factor_enabled) {
      throw new BadRequestException('2FA already enabled');
    }

    const secret = generateSecret({
      length: 32,
      name: `Messenger (${user.email})`,
    });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: BigInt(userId) },
        data: { two_factor_secret: secret.base32, two_factor_enabled: true },
      }),
      this.prisma.device.updateMany({
        where: { user_id: BigInt(userId) },
        data: { is_trusted: false },
      }),
    ]);

    return {
      secret: secret.base32,
      qrCodeUrl: `otpauth://totp/${user.email}?secret=${secret.base32}&issuer=Messenger`,
    };
  }

  async disableTwoFactor(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
    });

    if (!user || !user.password_hash) {
      throw new UnauthorizedException('User not found');
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid password');
    }

    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: { two_factor_enabled: false, two_factor_secret: null },
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshBlacklist.create({
      data: { refresh_token: refreshToken },
    });
  }

  async refreshToken(
    refreshToken: string,
    fingerprint: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const blacklisted = await this.prisma.refreshBlacklist.findUnique({
      where: { refresh_token: refreshToken },
    });

    if (blacklisted) {
      throw new UnauthorizedException('Refresh token is blacklisted');
    }

    let payload: { userId: string; fingerprint: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token: ' + error);
    }

    if (payload.fingerprint !== fingerprint) {
      throw new UnauthorizedException('Device fingerprint mismatch');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(payload.userId) },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or not active');
    }

    await this.logout(refreshToken);
    return this.generateTokens(payload.userId, fingerprint);
  }

  /**
   * Generates JWT access and refresh tokens.
   * @param userId User ID
   * @param fingerprint Device fingerprint
   * @returns Access and refresh tokens
   */
  private async generateTokens(
    userId: string,
    fingerprint: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessTokenPayload = { userId, fingerprint };
    const refreshTokenPayload = { userId, fingerprint };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessTokenPayload, {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: JWT_ACCESS_EXPIRE_IN,
      }),
      this.jwtService.signAsync(refreshTokenPayload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: JWT_REFRESH_EXPIRE_IN,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async logAuthAttempt(
    userIdOrIdentifier: string,
    req: Request,
    success: boolean,
    message?: string,
  ): Promise<void> {
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    let userId: bigint | null = null;
    try {
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: BigInt(userIdOrIdentifier) },
            { username: userIdOrIdentifier },
            { email: userIdOrIdentifier },
          ],
        },
      });
      userId = user?.id || BigInt(-1);
    } catch (error) {
      this.logger.warn(
        `Failed to find user for auth log: ${userIdOrIdentifier}`,
        error,
      );
    }

    await this.prisma.authLog.create({
      data: {
        user_id: userId!,
        ip_address: ipAddress,
        user_agent: userAgent,
        success,
      },
    });

    if (!success) {
      this.logger.warn(
        `Auth attempt failed for ${userIdOrIdentifier}: ${message || 'Invalid credentials'}`,
      );
    }
  }
}
