import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { SupabaseAuthService } from '../../libs/supabase/auth/supabase-auth.service';
import { PrismaService } from '../../libs/supabase/db/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly prisma: PrismaService,
  ) {}

  async refresh(access_token: string) {
    const result = await this.supabaseAuth.refreshSession(access_token);
    if (!result || !result.session || !result.user) {
      throw new UnauthorizedException('Failed to refresh session');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: result.user.email },
    });

    if (!user) throw new UnauthorizedException('User not found');

    return { user, session: result.session };
  }

  async register(email: string, password: string, username: string) {
    // Check for existing user
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new ConflictException('Email already exists');

    const result = await this.supabaseAuth.signUp(email, password);
    if (!result || !result.user) {
      throw new UnauthorizedException('Failed to register user');
    }

    const newUser = await this.prisma.user.create({
      data: {
        email,
        username,
      },
    });

    return { user: newUser, session: result.session };
  }

  async login(email: string, password: string) {
    const result = await this.supabaseAuth.signIn(email, password);
    if (!result || !result.user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { email: result.user.email },
    });

    if (!dbUser) throw new UnauthorizedException('User not found');

    return { user: dbUser, session: result.session };
  }

  async socialSignIn(provider: 'google' | 'twitter') {
    const result = await this.supabaseAuth.signInWithOAuth(provider);
    if (!result || !result.url) {
      throw new UnauthorizedException(`Failed to initiate sign in with ${provider}`);
    }

    // Return the URL for the client to redirect the user to the provider's OAuth page
    return { url: result.url };
  }

  async logout(jwt: string) {
    await this.supabaseAuth.signOut(jwt);
    return { message: 'Logout successful' };
  }

  async getUserProfile(jwt: string) {
    const supabaseUser = await this.supabaseAuth.getUser(jwt);
    if (!supabaseUser) throw new UnauthorizedException('Invalid token');

    const dbUser = await this.prisma.user.findUnique({
      where: { email: supabaseUser.email },
    });

    if (!dbUser) throw new UnauthorizedException('User not found');

    return { ...dbUser, supabaseUser };
  }
}
