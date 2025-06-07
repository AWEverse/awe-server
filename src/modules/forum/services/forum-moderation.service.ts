import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../libs/supabase/db/prisma.service';
import { CreateForumReportDto, ForumModerationActionDto } from '../dto/forum.dto';

@Injectable()
export class ForumModerationService {
  constructor(private prisma: PrismaService) {}

  async reportContent(
    userId: string,
    targetId: string,
    targetType: 'POST' | 'REPLY',
    reportDto: CreateForumReportDto,
  ): Promise<{ success: boolean; reportId: string }> {
    // Check if user already reported this content
    const existingReport = await this.prisma.report.findFirst({
      where: {
        reporterId: BigInt(userId),
        ...(targetType === 'POST' ? { postId: BigInt(targetId) } : { replyId: BigInt(targetId) }),
      },
    });

    if (existingReport) {
      throw new BadRequestException('You have already reported this content');
    }

    // Verify target exists
    const targetExists = await this.verifyTargetExists(targetId, targetType);
    if (!targetExists) {
      throw new NotFoundException(`${targetType.toLowerCase()} not found`);
    }

    const report = await this.prisma.report.create({
      data: {
        reporterId: BigInt(userId),
        ...(targetType === 'POST' ? { postId: BigInt(targetId) } : { replyId: BigInt(targetId) }),
        reason: reportDto.reason as any,
        description: reportDto.details,
        status: 'PENDING',
      },
    });

    return {
      success: true,
      reportId: report.id.toString(),
    };
  }

