import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateGifCategoryDto, CreateGifDto, UpdateGifDto, GifQueryDto } from '../dto';
import {
  GifCategoryInfo,
  GifInfo,
  GifUploadResult,
  PaginatedResponse,
  BulkUploadResult,
  BulkDeleteResult,
} from '../types';
import { PrismaService } from 'src/libs/db/prisma.service';
import { MediaUploadService } from './media-upload.service';

@Injectable()
export class GifService {
  private readonly logger = new Logger(GifService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaUpload: MediaUploadService,
  ) {}

  // === GIF Category Management ===

  async createGifCategory(dto: CreateGifCategoryDto): Promise<GifCategoryInfo> {
    try {
      // Check if category name already exists
      const existing = await this.prisma.gifCategory.findUnique({
        where: { name: dto.name },
      });

      if (existing) {
        throw new BadRequestException('GIF category with this name already exists');
      }

      // Calculate flags
      const flags = this.calculateCategoryFlags({
        isTrending: dto.isTrending,
        isFeatured: dto.isFeatured,
      });

      const category = await this.prisma.gifCategory.create({
        data: {
          name: dto.name,
          description: dto.description,
          iconUrl: dto.iconUrl,
          flags,
          position: dto.position || 0,
        },
      });

      return this.mapCategoryToInfo(category);
    } catch (error) {
      this.logger.error(`Failed to create GIF category: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getGifCategories(): Promise<GifCategoryInfo[]> {
    try {
      const categories = await this.prisma.gifCategory.findMany({
        orderBy: { position: 'asc' },
      });

      return categories.map(category => this.mapCategoryToInfo(category));
    } catch (error) {
      this.logger.error(`Failed to get GIF categories: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getGifCategory(id: string): Promise<GifCategoryInfo> {
    try {
      const category = await this.prisma.gifCategory.findUnique({
        where: { id: BigInt(id) },
      });

      if (!category) {
        throw new NotFoundException('GIF category not found');
      }

      return this.mapCategoryToInfo(category);
    } catch (error) {
      this.logger.error(`Failed to get GIF category: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateGifCategory(
    id: string,
    dto: Partial<CreateGifCategoryDto>,
  ): Promise<GifCategoryInfo> {
    try {
      const category = await this.prisma.gifCategory.findUnique({
        where: { id: BigInt(id) },
      });

      if (!category) {
        throw new NotFoundException('GIF category not found');
      }

      // Check name uniqueness if changing
      if (dto.name && dto.name !== category.name) {
        const existing = await this.prisma.gifCategory.findFirst({
          where: {
            name: dto.name,
            id: { not: BigInt(id) },
          },
        });

        if (existing) {
          throw new BadRequestException('GIF category with this name already exists');
        }
      }

      // Update flags if needed
      let flags = category.flags;
      if (dto.isTrending !== undefined || dto.isFeatured !== undefined) {
        flags = this.calculateCategoryFlags({
          isTrending: dto.isTrending ?? (flags & 1) > 0,
          isFeatured: dto.isFeatured ?? (flags & 2) > 0,
        });
      }

      const updatedCategory = await this.prisma.gifCategory.update({
        where: { id: BigInt(id) },
        data: {
          name: dto.name,
          description: dto.description,
          iconUrl: dto.iconUrl,
          flags,
          position: dto.position,
        },
      });

      return this.mapCategoryToInfo(updatedCategory);
    } catch (error) {
      this.logger.error(`Failed to update GIF category: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteGifCategory(id: string): Promise<void> {
    try {
      const category = await this.prisma.gifCategory.findUnique({
        where: { id: BigInt(id) },
        include: { gifs: true },
      });

      if (!category) {
        throw new NotFoundException('GIF category not found');
      }

      if (category.gifs.length > 0) {
        throw new BadRequestException('Cannot delete category with existing GIFs');
      }

      await this.prisma.gifCategory.delete({
        where: { id: BigInt(id) },
      });

      this.logger.log(`Deleted GIF category ${id}`);
    } catch (error) {
      this.logger.error(`Failed to delete GIF category: ${error.message}`, error.stack);
      throw error;
    }
  }

  // === GIF Management ===

  async createGif(dto: CreateGifDto, file: Express.Multer.File): Promise<GifUploadResult> {
    try {
      // Verify category exists
      const category = await this.prisma.gifCategory.findUnique({
        where: { id: BigInt(dto.categoryId) },
      });

      if (!category) {
        throw new NotFoundException('GIF category not found');
      }

      // Upload GIF file and generate preview
      const uploadResult = await this.mediaUpload.uploadMedia(file.buffer, dto.fileName, 'gif', {
        generatePreview: true,
      });

      // Calculate flags
      const flags = this.calculateGifFlags({
        isTrending: dto.isTrending,
        isFeatured: dto.isFeatured,
        isNsfw: dto.isNsfw,
      });

      const gif = await this.prisma.gif.create({
        data: {
          categoryId: BigInt(dto.categoryId),
          title: dto.title,
          url: uploadResult.url,
          previewUrl: uploadResult.previewUrl || uploadResult.url, // Use main URL if no preview
          width: uploadResult.metadata.width,
          height: uploadResult.metadata.height,
          fileSize: uploadResult.metadata.fileSize,
          duration: dto.duration,
          tags: dto.tags,
          searchText: dto.searchText || dto.title.toLowerCase(),
          flags,
        },
        include: {
          category: true,
        },
      });

      // Update category GIF count
      await this.prisma.gifCategory.update({
        where: { id: BigInt(dto.categoryId) },
        data: {
          gifCount: { increment: 1 },
        },
      });

      return {
        gif: this.mapGifToInfo(gif),
        uploadInfo: {
          originalSize: file.size,
          processedSize: uploadResult.metadata.fileSize,
          previewSize: uploadResult.previewSize || 0,
          processingTime: uploadResult.processingTime || 0,
          framesProcessed: uploadResult.framesProcessed || 0,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to create GIF: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getGifs(query: GifQueryDto): Promise<PaginatedResponse<GifInfo>> {
    try {
      const {
        page = 1,
        limit = 20,
        categoryId,
        trendingOnly,
        featuredOnly,
        safeMode,
        sortBy,
        query: searchQuery,
        tags,
      } = query;
      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {};

      if (categoryId) {
        where.categoryId = BigInt(categoryId);
      }

      if (trendingOnly) {
        where.flags = { equals: 1 }; // Trending flag
      }

      if (featuredOnly) {
        where.flags = { equals: 2 }; // Featured flag
      }

      if (safeMode) {
        where.flags = { not: { equals: 4 } }; // Not NSFW
      }

      if (searchQuery) {
        where.OR = [
          { title: { contains: searchQuery, mode: 'insensitive' } },
          { tags: { contains: searchQuery, mode: 'insensitive' } },
          { searchText: { contains: searchQuery, mode: 'insensitive' } },
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
        case 'trending':
          orderBy = [{ flags: 'desc' }, { usageCount: 'desc' }]; // Trending first, then popular
          break;
        case 'alphabetical':
          orderBy = { title: 'asc' };
          break;
        default:
          orderBy = { usageCount: 'desc' };
      }

      const [gifs, total] = await Promise.all([
        this.prisma.gif.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            category: true,
          },
        }),
        this.prisma.gif.count({ where }),
      ]);

      const items = gifs.map(gif => this.mapGifToInfo(gif));

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
      this.logger.error(`Failed to get GIFs: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getGif(id: string): Promise<GifInfo> {
    try {
      const gif = await this.prisma.gif.findUnique({
        where: { id: BigInt(id) },
        include: {
          category: true,
        },
      });

      if (!gif) {
        throw new NotFoundException('GIF not found');
      }

      return this.mapGifToInfo(gif);
    } catch (error) {
      this.logger.error(`Failed to get GIF: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateGif(id: string, dto: UpdateGifDto): Promise<GifInfo> {
    try {
      const gif = await this.prisma.gif.findUnique({
        where: { id: BigInt(id) },
      });

      if (!gif) {
        throw new NotFoundException('GIF not found');
      }

      // Verify new category exists if changing
      if (dto.categoryId && dto.categoryId !== gif.categoryId.toString()) {
        const category = await this.prisma.gifCategory.findUnique({
          where: { id: BigInt(dto.categoryId) },
        });

        if (!category) {
          throw new NotFoundException('New GIF category not found');
        }
      }

      // Update flags if needed
      let flags = gif.flags;
      if (
        dto.isTrending !== undefined ||
        dto.isFeatured !== undefined ||
        dto.isNsfw !== undefined
      ) {
        flags = this.calculateGifFlags({
          isTrending: dto.isTrending ?? (flags & 1) > 0,
          isFeatured: dto.isFeatured ?? (flags & 2) > 0,
          isNsfw: dto.isNsfw ?? (flags & 4) > 0,
        });
      }

      const updatedGif = await this.prisma.gif.update({
        where: { id: BigInt(id) },
        data: {
          title: dto.title,
          categoryId: dto.categoryId ? BigInt(dto.categoryId) : undefined,
          tags: dto.tags,
          searchText: dto.searchText,
          flags,
        },
        include: {
          category: true,
        },
      });

      // Update category counts if category changed
      if (dto.categoryId && dto.categoryId !== gif.categoryId.toString()) {
        await Promise.all([
          // Decrement old category
          this.prisma.gifCategory.update({
            where: { id: gif.categoryId },
            data: { gifCount: { decrement: 1 } },
          }),
          // Increment new category
          this.prisma.gifCategory.update({
            where: { id: BigInt(dto.categoryId) },
            data: { gifCount: { increment: 1 } },
          }),
        ]);
      }

      return this.mapGifToInfo(updatedGif);
    } catch (error) {
      this.logger.error(`Failed to update GIF: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteGif(id: string): Promise<void> {
    try {
      const gif = await this.prisma.gif.findUnique({
        where: { id: BigInt(id) },
      });

      if (!gif) {
        throw new NotFoundException('GIF not found');
      }

      // Delete files from R2
      const deletePromises = [this.mediaUpload.deleteMedia(gif.url)];
      if (gif.previewUrl && gif.previewUrl !== gif.url) {
        deletePromises.push(this.mediaUpload.deleteMedia(gif.previewUrl));
      }

      await Promise.allSettled(deletePromises);

      // Delete from database
      await this.prisma.gif.delete({
        where: { id: BigInt(id) },
      });

      // Update category count
      await this.prisma.gifCategory.update({
        where: { id: gif.categoryId },
        data: {
          gifCount: { decrement: 1 },
        },
      });

      this.logger.log(`Deleted GIF ${id}`);
    } catch (error) {
      this.logger.error(`Failed to delete GIF: ${error.message}`, error.stack);
      throw error;
    }
  }

  // === Special Queries ===

  async getTrendingGifs(limit = 20): Promise<GifInfo[]> {
    try {
      const gifs = await this.prisma.gif.findMany({
        where: {
          flags: { not: { equals: 4 } }, // Not NSFW
        },
        orderBy: { usageCount: 'desc' },
        take: limit,
        include: {
          category: true,
        },
      });

      return gifs.map(gif => this.mapGifToInfo(gif));
    } catch (error) {
      this.logger.error(`Failed to get trending GIFs: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getFeaturedGifs(limit = 20): Promise<GifInfo[]> {
    try {
      const gifs = await this.prisma.gif.findMany({
        where: {
          flags: { equals: 2 }, // Featured flag
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          category: true,
        },
      });

      return gifs.map(gif => this.mapGifToInfo(gif));
    } catch (error) {
      this.logger.error(`Failed to get featured GIFs: ${error.message}`, error.stack);
      throw error;
    }
  }

  async searchGifs(query: string, limit = 20): Promise<GifInfo[]> {
    try {
      const gifs = await this.prisma.gif.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { tags: { contains: query, mode: 'insensitive' } },
            { searchText: { contains: query, mode: 'insensitive' } },
          ],
          flags: { not: { equals: 4 } }, // Not NSFW
        },
        orderBy: { usageCount: 'desc' },
        take: limit,
        include: {
          category: true,
        },
      });

      return gifs.map(gif => this.mapGifToInfo(gif));
    } catch (error) {
      this.logger.error(`Failed to search GIFs: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getGifsByCategory(categoryId: string, limit = 20): Promise<GifInfo[]> {
    try {
      const gifs = await this.prisma.gif.findMany({
        where: {
          categoryId: BigInt(categoryId),
          flags: { not: { equals: 4 } }, // Not NSFW
        },
        orderBy: { usageCount: 'desc' },
        take: limit,
        include: {
          category: true,
        },
      });

      return gifs.map(gif => this.mapGifToInfo(gif));
    } catch (error) {
      this.logger.error(`Failed to get GIFs by category: ${error.message}`, error.stack);
      throw error;
    }
  }

  // === Bulk Operations ===

  async bulkUploadGifs(
    categoryId: string,
    files: Express.Multer.File[],
  ): Promise<BulkUploadResult<GifUploadResult>> {
    try {
      // Verify category exists
      const category = await this.prisma.gifCategory.findUnique({
        where: { id: BigInt(categoryId) },
      });

      if (!category) {
        throw new NotFoundException('GIF category not found');
      }

      const successful: GifUploadResult[] = [];
      const failed: any[] = [];
      let totalSize = 0;
      const startTime = Date.now();

      for (const file of files) {
        try {
          const result = await this.createGif(
            {
              categoryId,
              title: file.originalname.replace(/\.[^/.]+$/, ''), // Remove extension
              fileName: file.originalname,
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
      this.logger.error(`Failed to bulk upload GIFs: ${error.message}`, error.stack);
      throw error;
    }
  }

  async bulkDeleteGifs(gifIds: string[]): Promise<BulkDeleteResult> {
    try {
      const deleted: string[] = [];
      const failed: any[] = [];

      for (const id of gifIds) {
        try {
          await this.deleteGif(id);
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
          total: gifIds.length,
          successful: deleted.length,
          failed: failed.length,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to bulk delete GIFs: ${error.message}`, error.stack);
      throw error;
    }
  }

  async incrementUsageCount(gifId: string): Promise<void> {
    try {
      await this.prisma.gif.update({
        where: { id: BigInt(gifId) },
        data: {
          usageCount: { increment: 1 },
        },
      });
    } catch (error) {
      // Don't throw error for usage count updates
      this.logger.warn(`Failed to increment GIF usage count: ${error.message}`);
    }
  }

  // === Helper Methods ===

  private calculateCategoryFlags(options: {
    isTrending?: boolean;
    isFeatured?: boolean;
    isNsfw?: boolean;
  }): number {
    let flags = 0;
    if (options.isTrending) flags |= 1;
    if (options.isFeatured) flags |= 2;
    if (options.isNsfw) flags |= 4;
    return flags;
  }

  private calculateGifFlags(options: {
    isTrending?: boolean;
    isFeatured?: boolean;
    isNsfw?: boolean;
    isVerified?: boolean;
  }): number {
    let flags = 0;
    if (options.isTrending) flags |= 1;
    if (options.isFeatured) flags |= 2;
    if (options.isNsfw) flags |= 4;
    if (options.isVerified) flags |= 8;
    return flags;
  }

  private mapCategoryToInfo(category: any): GifCategoryInfo {
    return {
      id: category.id.toString(),
      name: category.name,
      description: category.description,
      iconUrl: category.iconUrl,
      flags: category.flags,
      position: category.position,
      gifCount: category.gifCount,
      createdAt: category.createdAt,
      isTrending: (category.flags & 1) > 0,
      isFeatured: (category.flags & 2) > 0,
      isNsfw: (category.flags & 4) > 0,
    };
  }

  private mapGifToInfo(gif: any): GifInfo {
    return {
      id: gif.id.toString(),
      categoryId: gif.categoryId.toString(),
      title: gif.title,
      url: gif.url,
      previewUrl: gif.previewUrl,
      metadata: {
        width: gif.width,
        height: gif.height,
        fileSize: gif.fileSize,
        mimeType: 'image/gif',
        duration: gif.duration,
      },
      tags: gif.tags,
      searchText: gif.searchText,
      flags: gif.flags,
      usageCount: gif.usageCount,
      createdAt: gif.createdAt,
      category: this.mapCategoryToInfo(gif.category),
      isTrending: (gif.flags & 1) > 0,
      isFeatured: (gif.flags & 2) > 0,
      isNsfw: (gif.flags & 4) > 0,
      isVerified: (gif.flags & 8) > 0,
    };
  }
}
