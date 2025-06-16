import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../../libs/db/prisma.service';

interface AuthenticatedSocket extends Socket {
  userId: bigint;
  username: string;
  user: any;
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: AuthenticatedSocket = context.switchToWs().getClient<AuthenticatedSocket>(); // Check if user is already authenticated from connection
      if (client.userId && client.user) {
        return true;
      }

      // Extract token from handshake or message
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn('No authentication token provided');
        this.logger.debug('Token extraction details:', {
          authHeader: client.handshake.headers.authorization ? 'present' : 'missing',
          queryToken: client.handshake.query.token ? 'present' : 'missing',
          authObject: client.handshake.auth ? 'present' : 'missing',
          authTokenInObject: client.handshake.auth?.token ? 'present' : 'missing',
        });
        client.emit('auth_error', {
          type: 'no_token',
          message: 'Authentication token required',
          shouldReconnect: false,
        });
        throw new WsException('Authentication token required');
      }

      // Verify token using the same logic as JwtAuthGuard
      const supabaseJwtSecret = this.configService.get<string>('SUPABASE_JWT_SECRET');
      if (!supabaseJwtSecret) {
        this.logger.error('SUPABASE_JWT_SECRET is not configured');
        client.emit('auth_error', {
          type: 'server_error',
          message: 'Server configuration error',
          shouldReconnect: false,
        });
        throw new WsException('Server configuration error');
      }

      let payload: { sub: string; [key: string]: any };

      try {
        payload = jwt.verify(token, supabaseJwtSecret) as { sub: string; [key: string]: any };
      } catch (err) {
        this.logger.warn('JWT verification failed:', err.message);

        // Notify client about specific token errors
        if (err.name === 'JsonWebTokenError') {
          client.emit('auth_error', {
            type: 'invalid_token',
            message: 'Invalid token format',
            shouldReconnect: false,
          });
          throw new WsException('Invalid token format');
        }
        if (err.name === 'TokenExpiredError') {
          client.emit('auth_error', {
            type: 'token_expired',
            message: 'Token expired, please refresh your session',
            shouldReconnect: true,
          });
          throw new WsException('Token expired');
        }
        if (err.name === 'NotBeforeError') {
          client.emit('auth_error', {
            type: 'token_not_active',
            message: 'Token not active yet',
            shouldReconnect: false,
          });
          throw new WsException('Token not active');
        }

        client.emit('auth_error', {
          type: 'invalid_token',
          message: 'Invalid token',
          shouldReconnect: false,
        });
        throw new WsException('Invalid token');
      }

      // Find user in database
      const user = await this.prisma.user.findUnique({
        where: { supabaseId: payload.sub },
        select: {
          id: true,
          email: true,
          username: true,
          supabaseId: true,
          createdAt: true,
          updatedAt: true,
          flags: true,
        },
      });
      if (!user) {
        this.logger.warn(`User not found for supabaseId: ${payload.sub}`);
        client.emit('auth_error', {
          type: 'user_not_found',
          message: 'User account not found',
          shouldReconnect: false,
        });
        throw new WsException('User not found');
      }

      // Attach user info to socket (same as in MessangerGateway)
      client.userId = user.id;
      client.username = user.username || user.email;
      client.user = user;

      this.logger.log(`WebSocket authenticated: ${client.username} (${client.userId})`);
      return true;
    } catch (error) {
      this.logger.error('WebSocket authentication failed:', error.message);

      // Re-throw WsException as-is
      if (error instanceof WsException) {
        throw error;
      }

      // Wrap other errors
      throw new WsException('Authentication failed');
    }
  }
  private extractToken(client: Socket): string | null {
    // Check authorization header first (preferred method)
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check query parameter
    const queryToken = client.handshake.query.token;
    if (typeof queryToken === 'string') {
      return queryToken;
    }

    // Check auth object (sent by socket.io client auth option)
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string') {
      return authToken;
    }

    return null;
  }
}
