import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../../libs/db/prisma.service';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Проверяем, является ли эндпоинт публичным
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    console.log('Auth header:', authHeader);

    if (!authHeader) {
      throw new UnauthorizedException('No auth header');
    }

    // Проверяем формат заголовка
    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid auth header format. Expected: Bearer <token>');
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    console.log('Token received:', token.substring(0, 20) + '...');

    try {
      const supabaseJwtSecret = this.configService.get<string>('SUPABASE_JWT_SECRET');
      if (!supabaseJwtSecret) {
        throw new Error('SUPABASE_JWT_SECRET is not configured');
      }

      const payload = jwt.verify(token, supabaseJwtSecret) as { sub: string };
      console.log('Token payload sub:', payload.sub);

      const user = await this.prisma.user.findUnique({
        where: { supabaseId: payload.sub },
      });

      if (!user) {
        console.log('User not found for supabaseId:', payload.sub);
        throw new UnauthorizedException('User not found');
      }

      console.log('User found:', user.id, user.email);
      request.user = user;
      return true;
    } catch (err) {
      console.error('JWT verification error:', err);
      if (err.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid token format');
      }
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expired');
      }
      if (err.name === 'NotBeforeError') {
        throw new UnauthorizedException('Token not active');
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
