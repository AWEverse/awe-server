import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateForumReplyDto, UpdateForumReplyDto, ForumReplyResponseDto } from '../dto/forum.dto';

@Injectable()
export class ForumReplyService {
  constructor(private prisma: PrismaService) {}

  async createReply(
    postId: string,
    userId: string,
    createReplyDto: CreateForumReplyDto,
  ): Promise<ForumReplyResponseDto> {
    // Verify post exists and is not locked
    const post = await this.prisma.forumPost.findUnique({
      where: { id: postId },
      include: { category: true },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.locked) {
      throw new BadRequestException('Cannot reply to locked post');
    }

    // Verify parent reply exists if parentId is provided
    if (createReplyDto.parentId) {
      const parentReply = await this.prisma.forumReply.findUnique({
        where: { id: createReplyDto.parentId },
      });

      if (!parentReply || parentReply.postId !== postId) {
        throw new BadRequestException('Invalid parent reply');
      }
    }

    // Create reply in transaction
    const reply = await this.prisma.$transaction(async prisma => {
      // If this is marked as solution, unmark other solutions
      if (createReplyDto.isSolution) {
        await prisma.forumReply.updateMany({
          where: { postId, isSolution: true },
          data: { isSolution: false },
        });

        // Mark post as solved
        await prisma.forumPost.update({
          where: { id: postId },
          data: { solved: true },
        });
      }

      // Create the reply
      const newReply = await prisma.forumReply.create({
        data: {
          content: createReplyDto.content,
          postId,
          authorId: userId,
          parentId: createReplyDto.parentId,
          isSolution: createReplyDto.isSolution || false,
        },
        include: this.getReplyIncludes(),
      });

      // Update post reply count and last activity
      await prisma.forumPost.update({
        where: { id: postId },
        data: {
          replyCount: { increment: 1 },
          lastActivity: new Date(),
        },
      });

      // Update category last activity
      await prisma.forumCategory.update({
        where: { id: post.categoryId },
        data: {
          lastActivity: new Date(),
        },
      });

      // Update user reputation for helpful reply
      if (createReplyDto.isSolution) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            reputation: { increment: 10 }, // +10 for solution
          },
        });
      }

