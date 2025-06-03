import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../libs/supabase/db/prisma.service';
import { Prisma } from '@prisma/client';

interface SearchFilters {
  query?: string;
  categoryId?: string;
  tags?: string[];
  authorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  solved?: boolean;
  featured?: boolean;
  minVotes?: number;
  hasReplies?: boolean;
}

interface SearchResult {
  posts: any[];
  replies: any[];
  categories: any[];
  tags: any[];
  total: number;
}

@Injectable()
export class ForumSearchService {
  constructor(private prisma: PrismaService) {}

  async globalSearch(
    searchQuery: string,
    filters: SearchFilters = {},
    page = 1,
    limit = 20,
    userId?: string,
  ): Promise<SearchResult> {
    const skip = (page - 1) * limit;

    // Search in posts
    const postResults = await this.searchPosts(searchQuery, filters, skip, limit, userId);

    // Search in replies
    const replyResults = await this.searchReplies(
      searchQuery,
      filters,
      skip,
      Math.min(limit, 10),
      userId,
    );

    // Search in categories
    const categoryResults = await this.searchCategories(searchQuery);

    // Search in tags
    const tagResults = await this.searchTags(searchQuery);

    const total =
      postResults.length + replyResults.length + categoryResults.length + tagResults.length;

    return {
      posts: postResults,
      replies: replyResults,
      categories: categoryResults,
      tags: tagResults,
      total,
    };
  }

