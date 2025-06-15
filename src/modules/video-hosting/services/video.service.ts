import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  CreateVideoDto,
  UpdateVideoDto,
  VideoSearchDto,
  VideoInteractionDto,
} from '../dto/video.dto';
import { VideoMetadata, VideoProcessingStatus, VideoStats, VideoSearchFilters } from '../types';
import { ContentType, ContentStatus, User, Content } from 'generated/client';
import { PrismaService } from 'src/libs/db/prisma.service';

@Injectable()
export class VideoService {
  constructor(private readonly prisma: PrismaService) {}

  async createVideo(authorId: bigint, createVideoDto: CreateVideoDto): Promise<Content> {
    const { tags, ageRestricted, commentsDisabled, monetized, ...videoData } = createVideoDto;

    // Создаем битовые флаги
    let flags = 0;
    if (ageRestricted) flags |= 4; // ageRestricted(4)
    if (commentsDisabled) flags |= 8; // commentsDisabled(8)
    if (monetized) flags |= 2; // monetized(2)

    const video = await this.prisma.content.create({
      data: {
        ...videoData,
        authorId,
        type: ContentType.VIDEO,
        flags,
        metadata: {
          processing: { status: 'pending', progress: 0 },
        },
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
            flags: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    // Добавляем теги если они есть
    if (tags && tags.length > 0) {
      await this.addTagsToVideo(video.id, tags);
    }

    return video;
  }

  async updateVideo(
    videoId: bigint,
    authorId: bigint,
    updateVideoDto: UpdateVideoDto,
  ): Promise<Content> {
    const video = await this.findVideoById(videoId);

    if (video.authorId !== authorId) {
      throw new ForbiddenException('You can only edit your own videos');
    }

    const { tags, ageRestricted, commentsDisabled, monetized, ...videoData } = updateVideoDto;

    // Обновляем битовые флаги
    let flags = video.flags;
    if (ageRestricted !== undefined) {
      flags = ageRestricted ? flags | 4 : flags & ~4;
    }
    if (commentsDisabled !== undefined) {
      flags = commentsDisabled ? flags | 8 : flags & ~8;
    }
    if (monetized !== undefined) {
      flags = monetized ? flags | 2 : flags & ~2;
    }

    const updatedVideo = await this.prisma.content.update({
      where: { id: videoId },
      data: {
        ...videoData,
        flags,
        updatedAt: new Date(),
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
            flags: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    // Обновляем теги если они переданы
    if (tags !== undefined) {
      await this.updateVideoTags(videoId, tags);
    }

    return updatedVideo;
  }

  async deleteVideo(videoId: bigint, authorId: bigint): Promise<void> {
    const video = await this.findVideoById(videoId);

    if (video.authorId !== authorId) {
      throw new ForbiddenException('You can only delete your own videos');
    }

    await this.prisma.content.update({
      where: { id: videoId },
      data: {
        status: ContentStatus.DELETED,
        deletedAt: new Date(),
      },
    });
  }

  async findVideoById(videoId: bigint): Promise<Content> {
    const video = await this.prisma.content.findFirst({
      where: {
        id: videoId,
        type: ContentType.VIDEO,
        deletedAt: null,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
            flags: true,
            subscribersCount: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
        attachments: true,
        _count: {
          select: {
            comments: {
              where: { deletedAt: null },
            },
            likes: true,
          },
        },
      },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    return video;
  }

  async searchVideos(searchDto: VideoSearchDto) {
    const { query, duration, uploadDate, quality, sortBy, page = 1, limit = 20 } = searchDto;
    const skip = (page - 1) * limit;

    // Строим условия поиска
    const where: any = {
      type: ContentType.VIDEO,
      status: ContentStatus.PUBLISHED,
      deletedAt: null,
    };

    // Полнотекстовый поиск
    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }

    // Фильтр по длительности
    if (duration) {
      const durationFilters = {
        short: { metadata: { path: ['duration'], lt: 240 } }, // < 4 минуты
        medium: {
          AND: [
            { metadata: { path: ['duration'], gte: 240 } },
            { metadata: { path: ['duration'], lt: 1200 } },
          ],
        }, // 4-20 минут
        long: { metadata: { path: ['duration'], gte: 1200 } }, // > 20 минут
      };
      Object.assign(where, durationFilters[duration]);
    }

    // Фильтр по дате загрузки
    if (uploadDate) {
      const now = new Date();
      const dateFilters = {
        hour: new Date(now.getTime() - 60 * 60 * 1000),
        today: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        week: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        month: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        year: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
      };
      where.publishedAt = { gte: dateFilters[uploadDate] };
    }

    // Сортировка
    const orderBy: any = {};
    switch (sortBy) {
      case 'upload_date':
        orderBy.publishedAt = 'desc';
        break;
      case 'view_count':
        orderBy.viewsCount = 'desc';
        break;
      case 'rating':
        orderBy.likesCount = 'desc';
        break;
      default:
        orderBy.createdAt = 'desc';
    }

    const [videos, total] = await Promise.all([
      this.prisma.content.findMany({
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
              flags: true,
            },
          },
          tags: {
            include: {
              tag: true,
            },
          },
          _count: {
            select: {
              comments: {
                where: { deletedAt: null },
              },
            },
          },
        },
      }),
      this.prisma.content.count({ where }),
    ]);

    return {
      videos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async incrementView(videoId: bigint, userId?: bigint): Promise<void> {
    // Увеличиваем счетчик просмотров
    await this.prisma.content.update({
      where: { id: videoId },
      data: {
        viewsCount: {
          increment: 1,
        },
      },
    });

    // Добавляем в историю просмотров если пользователь авторизован
    if (userId) {
      await this.prisma.watchHistory.upsert({
        where: {
          userId_contentId: {
            userId,
            contentId: videoId,
          },
        },
        update: {
          watchedAt: new Date(),
          watchTime: 0, // Можно передавать реальное время просмотра
          progress: 0,
        },
        create: {
          userId,
          contentId: videoId,
          watchedAt: new Date(),
          watchTime: 0,
          progress: 0,
        },
      });
    }
  }

  async interactWithVideo(
    videoId: bigint,
    userId: bigint,
    interactionDto: VideoInteractionDto,
  ): Promise<void> {
    const { action } = interactionDto;

    const video = await this.findVideoById(videoId);

    if (action === 'none') {
      // Удаляем лайк/дизлайк
      await this.prisma.like.deleteMany({
        where: {
          userId,
          contentId: videoId,
        },
      });
      return;
    }

    const value = action === 'like' ? 1 : -1;

    await this.prisma.like.upsert({
      where: {
        userId_contentId: {
          userId,
          contentId: videoId,
        },
      },
      update: {
        value,
        createdAt: new Date(),
      },
      create: {
        userId,
        contentId: videoId,
        value,
      },
    });
  }

  async getVideoStats(videoId: bigint): Promise<VideoStats> {
    const stats = await this.prisma.content.findUnique({
      where: { id: videoId },
      select: {
        viewsCount: true,
        likesCount: true,
        dislikesCount: true,
        sharesCount: true,
        commentsCount: true,
        _count: {
          select: {
            likes: {
              where: { value: 1 },
            },
          },
        },
      },
    });

    if (!stats) {
      throw new NotFoundException('Video not found');
    }

    const totalLikes = Number(stats.likesCount);
    const totalDislikes = Number(stats.dislikesCount);
    const totalRatings = totalLikes + totalDislikes;
    const averageRating = totalRatings > 0 ? (totalLikes / totalRatings) * 5 : 0;

    return {
      views: Number(stats.viewsCount),
      likes: totalLikes,
      dislikes: totalDislikes,
      shares: Number(stats.sharesCount),
      comments: stats.commentsCount,
      averageRating,
    };
  }

  private async addTagsToVideo(videoId: bigint, tagNames: string[]): Promise<void> {
    const tags = await Promise.all(
      tagNames.map(async name => {
        return this.prisma.tag.upsert({
          where: { name },
          update: {
            usageCount: {
              increment: 1,
            },
          },
          create: {
            name,
            usageCount: 1,
          },
        });
      }),
    );

    await this.prisma.contentTag.createMany({
      data: tags.map(tag => ({
        contentId: videoId,
        tagId: tag.id,
      })),
      skipDuplicates: true,
    });
  }

  private async updateVideoTags(videoId: bigint, tagNames: string[]): Promise<void> {
    // Удаляем старые теги
    await this.prisma.contentTag.deleteMany({
      where: { contentId: videoId },
    });

    // Добавляем новые теги
    if (tagNames.length > 0) {
      await this.addTagsToVideo(videoId, tagNames);
    }
  }
}
