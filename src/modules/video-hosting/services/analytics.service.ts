import { Injectable } from '@nestjs/common';
import { ContentType, ContentStatus } from '@prisma/client';
import { PrismaService } from 'src/libs/db/prisma.service';
import { AnalyticsData, TopVideoData } from '../types';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getVideoAnalytics(videoId: bigint, days: number = 30): Promise<AnalyticsData[]> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // В реальном приложении здесь была бы более сложная логика
    // с отдельной таблицей для аналитики по дням
    // Пока возвращаем mock данные на основе общей статистики

    const video = await this.prisma.content.findUnique({
      where: { id: videoId },
      select: {
        viewsCount: true,
        likesCount: true,
        commentsCount: true,
        sharesCount: true,
        publishedAt: true,
      },
    });

    if (!video) {
      return [];
    }

    // Генерируем данные по дням (упрощенная версия)
    const analyticsData: AnalyticsData[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);

      // Симулируем рост метрик со временем
      const dayProgress = i / days;
      const viewsPerDay = Math.floor((Number(video.viewsCount) * dayProgress) / days);
      const likesPerDay = Math.floor((Number(video.likesCount) * dayProgress) / days);

      analyticsData.push({
        date: date.toISOString().split('T')[0],
        views: viewsPerDay,
        likes: likesPerDay,
        comments: Math.floor((video.commentsCount * dayProgress) / days),
        shares: Math.floor((Number(video.sharesCount) * dayProgress) / days),
      });
    }

    return analyticsData;
  }

  async getChannelAnalytics(channelId: bigint, days: number = 30): Promise<AnalyticsData[]> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const channel = await this.prisma.user.findUnique({
      where: { id: channelId },
      select: {
        subscribersCount: true,
        totalViews: true,
        totalLikes: true,
      },
    });

    if (!channel) {
      return [];
    }

    // Получаем статистику по видео канала
    const videos = await this.prisma.content.findMany({
      where: {
        authorId: channelId,
        type: ContentType.VIDEO,
        publishedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        viewsCount: true,
        likesCount: true,
        commentsCount: true,
        sharesCount: true,
        publishedAt: true,
      },
    });

    // Группируем по дням
    const dailyStats = new Map<string, AnalyticsData>();

    videos.forEach(video => {
      const date = video.publishedAt?.toISOString().split('T')[0];
      if (date) {
        const existing = dailyStats.get(date) || {
          date,
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          subscribers: channel.subscribersCount,
        };

        existing.views += Number(video.viewsCount);
        existing.likes += Number(video.likesCount);
        existing.comments += video.commentsCount;
        existing.shares += Number(video.sharesCount);

        dailyStats.set(date, existing);
      }
    });

    return Array.from(dailyStats.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }

  async getTopVideos(channelId: bigint, limit: number = 10): Promise<TopVideoData[]> {
    const topVideos = await this.prisma.content.findMany({
      where: {
        authorId: channelId,
        type: ContentType.VIDEO,
        status: ContentStatus.PUBLISHED,
        deletedAt: null,
      },
      orderBy: [{ viewsCount: 'desc' }, { likesCount: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        thumbnailUrl: true,
        viewsCount: true,
        likesCount: true,
        publishedAt: true,
      },
    });

    return topVideos.map(video => ({
      id: video.id,
      title: video.title,
      thumbnailUrl: video.thumbnailUrl || '',
      views: Number(video.viewsCount),
      likes: Number(video.likesCount),
      publishedAt: video.publishedAt || new Date(),
    }));
  }

  async getVideoPerformance(videoId: bigint) {
    const video = await this.prisma.content.findUnique({
      where: { id: videoId },
      select: {
        viewsCount: true,
        likesCount: true,
        dislikesCount: true,
        commentsCount: true,
        sharesCount: true,
        publishedAt: true,
        author: {
          select: {
            subscribersCount: true,
          },
        },
      },
    });

    if (!video) {
      throw new Error('Video not found');
    }

    const totalLikes = Number(video.likesCount);
    const totalDislikes = Number(video.dislikesCount);
    const totalRatings = totalLikes + totalDislikes;

    const likeRatio = totalRatings > 0 ? (totalLikes / totalRatings) * 100 : 0;
    const engagementRate =
      video.author.subscribersCount > 0
        ? (Number(video.viewsCount) / video.author.subscribersCount) * 100
        : 0;

    // Дни с момента публикации
    const daysSincePublished = video.publishedAt
      ? Math.floor((Date.now() - video.publishedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const viewsPerDay =
      daysSincePublished > 0
        ? Number(video.viewsCount) / daysSincePublished
        : Number(video.viewsCount);

    return {
      totalViews: Number(video.viewsCount),
      totalLikes,
      totalDislikes,
      totalComments: video.commentsCount,
      totalShares: Number(video.sharesCount),
      likeRatio: Math.round(likeRatio * 100) / 100,
      engagementRate: Math.round(engagementRate * 100) / 100,
      viewsPerDay: Math.round(viewsPerDay * 100) / 100,
      daysSincePublished,
    };
  }

  async getChannelOverview(channelId: bigint) {
    const channel = await this.prisma.user.findUnique({
      where: { id: channelId },
      select: {
        subscribersCount: true,
        totalViews: true,
        totalLikes: true,
        videosCount: true,
        createdAt: true,
      },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    // Получаем статистику за последние 30 дней
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const recentVideos = await this.prisma.content.findMany({
      where: {
        authorId: channelId,
        type: ContentType.VIDEO,
        publishedAt: {
          gte: thirtyDaysAgo,
        },
      },
      select: {
        viewsCount: true,
        likesCount: true,
      },
    });

    const recentViews = recentVideos.reduce((sum, video) => sum + Number(video.viewsCount), 0);
    const recentLikes = recentVideos.reduce((sum, video) => sum + Number(video.likesCount), 0);

    // Дни с момента создания канала
    const daysSinceCreated = Math.floor(
      (Date.now() - channel.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    const avgViewsPerVideo =
      channel.videosCount > 0 ? Number(channel.totalViews) / channel.videosCount : 0;

    return {
      totalSubscribers: channel.subscribersCount,
      totalViews: Number(channel.totalViews),
      totalLikes: Number(channel.totalLikes),
      totalVideos: channel.videosCount,
      recentViews30Days: recentViews,
      recentLikes30Days: recentLikes,
      recentVideos30Days: recentVideos.length,
      avgViewsPerVideo: Math.round(avgViewsPerVideo),
      daysSinceCreated,
    };
  }

  async getPopularTags(channelId?: bigint, limit: number = 20) {
    const whereClause: any = {};

    if (channelId) {
      whereClause.content = {
        authorId: channelId,
        type: ContentType.VIDEO,
      };
    } else {
      whereClause.content = {
        type: ContentType.VIDEO,
      };
    }

    const popularTags = await this.prisma.contentTag.groupBy({
      by: ['tagId'],
      where: whereClause,
      _count: {
        tagId: true,
      },
      orderBy: {
        _count: {
          tagId: 'desc',
        },
      },
      take: limit,
    });

    // Получаем названия тегов
    const tagIds = popularTags.map(tag => tag.tagId);
    const tags = await this.prisma.tag.findMany({
      where: {
        id: { in: tagIds },
      },
      select: {
        id: true,
        name: true,
        usageCount: true,
      },
    });

    // Совмещаем данные
    const tagMap = new Map(tags.map(tag => [tag.id, tag]));

    return popularTags.map(tagStat => {
      const tag = tagMap.get(tagStat.tagId);
      return {
        id: tagStat.tagId,
        name: tag?.name || 'Unknown',
        usageCount: tag?.usageCount || 0,
        videoCount: tagStat._count.tagId,
      };
    });
  }

  async getViewsGrowth(channelId: bigint, days: number = 30) {
    // В реальном приложении здесь была бы таблица daily_analytics
    // Пока делаем упрощенную версию
    const channel = await this.prisma.user.findUnique({
      where: { id: channelId },
      select: { totalViews: true },
    });

    if (!channel) {
      return [];
    }

    const growth: { date: string; totalViews: number; dailyViews: number }[] = [];
    const totalViews = Number(channel.totalViews);

    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000);
      const progress = i / days;
      const views = Math.floor(totalViews * progress);

      growth.push({
        date: date.toISOString().split('T')[0],
        totalViews: views,
        dailyViews: i > 0 ? views - growth[i - 1].totalViews : views,
      });
    }

    return growth;
  }
}
