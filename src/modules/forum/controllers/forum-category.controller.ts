import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseBoolPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ForumCategoryService } from '../services/forum-category.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import {
  CreateForumCategoryDto,
  UpdateForumCategoryDto,
  ForumCategoryResponseDto,
} from '../dto/forum.dto';

@ApiTags('Forum Categories')
@Controller('forum/categories')
export class ForumCategoryController {
  constructor(private readonly forumCategoryService: ForumCategoryService) {}

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new forum category' })
  @ApiResponse({
    status: 201,
    description: 'Category created successfully',
    type: ForumCategoryResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  @ApiResponse({ status: 409, description: 'Category slug already exists' })
  async createCategory(
    @Body() createCategoryDto: CreateForumCategoryDto,
  ): Promise<ForumCategoryResponseDto> {
    return this.forumCategoryService.createCategory(createCategoryDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all forum categories with hierarchy' })
  @ApiQuery({
    name: 'includeArchived',
    required: false,
    type: Boolean,
    description: 'Include archived categories',
  })
  @ApiResponse({
    status: 200,
    description: 'Categories retrieved successfully',
    type: [ForumCategoryResponseDto],
  })
  async findAllCategories(
    @Query('includeArchived', new ParseBoolPipe({ optional: true }))
    includeArchived?: boolean,
  ): Promise<ForumCategoryResponseDto[]> {
    return this.forumCategoryService.findAllCategories(includeArchived || false);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a forum category by ID' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({
    status: 200,
    description: 'Category retrieved successfully',
    type: ForumCategoryResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findCategoryById(@Param('id') id: string): Promise<ForumCategoryResponseDto> {
    return this.forumCategoryService.findCategoryById(id);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get a forum category by slug' })
  @ApiParam({ name: 'slug', description: 'Category slug' })
  @ApiResponse({
    status: 200,
    description: 'Category retrieved successfully',
    type: ForumCategoryResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findCategoryBySlug(@Param('slug') slug: string): Promise<ForumCategoryResponseDto> {
    return this.forumCategoryService.findCategoryBySlug(slug);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a forum category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({
    status: 200,
    description: 'Category updated successfully',
    type: ForumCategoryResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Category slug already exists' })
  async updateCategory(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateForumCategoryDto,
  ): Promise<ForumCategoryResponseDto> {
    return this.forumCategoryService.updateCategory(id, updateCategoryDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a forum category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, description: 'Category deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - category has subcategories or posts',
  })
  async deleteCategory(@Param('id') id: string): Promise<{ message: string }> {
    await this.forumCategoryService.deleteCategory(id);
    return { message: 'Category deleted successfully' };
  }

  @Post('reorder')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reorder forum categories' })
  @ApiResponse({ status: 200, description: 'Categories reordered successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  async reorderCategories(
    @Body() categoryOrders: { id: string; position: number }[],
  ): Promise<{ message: string }> {
    await this.forumCategoryService.reorderCategories(categoryOrders);
    return { message: 'Categories reordered successfully' };
  }

  @Post(':id/move')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Move a category to a different parent' })
  @ApiParam({ name: 'id', description: 'Category ID to move' })
  @ApiResponse({
    status: 200,
    description: 'Category moved successfully',
    type: ForumCategoryResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid move operation',
  })
  async moveCategory(
    @Param('id') id: string,
    @Body() moveData: { newParentId?: string },
  ): Promise<ForumCategoryResponseDto> {
    return this.forumCategoryService.moveCategory(id, moveData.newParentId);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get category statistics' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({
    status: 200,
    description: 'Category statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        postCount: { type: 'number' },
        replyCount: { type: 'number' },
        lastActivity: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async getCategoryStats(@Param('id') id: string): Promise<{
    postCount: number;
    replyCount: number;
    lastActivity?: Date;
  }> {
    return this.forumCategoryService.getCategoryStats(id);
  }

  @Get(':id/breadcrumbs')
  @ApiOperation({ summary: 'Get category breadcrumbs' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({
    status: 200,
    description: 'Category breadcrumbs retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async getCategoryBreadcrumbs(
    @Param('id') id: string,
  ): Promise<{ id: string; name: string; slug: string }[]> {
    return this.forumCategoryService.getCategoryBreadcrumbs(id);
  }
}
