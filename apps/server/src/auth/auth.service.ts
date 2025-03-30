import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

interface UserCredentials {
  username: string;
  password: string;
}

interface OAuthProvider {
  provider: 'google' | 'facebook' | 'twitter' | 'instagram' | 'reddit';
  accessToken: string;
}

interface TwoFactorAuth {
  userId: string;
  code: string;
  expiresAt: Date;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async login(credentials: UserCredentials): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { username: credentials.username },
    });

    if (
      !user ||
      !(await bcrypt.compare(credentials.password, user.password_hash))
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.twoFactorEnabled) {
      // In real implementation, you'd trigger 2FA flow here
      // and return a temporary token or pending state
    }

    return this.generateAuthResponse(user.id);
  }
}