  async searchPosts(
    query: string,
    filters: SearchFilters = {},
    skip = 0,
    take = 20,
    userId?: string,
  ): Promise<any[]> {
    const where: Prisma.ForumPostWhereInput = {
      AND: [
        // Text search
        {
          OR: [
            {
              title: {
                contains: query,
                mode: 'insensitive',
              },
            },
            {
              content: {
                contains: query,
                mode: 'insensitive',
              },
            },
          ],
        },
        // Apply filters
        ...this.buildPostFilters(filters),
      ],
    };

    const posts = await this.prisma.forumPost.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatar: true,
            reputation: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
          },
        },
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
                slug: true,
                color: true,
              },
            },
          },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
      orderBy: [
        { featured: 'desc' },
        { pinned: 'desc' },
        { netVotes: 'desc' },
        { createdAt: 'desc' },
      ],
      skip,
      take,
    });

    // Add user votes if authenticated
    if (userId) {
      const postsWithVotes = await Promise.all(
        posts.map(async post => ({
          ...post,
          userVote: await this.getUserVote(userId, post.id, 'POST'),
        })),
      );
      return postsWithVotes;
    }

    return posts;
  }

  async searchReplies(
    query: string,
    filters: SearchFilters = {},
    skip = 0,
    take = 10,
    userId?: string,
  ): Promise<any[]> {
    const where: Prisma.ForumReplyWhereInput = {
      content: {
        contains: query,
        mode: 'insensitive',
      },
    };

    // Add post filters if needed
    if (filters.categoryId || filters.authorId || filters.solved !== undefined) {
      where.post = {};

      if (filters.categoryId) {
        where.post.categoryId = filters.categoryId;
      }

      if (filters.authorId) {
        where.post.authorId = filters.authorId;
      }

      if (filters.solved !== undefined) {
        where.post.solved = filters.solved;
      }
    }

    const replies = await this.prisma.forumReply.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatar: true,
            reputation: true,
          },
        },
        post: {
          select: {
            id: true,
            title: true,
            slug: true,
            categoryId: true,
          },
        },
      },
      orderBy: [{ isSolution: 'desc' }, { netVotes: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
    });

    // Add user votes if authenticated
    if (userId) {
      const repliesWithVotes = await Promise.all(
        replies.map(async reply => ({
          ...reply,
          userVote: await this.getUserVote(userId, reply.id, 'REPLY'),
        })),
      );
      return repliesWithVotes;
    }

    return replies;
  }

  async searchCategories(query: string): Promise<any[]> {
    return this.prisma.forumCategory.findMany({
      where: {
        OR: [
          {
            name: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: query,
              mode: 'insensitive',
            },
          },
        ],
        archived: false,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        color: true,
        icon: true,
        postCount: true,
        topicCount: true,
      },
      orderBy: [{ postCount: 'desc' }, { name: 'asc' }],
      take: 10,
    });
  }

  async searchTags(query: string): Promise<any[]> {
    return this.prisma.forumTag.findMany({
      where: {
        name: {
          contains: query,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        usageCount: true,
      },
      orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
      take: 10,
    });
  }

  async getPopularTags(limit = 20): Promise<any[]> {
    return this.prisma.forumTag.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        usageCount: true,
      },
      orderBy: {
        usageCount: 'desc',
      },
      take: limit,
    });
  }

  async getTrendingPosts(limit = 10, timeFrame: 'day' | 'week' | 'month' = 'week'): Promise<any[]> {
    const now = new Date();
    const timeFrameMap = {
      day: 1,
      week: 7,
      month: 30,
    };

    const daysAgo = timeFrameMap[timeFrame];
    const since = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

    return this.prisma.forumPost.findMany({
      where: {
        createdAt: {
          gte: since,
        },
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatar: true,
            reputation: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
          },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
      orderBy: [{ views: 'desc' }, { netVotes: 'desc' }, { replyCount: 'desc' }],
      take: limit,
    });
  }

  async getHotTopics(limit = 10): Promise<any[]> {
    // Calculate hot score based on activity in last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return this.prisma.forumPost.findMany({
      where: {
        lastActivity: {
          gte: oneDayAgo,
        },
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatar: true,
            reputation: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
          },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
      orderBy: [{ hotScore: 'desc' }, { lastActivity: 'desc' }],
      take: limit,
    });
  }

  async getSimilarPosts(postId: string, limit = 5): Promise<any[]> {
    // Get the current post's tags and category
    const currentPost = await this.prisma.forumPost.findUnique({
      where: { id: postId },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    if (!currentPost) {
      return [];
    }

    const tagIds = currentPost.tags.map(pt => pt.tag.id);

    // Find posts with similar tags or same category
    return this.prisma.forumPost.findMany({
      where: {
        AND: [
          { id: { not: postId } }, // Exclude current post
          {
            OR: [
              {
                categoryId: currentPost.categoryId,
              },
              {
                tags: {
                  some: {
                    tagId: {
                      in: tagIds,
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
      orderBy: [{ netVotes: 'desc' }, { views: 'desc' }],
      take: limit,
    });
  }

  async getSearchSuggestions(
    query: string,
    limit = 5,
  ): Promise<{
    posts: string[];
    tags: string[];
    categories: string[];
  }> {
    const [postSuggestions, tagSuggestions, categorySuggestions] = await Promise.all([
      // Post title suggestions
      this.prisma.forumPost.findMany({
        where: {
          title: {
            contains: query,
            mode: 'insensitive',
          },
        },
        select: { title: true },
        orderBy: { views: 'desc' },
        take: limit,
      }),

      // Tag suggestions
      this.prisma.forumTag.findMany({
        where: {
          name: {
            contains: query,
            mode: 'insensitive',
          },
        },
        select: { name: true },
        orderBy: { usageCount: 'desc' },
        take: limit,
      }),

      // Category suggestions
      this.prisma.forumCategory.findMany({
        where: {
          name: {
            contains: query,
            mode: 'insensitive',
          },
          archived: false,
        },
        select: { name: true },
        orderBy: { postCount: 'desc' },
        take: limit,
      }),
    ]);

    return {
      posts: postSuggestions.map(p => p.title),
      tags: tagSuggestions.map(t => t.name),
      categories: categorySuggestions.map(c => c.name),
    };
  }

  // Private helper methods
  private buildPostFilters(filters: SearchFilters): Prisma.ForumPostWhereInput[] {
    const conditions: Prisma.ForumPostWhereInput[] = [];

    if (filters.categoryId) {
      conditions.push({ categoryId: filters.categoryId });
    }

    if (filters.tags && filters.tags.length > 0) {
      conditions.push({
        tags: {
          some: {
            tag: {
              name: {
                in: filters.tags,
              },
            },
          },
        },
      });
    }

    if (filters.authorId) {
      conditions.push({ authorId: filters.authorId });
    }

    if (filters.dateFrom || filters.dateTo) {
      const dateFilter: any = {};
      if (filters.dateFrom) dateFilter.gte = filters.dateFrom;
      if (filters.dateTo) dateFilter.lte = filters.dateTo;
      conditions.push({ createdAt: dateFilter });
    }

    if (filters.solved !== undefined) {
      conditions.push({ solved: filters.solved });
    }

    if (filters.featured !== undefined) {
      conditions.push({ featured: filters.featured });
    }

    if (filters.minVotes !== undefined) {
      conditions.push({ netVotes: { gte: filters.minVotes } });
    }

    if (filters.hasReplies !== undefined) {
      if (filters.hasReplies) {
        conditions.push({ replyCount: { gt: 0 } });
      } else {
        conditions.push({ replyCount: 0 });
      }
    }

    return conditions;
  }

  private async getUserVote(
    userId: string,
    targetId: string,
    targetType: 'POST' | 'REPLY',
  ): Promise<number | undefined> {
    const vote = await this.prisma.forumVote.findUnique({
      where: {
        userId_targetId_targetType: {
          userId,
          targetId,
          targetType,
        },
      },
    });

    return vote?.value;
  }
}
