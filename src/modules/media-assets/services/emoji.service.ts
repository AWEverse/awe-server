import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { R2StorageService } from '../../../libs/cloudflare-r2/services/r2-storage.service';
import { CreateCustomEmojiDto, UpdateCustomEmojiDto, CustomEmojiQueryDto } from '../dto';
import {
  CustomEmojiInfo,
  EmojiUploadResult,
  PaginatedResponse,
  BulkUploadResult,
  BulkDeleteResult,
} from '../types';
import { PrismaService } from 'src/libs/db/prisma.service';
import { MediaUploadService } from './media-upload.service';

@Injectable()
export class EmojiService {
  private readonly logger = new Logger(EmojiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaUpload: MediaUploadService,
  ) {}

  async createCustomEmoji(
    authorId: bigint,
    dto: CreateCustomEmojiDto,
    file: Express.Multer.File,
  ): Promise<EmojiUploadResult> {
    try {
      // Check if emoji name already exists in the chat/globally
      const existing = await this.prisma.customEmoji.findFirst({
        where: {
          name: dto.name,
          chatId: dto.chatId ? BigInt(dto.chatId) : null,
        },
      });

      if (existing) {
        throw new BadRequestException(
          dto.chatId
            ? 'Custom emoji with this name already exists in this chat'
            : 'Global custom emoji with this name already exists',
        );
      }

      // If emoji is for a specific chat, check user permissions
      if (dto.chatId) {
        const participant = await this.prisma.chatParticipant.findFirst({
          where: {
            chatId: BigInt(dto.chatId),
            userId: authorId,
          },
        });

        if (!participant) {
          throw new ForbiddenException('You are not a member of this chat');
        }

        // Check if user has permissions to add emojis (admin/owner)
        if (!['OWNER', 'ADMIN'].includes(participant.role)) {
          throw new ForbiddenException('Only chat admins can add custom emojis');
        }
      }

      // Upload emoji file
      const uploadResult = await this.mediaUpload.uploadMedia(file.buffer, dto.fileName, 'emoji', {
        optimize: true,
        generatePreview: false,
      });

      // Calculate flags
      const flags = this.calculateEmojiFlags({
        isAnimated: dto.isAnimated,
        isPremium: dto.isPremium,
      });

      const emoji = await this.prisma.customEmoji.create({
        data: {
          chatId: dto.chatId ? BigInt(dto.chatId) : null,
          authorId,
          name: dto.name,
          fileUrl: uploadResult.url,
          width: uploadResult.metadata.width,
          height: uploadResult.metadata.height,
          fileSize: uploadResult.metadata.fileSize,
          mimeType: uploadResult.metadata.mimeType,
          flags,
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
          chat: {
            select: {
              id: true,
              title: true,
              type: true,
            },
          },
        },
      });

      return {
        emoji: this.mapEmojiToInfo(emoji),
        uploadInfo: {
          originalSize: file.size,
          optimizedSize: uploadResult.metadata.fileSize,
          processingTime: uploadResult.processingTime || 0,
          previewGenerated: false,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to create custom emoji: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getCustomEmojis(query: CustomEmojiQueryDto): Promise<PaginatedResponse<CustomEmojiInfo>> {
    try {
      const {
        page = 1,
        limit = 20,
        chatId,
        includeGlobal,
        includeAnimated,
        sortBy,
        query: searchQuery,
      } = query;
      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {
        flags: { not: { equals: 8 } }, // Not disabled
      };

      if (chatId && includeGlobal) {
        where.OR = [{ chatId: BigInt(chatId) }, { chatId: null }];
      } else if (chatId) {
        where.chatId = BigInt(chatId);
      } else if (includeGlobal) {
        where.chatId = null;
      }

      if (!includeAnimated) {
        where.flags = { ...where.flags, not: { equals: 9 } }; // Not animated and not disabled
      }

      if (searchQuery) {
        where.name = {
          contains: searchQuery,
          mode: 'insensitive',
        };
      }

      // Build order by
      let orderBy: any = {};
      switch (sortBy) {
        case 'popular':
          orderBy = { usageCount: 'desc' };
          break;
        case 'recent':
          orderBy = { createdAt: 'desc' };
          break;
        case 'alphabetical':
          orderBy = { name: 'asc' };
          break;
        default:
          orderBy = { usageCount: 'desc' };
      }

      const [emojis, total] = await Promise.all([
        this.prisma.customEmoji.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            author: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatarUrl: true,
              },
            },
            chat: {
              select: {
                id: true,
                title: true,
                type: true,
              },
            },
          },
        }),
        this.prisma.customEmoji.count({ where }),
      ]);

      const items = emojis.map(emoji => this.mapEmojiToInfo(emoji));

      return {
        items,
        meta: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get custom emojis: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getCustomEmoji(id: string): Promise<CustomEmojiInfo> {
    try {
      const emoji = await this.prisma.customEmoji.findUnique({
        where: { id: BigInt(id) },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
          chat: {
            select: {
              id: true,
              title: true,
              type: true,
            },
          },
        },
      });

      if (!emoji) {
        throw new NotFoundException('Custom emoji not found');
      }

      return this.mapEmojiToInfo(emoji);
    } catch (error) {
      this.logger.error(`Failed to get custom emoji: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateCustomEmoji(
    id: string,
    authorId: bigint,
    dto: UpdateCustomEmojiDto,
  ): Promise<CustomEmojiInfo> {
    try {
      const emoji = await this.prisma.customEmoji.findUnique({
        where: { id: BigInt(id) },
        include: { chat: true },
      });

      if (!emoji) {
        throw new NotFoundException('Custom emoji not found');
      }

      // Check permissions
      if (emoji.authorId !== authorId) {
        // If not author, check if user is chat admin (for chat emojis)
        if (emoji.chatId) {
          const participant = await this.prisma.chatParticipant.findFirst({
            where: {
              chatId: emoji.chatId,
              userId: authorId,
            },
          });

          if (!participant || !['OWNER', 'ADMIN'].includes(participant.role)) {
            throw new ForbiddenException(
              'You can only edit your own emojis or need admin permissions',
            );
          }
        } else {
          throw new ForbiddenException('You can only edit your own emojis');
        }
      }

      // Check if new name conflicts
      if (dto.name && dto.name !== emoji.name) {
        const existing = await this.prisma.customEmoji.findFirst({
          where: {
            name: dto.name,
            chatId: emoji.chatId,
            id: { not: BigInt(id) },
          },
        });

        if (existing) {
          throw new BadRequestException('Emoji with this name already exists');
        }
      }

      // Update flags
      let flags = emoji.flags;
      if (dto.isDisabled !== undefined) {
        flags = this.calculateEmojiFlags({
          isAnimated: (flags & 1) > 0,
          isPremium: (flags & 2) > 0,
          isVerified: (flags & 4) > 0,
          isDisabled: dto.isDisabled,
        });
      }

      const updatedEmoji = await this.prisma.customEmoji.update({
        where: { id: BigInt(id) },
        data: {
          name: dto.name,
          flags,
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
          chat: {
            select: {
              id: true,
              title: true,
              type: true,
            },
          },
        },
      });

      return this.mapEmojiToInfo(updatedEmoji);
    } catch (error) {
      this.logger.error(`Failed to update custom emoji: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteCustomEmoji(id: string, authorId: bigint): Promise<void> {
    try {
      const emoji = await this.prisma.customEmoji.findUnique({
        where: { id: BigInt(id) },
      });

      if (!emoji) {
        throw new NotFoundException('Custom emoji not found');
      }

      // Check permissions
      if (emoji.authorId !== authorId) {
        // If not author, check if user is chat admin (for chat emojis)
        if (emoji.chatId) {
          const participant = await this.prisma.chatParticipant.findFirst({
            where: {
              chatId: emoji.chatId,
              userId: authorId,
            },
          });

          if (!participant || !['OWNER', 'ADMIN'].includes(participant.role)) {
            throw new ForbiddenException(
              'You can only delete your own emojis or need admin permissions',
            );
          }
        } else {
          throw new ForbiddenException('You can only delete your own emojis');
        }
      }

      // Delete file from R2
      await this.mediaUpload.deleteMedia(emoji.fileUrl);

      // Delete from database
      await this.prisma.customEmoji.delete({
        where: { id: BigInt(id) },
      });

      this.logger.log(`Deleted custom emoji ${id}`);
    } catch (error) {
      this.logger.error(`Failed to delete custom emoji: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getChatEmojis(chatId: string, includeGlobal = true): Promise<CustomEmojiInfo[]> {
    try {
      const where: any = {
        flags: { not: { equals: 8 } }, // Not disabled
      };

      if (includeGlobal) {
        where.OR = [{ chatId: BigInt(chatId) }, { chatId: null }];
      } else {
        where.chatId = BigInt(chatId);
      }

      const emojis = await this.prisma.customEmoji.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
          chat: {
            select: {
              id: true,
              title: true,
              type: true,
            },
          },
        },
      });

      return emojis.map(emoji => this.mapEmojiToInfo(emoji));
    } catch (error) {
      this.logger.error(`Failed to get chat emojis: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getGlobalEmojis(): Promise<CustomEmojiInfo[]> {
    try {
      const emojis = await this.prisma.customEmoji.findMany({
        where: {
          chatId: null,
          flags: { not: { equals: 8 } }, // Not disabled
        },
        orderBy: { usageCount: 'desc' },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      });

      return emojis.map(emoji => this.mapEmojiToInfo(emoji));
    } catch (error) {
      this.logger.error(`Failed to get global emojis: ${error.message}`, error.stack);
      throw error;
    }
  }

  async searchEmojis(query: string, limit = 20): Promise<CustomEmojiInfo[]> {
    try {
      const emojis = await this.prisma.customEmoji.findMany({
        where: {
          name: {
            contains: query,
            mode: 'insensitive',
          },
          flags: { not: { equals: 8 } }, // Not disabled
        },
        orderBy: { usageCount: 'desc' },
        take: limit,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
          chat: {
            select: {
              id: true,
              title: true,
              type: true,
            },
          },
        },
      });

      return emojis.map(emoji => this.mapEmojiToInfo(emoji));
    } catch (error) {
      this.logger.error(`Failed to search emojis: ${error.message}`, error.stack);
      throw error;
    }
  }

  async bulkDeleteEmojis(authorId: bigint, emojiIds: string[]): Promise<BulkDeleteResult> {
    try {
      const deleted: string[] = [];
      const failed: any[] = [];

      for (const id of emojiIds) {
        try {
          await this.deleteCustomEmoji(id, authorId);
          deleted.push(id);
        } catch (error) {
          failed.push({
            id,
            error: error.message,
          });
        }
      }

      return {
        deleted,
        failed,
        summary: {
          total: emojiIds.length,
          successful: deleted.length,
          failed: failed.length,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to bulk delete emojis: ${error.message}`, error.stack);
      throw error;
    }
  }

  async incrementUsageCount(emojiId: string): Promise<void> {
    try {
      await this.prisma.customEmoji.update({
        where: { id: BigInt(emojiId) },
        data: {
          usageCount: { increment: 1 },
        },
      });
    } catch (error) {
      // Don't throw error for usage count updates
      this.logger.warn(`Failed to increment emoji usage count: ${error.message}`);
    }
  }

  // === Helper Methods ===

  private calculateEmojiFlags(options: {
    isAnimated?: boolean;
    isPremium?: boolean;
    isVerified?: boolean;
    isDisabled?: boolean;
  }): number {
    let flags = 0;
    if (options.isAnimated) flags |= 1;
    if (options.isPremium) flags |= 2;
    if (options.isVerified) flags |= 4;
    if (options.isDisabled) flags |= 8;
    return flags;
  }

  private mapEmojiToInfo(emoji: any): CustomEmojiInfo {
    return {
      id: emoji.id.toString(),
      chatId: emoji.chatId?.toString(),
      authorId: emoji.authorId.toString(),
      name: emoji.name,
      fileUrl: emoji.fileUrl,
      metadata: {
        width: emoji.width,
        height: emoji.height,
        fileSize: emoji.fileSize,
        mimeType: emoji.mimeType,
      },
      flags: emoji.flags,
      usageCount: emoji.usageCount,
      createdAt: emoji.createdAt,
      updatedAt: emoji.updatedAt,
      author: {
        id: emoji.author.id.toString(),
        username: emoji.author.username,
        fullName: emoji.author.fullName,
        avatarUrl: emoji.author.avatarUrl,
      },
      chat: emoji.chat
        ? {
            id: emoji.chat.id.toString(),
            name: emoji.chat.name,
            type: emoji.chat.type,
          }
        : undefined,
      isAnimated: (emoji.flags & 1) > 0,
      isPremium: (emoji.flags & 2) > 0,
      isVerified: (emoji.flags & 4) > 0,
      isDisabled: (emoji.flags & 8) > 0,
      isGlobal: emoji.chatId === null,
    };
  }
}
