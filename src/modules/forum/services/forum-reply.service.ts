import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../libs/db/prisma.service';
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
      where: { id: BigInt(postId) },
      include: { category: true },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.flags & 2) {
      // locked is bit 2
      throw new BadRequestException('Cannot reply to locked post');
    } // Verify parent reply exists if parentId is provided
    if (createReplyDto.parentId) {
      const parentReply = await this.prisma.forumReply.findUnique({
        where: { id: BigInt(createReplyDto.parentId) },
      });

      if (!parentReply || parentReply.postId.toString() !== postId) {
        throw new BadRequestException('Invalid parent reply');
      }
    }

    // Create reply in transaction
    const reply = await this.prisma.$transaction(async prisma => {
      let flags = 0;

      // If this is marked as solution, unmark other solutions
      if (createReplyDto.isSolution) {
        // Unmark other solutions by clearing bit 4 (solution flag)
        const existingSolutions = await prisma.forumReply.findMany({
          where: {
            postId: BigInt(postId),
            flags: { gte: 16 }, // Check if bit 4 is set (16 = 2^4)
          },
          select: { id: true, flags: true },
        });

        // Update each solution individually to clear bit 4
        for (const solution of existingSolutions) {
          if (solution.flags & 16) {
            // Check if bit 4 is set
            await prisma.forumReply.update({
              where: { id: solution.id },
              data: { flags: solution.flags & ~16 }, // Clear bit 4 (solution flag)
            });
          }
        } // Mark post as solved using bit 8
        const currentPost = await prisma.forumPost.findUnique({
          where: { id: BigInt(postId) },
          select: { flags: true },
        });

        if (currentPost) {
          const updatedFlags = currentPost.flags | 256; // Set bit 8 for solved (256 = 2^8)
          await prisma.forumPost.update({
            where: { id: BigInt(postId) },
            data: { flags: updatedFlags },
          });
        }

        flags |= 16; // Set solution flag (bit 4 = 16)
      }

      // Create the reply
      const newReply = await prisma.forumReply.create({
        data: {
          content: createReplyDto.content,
          postId: BigInt(postId),
          authorId: BigInt(userId),
          parentId: createReplyDto.parentId ? BigInt(createReplyDto.parentId) : null,
          flags,
        },
        include: this.getReplyIncludes(),
      });

      // Update post reply count and last activity
      await prisma.forumPost.update({
        where: { id: BigInt(postId) },
        data: {
          repliesCount: { increment: 1 },
        },
      });

      // Update user reputation for helpful reply
      if (createReplyDto.isSolution) {
        await prisma.user.update({
          where: { id: BigInt(userId) },
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
      where: { id: BigInt(postId) },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // Get top-level replies with nested children
    const replies = await this.prisma.forumReply.findMany({
      where: {
        postId: BigInt(postId),
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
        { flags: 'desc' }, // Solutions first (bit 4)
        { likesCount: 'desc' }, // Then by likes
        { createdAt: 'asc' }, // Then by creation time
      ],
    });

    // Transform replies and add user votes if authenticated
    const transformedReplies = await Promise.all(
      replies.map(async reply => {
        const transformed = this.transformReplyToResponse(reply);

        if (userId) {
          transformed.userVote = await this.getUserVote(userId, reply.id.toString());

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
      where: { id: BigInt(id) },
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
      where: { id: BigInt(id) },
      include: {
        post: {
          select: {
            id: true,
            flags: true,
          },
        },
      },
    });

    if (!existingReply) {
      throw new NotFoundException('Reply not found');
    }

    if (existingReply.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own replies');
    }

    if (existingReply.post.flags & 4) {
      // Check if bit 2 is set for locked (4 = 2^2)
      throw new BadRequestException('Cannot edit reply in locked post');
    } // Update reply in transaction
    const updatedReply = await this.prisma.$transaction(async prisma => {
      // Handle solution status change
      if (updateReplyDto.isSolution !== undefined) {
        if (updateReplyDto.isSolution) {
          // Unmark other solutions in the same post (clear bit 4)
          const existingSolutions = await prisma.forumReply.findMany({
            where: {
              postId: existingReply.postId,
              id: { not: BigInt(id) },
              flags: { gte: 16 }, // Check if bit 4 is set (16 = 2^4)
            },
            select: { id: true, flags: true },
          });

          // Update each solution individually to clear bit 4
          for (const solution of existingSolutions) {
            if (solution.flags & 16) {
              await prisma.forumReply.update({
                where: { id: solution.id },
                data: { flags: solution.flags & ~16 }, // Clear bit 4 (solution flag)
              });
            }
          }

          // Mark post as solved (set bit 8 = 256)
          const currentPost = await prisma.forumPost.findUnique({
            where: { id: existingReply.postId },
            select: { flags: true },
          });

          if (currentPost) {
            await prisma.forumPost.update({
              where: { id: existingReply.postId },
              data: { flags: currentPost.flags | 256 }, // Set bit 8 for solved
            });
          }
        } else {
          // Check if this was the only solution
          const otherSolutions = await prisma.forumReply.count({
            where: {
              postId: existingReply.postId,
              id: { not: BigInt(id) },
              flags: { gte: 16 }, // Check if bit 4 is set (16 = 2^4)
            },
          });

          if (otherSolutions === 0) {
            // Mark post as unsolved (clear bit 8)
            const currentPost = await prisma.forumPost.findUnique({
              where: { id: existingReply.postId },
              select: { flags: true },
            });

            if (currentPost) {
              await prisma.forumPost.update({
                where: { id: existingReply.postId },
                data: { flags: currentPost.flags & ~256 }, // Clear bit 8 for solved
              });
            }
          }
        }
      }

      // Calculate new flags
      let newFlags = existingReply.flags;

      // Handle solution flag change
      if (updateReplyDto.isSolution !== undefined) {
        if (updateReplyDto.isSolution) {
          newFlags |= 16; // Set solution flag (bit 4 = 16)
        } else {
          newFlags &= ~16; // Clear solution flag
        }
      }

      // Update the reply
      const reply = await prisma.forumReply.update({
        where: { id: BigInt(id) },
        data: {
          content: updateReplyDto.content || existingReply.content,
          flags: newFlags,
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
      where: { id: BigInt(id) },
      include: {
        children: {
          select: { id: true },
        },
      },
    });

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    if (reply.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own replies');
    }

    if (reply.children.length > 0) {
      throw new BadRequestException('Cannot delete reply with child replies');
    }

    // Delete reply and update counters
    await this.prisma.$transaction(async prisma => {
      // Delete the reply
      await prisma.forumReply.delete({
        where: { id: BigInt(id) },
      });

      // Update post reply count
      await prisma.forumPost.update({
        where: { id: reply.postId },
        data: {
          repliesCount: { decrement: 1 },
        },
      });

      // If this was a solution, mark post as unsolved if no other solutions
      if (reply.flags & 16) {
        // Check if bit 4 is set for solution (16 = 2^4)
        const otherSolutions = await prisma.forumReply.count({
          where: {
            postId: reply.postId,
            flags: { gte: 16 }, // Check if bit 4 is set
          },
        });

        if (otherSolutions === 0) {
          const currentPost = await prisma.forumPost.findUnique({
            where: { id: reply.postId },
            select: { flags: true },
          });

          if (currentPost) {
            await prisma.forumPost.update({
              where: { id: reply.postId },
              data: { flags: currentPost.flags & ~256 }, // Clear bit 8 for solved
            });
          }
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
      where: { id: BigInt(replyId) },
      include: {
        post: {
          select: {
            id: true,
            authorId: true,
          },
        },
      },
    });

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    if (reply.post.authorId.toString() !== userId) {
      throw new ForbiddenException('Only the post author can mark solutions');
    }

    // Update in transaction
    const updatedReply = await this.prisma.$transaction(async prisma => {
      // Unmark other solutions (clear bit 4 for all solutions in the post)
      const existingSolutions = await prisma.forumReply.findMany({
        where: {
          postId: reply.postId,
          flags: { gte: 16 }, // Check if bit 4 is set (16 = 2^4)
        },
        select: { id: true, flags: true },
      });

      // Update each solution individually to clear bit 4
      for (const solution of existingSolutions) {
        if (solution.flags & 16) {
          await prisma.forumReply.update({
            where: { id: solution.id },
            data: { flags: solution.flags & ~16 }, // Clear bit 4 (solution flag)
          });
        }
      }

      // Mark this reply as solution (set bit 4)
      const updated = await prisma.forumReply.update({
        where: { id: BigInt(replyId) },
        data: { flags: reply.flags | 16 }, // Set bit 4 for solution
        include: this.getReplyIncludes(),
      });

      // Mark post as solved (set bit 8)
      const currentPost = await prisma.forumPost.findUnique({
        where: { id: reply.postId },
        select: { flags: true },
      });

      if (currentPost) {
        await prisma.forumPost.update({
          where: { id: reply.postId },
          data: { flags: currentPost.flags | 256 }, // Set bit 8 for solved
        });
      }

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
      id: reply.id.toString(),
      content: reply.content,
      isSolution: !!(reply.flags & 16), // Check if bit 4 is set (16 = 2^4)
      upvotes: reply.likesCount || 0,
      downvotes: reply.dislikesCount || 0,
      netVotes: (reply.likesCount || 0) - (reply.dislikesCount || 0),
      parentId: reply.parentId?.toString(),
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
          userId_replyId: {
            userId: BigInt(userId),
            replyId: BigInt(targetId),
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
            userId: BigInt(userId),
            replyId: BigInt(targetId),
            value,
          },
        });
      } // Update reply vote counts
      const updateData: any = {};

      if (value > 0) {
        updateData.likesCount = { increment: netChange > 0 ? 1 : -1 };
      } else {
        updateData.dislikesCount = { increment: netChange < 0 ? 1 : -1 };
      }

      const updatedReply = await prisma.forumReply.update({
        where: { id: BigInt(targetId) },
        data: updateData,
        select: { likesCount: true, dislikesCount: true },
      });

      const netVotes = updatedReply.likesCount - updatedReply.dislikesCount;

      return {
        success: true,
        netVotes,
      };
    });
  }
  private async getUserVote(userId: string, replyId: string): Promise<number | undefined> {
    const vote = await this.prisma.forumVote.findUnique({
      where: {
        userId_replyId: {
          userId: BigInt(userId),
          replyId: BigInt(replyId),
        },
      },
    });

    return vote?.value;
  }
}
