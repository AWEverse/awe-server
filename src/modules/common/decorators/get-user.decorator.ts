import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface JwtPayload {
  id: string; // User ID as string (compatible with Prisma BigInt)
  sub: string; // User ID as string
  email: string;
  username?: string;
  iat: number;
  exp: number;
  deviceId?: string;
  sessionId?: string;
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

export const GetUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      return null;
    }

    // If no specific field is requested, return the entire user object
    if (!data) {
      return user;
    } // Handle special case for 'id' field - ensure it's a string compatible with Prisma
    if (data === 'sub' || data === 'id') {
      return user.sub; // Return as string, not BigInt
    }

    // Return the requested field
    return user[data];
  },
);
