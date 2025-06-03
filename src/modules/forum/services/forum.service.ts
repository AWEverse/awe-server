import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateForumPostDto,
  UpdateForumPostDto,
  ForumPostQueryDto,
  ForumPostResponseDto,
  PaginatedForumPostsDto,
  ForumStatsDto,
} from './dto/forum.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ForumService {
  constructor(private prisma: PrismaService) {}

  async createPost(
    userId: string,
    createPostDto: CreateForumPostDto,
  ): Promise<ForumPostResponseDto> {
    const { tags, ...postData } = createPostDto;

    // Verify category exists
    const category = await this.prisma.forumCategory.findUnique({
      where: { id: createPostDto.categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.archived) {
      throw new BadRequestException('Cannot post in archived category');
    }

    // Generate slug from title
    const slug = this.generateSlug(createPostDto.title);

    // Create post in transaction
    const post = await this.prisma.$transaction(async prisma => {
      // Create the post
      const newPost = await prisma.forumPost.create({
        data: {
          ...postData,
          slug,
          authorId: userId,
        },
        include: this.getPostIncludes(),
      });

      // Handle tags if provided
      if (tags && tags.length > 0) {
        await this.handlePostTags(prisma, newPost.id, tags);
      }

      // Update category post count
      await prisma.forumCategory.update({
        where: { id: createPostDto.categoryId },
        data: {
          postCount: { increment: 1 },
          topicCount: { increment: 1 },
          lastActivity: new Date(),
        },
      });

      // Update user post count
      await prisma.user.update({
        where: { id: userId },
        data: {
          postCount: { increment: 1 },
        },
      });

      return newPost;
    });

    return this.transformPostToResponse(post);
  }

  async findPosts(query: ForumPostQueryDto, userId?: string): Promise<PaginatedForumPostsDto> {
    const {
      categoryId,
      tag,
      search,
      sortBy = 'latest',
      sortOrder = 'desc',
      solved,
      featured,
      page = 1,
      limit = 20,
    } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.ForumPostWhereInput = {};

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (tag) {
      where.tags = {
        some: {
          tag: {
            name: {
              equals: tag,
              mode: 'insensitive',
            },
          },
        },
      };
    }

    if (search) {
      where.OR = [
        {
          title: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          content: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (solved !== undefined) {
      where.solved = solved;
    }

    if (featured !== undefined) {
      where.featured = featured;
    }

    // Build order by clause
    const orderBy = this.buildOrderBy(sortBy, sortOrder);

    // Execute query
    const [posts, total] = await this.prisma.$transaction([
      this.prisma.forumPost.findMany({
        where,
        include: this.getPostIncludes(),
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.forumPost.count({ where }),
    ]);

    // Transform posts and add user votes if authenticated
    const transformedPosts = await Promise.all(
      posts.map(async post => {
        const transformed = this.transformPostToResponse(post);
        if (userId) {
          transformed.userVote = await this.getUserVote(userId, post.id, 'POST');
        }
        return transformed;
      }),
    );

    const totalPages = Math.ceil(total / limit);

    return {
      data: transformedPosts,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages,
      },
    };
  }

  async findPostById(id: string, userId?: string): Promise<ForumPostResponseDto> {
    const post = await this.prisma.forumPost.findUnique({
      where: { id },
      include: {
        ...this.getPostIncludes(),
        replies: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                avatar: true,
                reputation: true,
                postCount: true,
                createdAt: true,
              },
            },
            children: {
              include: {
                author: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true,
                    reputation: true,
                    postCount: true,
                    createdAt: true,
                  },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          where: { parentId: null }, // Only top-level replies
          orderBy: [
            { isSolution: 'desc' }, // Solutions first
            { netVotes: 'desc' }, // Then by votes
            { createdAt: 'asc' }, // Then by creation time
          ],
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // Increment view count (async, don't wait)
    this.incrementPostViews(id).catch(() => {
      // Silently handle view increment errors
    });

    const transformed = this.transformPostToResponse(post);

    // Add user vote if authenticated
    if (userId) {
      transformed.userVote = await this.getUserVote(userId, id, 'POST');

      // Add user votes for replies
      if (transformed.replies) {
        for (const reply of transformed.replies) {
          reply.userVote = await this.getUserVote(userId, reply.id, 'REPLY');
          if (reply.children) {
            for (const childReply of reply.children) {
              childReply.userVote = await this.getUserVote(userId, childReply.id, 'REPLY');
            }
          }
        }
      }
    }

    return transformed;
  }

  async updatePost(
    id: string,
    userId: string,
    updatePostDto: UpdateForumPostDto,
  ): Promise<ForumPostResponseDto> {
    const { tags, ...updateData } = updatePostDto;

    // Verify post exists and user has permission
    const existingPost = await this.prisma.forumPost.findUnique({
      where: { id },
      include: { author: true },
    });

    if (!existingPost) {
      throw new NotFoundException('Post not found');
    }

    if (existingPost.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own posts');
    }

    if (existingPost.locked) {
      throw new BadRequestException('Cannot edit locked post');
    }

    // Update post in transaction
    const updatedPost = await this.prisma.$transaction(async prisma => {
      // Update the post
      const post = await prisma.forumPost.update({
        where: { id },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
        include: this.getPostIncludes(),
      });

      // Handle tags if provided
      if (tags !== undefined) {
        // Remove existing tags
        await prisma.forumPostTag.deleteMany({
          where: { postId: id },
        });

        // Add new tags
        if (tags.length > 0) {
          await this.handlePostTags(prisma, id, tags);
        }
      }

      return post;
    });

    return this.transformPostToResponse(updatedPost);
  }

  async deletePost(id: string, userId: string): Promise<void> {
    // Verify post exists and user has permission
    const post = await this.prisma.forumPost.findUnique({
      where: { id },
      include: { author: true, category: true },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    // Delete post and update counters
    await this.prisma.$transaction(async prisma => {
      // Delete the post (cascading deletes will handle related records)
      await prisma.forumPost.delete({
        where: { id },
      });

      // Update category counters
      await prisma.forumCategory.update({
        where: { id: post.categoryId },
        data: {
          postCount: { decrement: 1 },
          topicCount: { decrement: 1 },
        },
      });

      // Update user post count
      await prisma.user.update({
        where: { id: userId },
        data: {
          postCount: { decrement: 1 },
        },
      });
    });
  }

  async votePost(
    postId: string,
    userId: string,
    value: number,
  ): Promise<{ success: boolean; netVotes: number }> {
    return this.handleVote(postId, userId, value, 'POST');
  }

  async getForumStats(): Promise<ForumStatsDto> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalPosts,
      totalReplies,
      totalUsers,
      totalCategories,
      todayPosts,
      todayReplies,
      activeUsers,
    ] = await Promise.all([
      this.prisma.forumPost.count(),
      this.prisma.forumReply.count(),
      this.prisma.user.count(),
      this.prisma.forumCategory.count({ where: { archived: false } }),
      this.prisma.forumPost.count({
        where: { createdAt: { gte: today } },
      }),
      this.prisma.forumReply.count({
        where: { createdAt: { gte: today } },
      }),
      this.prisma.user.count({
        where: {
          lastSeen: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      }),
    ]);

    return {
      totalPosts,
      totalReplies,
      totalUsers,
      totalCategories,
      todayPosts,
      todayReplies,
      activeUsers,
    };
  }

  // Private helper methods
  private getPostIncludes() {
    return {
      author: {
        select: {
          id: true,
          username: true,
          avatar: true,
          reputation: true,
          postCount: true,
          createdAt: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          color: true,
          icon: true,
          position: true,
          postCount: true,
          topicCount: true,
          lastActivity: true,
          archived: true,
          moderated: true,
          private: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
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
              usageCount: true,
            },
          },
        },
      },
      _count: {
        select: {
          replies: true,
        },
      },
    };
  }

  private transformPostToResponse(post: any): ForumPostResponseDto {
    return {
      id: post.id,
      title: post.title,
      content: post.content,
      slug: post.slug,
      views: post.views,
      upvotes: post.upvotes,
      downvotes: post.downvotes,
      netVotes: post.netVotes,
      replyCount: post._count?.replies || 0,
      pinned: post.pinned,
      locked: post.locked,
      featured: post.featured,
      solved: post.solved,
      lastActivity: post.lastActivity,
      author: post.author,
      category: post.category,
      tags: post.tags?.map((pt: any) => pt.tag) || [],
      replies: post.replies?.map((reply: any) => this.transformReplyToResponse(reply)) || undefined,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }

  private transformReplyToResponse(reply: any): any {
    return {
      id: reply.id,
      content: reply.content,
      isSolution: reply.isSolution,
      upvotes: reply.upvotes,
      downvotes: reply.downvotes,
      netVotes: reply.netVotes,
      parentId: reply.parentId,
      author: reply.author,
      children: reply.children?.map((child: any) => this.transformReplyToResponse(child)) || [],
      createdAt: reply.createdAt,
      updatedAt: reply.updatedAt,
    };
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  private buildOrderBy(sortBy: string, sortOrder: string) {
    const order = sortOrder === 'asc' ? 'asc' : 'desc';

    switch (sortBy) {
      case 'popular':
        return [{ netVotes: order }, { replyCount: order }];
      case 'hot':
        return [{ hotScore: order }, { netVotes: order }];
      case 'views':
        return { views: order };
      case 'votes':
        return { netVotes: order };
      case 'latest':
      default:
        return { createdAt: order };
    }
  }

  private async handlePostTags(prisma: any, postId: string, tagNames: string[]) {
    for (const tagName of tagNames) {
      // Find or create tag
      const tag = await prisma.forumTag.upsert({
        where: { name: tagName.toLowerCase() },
        update: {
          usageCount: { increment: 1 },
        },
        create: {
          name: tagName.toLowerCase(),
          slug: this.generateSlug(tagName),
          usageCount: 1,
        },
      });

      // Link tag to post
      await prisma.forumPostTag.create({
        data: {
          postId,
          tagId: tag.id,
        },
      });
    }
  }

  private async handleVote(
    targetId: string,
    userId: string,
    value: number,
    type: 'POST' | 'REPLY',
  ) {
    return this.prisma.$transaction(async prisma => {
      const targetTable = type === 'POST' ? 'forumPost' : 'forumReply';

      // Check for existing vote
      const existingVote = await prisma.forumVote.findUnique({
        where: {
          userId_targetId_targetType: {
            userId,
            targetId,
            targetType: type,
          },
        },
      });

      let netChange = value;

      if (existingVote) {
        if (existingVote.value === value) {
          // Same vote - remove it
          await prisma.forumVote.delete({
            where: { id: existingVote.id },
          });
          netChange = -value;
        } else {
          // Different vote - update it
          await prisma.forumVote.update({
            where: { id: existingVote.id },
            data: { value },
          });
          netChange = value - existingVote.value;
        }
      } else {
        // New vote
        await prisma.forumVote.create({
          data: {
            userId,
            targetId,
            targetType: type,
            value,
          },
        });
      }

      // Update target vote counts
      const updateData: any = {
        netVotes: { increment: netChange },
      };

      if (value > 0) {
        updateData.upvotes = { increment: netChange > 0 ? 1 : -1 };
      } else {
        updateData.downvotes = { increment: netChange < 0 ? 1 : -1 };
      }

      const updatedTarget = await (prisma as any)[targetTable].update({
        where: { id: targetId },
        data: updateData,
        select: { netVotes: true },
      });

      return {
        success: true,
        netVotes: updatedTarget.netVotes,
      };
    });
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

  private async incrementPostViews(postId: string): Promise<void> {
    await this.prisma.forumPost.update({
      where: { id: postId },
      data: {
        views: { increment: 1 },
      },
    });
  }
}
