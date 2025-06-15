import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ChannelStats } from '../types';
import { ContentType, ContentStatus } from 'generated/client';
import { PrismaService } from 'src/libs/db/prisma.service';

@Injectable()
export class ChannelService {
  constructor(private readonly prisma: PrismaService) {}

  async getChannelById(channelId: bigint) {
    const channel = await this.prisma.user.findUnique({
      where: { id: channelId },
      select: {
        id: true,
        username: true,
        fullName: true,
        bio: true,
        avatarUrl: true,
        bannerUrl: true,
        subscribersCount: true,
        subscriptionsCount: true,
        videosCount: true,
        totalViews: true,
        totalLikes: true,
        createdAt: true,
        flags: true,
      },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    return channel;
  }

  async getChannelVideos(channelId: bigint, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [videos, total] = await Promise.all([
      this.prisma.content.findMany({
        where: {
          authorId: channelId,
          type: ContentType.VIDEO,
          status: ContentStatus.PUBLISHED,
          deletedAt: null,
        },
        orderBy: {
          publishedAt: 'desc',
        },
        skip,
        take: limit,
        include: {
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
      this.prisma.content.count({
        where: {
          authorId: channelId,
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

  async getChannelPlaylists(channelId: bigint, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [playlists, total] = await Promise.all([
      this.prisma.playlist.findMany({
        where: {
          authorId: channelId,
          flags: {
            // Публичные плейлисты (public = 1)
            gte: 1,
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        skip,
        take: limit,
        include: {
          items: {
            take: 3, // Первые 3 видео для превью
            include: {
              content: {
                select: {
                  id: true,
                  title: true,
                  thumbnailUrl: true,
                  viewsCount: true,
                  createdAt: true,
                },
              },
            },
            orderBy: {
              position: 'asc',
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
      this.prisma.playlist.count({
        where: {
          authorId: channelId,
          flags: {
            gte: 1,
          },
        },
      }),
    ]);

    return {
      playlists,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async subscribeToChannel(subscriberId: bigint, channelId: bigint): Promise<void> {
    if (subscriberId === channelId) {
      throw new ForbiddenException('You cannot subscribe to yourself');
    }

    await this.prisma.subscription.upsert({
      where: {
        subscriberId_subscribedToId: {
          subscriberId,
          subscribedToId: channelId,
        },
      },
      update: {
        flags: 1, // Включаем уведомления
        createdAt: new Date(),
      },
      create: {
        subscriberId,
        subscribedToId: channelId,
        flags: 1,
      },
    });

    // Обновляем счетчик подписчиков у канала
    await this.prisma.user.update({
      where: { id: channelId },
      data: {
        subscribersCount: {
          increment: 1,
        },
      },
    });

    // Обновляем счетчик подписок у пользователя
    await this.prisma.user.update({
      where: { id: subscriberId },
      data: {
        subscriptionsCount: {
          increment: 1,
        },
      },
    });
  }

  async unsubscribeFromChannel(subscriberId: bigint, channelId: bigint): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({
      where: {
        subscriberId_subscribedToId: {
          subscriberId,
          subscribedToId: channelId,
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    await this.prisma.subscription.delete({
      where: {
        subscriberId_subscribedToId: {
          subscriberId,
          subscribedToId: channelId,
        },
      },
    });

    // Обновляем счетчики
    await Promise.all([
      this.prisma.user.update({
        where: { id: channelId },
        data: {
          subscribersCount: {
            decrement: 1,
          },
        },
      }),
      this.prisma.user.update({
        where: { id: subscriberId },
        data: {
          subscriptionsCount: {
            decrement: 1,
          },
        },
      }),
    ]);
  }

  async isSubscribed(subscriberId: bigint, channelId: bigint): Promise<boolean> {
    const subscription = await this.prisma.subscription.findUnique({
      where: {
        subscriberId_subscribedToId: {
          subscriberId,
          subscribedToId: channelId,
        },
      },
    });

    return !!subscription;
  }

  async getChannelStats(channelId: bigint): Promise<ChannelStats> {
    const stats = await this.prisma.user.findUnique({
      where: { id: channelId },
      select: {
        subscribersCount: true,
        totalViews: true,
        videosCount: true,
        totalLikes: true,
      },
    });

    if (!stats) {
      throw new NotFoundException('Channel not found');
    }

    return {
      subscribersCount: stats.subscribersCount,
      totalViews: Number(stats.totalViews),
      totalVideos: stats.videosCount,
      totalLikes: Number(stats.totalLikes),
    };
  }

  async getSubscriptions(userId: bigint, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [subscriptions, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { subscriberId: userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          subscribedTo: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
              subscribersCount: true,
              videosCount: true,
              flags: true,
            },
          },
        },
      }),
      this.prisma.subscription.count({
        where: { subscriberId: userId },
      }),
    ]);

    return {
      subscriptions: subscriptions.map(sub => sub.subscribedTo),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getSubscriptionFeed(userId: bigint, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    // Получаем список каналов на которые подписан пользователь
    const subscriptions = await this.prisma.subscription.findMany({
      where: { subscriberId: userId },
      select: { subscribedToId: true },
    });

    const channelIds = subscriptions.map(sub => sub.subscribedToId);

    if (channelIds.length === 0) {
      return {
        videos: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const [videos, total] = await Promise.all([
      this.prisma.content.findMany({
        where: {
          authorId: { in: channelIds },
          type: ContentType.VIDEO,
          status: ContentStatus.PUBLISHED,
          deletedAt: null,
        },
        orderBy: {
          publishedAt: 'desc',
        },
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
      this.prisma.content.count({
        where: {
          authorId: { in: channelIds },
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