      return newReply;
    });

    return this.transformReplyToResponse(reply);
  }

  async findRepliesByPost(postId: string, userId?: string): Promise<ForumReplyResponseDto[]> {
    // Verify post exists
    const post = await this.prisma.forumPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // Get top-level replies with nested children
    const replies = await this.prisma.forumReply.findMany({
      where: {
        postId,
        parentId: null, // Only top-level replies
      },
      include: {
        ...this.getReplyIncludes(),
        children: {
          include: this.getReplyIncludes(),
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [
        { isSolution: 'desc' }, // Solutions first
        { netVotes: 'desc' }, // Then by votes
        { createdAt: 'asc' }, // Then by creation time
      ],
    });

    // Transform replies and add user votes if authenticated
    const transformedReplies = await Promise.all(
      replies.map(async reply => {
        const transformed = this.transformReplyToResponse(reply);

        if (userId) {
          transformed.userVote = await this.getUserVote(userId, reply.id);

          // Add user votes for children
          if (transformed.children) {
            for (const child of transformed.children) {
              child.userVote = await this.getUserVote(userId, child.id);
            }
          }
        }

        return transformed;
      }),
    );

    return transformedReplies;
  }

  async findReplyById(id: string, userId?: string): Promise<ForumReplyResponseDto> {
    const reply = await this.prisma.forumReply.findUnique({
      where: { id },
      include: {
        ...this.getReplyIncludes(),
        children: {
          include: this.getReplyIncludes(),
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    const transformed = this.transformReplyToResponse(reply);

    // Add user vote if authenticated
    if (userId) {
      transformed.userVote = await this.getUserVote(userId, id);

      // Add user votes for children
      if (transformed.children) {
        for (const child of transformed.children) {
          child.userVote = await this.getUserVote(userId, child.id);
        }
      }
    }

    return transformed;
  }

  async updateReply(
    id: string,
    userId: string,
    updateReplyDto: UpdateForumReplyDto,
  ): Promise<ForumReplyResponseDto> {
    // Verify reply exists and user has permission
    const existingReply = await this.prisma.forumReply.findUnique({
      where: { id },
      include: {
        author: true,
        post: true,
      },
    });

    if (!existingReply) {
      throw new NotFoundException('Reply not found');
    }

    if (existingReply.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own replies');
    }

    if (existingReply.post.locked) {
      throw new BadRequestException('Cannot edit reply in locked post');
    }

    // Update reply in transaction
    const updatedReply = await this.prisma.$transaction(async prisma => {
      // Handle solution status change
      if (updateReplyDto.isSolution !== undefined) {
        if (updateReplyDto.isSolution) {
          // Unmark other solutions in the same post
          await prisma.forumReply.updateMany({
            where: {
              postId: existingReply.postId,
              id: { not: id },
              isSolution: true,
            },
            data: { isSolution: false },
          });

          // Mark post as solved
          await prisma.forumPost.update({
            where: { id: existingReply.postId },
            data: { solved: true },
          });
        } else {
          // Check if this was the only solution
          const otherSolutions = await prisma.forumReply.count({
            where: {
              postId: existingReply.postId,
              id: { not: id },
              isSolution: true,
            },
          });

          if (otherSolutions === 0) {
            // Mark post as unsolved
            await prisma.forumPost.update({
              where: { id: existingReply.postId },
              data: { solved: false },
            });
          }
        }
      }

      // Update the reply
      const reply = await prisma.forumReply.update({
        where: { id },
        data: {
          ...updateReplyDto,
          updatedAt: new Date(),
        },
        include: this.getReplyIncludes(),
      });

      return reply;
    });

    return this.transformReplyToResponse(updatedReply);
  }

  async deleteReply(id: string, userId: string): Promise<void> {
    // Verify reply exists and user has permission
    const reply = await this.prisma.forumReply.findUnique({
      where: { id },
      include: {
        author: true,
        post: true,
        children: true,
      },
    });

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    if (reply.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own replies');
    }

    if (reply.children.length > 0) {
      throw new BadRequestException('Cannot delete reply with child replies');
    }

    // Delete reply and update counters
    await this.prisma.$transaction(async prisma => {
      // Delete the reply
      await prisma.forumReply.delete({
        where: { id },
      });

      // Update post reply count
      await prisma.forumPost.update({
        where: { id: reply.postId },
        data: {
          replyCount: { decrement: 1 },
        },
      });

      // If this was a solution, mark post as unsolved if no other solutions
      if (reply.isSolution) {
        const otherSolutions = await prisma.forumReply.count({
          where: {
            postId: reply.postId,
            isSolution: true,
          },
        });

        if (otherSolutions === 0) {
          await prisma.forumPost.update({
            where: { id: reply.postId },
            data: { solved: false },
          });
        }
      }
    });
  }

  async voteReply(
    replyId: string,
    userId: string,
    value: number,
  ): Promise<{ success: boolean; netVotes: number }> {
    return this.handleVote(replyId, userId, value);
  }

  async markAsSolution(replyId: string, userId: string): Promise<ForumReplyResponseDto> {
    // Verify reply exists and user is post author
    const reply = await this.prisma.forumReply.findUnique({
      where: { id: replyId },
      include: {
        post: {
          include: { author: true },
        },
      },
    });

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    if (reply.post.authorId !== userId) {
      throw new ForbiddenException('Only the post author can mark solutions');
    }

    // Update in transaction
    const updatedReply = await this.prisma.$transaction(async prisma => {
      // Unmark other solutions
      await prisma.forumReply.updateMany({
        where: {
          postId: reply.postId,
          isSolution: true,
        },
        data: { isSolution: false },
      });

      // Mark this reply as solution
      const updated = await prisma.forumReply.update({
        where: { id: replyId },
        data: { isSolution: true },
        include: this.getReplyIncludes(),
      });

      // Mark post as solved
      await prisma.forumPost.update({
        where: { id: reply.postId },
        data: { solved: true },
      });

      // Give reputation to solution author
      await prisma.user.update({
        where: { id: reply.authorId },
        data: {
          reputation: { increment: 10 },
        },
      });

      return updated;
    });

    return this.transformReplyToResponse(updatedReply);
  }

  // Private helper methods
  private getReplyIncludes() {
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
    };
  }

  private transformReplyToResponse(reply: any): ForumReplyResponseDto {
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

  private async handleVote(targetId: string, userId: string, value: number) {
    return this.prisma.$transaction(async prisma => {
      // Check for existing vote
      const existingVote = await prisma.forumVote.findUnique({
        where: {
          userId_targetId_targetType: {
            userId,
            targetId,
            targetType: 'REPLY',
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
            targetType: 'REPLY',
            value,
          },
        });
      }

      // Update reply vote counts
      const updateData: any = {
        netVotes: { increment: netChange },
      };

      if (value > 0) {
        updateData.upvotes = { increment: netChange > 0 ? 1 : -1 };
      } else {
        updateData.downvotes = { increment: netChange < 0 ? 1 : -1 };
      }

      const updatedReply = await prisma.forumReply.update({
        where: { id: targetId },
        data: updateData,
        select: { netVotes: true },
      });

      return {
        success: true,
        netVotes: updatedReply.netVotes,
      };
    });
  }

  private async getUserVote(userId: string, replyId: string): Promise<number | undefined> {
    const vote = await this.prisma.forumVote.findUnique({
      where: {
        userId_targetId_targetType: {
          userId,
          targetId: replyId,
          targetType: 'REPLY',
        },
      },
    });

    return vote?.value;
  }
}
