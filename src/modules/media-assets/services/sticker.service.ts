import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  CreateStickerPackDto,
  UpdateStickerPackDto,
  CreateStickerDto,
  UpdateStickerDto,
  StickerPackQueryDto,
} from '../dto';
import {
  StickerPackInfo,
  StickerInfo,
  StickerUploadResult,
  PaginatedResponse,
  BulkUploadResult,
  BulkDeleteResult,
} from '../types';
import { PrismaService } from 'src/libs/db/prisma.service';
import { MediaUploadService } from './media-upload.service';

@Injectable()
export class StickerService {
  private readonly logger = new Logger(StickerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaUpload: MediaUploadService,
  ) {}

  // === Sticker Pack Management ===

  async createStickerPack(
    authorId: bigint,
    dto: CreateStickerPackDto,
    thumbnailFile?: Express.Multer.File,
  ): Promise<StickerPackInfo> {
    try {
      // Check if pack name already exists
      const existing = await this.prisma.stickerPack.findFirst({
        where: { name: dto.name },
      });

      if (existing) {
        throw new BadRequestException('Sticker pack with this name already exists');
      }

      // Upload thumbnail if provided
      let thumbnailUrl = '';
      if (thumbnailFile) {
        const thumbnailResult = await this.mediaUpload.uploadMedia(
          thumbnailFile.buffer,
          thumbnailFile.originalname,
          'sticker',
          { generatePreview: false },
        );
        thumbnailUrl = thumbnailResult.url;
      }

      // Calculate flags
      const flags = this.calculateStickerPackFlags({
        isPremium: dto.isPremium,
        isAnimated: dto.isAnimated,
        isOfficial: dto.isOfficial,
      });

      const pack = await this.prisma.stickerPack.create({
        data: {
          name: dto.name,
          title: dto.title,
          description: dto.description,
          authorId,
          thumbnailUrl,
          flags,
          price: dto.price || 0,
          category: dto.category,
          tags: dto.tags,
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
          _count: {
            select: { stickers: true },
          },
        },
      });

      return this.mapStickerPackToInfo(pack);
    } catch (error) {
      this.logger.error(`Failed to create sticker pack: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getStickerPacks(query: StickerPackQueryDto): Promise<PaginatedResponse<StickerPackInfo>> {
    try {
      const {
        page = 1,
        limit = 20,
        category,
        priceType,
        includePremium,
        sortBy,
        query: searchQuery,
        tags,
      } = query;
      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {
        flags: { not: { equals: 16 } }, // Not disabled
      };

      if (category) {
        where.category = category;
      }

      if (priceType === 'free') {
        where.price = 0;
      } else if (priceType === 'paid') {
        where.price = { gt: 0 };
      }

      if (!includePremium) {
        where.flags = { ...where.flags, not: { equals: 17 } }; // Not premium and not disabled
      }

      if (searchQuery) {
        where.OR = [
          { name: { contains: searchQuery, mode: 'insensitive' } },
          { title: { contains: searchQuery, mode: 'insensitive' } },
          { description: { contains: searchQuery, mode: 'insensitive' } },
          { tags: { contains: searchQuery, mode: 'insensitive' } },
        ];
      }

      if (tags && tags.length > 0) {
        where.tags = {
          contains: tags.join(','),
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
          orderBy = { title: 'asc' };
          break;
        default:
          orderBy = { usageCount: 'desc' };
      }

      const [packs, total] = await Promise.all([
        this.prisma.stickerPack.findMany({
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
            _count: {
              select: { stickers: true },
            },
          },
        }),
        this.prisma.stickerPack.count({ where }),
      ]);

      const items = packs.map(pack => this.mapStickerPackToInfo(pack));

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
      this.logger.error(`Failed to get sticker packs: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getStickerPack(id: string): Promise<StickerPackInfo> {
    try {
      const pack = await this.prisma.stickerPack.findUnique({
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
          stickers: {
            orderBy: { position: 'asc' },
          },
          _count: {
            select: { stickers: true },
          },
        },
      });

      if (!pack) {
        throw new NotFoundException('Sticker pack not found');
      }

      return this.mapStickerPackToInfo(pack);
    } catch (error) {
      this.logger.error(`Failed to get sticker pack: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateStickerPack(
    id: string,
    authorId: bigint,
    dto: UpdateStickerPackDto,
    thumbnailFile?: Express.Multer.File,
  ): Promise<StickerPackInfo> {
    try {
      // Check ownership
      const pack = await this.prisma.stickerPack.findUnique({
        where: { id: BigInt(id) },
      });

      if (!pack) {
        throw new NotFoundException('Sticker pack not found');
      }

      if (pack.authorId !== authorId) {
        throw new ForbiddenException('You can only edit your own sticker packs');
      }

      // Upload new thumbnail if provided
      let thumbnailUrl = pack.thumbnailUrl;
      if (thumbnailFile) {
        // Delete old thumbnail
        if (pack.thumbnailUrl) {
          await this.mediaUpload.deleteMedia(pack.thumbnailUrl);
        }

        const thumbnailResult = await this.mediaUpload.uploadMedia(
          thumbnailFile.buffer,
          thumbnailFile.originalname,
          'sticker',
          { generatePreview: false },
        );
        thumbnailUrl = thumbnailResult.url;
      }

      // Update flags
      let flags = pack.flags;
      if (dto.isPremium !== undefined || dto.isDisabled !== undefined) {
        flags = this.calculateStickerPackFlags({
          isPremium: dto.isPremium ?? (flags & 1) > 0,
          isAnimated: (flags & 2) > 0,
          isOfficial: (flags & 4) > 0,
          isDisabled: dto.isDisabled ?? (flags & 16) > 0,
        });
      }

      const updatedPack = await this.prisma.stickerPack.update({
        where: { id: BigInt(id) },
        data: {
          title: dto.title,
          description: dto.description,
          price: dto.price,
          category: dto.category,
          tags: dto.tags,
          thumbnailUrl,
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
          _count: {
            select: { stickers: true },
          },
        },
      });

      return this.mapStickerPackToInfo(updatedPack);
    } catch (error) {
      this.logger.error(`Failed to update sticker pack: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteStickerPack(id: string, authorId: bigint): Promise<void> {
    try {
      const pack = await this.prisma.stickerPack.findUnique({
        where: { id: BigInt(id) },
        include: { stickers: true },
      });

      if (!pack) {
        throw new NotFoundException('Sticker pack not found');
      }

      if (pack.authorId !== authorId) {
        throw new ForbiddenException('You can only delete your own sticker packs');
      }

      // Delete all sticker files from R2
      const deletePromises = pack.stickers.map(sticker =>
        this.mediaUpload.deleteMedia(sticker.fileUrl),
      );

      // Delete thumbnail
      if (pack.thumbnailUrl) {
        deletePromises.push(this.mediaUpload.deleteMedia(pack.thumbnailUrl));
      }

      await Promise.allSettled(deletePromises);

      // Delete from database (cascade will handle stickers)
      await this.prisma.stickerPack.delete({
        where: { id: BigInt(id) },
      });

      this.logger.log(`Deleted sticker pack ${id} with ${pack.stickers.length} stickers`);
    } catch (error) {
      this.logger.error(`Failed to delete sticker pack: ${error.message}`, error.stack);
      throw error;
    }
  }

  // === Individual Sticker Management ===

  async createSticker(
    authorId: bigint,
    dto: CreateStickerDto,
    file: Express.Multer.File,
  ): Promise<StickerUploadResult> {
    try {
      // Check pack ownership
      const pack = await this.prisma.stickerPack.findUnique({
        where: { id: BigInt(dto.packId) },
      });

      if (!pack) {
        throw new NotFoundException('Sticker pack not found');
      }

      if (pack.authorId !== authorId) {
        throw new ForbiddenException('You can only add stickers to your own packs');
      }

      // Upload sticker file
      const uploadResult = await this.mediaUpload.uploadMedia(
        file.buffer,
        dto.fileName,
        'sticker',
        { optimize: true },
      );

      // Calculate flags
      const flags = this.calculateStickerFlags({
        isAnimated: dto.isAnimated,
        isPremium: dto.isPremium,
      });

      const sticker = await this.prisma.sticker.create({
        data: {
          packId: BigInt(dto.packId),
          emoji: dto.emoji,
          fileUrl: uploadResult.url,
          fileName: dto.fileName,
          width: uploadResult.metadata.width,
          height: uploadResult.metadata.height,
          fileSize: uploadResult.metadata.fileSize,
          mimeType: uploadResult.metadata.mimeType,
          flags,
          position: dto.position || 0,
        },
        include: {
          pack: {
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
          },
        },
      });

      return {
        sticker: this.mapStickerToInfo(sticker),
        uploadInfo: {
          originalSize: file.size,
          compressedSize: uploadResult.metadata.fileSize,
          compressionRatio: uploadResult.metadata.fileSize / file.size,
          processingTime: uploadResult.processingTime || 0,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to create sticker: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getStickers(packId: string): Promise<StickerInfo[]> {
    try {
      const stickers = await this.prisma.sticker.findMany({
        where: { packId: BigInt(packId) },
        orderBy: { position: 'asc' },
        include: {
          pack: {
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
          },
        },
      });

      return stickers.map(sticker => this.mapStickerToInfo(sticker));
    } catch (error) {
      this.logger.error(`Failed to get stickers: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateSticker(id: string, authorId: bigint, dto: UpdateStickerDto): Promise<StickerInfo> {
    try {
      const sticker = await this.prisma.sticker.findUnique({
        where: { id: BigInt(id) },
        include: { pack: true },
      });

      if (!sticker) {
        throw new NotFoundException('Sticker not found');
      }

      if (sticker.pack.authorId !== authorId) {
        throw new ForbiddenException('You can only edit stickers in your own packs');
      }

      // Update flags if needed
      let flags = sticker.flags;
      if (dto.isAnimated !== undefined || dto.isPremium !== undefined) {
        flags = this.calculateStickerFlags({
          isAnimated: dto.isAnimated ?? (flags & 1) > 0,
          isPremium: dto.isPremium ?? (flags & 2) > 0,
        });
      }

      const updatedSticker = await this.prisma.sticker.update({
        where: { id: BigInt(id) },
        data: {
          emoji: dto.emoji,
          position: dto.position,
          flags,
        },
        include: {
          pack: {
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
          },
        },
      });

      return this.mapStickerToInfo(updatedSticker);
    } catch (error) {
      this.logger.error(`Failed to update sticker: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteSticker(id: string, authorId: bigint): Promise<void> {
    try {
      const sticker = await this.prisma.sticker.findUnique({
        where: { id: BigInt(id) },
        include: { pack: true },
      });

      if (!sticker) {
        throw new NotFoundException('Sticker not found');
      }

      if (sticker.pack.authorId !== authorId) {
        throw new ForbiddenException('You can only delete stickers from your own packs');
      }

      // Delete file from R2
      await this.mediaUpload.deleteMedia(sticker.fileUrl);

      // Delete from database
      await this.prisma.sticker.delete({
        where: { id: BigInt(id) },
      });

      this.logger.log(`Deleted sticker ${id}`);
    } catch (error) {
      this.logger.error(`Failed to delete sticker: ${error.message}`, error.stack);
      throw error;
    }
  }

  // === Bulk Operations ===

  async bulkUploadStickers(
    authorId: bigint,
    packId: string,
    files: Express.Multer.File[],
  ): Promise<BulkUploadResult<StickerUploadResult>> {
    try {
      // Check pack ownership
      const pack = await this.prisma.stickerPack.findUnique({
        where: { id: BigInt(packId) },
      });

      if (!pack) {
        throw new NotFoundException('Sticker pack not found');
      }

      if (pack.authorId !== authorId) {
        throw new ForbiddenException('You can only add stickers to your own packs');
      }

      const successful: StickerUploadResult[] = [];
      const failed: any[] = [];
      let totalSize = 0;
      const startTime = Date.now();

      for (const [index, file] of files.entries()) {
        try {
          const result = await this.createSticker(
            authorId,
            {
              packId,
              emoji: '😀', // Default emoji, should be provided in metadata
              fileName: file.originalname,
              position: index,
            },
            file,
          );

          successful.push(result);
          totalSize += file.size;
        } catch (error) {
          failed.push({
            fileName: file.originalname,
            error: error.message,
            details: error.response || error,
          });
        }
      }

      const processingTime = Date.now() - startTime;

      return {
        successful,
        failed,
        summary: {
          total: files.length,
          successful: successful.length,
          failed: failed.length,
          totalSize,
          processingTime,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to bulk upload stickers: ${error.message}`, error.stack);
      throw error;
    }
  }

  async bulkDeleteStickers(authorId: bigint, stickerIds: string[]): Promise<BulkDeleteResult> {
    try {
      const deleted: string[] = [];
      const failed: any[] = [];

      for (const id of stickerIds) {
        try {
          await this.deleteSticker(id, authorId);
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
          total: stickerIds.length,
          successful: deleted.length,
          failed: failed.length,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to bulk delete stickers: ${error.message}`, error.stack);
      throw error;
    }
  }

  // === User Sticker Packs ===

  async addStickerPackToUser(userId: bigint, packId: string): Promise<void> {
    try {
      const pack = await this.prisma.stickerPack.findUnique({
        where: { id: BigInt(packId) },
      });

      if (!pack) {
        throw new NotFoundException('Sticker pack not found');
      }

      // Check if user already has this pack
      const existing = await this.prisma.userStickerPack.findFirst({
        where: {
          userId,
          packId: BigInt(packId),
        },
      });

      if (existing) {
        throw new BadRequestException('User already has this sticker pack');
      }

      // If pack is premium, check if user purchased it
      if ((pack.flags & 1) > 0) {
        const purchase = await this.prisma.stickerPurchase.findFirst({
          where: {
            userId,
            packId: BigInt(packId),
          },
        });

        if (!purchase) {
          throw new ForbiddenException('Premium sticker pack not purchased');
        }
      }

      await this.prisma.userStickerPack.create({
        data: {
          userId,
          packId: BigInt(packId),
          position: 0,
        },
      });

      this.logger.log(`Added sticker pack ${packId} to user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to add sticker pack to user: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getUserStickerPacks(userId: bigint): Promise<StickerPackInfo[]> {
    try {
      const userPacks = await this.prisma.userStickerPack.findMany({
        where: { userId },
        orderBy: { position: 'asc' },
        include: {
          pack: {
            include: {
              author: {
                select: {
                  id: true,
                  username: true,
                  fullName: true,
                  avatarUrl: true,
                },
              },
              _count: {
                select: { stickers: true },
              },
            },
          },
        },
      });

      // Also include free packs
      const freePacks = await this.prisma.stickerPack.findMany({
        where: {
          price: 0,
          flags: { not: { equals: 16 } }, // Not disabled
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
          _count: {
            select: { stickers: true },
          },
        },
      });

      const userPackInfos = userPacks.map(up => this.mapStickerPackToInfo(up.pack));
      const freePackInfos = freePacks.map(pack => this.mapStickerPackToInfo(pack));

      // Combine and deduplicate
      const allPacks = [...userPackInfos, ...freePackInfos];
      const uniquePacks = allPacks.filter(
        (pack, index, self) => index === self.findIndex(p => p.id === pack.id),
      );

      return uniquePacks;
    } catch (error) {
      this.logger.error(`Failed to get user sticker packs: ${error.message}`, error.stack);
      throw error;
    }
  }

  // === Helper Methods ===

  private calculateStickerPackFlags(options: {
    isPremium?: boolean;
    isAnimated?: boolean;
    isOfficial?: boolean;
    isNsfw?: boolean;
    isDisabled?: boolean;
  }): number {
    let flags = 0;
    if (options.isPremium) flags |= 1;
    if (options.isAnimated) flags |= 2;
    if (options.isOfficial) flags |= 4;
    if (options.isNsfw) flags |= 8;
    if (options.isDisabled) flags |= 16;
    return flags;
  }

  private calculateStickerFlags(options: { isAnimated?: boolean; isPremium?: boolean }): number {
    let flags = 0;
    if (options.isAnimated) flags |= 1;
    if (options.isPremium) flags |= 2;
    return flags;
  }

  private mapStickerPackToInfo(pack: any): StickerPackInfo {
    return {
      id: pack.id.toString(),
      name: pack.name,
      title: pack.title,
      description: pack.description,
      authorId: pack.authorId?.toString(),
      thumbnailUrl: pack.thumbnailUrl,
      flags: pack.flags,
      price: pack.price,
      category: pack.category,
      tags: pack.tags,
      downloadCount: pack.downloadCount,
      usageCount: pack.usageCount,
      createdAt: pack.createdAt,
      updatedAt: pack.updatedAt,
      author: pack.author
        ? {
            id: pack.author.id.toString(),
            username: pack.author.username,
            fullName: pack.author.fullName,
            avatarUrl: pack.author.avatarUrl,
          }
        : undefined,
      stickerCount: pack._count?.stickers || pack.stickers?.length || 0,
      isPremium: (pack.flags & 1) > 0,
      isAnimated: (pack.flags & 2) > 0,
      isOfficial: (pack.flags & 4) > 0,
      isDisabled: (pack.flags & 16) > 0,
      isPurchased: false, // Should be set based on user context
    };
  }

  private mapStickerToInfo(sticker: any): StickerInfo {
    return {
      id: sticker.id.toString(),
      packId: sticker.packId.toString(),
      emoji: sticker.emoji,
      fileUrl: sticker.fileUrl,
      fileName: sticker.fileName,
      metadata: {
        width: sticker.width,
        height: sticker.height,
        fileSize: sticker.fileSize,
        mimeType: sticker.mimeType,
      },
      flags: sticker.flags,
      usageCount: sticker.usageCount,
      position: sticker.position,
      createdAt: sticker.createdAt,
      pack: sticker.pack ? this.mapStickerPackToInfo(sticker.pack) : undefined,
      isAnimated: (sticker.flags & 1) > 0,
      isPremium: (sticker.flags & 2) > 0,
    };
  }
}
