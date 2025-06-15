import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../libs/db/prisma.service';

@Injectable()
export class ModeratorGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Get user from database to check role
    const dbUser = await this.prisma.user.findUnique({
      where: { id: BigInt(user.id || user.sub) },
      include: { role: true },
    });

    if (!dbUser || !dbUser.role || !['ADMIN', 'MODERATOR'].includes(dbUser.role.name)) {
      throw new ForbiddenException('Moderator access required');
    }

    return true;
  }
}