  async getReports(
    status?: 'PENDING' | 'RESOLVED' | 'DISMISSED',
    page = 1,
    limit = 20,
  ): Promise<{
    reports: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [reports, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        include: {
          reporter: {
            select: {
              id: true,
              username: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              username: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]);

    // Enrich reports with target content
    const enrichedReports = await Promise.all(
      reports.map(async report => {
        let targetContent = undefined;
        if (report.postId) {
          targetContent = await this.getTargetContent(report.postId.toString(), 'POST');
        } else if (report.replyId) {
          targetContent = await this.getTargetContent(report.replyId.toString(), 'REPLY');
        }
        return {
          ...report,
          id: report.id.toString(),
          reporterId: report.reporterId.toString(),
          postId: report.postId?.toString(),
          replyId: report.replyId?.toString(),
          reviewedBy: report.reviewedBy?.toString(),
          targetContent,
        };
      }),
    );

    return {
      reports: enrichedReports,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async moderateContent(
    reportId: string,
    moderatorId: string,
    actionDto: ForumModerationActionDto,
  ): Promise<{ success: boolean; message: string }> {
    // Get the report
    const report = await this.prisma.report.findUnique({
      where: { id: BigInt(reportId) },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    if (report.status !== 'PENDING') {
      throw new BadRequestException('Report has already been processed');
    }

    // Determine target ID and type from report
    const targetId = report.postId ? report.postId.toString() : report.replyId?.toString();
    const targetType = report.postId ? 'POST' : 'REPLY';

    if (!targetId) {
      throw new BadRequestException('Invalid report: no target found');
    }

    // Verify target still exists
    const targetExists = await this.verifyTargetExists(targetId, targetType as 'POST' | 'REPLY');
    if (!targetExists) {
      throw new NotFoundException(`${targetType.toLowerCase()} not found`);
    }

    // Perform moderation action in transaction
    const result = await this.prisma.$transaction(async prisma => {
      // Update report status
      await prisma.report.update({
        where: { id: BigInt(reportId) },
        data: {
          status: 'RESOLVED',
          reviewedBy: BigInt(moderatorId),
          reviewedAt: new Date(),
        },
      }); // Log moderation action
      try {
        await prisma.forumModerationLog.create({
          data: {
            moderatorId: BigInt(moderatorId),
            ...(targetType === 'POST'
              ? { postId: BigInt(targetId) }
              : { replyId: BigInt(targetId) }),
            action: actionDto.action as any,
            reason: actionDto.reason,
            metadata: actionDto.notes ? { notes: actionDto.notes } : undefined,
          },
        });
      } catch (error) {
        // If ForumModerationLog table doesn't exist, continue without logging
        console.warn('ForumModerationLog table not found, skipping log entry');
      }

      // Execute the action
      await this.executeAction(
        prisma,
        targetId,
        targetType as 'POST' | 'REPLY',
        actionDto.action,
        moderatorId,
      );

      return { success: true };
    });

    return {
      success: result.success,
      message: `Action ${actionDto.action} executed successfully`,
    };
  }

  async dismissReport(
    reportId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    const report = await this.prisma.report.findUnique({
      where: { id: BigInt(reportId) },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    if (report.status !== 'PENDING') {
      throw new BadRequestException('Report has already been processed');
    }

    await this.prisma.report.update({
      where: { id: BigInt(reportId) },
      data: {
        status: 'DISMISSED',
        reviewedBy: BigInt(moderatorId),
        reviewedAt: new Date(),
      },
    });

    return { success: true };
  }
  async getModerationLogs(
    targetId?: string,
    moderatorId?: string,
    page = 1,
    limit = 20,
  ): Promise<{
    logs: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (targetId) {
      // Support both post and reply IDs
      where.OR = [{ postId: BigInt(targetId) }, { replyId: BigInt(targetId) }];
    }
    if (moderatorId) where.moderatorId = BigInt(moderatorId);

    try {
      const [logs, total] = await this.prisma.$transaction([
        this.prisma.forumModerationLog.findMany({
          where,
          include: {
            moderator: {
              select: {
                id: true,
                username: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: limit,
        }),
        this.prisma.forumModerationLog.count({ where }),
      ]);

      // Enrich logs with target content
      const enrichedLogs = await Promise.all(
        logs.map(async log => {
          let targetContent: any = undefined;
          let targetId: string | undefined = undefined;
          let targetType: 'POST' | 'REPLY' | undefined = undefined;

          if (log.postId) {
            targetId = log.postId.toString();
            targetType = 'POST';
            targetContent = await this.getTargetContent(targetId, 'POST');
          } else if (log.replyId) {
            targetId = log.replyId.toString();
            targetType = 'REPLY';
            targetContent = await this.getTargetContent(targetId, 'REPLY');
          }

          return {
            ...log,
            id: log.id.toString(),
            moderatorId: log.moderatorId.toString(),
            targetId,
            targetType,
            targetContent,
            notes:
              typeof log.metadata === 'object' &&
              log.metadata !== undefined &&
              'notes' in log.metadata
                ? (log.metadata as any).notes
                : undefined,
          };
        }),
      );

      return {
        logs: enrichedLogs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      // If ForumModerationLog table doesn't exist, return empty results
      console.warn('ForumModerationLog table not found, returning empty results');
      return {
        logs: [],
        total: 0,
        page,
        totalPages: 0,
      };
    }
  }

  async lockPost(
    postId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    await this.prisma.$transaction(async prisma => {
      // Update post to set locked flag using bit manipulation
      const post = await prisma.forumPost.findUnique({
        where: { id: BigInt(postId) },
        select: { flags: true },
      });

      if (!post) {
        throw new NotFoundException('Post not found');
      }

      const updatedFlags = BigInt(post.flags) | (1n << 1n); // Set bit 1 for locked

      await prisma.forumPost.update({
        where: { id: BigInt(postId) },
        data: { flags: Number(updatedFlags) },
      }); // Log the action if ForumModerationLog exists
      try {
        await prisma.forumModerationLog.create({
          data: {
            moderatorId: BigInt(moderatorId),
            postId: BigInt(postId),
            action: 'LOCK',
            reason,
          },
        });
      } catch (error) {
        console.warn('ForumModerationLog table not found, skipping log entry');
      }
    });

    return { success: true };
  }

  async unlockPost(
    postId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    await this.prisma.$transaction(async prisma => {
      // Update post to clear locked flag using bit manipulation
      const post = await prisma.forumPost.findUnique({
        where: { id: BigInt(postId) },
        select: { flags: true },
      });

      if (!post) {
        throw new NotFoundException('Post not found');
      }

      const updatedFlags = BigInt(post.flags) & ~(1n << 1n); // Clear bit 1 for locked

      await prisma.forumPost.update({
        where: { id: BigInt(postId) },
        data: { flags: Number(updatedFlags) },
      }); // Log the action if forumModerationLog exists
      try {
        await prisma.forumModerationLog.create({
          data: {
            moderatorId: BigInt(moderatorId),
            postId: BigInt(postId),
            action: 'UNLOCK',
            reason,
            metadata: reason ? { notes: `Unlocked: ${reason}` } : undefined,
          },
        });
      } catch (error) {
        console.warn('ForumModerationLog table not found, skipping log entry');
      }
    });

    return { success: true };
  }

  async pinPost(
    postId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    await this.prisma.$transaction(async prisma => {
      // Update post to set pinned flag using bit manipulation
      const post = await prisma.forumPost.findUnique({
        where: { id: BigInt(postId) },
        select: { flags: true },
      });

      if (!post) {
        throw new NotFoundException('Post not found');
      }

      const updatedFlags = BigInt(post.flags) | (1n << 3n); // Set bit 3 for pinned

      await prisma.forumPost.update({
        where: { id: BigInt(postId) },
        data: { flags: Number(updatedFlags) },
      }); // Log the action if forumModerationLog exists
      try {
        await prisma.forumModerationLog.create({
          data: {
            moderatorId: BigInt(moderatorId),
            postId: BigInt(postId),
            action: 'PIN',
            reason,
            metadata: reason ? { notes: reason } : undefined,
          },
        });
      } catch (error) {
        console.warn('ForumModerationLog table not found, skipping log entry');
      }
    });

    return { success: true };
  }

  async unpinPost(
    postId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    await this.prisma.$transaction(async prisma => {
      // Update post to clear pinned flag using bit manipulation
      const post = await prisma.forumPost.findUnique({
        where: { id: BigInt(postId) },
        select: { flags: true },
      });

      if (!post) {
        throw new NotFoundException('Post not found');
      }

      const updatedFlags = BigInt(post.flags) & ~(1n << 3n); // Clear bit 3 for pinned

      await prisma.forumPost.update({
        where: { id: BigInt(postId) },
        data: { flags: Number(updatedFlags) },
      }); // Log the action if forumModerationLog exists
      try {
        await prisma.forumModerationLog.create({
          data: {
            moderatorId: BigInt(moderatorId),
            postId: BigInt(postId),
            action: 'UNPIN',
            reason,
            metadata: reason ? { notes: `Unpinned: ${reason}` } : undefined,
          },
        });
      } catch (error) {
        console.warn('ForumModerationLog table not found, skipping log entry');
      }
    });

    return { success: true };
  }

  async featurePost(
    postId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    await this.prisma.$transaction(async prisma => {
      // Update post to set featured flag using bit manipulation
      const post = await prisma.forumPost.findUnique({
        where: { id: BigInt(postId) },
        select: { flags: true },
      });

      if (!post) {
        throw new NotFoundException('Post not found');
      }

      const updatedFlags = BigInt(post.flags) | (1n << 5n); // Set bit 5 for featured

      await prisma.forumPost.update({
        where: { id: BigInt(postId) },
        data: { flags: Number(updatedFlags) },
      }); // Log the action if forumModerationLog exists
      try {
        await prisma.forumModerationLog.create({
          data: {
            moderatorId: BigInt(moderatorId),
            postId: BigInt(postId),
            action: 'FEATURE',
            reason,
            metadata: reason ? { notes: reason } : undefined,
          },
        });
      } catch (error) {
        console.warn('ForumModerationLog table not found, skipping log entry');
      }
    });

    return { success: true };
  }

  async unfeaturePost(
    postId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    await this.prisma.$transaction(async prisma => {
      // Update post to clear featured flag using bit manipulation
      const post = await prisma.forumPost.findUnique({
        where: { id: BigInt(postId) },
        select: { flags: true },
      });

      if (!post) {
        throw new NotFoundException('Post not found');
      }

      const updatedFlags = BigInt(post.flags) & ~(1n << 5n); // Clear bit 5 for featured

      await prisma.forumPost.update({
        where: { id: BigInt(postId) },
        data: { flags: Number(updatedFlags) },
      }); // Log the action if forumModerationLog exists
      try {
        await prisma.forumModerationLog.create({
          data: {
            moderatorId: BigInt(moderatorId),
            postId: BigInt(postId),
            action: 'UNFEATURE',
            reason,
            metadata: reason ? { notes: `Unfeatured: ${reason}` } : undefined,
          },
        });
      } catch (error) {
        console.warn('ForumModerationLog table not found, skipping log entry');
      }
    });

    return { success: true };
  }

  async movePost(
    postId: string,
    newCategoryId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    // Verify new category exists
    const category = await this.prisma.forumCategory.findUnique({
      where: { id: BigInt(newCategoryId) },
    });

    if (!category) {
      throw new NotFoundException('Target category not found');
    }

    const post = await this.prisma.forumPost.findUnique({
      where: { id: BigInt(postId) },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    await this.prisma.$transaction(async prisma => {
      // Update post category
      await prisma.forumPost.update({
        where: { id: BigInt(postId) },
        data: { categoryId: BigInt(newCategoryId) },
      });

      // Update old category counters
      await prisma.forumCategory.update({
        where: { id: post.categoryId },
        data: {
          postsCount: { decrement: 1 },
          topicsCount: { decrement: 1 },
        },
      });

      // Update new category counters
      await prisma.forumCategory.update({
        where: { id: BigInt(newCategoryId) },
        data: {
          postsCount: { increment: 1 },
          topicsCount: { increment: 1 },
          updatedAt: new Date(),
        },
      }); // Log action if forumModerationLog exists
      try {
        await prisma.forumModerationLog.create({
          data: {
            moderatorId: BigInt(moderatorId),
            postId: BigInt(postId),
            action: 'MOVE',
            reason,
            metadata: { notes: `Moved to category: ${category.name}` },
          },
        });
      } catch (error) {
        console.warn('ForumModerationLog table not found, skipping log entry');
      }
    });

    return { success: true };
  }

  async deleteContent(
    targetId: string,
    targetType: 'POST' | 'REPLY',
    moderatorId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    await this.prisma.$transaction(async prisma => {
      if (targetType === 'POST') {
        const post = await prisma.forumPost.findUnique({
          where: { id: BigInt(targetId) },
        });

        if (post) {
          await prisma.forumPost.delete({
            where: { id: BigInt(targetId) },
          });

          // Update category counters
          await prisma.forumCategory.update({
            where: { id: post.categoryId },
            data: {
              postsCount: { decrement: 1 },
              topicsCount: { decrement: 1 },
            },
          });
        }
      } else {
        const reply = await prisma.forumReply.findUnique({
          where: { id: BigInt(targetId) },
        });

        if (reply) {
          await prisma.forumReply.delete({
            where: { id: BigInt(targetId) },
          });

          // Update post reply count
          await prisma.forumPost.update({
            where: { id: reply.postId },
            data: {
              repliesCount: { decrement: 1 },
            },
          });
        }
      } // Log action if forumModerationLog exists
      try {
        await prisma.forumModerationLog.create({
          data: {
            moderatorId: BigInt(moderatorId),
            ...(targetType === 'POST'
              ? { postId: BigInt(targetId) }
              : { replyId: BigInt(targetId) }),
            action: 'DELETE',
            reason,
            metadata: reason ? { notes: reason } : undefined,
          },
        });
      } catch (error) {
        console.warn('ForumModerationLog table not found, skipping log entry');
      }
    });

    return { success: true };
  }

  // Private helper methods
  private async verifyTargetExists(
    targetId: string,
    targetType: 'POST' | 'REPLY',
  ): Promise<boolean> {
    if (targetType === 'POST') {
      const post = await this.prisma.forumPost.findUnique({
        where: { id: BigInt(targetId) },
      });
      return !!post;
    } else {
      const reply = await this.prisma.forumReply.findUnique({
        where: { id: BigInt(targetId) },
      });
      return !!reply;
    }
  }

  private async getTargetContent(targetId: string, targetType: 'POST' | 'REPLY'): Promise<any> {
    if (targetType === 'POST') {
      return this.prisma.forumPost.findUnique({
        where: { id: BigInt(targetId) },
        select: {
          id: true,
          title: true,
          content: true,
          authorId: true,
          createdAt: true,
          author: {
            select: {
              username: true,
            },
          },
        },
      });
    } else {
      return this.prisma.forumReply.findUnique({
        where: { id: BigInt(targetId) },
        select: {
          id: true,
          content: true,
          authorId: true,
          postId: true,
          createdAt: true,
          author: {
            select: {
              username: true,
            },
          },
          post: {
            select: {
              title: true,
            },
          },
        },
      });
    }
  }

  private async executeAction(
    prisma: any,
    targetId: string,
    targetType: 'POST' | 'REPLY',
    action: string,
    moderatorId: string,
  ): Promise<void> {
    switch (action) {
      case 'DELETE':
        if (targetType === 'POST') {
          await prisma.forumPost.delete({
            where: { id: BigInt(targetId) },
          });
        } else {
          await prisma.reply.delete({
            where: { id: BigInt(targetId) },
          });
        }
        break;

      case 'LOCK':
        if (targetType === 'POST') {
          const post = await prisma.forumPost.findUnique({
            where: { id: BigInt(targetId) },
            select: { flags: true },
          });
          const updatedFlags = post.flags | (1n << 1n); // Set bit 1 for locked
          await prisma.forumPost.update({
            where: { id: BigInt(targetId) },
            data: { flags: updatedFlags },
          });
        }
        break;

      case 'PIN':
        if (targetType === 'POST') {
          const post = await prisma.forumPost.findUnique({
            where: { id: BigInt(targetId) },
            select: { flags: true },
          });
          const updatedFlags = post.flags | (1n << 3n); // Set bit 3 for pinned
          await prisma.forumPost.update({
            where: { id: BigInt(targetId) },
            data: { flags: updatedFlags },
          });
        }
        break;

      case 'FEATURE':
        if (targetType === 'POST') {
          const post = await prisma.forumPost.findUnique({
            where: { id: BigInt(targetId) },
            select: { flags: true },
          });
          const updatedFlags = post.flags | (1n << 5n); // Set bit 5 for featured
          await prisma.forumPost.update({
            where: { id: BigInt(targetId) },
            data: { flags: updatedFlags },
          });
        }
        break;

      case 'WARN':
        // Warning is just logged, no content changes
        break;

      default:
        throw new BadRequestException(`Unsupported action: ${action}`);
    }
  }
}
