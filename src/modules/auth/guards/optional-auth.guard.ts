import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalAuthGuard extends AuthGuard('SUPABASE_AUTH') implements CanActivate {
  canActivate(context: ExecutionContext) {
    // Allow both authenticated and unauthenticated requests
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    // Don't throw error if user is not authenticated
    // Just return null for unauthenticated users
    if (err || !user) {
      return null;
    }
    return user;
  }
}
