import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../libs/db/prisma.service';

export const MEDIA_PERMISSIONS = {
  CREATE_STICKER_PACK: 'create:sticker_pack',
  UPDATE_STICKER_PACK: 'update:sticker_pack',
  DELETE_STICKER_PACK: 'delete:sticker_pack',
  CREATE_EMOJI: 'create:emoji',
  UPDATE_EMOJI: 'update:emoji',
  DELETE_EMOJI: 'delete:emoji',
  CREATE_GIF: 'create:gif',
  UPDATE_GIF: 'update:gif',
  DELETE_GIF: 'delete:gif',
  MODERATE_CONTENT: 'moderate:content',
  ADMIN_ACCESS: 'admin:access',
} as const;

export type MediaPermission = (typeof MEDIA_PERMISSIONS)[keyof typeof MEDIA_PERMISSIONS];

export const RequirePermission = (permission: MediaPermission) =>
  SetMetadata('permission', permission);

@Injectable()
export class MediaPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.get<MediaPermission>('permission', context.getHandler());
    if (!permission) {
      return true; // No permission required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Check if user has the required permission
    const hasPermission = await this.checkUserPermission(user.id, permission);
    if (!hasPermission) {
      throw new ForbiddenException(`Permission denied: ${permission}`);
    }

    return true;
  }
  private async checkUserPermission(userId: string, permission: MediaPermission): Promise<boolean> {
    try {
      // For now, we'll implement a basic admin check
      // This can be expanded when the role system is fully implemented
      const user = await this.prisma.user.findUnique({
        where: { id: BigInt(userId) },
      });

      if (!user) {
        return false;
      }

      // For now, check if user has admin privileges based on some user field
      // This is a simplified implementation
      return user.email?.includes('admin') || false;
    } catch (error) {
      console.error('Error checking user permission:', error);
      return false;
    }
  }
}

@Injectable()
export class MediaOwnershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const resourceId = request.params.id;

    if (!user || !resourceId) {
      return false;
    }

    // Determine resource type from route
    const resourceType = this.getResourceTypeFromRoute(request.route?.path || request.path);
    if (!resourceType) {
      return true; // Skip ownership check if we can't determine type
    }

    return this.checkOwnership(user.id, resourceId, resourceType);
  }

  private getResourceTypeFromRoute(path: string): 'sticker_pack' | 'emoji' | 'gif' | null {
    if (path.includes('/stickers') && !path.includes('/stickers/:id')) return 'sticker_pack';
    if (path.includes('/stickers/:id')) return 'sticker_pack';
    if (path.includes('/emojis')) return 'emoji';
    if (path.includes('/gifs')) return 'gif';
    return null;
  }
  private async checkOwnership(
    userId: string,
    resourceId: string,
    resourceType: 'sticker_pack' | 'emoji' | 'gif',
  ): Promise<boolean> {
    try {
      switch (resourceType) {
        case 'sticker_pack':
          const stickerPack = await this.prisma.stickerPack.findUnique({
            where: { id: BigInt(resourceId) },
            select: { authorId: true },
          });
          return stickerPack?.authorId === BigInt(userId);

        case 'emoji':
          const emoji = await this.prisma.customEmoji.findUnique({
            where: { id: BigInt(resourceId) },
            select: { authorId: true },
          });
          return emoji?.authorId === BigInt(userId);

        case 'gif':
          // GIF doesn't have an authorId field in the current schema
          // For now, we'll allow access or implement based on available fields
          return true;

        default:
          return false;
      }
    } catch (error) {
      console.error('Error checking ownership:', error);
      return false;
    }
  }
}

@Injectable()
export class MediaModerationGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Check if user has moderation privileges
    const hasModeratorRole = await this.checkModeratorRole(user.id);
    if (!hasModeratorRole) {
      throw new ForbiddenException('Moderation privileges required');
    }

    return true;
  }
  private async checkModeratorRole(userId: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: BigInt(userId) },
      });

      if (!user) {
        return false;
      }

      // Simplified admin check - can be expanded when role system is implemented
      return user.email?.includes('admin') || user.email?.includes('moderator') || false;
    } catch (error) {
      console.error('Error checking moderator role:', error);
      return false;
    }
  }
}
