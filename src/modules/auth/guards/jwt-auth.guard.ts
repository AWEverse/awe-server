import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from 'src/libs/supabase/db/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    if (!authHeader) throw new UnauthorizedException('No auth header');

    const token = authHeader.split(' ')[1];

    try {
      const supabaseJwtSecret = this.configService.get<string>('SUPABASE_JWT_SECRET');
      if (!supabaseJwtSecret) {
        throw new Error('SUPABASE_JWT_SECRET is not configured');
      }

      const payload = jwt.verify(token, supabaseJwtSecret) as { sub: string }; // типизация важна

      const user = await this.prisma.user.findUnique({
        where: { supabaseId: payload.sub }, // или просто id, если совпадает
      });

      if (!user) throw new UnauthorizedException('User not found');

      request.user = user; // кладём полноценного пользователя
      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
