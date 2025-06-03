import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateForumCategoryDto,
  UpdateForumCategoryDto,
  ForumCategoryResponseDto,
} from '../dto/forum.dto';

@Injectable()
export class ForumCategoryService {
  constructor(private prisma: PrismaService) {}

  async createCategory(
    createCategoryDto: CreateForumCategoryDto,
  ): Promise<ForumCategoryResponseDto> {
    // Check if slug is unique
    const existingCategory = await this.prisma.forumCategory.findUnique({
      where: { slug: createCategoryDto.slug },
    });

    if (existingCategory) {
      throw new ConflictException('Category slug already exists');
    }

    // Verify parent category exists if parentId is provided
    if (createCategoryDto.parentId) {
      const parentCategory = await this.prisma.forumCategory.findUnique({
        where: { id: createCategoryDto.parentId },
        include: { parent: true },
      });

      if (!parentCategory) {
        throw new NotFoundException('Parent category not found');
      }

      // Check nesting level (max 3 levels)
      let nestingLevel = 1;
      let current = parentCategory;
      while (current.parent) {
        nestingLevel++;
        current = current.parent;
        if (nestingLevel >= 3) {
          throw new BadRequestException('Maximum nesting level (3) exceeded');
        }
      }
    }

    const category = await this.prisma.forumCategory.create({
      data: createCategoryDto,
      include: this.getCategoryIncludes(),
    });

    return this.transformCategoryToResponse(category);
  }

