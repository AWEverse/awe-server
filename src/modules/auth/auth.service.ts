import { Injectable } from '@nestjs/common';
import { SupabaseAuthService } from '../../libs/supabase/auth/supabase-auth.service';
import { PrismaService } from '../../libs/supabase/db/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly prisma: PrismaService,
  ) {}

  refresh(access_token: string) {}

  async register(email: string, password: string, username: string) {
    const { user, session } = await this.supabaseAuth.signUp(email, password);
    if (!user) throw new Error('Failed to register user in Supabase');

    const newUser = await this.prisma.user.create({
      data: {
        email,
        username,
        oauth_id: user.id, // Supabase user ID
        oauth_provider: 'supabase',
        role_id: 1, // Default role ID
      },
    });

    return { user: newUser, session };
  }

  async login(email: string, password: string) {
    const { user, session } = await this.supabaseAuth.signIn(email, password);
    if (!user) throw new Error('Failed to login user in Supabase');

    const dbUser = await this.prisma.user.findUnique({
      where: { email: user.email },
    });

    if (!dbUser) {
      throw new Error('User not found in database');
    }

    return { user: dbUser, session };
  }

  async logout(jwt: string) {
    return this.supabaseAuth.signOut(jwt);
  }

  async getUserProfile(jwt: string) {
    const supabaseUser = await this.supabaseAuth.getUser(jwt);
    if (!supabaseUser) throw new Error('Invalid token');

    const dbUser = await this.prisma.user.findUnique({
      where: { email: supabaseUser.email },
    });

    if (!dbUser) {
      throw new Error('User not found in database');
    }

    return { ...dbUser, supabaseUser };
  }
}
