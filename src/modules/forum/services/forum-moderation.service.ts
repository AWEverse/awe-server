import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../libs/supabase/db/prisma.service';
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
    const existingReport = await this.prisma.forumReport.findFirst({
      where: {
        reporterId: userId,
        targetId,
        targetType,
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

    const report = await this.prisma.forumReport.create({
      data: {
        reporterId: userId,
        targetId,
        targetType,
        reason: reportDto.reason as any,
        details: reportDto.details,
        status: 'PENDING',
      },
    });

    return {
      success: true,
      reportId: report.id,
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
      this.prisma.forumReport.findMany({
        where,
        include: {
          reporter: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
          moderator: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.forumReport.count({ where }),
    ]);

    // Enrich reports with target content
    const enrichedReports = await Promise.all(
      reports.map(async report => {
        const targetContent = await this.getTargetContent(report.targetId, report.targetType);
        return {
          ...report,
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
    const report = await this.prisma.forumReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    if (report.status !== 'PENDING') {
      throw new BadRequestException('Report has already been processed');
    }

    // Verify target still exists
    const targetExists = await this.verifyTargetExists(report.targetId, report.targetType);
    if (!targetExists) {
      throw new NotFoundException(`${report.targetType.toLowerCase()} not found`);
    }

    // Perform moderation action in transaction
    const result = await this.prisma.$transaction(async prisma => {
      // Update report status
      await prisma.forumReport.update({
        where: { id: reportId },
        data: {
          status: 'RESOLVED',
          moderatorId,
          resolvedAt: new Date(),
        },
      });

      // Log moderation action
      await prisma.forumModerationLog.create({
        data: {
          moderatorId,
          targetId: report.targetId,
          targetType: report.targetType,
          action: actionDto.action as any,
          reason: actionDto.reason,
          notes: actionDto.notes,
        },
      });

      // Execute the action
      await this.executeAction(
        prisma,
        report.targetId,
        report.targetType,
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
    const report = await this.prisma.forumReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    if (report.status !== 'PENDING') {
      throw new BadRequestException('Report has already been processed');
    }

    await this.prisma.forumReport.update({
      where: { id: reportId },
      data: {
        status: 'DISMISSED',
        moderatorId,
        resolvedAt: new Date(),
        moderatorNotes: reason,
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

    if (targetId) where.targetId = targetId;
    if (moderatorId) where.moderatorId = moderatorId;

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.forumModerationLog.findMany({
        where,
        include: {
          moderator: {
            select: {
              id: true,
              username: true,
              avatar: true,
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
        const targetContent = await this.getTargetContent(log.targetId, log.targetType);
        return {
          ...log,
          targetContent,
        };
      }),
    );

    return {
      logs: enrichedLogs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async lockPost(
    postId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    await this.prisma.$transaction(async prisma => {
      await prisma.forumPost.update({
        where: { id: postId },
        data: { locked: true },
      });

      await prisma.forumModerationLog.create({
        data: {
          moderatorId,
          targetId: postId,
          targetType: 'POST',
          action: 'LOCK',
          reason,
        },
      });
    });

    return { success: true };
  }

  async unlockPost(
    postId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    await this.prisma.$transaction(async prisma => {
      await prisma.forumPost.update({
        where: { id: postId },
        data: { locked: false },
      });

      await prisma.forumModerationLog.create({
        data: {
          moderatorId,
          targetId: postId,
          targetType: 'POST',
          action: 'EDIT', // Using EDIT as unlock action
          reason: `Unlocked: ${reason}`,
        },
      });
    });

    return { success: true };
  }

  async pinPost(
    postId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    await this.prisma.$transaction(async prisma => {
      await prisma.forumPost.update({
        where: { id: postId },
        data: { pinned: true },
      });

      await prisma.forumModerationLog.create({
        data: {
          moderatorId,
          targetId: postId,
          targetType: 'POST',
          action: 'PIN',
          reason,
        },
      });
    });

    return { success: true };
  }

  async unpinPost(
    postId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    await this.prisma.$transaction(async prisma => {
      await prisma.forumPost.update({
        where: { id: postId },
        data: { pinned: false },
      });

      await prisma.forumModerationLog.create({
        data: {
          moderatorId,
          targetId: postId,
          targetType: 'POST',
          action: 'EDIT',
          reason: `Unpinned: ${reason}`,
        },
      });
    });

    return { success: true };
  }

  async featurePost(
    postId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    await this.prisma.$transaction(async prisma => {
      await prisma.forumPost.update({
        where: { id: postId },
        data: { featured: true },
      });

      await prisma.forumModerationLog.create({
        data: {
          moderatorId,
          targetId: postId,
          targetType: 'POST',
          action: 'FEATURE',
          reason,
        },
      });
    });

    return { success: true };
  }

  async unfeaturePost(
    postId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    await this.prisma.$transaction(async prisma => {
      await prisma.forumPost.update({
        where: { id: postId },
        data: { featured: false },
      });

      await prisma.forumModerationLog.create({
        data: {
          moderatorId,
          targetId: postId,
          targetType: 'POST',
          action: 'EDIT',
          reason: `Unfeatured: ${reason}`,
        },
      });
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
      where: { id: newCategoryId },
    });

    if (!category) {
      throw new NotFoundException('Target category not found');
    }

    const post = await this.prisma.forumPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    await this.prisma.$transaction(async prisma => {
      // Update post category
      await prisma.forumPost.update({
        where: { id: postId },
        data: { categoryId: newCategoryId },
      });

      // Update old category counters
      await prisma.forumCategory.update({
        where: { id: post.categoryId },
        data: {
          postCount: { decrement: 1 },
          topicCount: { decrement: 1 },
        },
      });

      // Update new category counters
      await prisma.forumCategory.update({
        where: { id: newCategoryId },
        data: {
          postCount: { increment: 1 },
          topicCount: { increment: 1 },
          lastActivity: new Date(),
        },
      });

      // Log action
      await prisma.forumModerationLog.create({
        data: {
          moderatorId,
          targetId: postId,
          targetType: 'POST',
          action: 'MOVE',
          reason,
          notes: `Moved to category: ${category.name}`,
        },
      });
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
          where: { id: targetId },
        });

        if (post) {
          await prisma.forumPost.delete({
            where: { id: targetId },
          });

          // Update category counters
          await prisma.forumCategory.update({
            where: { id: post.categoryId },
            data: {
              postCount: { decrement: 1 },
              topicCount: { decrement: 1 },
            },
          });
        }
      } else {
        const reply = await prisma.forumReply.findUnique({
          where: { id: targetId },
        });

        if (reply) {
          await prisma.forumReply.delete({
            where: { id: targetId },
          });

          // Update post reply count
          await prisma.forumPost.update({
            where: { id: reply.postId },
            data: {
              replyCount: { decrement: 1 },
            },
          });
        }
      }

      // Log action
      await prisma.forumModerationLog.create({
        data: {
          moderatorId,
          targetId,
          targetType,
          action: 'DELETE',
          reason,
        },
      });
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
        where: { id: targetId },
      });
      return !!post;
    } else {
      const reply = await this.prisma.forumReply.findUnique({
        where: { id: targetId },
      });
      return !!reply;
    }
  }

  private async getTargetContent(targetId: string, targetType: 'POST' | 'REPLY'): Promise<any> {
    if (targetType === 'POST') {
      return this.prisma.forumPost.findUnique({
        where: { id: targetId },
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
        where: { id: targetId },
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
            where: { id: targetId },
          });
        } else {
          await prisma.forumReply.delete({
            where: { id: targetId },
          });
        }
        break;

      case 'LOCK':
        if (targetType === 'POST') {
          await prisma.forumPost.update({
            where: { id: targetId },
            data: { locked: true },
          });
        }
        break;

      case 'PIN':
        if (targetType === 'POST') {
          await prisma.forumPost.update({
            where: { id: targetId },
            data: { pinned: true },
          });
        }
        break;

      case 'FEATURE':
        if (targetType === 'POST') {
          await prisma.forumPost.update({
            where: { id: targetId },
            data: { featured: true },
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
