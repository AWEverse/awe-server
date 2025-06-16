import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../libs/db/prisma.service';
import { CreateForumPostDto, CreateForumReplyDto } from '../dto';

@Injectable()
export class ForumPostService {
  constructor(private readonly prisma: PrismaService) {}

  async createPost(categoryId: bigint, authorId: bigint, data: CreateForumPostDto) {
    // Проверяем, что категория существует
    const category = await this.prisma.forumCategory.findUnique({
      where: { id: categoryId },
      include: { forum: true },
    });

    if (!category) {
      throw new NotFoundException('Категория не найдена');
    }

    // Проверяем, что slug уникальный
    const existingPost = await this.prisma.forumPost.findUnique({
      where: { slug: data.slug },
    });

    if (existingPost) {
      throw new ConflictException('Пост с таким slug уже существует');
    }

    // Создаем пост
    const post = await this.prisma.forumPost.create({
      data: {
        title: data.title,
        content: data.content,
        slug: data.slug,
        forumId: category.forumId,
        categoryId,
        authorId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        category: true,
        forum: true,
        _count: {
          select: { replies: true },
        },
      },
    });

    // Добавляем теги, если они есть
    if (data.tags && data.tags.length > 0) {
      await this.addTagsToPost(post.id, data.tags);
    }

    return post;
  }

  async getPostsByCategory(categoryId: bigint, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      this.prisma.forumPost.findMany({
        where: { categoryId },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
          _count: {
            select: { replies: true },
          },
          tags: {
            include: {
              tag: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.forumPost.count({
        where: { categoryId },
      }),
    ]);

    return {
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getPostBySlug(slug: string) {
    const post = await this.prisma.forumPost.findUnique({
      where: { slug },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        category: true,
        forum: true,
        replies: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        tags: {
          include: {
            tag: true,
          },
        },
        _count: {
          select: { replies: true },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Пост не найден');
    }

    return post;
  }

  async createReply(postId: bigint, authorId: bigint, data: CreateForumReplyDto) {
    // Проверяем, что пост существует
    const post = await this.prisma.forumPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('Пост не найден');
    }

    return this.prisma.forumReply.create({
      data: {
        content: data.content,
        postId,
        authorId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });
  }

  async getRepliesByPost(postId: bigint, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [replies, total] = await Promise.all([
      this.prisma.forumReply.findMany({
        where: { postId },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.forumReply.count({
        where: { postId },
      }),
    ]);

    return {
      replies,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async deletePost(id: bigint, authorId: bigint) {
    const post = await this.prisma.forumPost.findUnique({
      where: { id },
    });

    if (!post) {
      throw new NotFoundException('Пост не найден');
    }

    if (post.authorId !== authorId) {
      throw new ConflictException('Только автор может удалить пост');
    }

    return this.prisma.forumPost.delete({
      where: { id },
    });
  }

  async deleteReply(id: bigint, authorId: bigint) {
    const reply = await this.prisma.forumReply.findUnique({
      where: { id },
    });

    if (!reply) {
      throw new NotFoundException('Ответ не найден');
    }

    if (reply.authorId !== authorId) {
      throw new ConflictException('Только автор может удалить ответ');
    }

    return this.prisma.forumReply.delete({
      where: { id },
    });
  }

  private async addTagsToPost(postId: bigint, tagNames: string[]) {
    for (const tagName of tagNames) {
      // Найти или создать тег
      let tag = await this.prisma.forumTag.findUnique({
        where: { name: tagName },
      });

      if (!tag) {
        tag = await this.prisma.forumTag.create({
          data: { name: tagName },
        });
      }

      // Связать тег с постом
      await this.prisma.forumPostTag.create({
        data: {
          postId,
          tagId: tag.id,
        },
      });
    }
  }
}
