import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../libs/supabase/db/prisma.service';
import { UpdateProfileDto, ProfileResponseDto } from './dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get user profile by user ID
   */
  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: BigInt(userId),
      },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        bio: true,
        avatarUrl: true,
        bannerUrl: true,
        color: true,
        phoneNumber: true,
        timezone: true,
        locale: true,
        flags: true,
        status: true,
        subscribersCount: true,
        subscriptionsCount: true,
        videosCount: true,
        postsCount: true,
        totalViews: true,
        totalLikes: true,
        reputation: true,
        lastSeen: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      ...user,
      id: user.id.toString(),
      totalViews: user.totalViews.toString(),
      totalLikes: user.totalLikes.toString(),
    };
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updateData: UpdateProfileDto): Promise<ProfileResponseDto> {
    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    // Check for unique constraints if updating phone
    if (updateData.phoneNumber) {
      const phoneExists = await this.prisma.user.findFirst({
        where: {
          phoneNumber: updateData.phoneNumber,
          id: { not: BigInt(userId) },
        },
      });

      if (phoneExists) {
        throw new BadRequestException('Phone number already in use');
      }
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: {
          id: BigInt(userId),
        },
        data: updateData,
        select: {
          id: true,
          email: true,
          username: true,
          fullName: true,
          bio: true,
          avatarUrl: true,
          bannerUrl: true,
          color: true,
          phoneNumber: true,
          timezone: true,
          locale: true,
          flags: true,
          status: true,
          subscribersCount: true,
          subscriptionsCount: true,
          videosCount: true,
          postsCount: true,
          totalViews: true,
          totalLikes: true,
          reputation: true,
          lastSeen: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        ...updatedUser,
        id: updatedUser.id.toString(),
        totalViews: updatedUser.totalViews.toString(),
        totalLikes: updatedUser.totalLikes.toString(),
      };
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException('A user with this information already exists');
      }
      throw error;
    }
  }

  /**
   * Get user profile statistics
   */
  async getProfileStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: {
        subscribersCount: true,
        subscriptionsCount: true,
        videosCount: true,
        postsCount: true,
        totalViews: true,
        totalLikes: true,
        reputation: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      ...user,
      totalViews: user.totalViews.toString(),
      totalLikes: user.totalLikes.toString(),
    };
  }

  /**
   * Check if username is available
   */
  async checkUsernameAvailability(
    username: string,
    currentUserId?: string,
  ): Promise<{ available: boolean }> {
    const whereClause: any = { username };

    if (currentUserId) {
      whereClause.id = { not: BigInt(currentUserId) };
    }

    const existingUser = await this.prisma.user.findFirst({
      where: whereClause,
    });

    return { available: !existingUser };
  }

  /**
   * Update last seen timestamp
   */
  async updateLastSeen(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: { lastSeen: new Date() },
    });
  }

  /**
   * Get user's followers/subscribers
   */
  async getFollowers(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const followers = await this.prisma.subscription.findMany({
      where: { subscribedToId: BigInt(userId) },
      include: {
        subscriber: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
            flags: true,
            subscribersCount: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const total = await this.prisma.subscription.count({
      where: { subscribedToId: BigInt(userId) },
    });

    return {
      followers: followers.map(f => ({
        ...f.subscriber,
        id: f.subscriber.id.toString(),
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user's following/subscriptions
   */
  async getFollowing(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const following = await this.prisma.subscription.findMany({
      where: { subscriberId: BigInt(userId) },
      include: {
        subscribedTo: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
            flags: true,
            subscribersCount: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const total = await this.prisma.subscription.count({
      where: { subscriberId: BigInt(userId) },
    });

    return {
      following: following.map(f => ({
        ...f.subscribedTo,
        id: f.subscribedTo.id.toString(),
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}
