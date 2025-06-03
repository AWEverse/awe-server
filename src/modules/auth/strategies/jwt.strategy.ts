import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SupabaseAuthService } from '../../../libs/supabase/auth/supabase-auth.service';
import { PrismaService } from '../../../libs/supabase/db/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly prisma: PrismaService,
  ) {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is not defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
      passReqToCallback: true, // This allows us to access the original JWT token
    });
  }

  async validate(req: any, payload: any) {
    try {
      // Extract the JWT token from the Authorization header
      const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      // Validate token with Supabase
      const supabaseUser = await this.supabaseAuth.getUser(token);

      if (!supabaseUser) {
        throw new UnauthorizedException('Invalid token');
      }

      // Get user from database
      const dbUser = await this.prisma.user.findUnique({
        where: { email: supabaseUser.email },
        include: { role: true },
      });

      if (!dbUser) {
        throw new UnauthorizedException('User not found in database');
      }

      // Return user data that will be attached to request.user
      return {
        id: dbUser.id.toString(),
        sub: dbUser.id.toString(),
        email: dbUser.email,
        username: dbUser.username,
        role: dbUser.role,
        supabaseUser,
      };
    } catch (error) {
      throw new UnauthorizedException('Token validation failed');
    }
  }
}
