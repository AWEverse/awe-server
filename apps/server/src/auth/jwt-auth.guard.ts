import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'src/_common/decorator/public.decorator';
import { Role, ROLES_KEY } from 'src/_common/decorator/roles.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = { roles: string[] }>(
    err: any,
    user: TUser,
    info: any,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw new UnauthorizedException('Invalid or missing token');
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (
      requiredRoles &&
      (!user.roles || !this.hasRequiredRoles(user, requiredRoles))
    ) {
      throw new ForbiddenException('You do not have the required roles');
    }

    return user;
  }

  private hasRequiredRoles(
    user: { roles: string[] },
    requiredRoles: Role[],
  ): boolean {
    const userRoles: string[] = user.roles || [];
    return requiredRoles.some((role) => userRoles.includes(role));
  }
}
