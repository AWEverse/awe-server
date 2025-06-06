import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../libs/supabase/db/prisma.service';
import {
  CreateForumPostDto,
  UpdateForumPostDto,
  ForumPostQueryDto,
  ForumPostResponseDto,
  PaginatedForumPostsDto,
  ForumStatsDto,
} from '../dto/forum.dto';
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
      where: { id: BigInt(createPostDto.categoryId) },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    } // Check if category is archived using flags (bit 16 = archived)
    if (category.flags & 16) {
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
          categoryId: BigInt(createPostDto.categoryId),
          slug,
          authorId: BigInt(userId),
        },
        include: this.getPostIncludes(),
      }); // Handle tags if provided
      if (tags && tags.length > 0) {
        await this.handlePostTags(prisma, newPost.id.toString(), tags);
      } // Update category post count
      await prisma.forumCategory.update({
        where: { id: BigInt(createPostDto.categoryId) },
        data: {
          postsCount: { increment: 1 },
          topicsCount: { increment: 1 },
        },
      }); // Update user post count
      await prisma.user.update({
        where: { id: BigInt(userId) },
        data: {
          postsCount: { increment: 1 },
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
      where.categoryId = BigInt(categoryId);
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
      // solved is bit 8 in flags - we need to use bitwise AND
      if (solved) {
        // Posts where (flags & 8) != 0 - posts that are solved
        if (!where.AND) where.AND = [];
        if (Array.isArray(where.AND)) {
          where.AND.push({ flags: { gte: 8 } });
        }
      } else {
        // Posts where (flags & 8) == 0 - posts that are not solved
        if (!where.AND) where.AND = [];
        if (Array.isArray(where.AND)) {
          where.AND.push({ flags: { lt: 8 } });
        }
      }
    }
    if (featured !== undefined) {
      // featured is bit 4 in flags
      if (featured) {
        if (!where.AND) where.AND = [];
        if (Array.isArray(where.AND)) {
          where.AND.push({ flags: { gte: 4 } });
        }
      } else {
        if (!where.AND) where.AND = [];
        if (Array.isArray(where.AND)) {
          where.AND.push({ flags: { lt: 4 } });
        }
      }
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
          transformed.userVote = await this.getUserVote(userId, post.id.toString(), 'POST');
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
      where: { id: BigInt(id) },
      include: {
        ...this.getPostIncludes(),
        replies: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                reputation: true,
                postsCount: true,
                createdAt: true,
              },
            },
            children: {
              include: {
                author: {
                  select: {
                    id: true,
                    username: true,
                    reputation: true,
                    postsCount: true,
                    createdAt: true,
                  },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          where: { parentId: null }, // Only top-level replies
          orderBy: [
            { createdAt: 'asc' }, // For now, simple ordering - we'll need to handle solution logic differently
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
    const { tags, ...updateData } = updatePostDto; // Verify post exists and user has permission
    const existingPost = await this.prisma.forumPost.findUnique({
      where: { id: BigInt(id) },
      include: { author: true },
    });

    if (!existingPost) {
      throw new NotFoundException('Post not found');
    }
    if (existingPost.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own posts');
    }
    if (existingPost.flags & 2) {
      // locked is bit 2
      throw new BadRequestException('Cannot edit locked post');
    }

    // Update post in transaction
    const updatedPost = await this.prisma.$transaction(async prisma => {
      // Update the post
      const post = await prisma.forumPost.update({
        where: { id: BigInt(id) },
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
          where: { postId: BigInt(id) },
        }); // Add new tags
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
      where: { id: BigInt(id) },
      include: { author: true, category: true },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }
    if (post.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    // Delete post and update counters
    await this.prisma.$transaction(async prisma => {
      // Delete the post (cascading deletes will handle related records)
      await prisma.forumPost.delete({
        where: { id: BigInt(id) },
      });

      // Update category counters
      await prisma.forumCategory.update({
        where: { id: post.categoryId },
        data: {
          postsCount: { decrement: 1 },
          topicsCount: { decrement: 1 },
        },
      });

      // Update user post count
      await prisma.user.update({
        where: { id: BigInt(userId) },
        data: {
          postsCount: { decrement: 1 },
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
      this.prisma.forumCategory.count({ where: { flags: { lt: 16 } } }), // not archived (bit 16)
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
          reputation: true,
          postsCount: true,
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
          postsCount: true,
          topicsCount: true,
          flags: true,
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
      views: post.viewsCount,
      upvotes: post.likesCount,
      downvotes: post.dislikesCount,
      netVotes: post.likesCount - post.dislikesCount,
      replyCount: post.repliesCount,
      pinned: (post.flags & 1) !== 0,
      locked: (post.flags & 2) !== 0,
      featured: (post.flags & 4) !== 0,
      solved: (post.flags & 8) !== 0,
      author: {
        id: post.author.id.toString(),
        username: post.author.username,
        reputation: post.author.reputation,
        postCount: post.author.postsCount,
        createdAt: post.author.createdAt,
      },
      category: {
        id: post.category.id.toString(),
        name: post.category.name,
        slug: post.category.slug,
        description: post.category.description,
        color: post.category.color,
        position: post.category.position,
        postCount: post.category.postsCount,
        topicCount: post.category.topicsCount,
        archived: !!(post.category.flags & 16),
        moderated: post.category.moderated,
        private: post.category.private,
        parentId: post.category.parentId?.toString(),
        createdAt: post.category.createdAt,
        updatedAt: post.category.updatedAt,
      },
      tags:
        post.tags?.map((pt: any) => ({
          id: pt.tag.id.toString(),
          name: pt.tag.name,
          slug: pt.tag.slug,
          color: pt.tag.color,
          usageCount: pt.tag.usageCount,
        })) || [],
      replies: post.replies?.map((reply: any) => this.transformReplyToResponse(reply)) || undefined,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }
  private transformReplyToResponse(reply: any): any {
    return {
      id: reply.id,
      content: reply.content,
      isSolution: reply.isSolution || false,
      upvotes: reply.likesCount,
      downvotes: reply.dislikesCount,
      netVotes: reply.likesCount - reply.dislikesCount,
      parentId: reply.parentId,
      author: {
        id: reply.author.id.toString(),
        username: reply.author.username,
        reputation: reply.author.reputation,
        postCount: reply.author.postsCount,
        createdAt: reply.author.createdAt,
      },
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
    const order = (sortOrder === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
    switch (sortBy) {
      case 'popular':
        return [{ likesCount: order }, { repliesCount: order }];
      case 'hot':
        return [{ likesCount: order }]; // Simplified for now
      case 'views':
        return { viewsCount: order };
      case 'votes':
        return { likesCount: order };
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
      const targetTable = type === 'POST' ? 'forumPost' : 'forumReply'; // Check for existing vote using correct unique constraint
      let existingVote;
      if (type === 'POST') {
        existingVote = await prisma.forumVote.findUnique({
          where: {
            userId_postId: {
              userId: BigInt(userId),
              postId: BigInt(targetId),
            },
          },
        });
      } else {
        existingVote = await prisma.forumVote.findUnique({
          where: {
            userId_replyId: {
              userId: BigInt(userId),
              replyId: BigInt(targetId),
            },
          },
        });
      }

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
        // New vote - create with correct fields
        const voteData: any = {
          userId: BigInt(userId),
          value,
        };

        if (type === 'POST') {
          voteData.postId = BigInt(targetId);
        } else {
          voteData.replyId = BigInt(targetId);
        }

        await prisma.forumVote.create({
          data: voteData,
        });
      }

      // Update target vote counts
      const updateData: any = {
        likesCount: value > 0 ? { increment: netChange > 0 ? 1 : -1 } : undefined,
        dislikesCount: value < 0 ? { increment: netChange < 0 ? 1 : -1 } : undefined,
      };

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      const updatedTarget = await (prisma as any)[targetTable].update({
        where: { id: BigInt(targetId) },
        data: updateData,
        select: { likesCount: true, dislikesCount: true },
      });

      // Calculate net votes
      const netVotes = updatedTarget.likesCount - updatedTarget.dislikesCount;

      return {
        success: true,
        netVotes,
      };
    });
  }
  private async getUserVote(
    userId: string,
    targetId: string,
    targetType: 'POST' | 'REPLY',
  ): Promise<number | undefined> {
    let vote;

    if (targetType === 'POST') {
      vote = await this.prisma.forumVote.findUnique({
        where: {
          userId_postId: {
            userId: BigInt(userId),
            postId: BigInt(targetId),
          },
        },
      });
    } else {
      vote = await this.prisma.forumVote.findUnique({
        where: {
          userId_replyId: {
            userId: BigInt(userId),
            replyId: BigInt(targetId),
          },
        },
      });
    }

    return vote?.value;
  }
  private async incrementPostViews(postId: string): Promise<void> {
    await this.prisma.forumPost.update({
      where: { id: BigInt(postId) },
      data: {
        viewsCount: { increment: 1 },
      },
    });
  }
}
