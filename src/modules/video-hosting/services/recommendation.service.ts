import { Injectable } from '@nestjs/common';
import { RecommendationContext } from '../types';
import { ContentType, ContentStatus } from 'generated/client';
import { PrismaService } from 'src/libs/db/prisma.service';

@Injectable()
export class RecommendationService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecommendedVideos(context: RecommendationContext, limit: number = 20) {
    const { userId, videoId, watchHistory, likedVideos, subscribedChannels } = context;

    // Если есть конкретное видео, рекомендуем похожие
    if (videoId) {
      return this.getRelatedVideos(videoId, limit);
    }

    // Если есть пользователь, персональные рекомендации
    if (userId) {
      return this.getPersonalizedRecommendations(userId, limit);
    }

    // Иначе общие трендовые видео
    return this.getTrendingVideos(limit);
  }

  private async getRelatedVideos(videoId: bigint, limit: number) {
    // Получаем информацию о текущем видео
    const currentVideo = await this.prisma.content.findUnique({
      where: { id: videoId },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    if (!currentVideo) {
      return this.getTrendingVideos(limit);
    }

    const tagIds = currentVideo.tags.map(ct => ct.tagId);
    const authorId = currentVideo.authorId;

    // Рекомендуем видео с похожими тегами и от того же автора
    const relatedVideos = await this.prisma.content.findMany({
      where: {
        AND: [
          { id: { not: videoId } }, // Исключаем текущее видео
          { type: ContentType.VIDEO },
          { status: ContentStatus.PUBLISHED },
          { deletedAt: null },
          {
            OR: [
              { authorId }, // От того же автора
              {
                tags: {
                  some: {
                    tagId: { in: tagIds },
                  },
                },
              },
            ],
          },
        ],
      },
      orderBy: [{ viewsCount: 'desc' }, { likesCount: 'desc' }, { createdAt: 'desc' }],
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
    });

    return relatedVideos;
  }

  private async getPersonalizedRecommendations(userId: bigint, limit: number) {
    // Получаем данные о пользователе
    const userPreferences = await this.getUserPreferences(userId);

    const { watchedChannels, likedTags, watchedVideoIds, subscribedChannelIds } = userPreferences;

    // Рекомендуем видео на основе предпочтений
    const recommendedVideos = await this.prisma.content.findMany({
      where: {
        AND: [
          { type: ContentType.VIDEO },
          { status: ContentStatus.PUBLISHED },
          { deletedAt: null },
          { id: { notIn: watchedVideoIds } }, // Исключаем уже просмотренные
          {
            OR: [
              // Видео от подписанных каналов
              { authorId: { in: subscribedChannelIds } },
              // Видео с интересными тегами
              {
                tags: {
                  some: {
                    tagId: { in: likedTags },
                  },
                },
              },
              // Видео от каналов, которые часто смотрит
              { authorId: { in: watchedChannels } },
            ],
          },
        ],
      },
      orderBy: [
        // Приоритет видео от подписанных каналов
        {
          author: {
            subscribers: {
              _count: 'desc',
            },
          },
        },
        { viewsCount: 'desc' },
        { createdAt: 'desc' },
      ],
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
    });

    // Если недостаточно персональных рекомендаций, добавляем трендовые
    if (recommendedVideos.length < limit) {
      const trendingVideos = await this.getTrendingVideos(limit - recommendedVideos.length);
      recommendedVideos.push(...trendingVideos);
    }

    return recommendedVideos;
  }

  private async getTrendingVideos(limit: number) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Трендовые видео за последние 24 часа
    const trendingVideos = await this.prisma.content.findMany({
      where: {
        type: ContentType.VIDEO,
        status: ContentStatus.PUBLISHED,
        deletedAt: null,
        publishedAt: {
          gte: oneWeekAgo,
        },
      },
      orderBy: [
        // Сортируем по популярности (views + likes)
        { viewsCount: 'desc' },
        { likesCount: 'desc' },
        { publishedAt: 'desc' },
      ],
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
    });

    return trendingVideos;
  }

  private async getUserPreferences(userId: bigint) {
    // Получаем историю просмотров
    const watchHistory = await this.prisma.watchHistory.findMany({
      where: { userId },
      orderBy: { watchedAt: 'desc' },
      take: 100, // Последние 100 просмотров
      include: {
        content: {
          include: {
            tags: {
              include: {
                tag: true,
              },
            },
          },
        },
      },
    });

    // Получаем лайки
    const likes = await this.prisma.like.findMany({
      where: {
        userId,
        value: 1, // Только лайки
      },
      include: {
        content: {
          include: {
            tags: {
              include: {
                tag: true,
              },
            },
          },
        },
      },
    });

    // Получаем подписки
    const subscriptions = await this.prisma.subscription.findMany({
      where: { subscriberId: userId },
      select: { subscribedToId: true },
    });

    // Анализируем предпочтения
    const watchedChannels = Array.from(new Set(watchHistory.map(wh => wh.content.authorId)));

    const likedTags = Array.from(
      new Set([
        ...watchHistory.flatMap(wh => wh.content.tags.map(ct => ct.tagId)),
        ...likes.flatMap(like => (like.content ? like.content.tags.map(ct => ct.tagId) : [])),
      ]),
    );

    const watchedVideoIds = watchHistory.map(wh => wh.contentId);
    const subscribedChannelIds = subscriptions.map(sub => sub.subscribedToId);

    return {
      watchedChannels,
      likedTags,
      watchedVideoIds,
      subscribedChannelIds,
    };
  }

  async getHomePageRecommendations(userId?: bigint, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    if (userId) {
      // Персональные рекомендации для авторизованного пользователя
      const recommendations = await this.getPersonalizedRecommendations(userId, limit + skip);
      return {
        videos: recommendations.slice(skip, skip + limit),
        pagination: {
          page,
          limit,
          hasMore: recommendations.length > skip + limit,
        },
      };
    } else {
      // Общие рекомендации для неавторизованного пользователя
      const [videos, total] = await Promise.all([
        this.getTrendingVideos(limit),
        this.prisma.content.count({
          where: {
            type: ContentType.VIDEO,
            status: ContentStatus.PUBLISHED,
            deletedAt: null,
          },
        }),
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
  }

  async getSimilarVideos(videoId: bigint, limit: number = 10) {
    return this.getRelatedVideos(videoId, limit);
  }

  async getPopularVideos(
    timeframe: 'day' | 'week' | 'month' | 'year' = 'week',
    limit: number = 20,
  ) {
    const timeframes = {
      day: new Date(Date.now() - 24 * 60 * 60 * 1000),
      week: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      month: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      year: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    };

    const videos = await this.prisma.content.findMany({
      where: {
        type: ContentType.VIDEO,
        status: ContentStatus.PUBLISHED,
        deletedAt: null,
        publishedAt: {
          gte: timeframes[timeframe],
        },
      },
      orderBy: [{ viewsCount: 'desc' }, { likesCount: 'desc' }],
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
    });

    return videos;
  }
}
