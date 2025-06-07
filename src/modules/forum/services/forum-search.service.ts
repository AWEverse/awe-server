import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../libs/supabase/db/prisma.service';
import { Prisma } from 'generated/client';

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

export interface SearchResult {
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
            reputation: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
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
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take,
    });

    // Add user votes if authenticated
    if (userId) {
      const postsWithVotes = await Promise.all(
        posts.map(async post => ({
          ...post,
          userVote: await this.getUserVote(userId, post.id.toString(), 'POST'),
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
        where.post.categoryId = BigInt(filters.categoryId);
      }

      if (filters.authorId) {
        where.post.authorId = BigInt(filters.authorId);
      }
      if (filters.solved !== undefined) {
        // solved is bit 8 in flags
        if (filters.solved) {
          where.post.flags = { gt: 7 }; // Has solved bit set
        } else {
          where.post.flags = { lt: 8 }; // Doesn't have solved bit set
        }
      }
    }
    const replies = await this.prisma.forumReply.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            username: true,
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
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take,
    });

    // Add user votes if authenticated
    if (userId) {
      const repliesWithVotes = await Promise.all(
        replies.map(async reply => ({
          ...reply,
          userVote: await this.getUserVote(userId, reply.id.toString(), 'REPLY'),
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
        // archived: false,  // Use bit flags if needed
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        color: true,
        icon: true,
        postsCount: true,
        topicsCount: true,
      },
      orderBy: [{ postsCount: 'desc' }, { name: 'asc' }],
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
            reputation: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
      orderBy: [{ repliesCount: 'desc' }],
      take: limit,
    });
  }
  async getHotTopics(limit = 10): Promise<any[]> {
    // Calculate hot score based on activity in last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return this.prisma.forumPost.findMany({
      where: {
        createdAt: {
          gte: oneDayAgo,
        },
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            reputation: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });
  }
  async getSimilarPosts(postId: string, limit = 5): Promise<any[]> {
    // Get the current post's tags and category
    const currentPost = await this.prisma.forumPost.findUnique({
      where: { id: BigInt(postId) },
      include: {
        // Remove tags include since it's causing errors
      },
    });

    if (!currentPost) {
      return [];
    } // Find posts with same category
    return this.prisma.forumPost.findMany({
      where: {
        AND: [
          { id: { not: BigInt(postId) } }, // Exclude current post
          {
            categoryId: currentPost.categoryId,
          },
        ],
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
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
        orderBy: { viewsCount: 'desc' },
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
      }), // Category suggestions
      this.prisma.forumCategory.findMany({
        where: {
          name: {
            contains: query,
            mode: 'insensitive',
          },
          // archived: false,  // Comment out archived filter
        },
        select: { name: true },
        orderBy: { postsCount: 'desc' },
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
      conditions.push({ categoryId: BigInt(filters.categoryId) });
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
      conditions.push({ authorId: BigInt(filters.authorId) });
    }

    if (filters.dateFrom || filters.dateTo) {
      const dateFilter: any = {};
      if (filters.dateFrom) dateFilter.gte = filters.dateFrom;
      if (filters.dateTo) dateFilter.lte = filters.dateTo;
      conditions.push({ createdAt: dateFilter });
    }
    if (filters.solved !== undefined) {
      // solved is bit 8 in flags
      if (filters.solved) {
        conditions.push({ flags: { gte: 8 } }); // Has solved bit set
      } else {
        conditions.push({
          OR: [
            { flags: { lt: 8 } }, // Flags < 8 (no solved bit)
            { flags: { in: [1, 2, 3, 4, 5, 6, 7] } }, // Specific values without solved bit
          ],
        });
      }
    }
    if (filters.featured !== undefined) {
      // featured is bit 4 in flags
      if (filters.featured) {
        conditions.push({
          flags: { gte: 16 }, // Bit 5 for featured (2^4 = 16)
        });
      } else {
        conditions.push({
          OR: [
            { flags: { lt: 16 } }, // No featured bit
            { flags: { in: [1, 2, 3] } }, // Specific values without featured bit
          ],
        });
      }
    }
    if (filters.minVotes !== undefined) {
      // Use likesCount - dislikesCount as net votes
      conditions.push({
        likesCount: {
          gte: filters.minVotes + (filters.minVotes > 0 ? 0 : Math.abs(filters.minVotes)),
        },
      });
    }
    if (filters.hasReplies !== undefined) {
      if (filters.hasReplies) {
        conditions.push({ repliesCount: { gt: 0 } });
      } else {
        conditions.push({ repliesCount: 0 });
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
      where:
        targetType === 'POST'
          ? {
              userId_postId: {
                userId: BigInt(userId),
                postId: BigInt(targetId),
              },
            }
          : {
              userId_replyId: {
                userId: BigInt(userId),
                replyId: BigInt(targetId),
              },
            },
      select: {
        value: true,
      },
    });

    return vote?.value;
  }
}