  async findAllCategories(includeArchived = false): Promise<ForumCategoryResponseDto[]> {
    const categories = await this.prisma.forumCategory.findMany({
      where: includeArchived ? {} : { archived: false },
      include: {
        ...this.getCategoryIncludes(),
        children: {
          where: includeArchived ? {} : { archived: false },
          include: {
            ...this.getCategoryIncludes(),
            children: {
              where: includeArchived ? {} : { archived: false },
              include: this.getCategoryIncludes(),
              orderBy: { position: 'asc' },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
      where: {
        parentId: null, // Only root categories
        ...(includeArchived ? {} : { archived: false }),
      },
      orderBy: { position: 'asc' },
    });

    return categories.map(category => this.transformCategoryToResponse(category));
  }

  async findCategoryById(id: string): Promise<ForumCategoryResponseDto> {
    const category = await this.prisma.forumCategory.findUnique({
      where: { id },
      include: {
        ...this.getCategoryIncludes(),
        children: {
          include: {
            ...this.getCategoryIncludes(),
            children: {
              include: this.getCategoryIncludes(),
              orderBy: { position: 'asc' },
            },
          },
          orderBy: { position: 'asc' },
        },
        parent: {
          include: {
            parent: true, // Include grandparent for breadcrumbs
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return this.transformCategoryToResponse(category);
  }

  async findCategoryBySlug(slug: string): Promise<ForumCategoryResponseDto> {
    const category = await this.prisma.forumCategory.findUnique({
      where: { slug },
      include: {
        ...this.getCategoryIncludes(),
        children: {
          include: {
            ...this.getCategoryIncludes(),
            children: {
              include: this.getCategoryIncludes(),
              orderBy: { position: 'asc' },
            },
          },
          orderBy: { position: 'asc' },
        },
        parent: {
          include: {
            parent: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return this.transformCategoryToResponse(category);
  }

  async updateCategory(
    id: string,
    updateCategoryDto: UpdateForumCategoryDto,
  ): Promise<ForumCategoryResponseDto> {
    // Verify category exists
    const existingCategory = await this.prisma.forumCategory.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      throw new NotFoundException('Category not found');
    }

    // Check slug uniqueness if being updated
    if (updateCategoryDto.slug && updateCategoryDto.slug !== existingCategory.slug) {
      const slugExists = await this.prisma.forumCategory.findUnique({
        where: { slug: updateCategoryDto.slug },
      });

      if (slugExists) {
        throw new ConflictException('Category slug already exists');
      }
    }

    const updatedCategory = await this.prisma.forumCategory.update({
      where: { id },
      data: {
        ...updateCategoryDto,
        updatedAt: new Date(),
      },
      include: this.getCategoryIncludes(),
    });

    return this.transformCategoryToResponse(updatedCategory);
  }

  async deleteCategory(id: string): Promise<void> {
    // Verify category exists
    const category = await this.prisma.forumCategory.findUnique({
      where: { id },
      include: {
        children: true,
        posts: true,
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Check if category has children or posts
    if (category.children.length > 0) {
      throw new BadRequestException('Cannot delete category with subcategories');
    }

    if (category.posts.length > 0) {
      throw new BadRequestException('Cannot delete category with posts');
    }

    await this.prisma.forumCategory.delete({
      where: { id },
    });
  }

  async reorderCategories(categoryOrders: { id: string; position: number }[]): Promise<void> {
    await this.prisma.$transaction(async prisma => {
      for (const { id, position } of categoryOrders) {
        await prisma.forumCategory.update({
          where: { id },
          data: { position },
        });
      }
    });
  }

  async moveCategory(categoryId: string, newParentId?: string): Promise<ForumCategoryResponseDto> {
    // Verify category exists
    const category = await this.prisma.forumCategory.findUnique({
      where: { id: categoryId },
      include: { children: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Verify new parent exists and check nesting level
    if (newParentId) {
      const newParent = await this.prisma.forumCategory.findUnique({
        where: { id: newParentId },
        include: { parent: true },
      });

      if (!newParent) {
        throw new NotFoundException('New parent category not found');
      }

      // Check if moving to a descendant (would create cycle)
      if (await this.isDescendant(categoryId, newParentId)) {
        throw new BadRequestException('Cannot move category to its own descendant');
      }

      // Check nesting level
      let nestingLevel = 1;
      let current = newParent;
      while (current.parent) {
        nestingLevel++;
        current = current.parent;
        if (nestingLevel >= 3) {
          throw new BadRequestException('Maximum nesting level (3) exceeded');
        }
      }

      // Check if category has children and would exceed nesting
      if (category.children.length > 0 && nestingLevel >= 2) {
        throw new BadRequestException('Moving this category would exceed maximum nesting level');
      }
    }

    const updatedCategory = await this.prisma.forumCategory.update({
      where: { id: categoryId },
      data: {
        parentId: newParentId,
        updatedAt: new Date(),
      },
      include: this.getCategoryIncludes(),
    });

    return this.transformCategoryToResponse(updatedCategory);
  }

  async getCategoryStats(categoryId: string): Promise<{
    postCount: number;
    replyCount: number;
    lastActivity?: Date;
  }> {
    const category = await this.prisma.forumCategory.findUnique({
      where: { id: categoryId },
      include: {
        posts: {
          include: {
            _count: {
              select: { replies: true },
            },
          },
          orderBy: { lastActivity: 'desc' },
          take: 1,
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const replyCount = category.posts.reduce((total, post) => total + post._count.replies, 0);

    return {
      postCount: category.postCount,
      replyCount,
      lastActivity: category.lastActivity,
    };
  }

  async getCategoryBreadcrumbs(
    categoryId: string,
  ): Promise<{ id: string; name: string; slug: string }[]> {
    const breadcrumbs: { id: string; name: string; slug: string }[] = [];

    let currentCategory = await this.prisma.forumCategory.findUnique({
      where: { id: categoryId },
      include: { parent: true },
    });

    while (currentCategory) {
      breadcrumbs.unshift({
        id: currentCategory.id,
        name: currentCategory.name,
        slug: currentCategory.slug,
      });

      if (currentCategory.parent) {
        currentCategory = await this.prisma.forumCategory.findUnique({
          where: { id: currentCategory.parent.id },
          include: { parent: true },
        });
      } else {
        currentCategory = null;
      }
    }

    return breadcrumbs;
  }

  // Private helper methods
  private getCategoryIncludes() {
    return {
      _count: {
        select: {
          posts: true,
          children: true,
        },
      },
    };
  }

  private transformCategoryToResponse(category: any): ForumCategoryResponseDto {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      color: category.color,
      icon: category.icon,
      position: category.position,
      postCount: category.postCount,
      topicCount: category.topicCount,
      lastActivity: category.lastActivity,
      archived: category.archived,
      moderated: category.moderated,
      private: category.private,
      parentId: category.parentId,
      children:
        category.children?.map((child: any) => this.transformCategoryToResponse(child)) || [],
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  private async isDescendant(categoryId: string, potentialAncestorId: string): Promise<boolean> {
    const descendants = await this.getAllDescendants(categoryId);
    return descendants.some(descendant => descendant.id === potentialAncestorId);
  }

  private async getAllDescendants(categoryId: string): Promise<{ id: string }[]> {
    const descendants: { id: string }[] = [];

    const children = await this.prisma.forumCategory.findMany({
      where: { parentId: categoryId },
      select: { id: true },
    });

    for (const child of children) {
      descendants.push(child);
      const childDescendants = await this.getAllDescendants(child.id);
      descendants.push(...childDescendants);
    }

    return descendants;
  }
}
