import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../libs/db/prisma.service';
import { CreateForumDto, CreateForumCategoryDto } from '../dto';

@Injectable()
export class ForumService {
  constructor(private readonly prisma: PrismaService) {}

  async createForum(data: CreateForumDto, ownerId: bigint) {
    // Проверяем, что slug уникальный
    const existingForum = await this.prisma.forum.findUnique({
      where: { slug: data.slug },
    });

    if (existingForum) {
      throw new ConflictException('Форум с таким slug уже существует');
    }

    return this.prisma.forum.create({
      data: {
        ...data,
        ownerId,
      },
      include: {
        categories: true,
      },
    });
  }

  async getForums() {
    return this.prisma.forum.findMany({
      include: {
        categories: {
          include: {
            _count: {
              select: { posts: true },
            },
          },
        },
        _count: {
          select: { categories: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getForumBySlug(slug: string) {
    const forum = await this.prisma.forum.findUnique({
      where: { slug },
      include: {
        categories: {
          include: {
            _count: {
              select: { posts: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { posts: true },
        },
      },
    });

    if (!forum) {
      throw new NotFoundException('Форум не найден');
    }

    return forum;
  }

  async createCategory(forumId: bigint, data: CreateForumCategoryDto) {
    // Проверяем, что форум существует
    const forum = await this.prisma.forum.findUnique({
      where: { id: forumId },
    });

    if (!forum) {
      throw new NotFoundException('Форум не найден');
    }

    // Проверяем, что slug уникальный
    const existingCategory = await this.prisma.forumCategory.findUnique({
      where: { slug: data.slug },
    });

    if (existingCategory) {
      throw new ConflictException('Категория с таким slug уже существует');
    }

    return this.prisma.forumCategory.create({
      data: {
        ...data,
        forumId,
      },
      include: {
        _count: {
          select: { posts: true },
        },
      },
    });
  }

  async getCategoriesByForumId(forumId: bigint) {
    return this.prisma.forumCategory.findMany({
      where: { forumId },
      include: {
        _count: {
          select: { posts: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getCategoryBySlug(slug: string) {
    const category = await this.prisma.forumCategory.findUnique({
      where: { slug },
      include: {
        forum: true,
        _count: {
          select: { posts: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Категория не найдена');
    }

    return category;
  }

  async deleteForum(id: bigint, ownerId: bigint) {
    const forum = await this.prisma.forum.findUnique({
      where: { id },
    });

    if (!forum) {
      throw new NotFoundException('Форум не найден');
    }

    if (forum.ownerId !== ownerId) {
      throw new ConflictException('Только владелец может удалить форум');
    }

    return this.prisma.forum.delete({
      where: { id },
    });
  }

  async deleteCategory(id: bigint, ownerId: bigint) {
    const category = await this.prisma.forumCategory.findUnique({
      where: { id },
      include: { forum: true },
    });

    if (!category) {
      throw new NotFoundException('Категория не найдена');
    }

    if (category.forum.ownerId !== ownerId) {
      throw new ConflictException('Только владелец форума может удалить категорию');
    }

    return this.prisma.forumCategory.delete({
      where: { id },
    });
  }
}
