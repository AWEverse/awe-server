import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../libs/supabase/db/prisma.service';
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
    } // Verify parent category exists if parentId is provided
    if (createCategoryDto.parentId) {
      const parentCategory = await this.prisma.forumCategory.findUnique({
        where: { id: BigInt(createCategoryDto.parentId) },
        include: { parent: true },
      });

      if (!parentCategory) {
        throw new NotFoundException('Parent category not found');
      }

      // Check nesting level (max 3 levels)
      let nestingLevel = 1;
      let currentParent = parentCategory.parent;
      while (currentParent) {
        nestingLevel++;
        if (nestingLevel >= 3) {
          throw new BadRequestException('Maximum nesting level (3) exceeded');
        }
        const nextParent = await this.prisma.forumCategory.findUnique({
          where: { id: currentParent.id },
          include: { parent: true },
        });
        currentParent = nextParent?.parent || null;
      }
    }

    // Transform DTO to Prisma data format
    if (!createCategoryDto.forumId) {
      throw new BadRequestException('forumId is required');
    }
    const createData = {
      ...createCategoryDto,
      parentId: createCategoryDto.parentId ? BigInt(createCategoryDto.parentId) : null,
      forumId: BigInt(createCategoryDto.forumId), // Ensure forumId is provided and cast to BigInt
    };

    const category = await this.prisma.forumCategory.create({
      data: createData,
      include: this.getCategoryIncludes(),
    });

    return this.transformCategoryToResponse(category);
  }
  async findAllCategories(includeArchived = false): Promise<ForumCategoryResponseDto[]> {
    const categories = await this.prisma.forumCategory.findMany({
      where: {
        parentId: null, // Only root categories
        ...(includeArchived ? {} : { flags: { not: { equals: 8 } } }), // archived bit is 8
      },
      include: {
        ...this.getCategoryIncludes(),
        children: {
          where: includeArchived ? {} : { flags: { not: { equals: 8 } } },
          include: {
            ...this.getCategoryIncludes(),
            children: {
              where: includeArchived ? {} : { flags: { not: { equals: 8 } } },
              include: this.getCategoryIncludes(),
              orderBy: { position: 'asc' },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { position: 'asc' },
    });

    return categories.map(category => this.transformCategoryToResponse(category));
  }
  async findCategoryById(id: string): Promise<ForumCategoryResponseDto> {
    const category = await this.prisma.forumCategory.findUnique({
      where: { id: BigInt(id) },
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
      where: { id: BigInt(id) },
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
      where: { id: BigInt(id) },
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
      where: { id: BigInt(id) },
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
      where: { id: BigInt(id) },
    });
  }
  async reorderCategories(categoryOrders: { id: string; position: number }[]): Promise<void> {
    await this.prisma.$transaction(async prisma => {
      for (const { id, position } of categoryOrders) {
        await prisma.forumCategory.update({
          where: { id: BigInt(id) },
          data: { position },
        });
      }
    });
  }
  async moveCategory(categoryId: string, newParentId?: string): Promise<ForumCategoryResponseDto> {
    // Verify category exists
    const category = await this.prisma.forumCategory.findUnique({
      where: { id: BigInt(categoryId) },
      include: { children: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Verify new parent exists and check nesting level
    if (newParentId) {
      const newParent = await this.prisma.forumCategory.findUnique({
        where: { id: BigInt(newParentId) },
        include: { parent: true },
      });

      if (!newParent) {
        throw new NotFoundException('New parent category not found');
      }

      // Check if moving to a descendant (would create cycle)
      if (await this.isDescendant(categoryId, newParentId)) {
        throw new BadRequestException('Cannot move category to its own descendant');
      } // Check nesting level
      let nestingLevel = 1;
      let currentParent = newParent.parent;
      while (currentParent) {
        nestingLevel++;
        if (nestingLevel >= 3) {
          throw new BadRequestException('Maximum nesting level (3) exceeded');
        }
        const nextParent = await this.prisma.forumCategory.findUnique({
          where: { id: currentParent.id },
          include: { parent: true },
        });
        currentParent = nextParent?.parent || null;
      }

      // Check if category has children and would exceed nesting
      if (category.children.length > 0 && nestingLevel >= 2) {
        throw new BadRequestException('Moving this category would exceed maximum nesting level');
      }
    }

    const updatedCategory = await this.prisma.forumCategory.update({
      where: { id: BigInt(categoryId) },
      data: {
        parentId: newParentId ? BigInt(newParentId) : null,
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
      where: { id: BigInt(categoryId) },
      include: {
        posts: {
          include: {
            _count: {
              select: { replies: true },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const replyCount = category.posts.reduce((total, post) => total + post._count.replies, 0);

    return {
      postCount: category.postsCount,
      replyCount,
      lastActivity: category.posts[0]?.updatedAt,
    };
  }
  async getCategoryBreadcrumbs(
    categoryId: string,
  ): Promise<{ id: string; name: string; slug: string }[]> {
    const breadcrumbs: { id: string; name: string; slug: string }[] = [];

    let currentCategory = await this.prisma.forumCategory.findUnique({
      where: { id: BigInt(categoryId) },
      include: { parent: true },
    });

    while (currentCategory) {
      breadcrumbs.unshift({
        id: currentCategory.id.toString(),
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
      id: category.id.toString(),
      name: category.name,
      slug: category.slug,
      description: category.description,
      color: category.color,
      icon: category.icon,
      position: category.position,
      postCount: category.postsCount,
      topicCount: category.topicsCount,
      lastActivity: category.updatedAt, // Use updatedAt as lastActivity
      archived: (category.flags & 8) !== 0, // archived bit is 8
      moderated: (category.flags & 2) !== 0, // moderated bit is 2
      private: (category.flags & 4) !== 0, // private bit is 4
      parentId: category.parentId?.toString() || undefined,
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
      where: { parentId: BigInt(categoryId) },
      select: { id: true },
    });

    for (const child of children) {
      descendants.push({ id: child.id.toString() });
      const childDescendants = await this.getAllDescendants(child.id.toString());
      descendants.push(...childDescendants);
    }

    return descendants;
  }
}
