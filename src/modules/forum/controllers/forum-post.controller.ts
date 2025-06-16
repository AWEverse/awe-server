import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ForumPostService } from '../services/forum-post.service';
import { CreateForumPostDto, CreateForumReplyDto } from '../dto';

@ApiTags('Forum Posts')
@Controller('forum')
export class ForumPostController {
  constructor(private readonly forumPostService: ForumPostService) {}

  @Post('categories/:categoryId/posts')
  @ApiOperation({ summary: 'Создать пост в категории' })
  @ApiResponse({ status: 201, description: 'Пост успешно создан' })
  @ApiResponse({ status: 404, description: 'Категория не найдена' })
  @ApiResponse({ status: 409, description: 'Пост с таким slug уже существует' })
  async createPost(
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Body() createPostDto: CreateForumPostDto,
    @Request() req: any,
  ) {
    const userId = BigInt(req.user?.id || 1);
    return this.forumPostService.createPost(BigInt(categoryId), userId, createPostDto);
  }

  @Get('categories/:categoryId/posts')
  @ApiOperation({ summary: 'Получить посты категории' })
  @ApiResponse({ status: 200, description: 'Список постов' })
  @ApiQuery({ name: 'page', required: false, description: 'Номер страницы', example: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Количество постов на странице',
    example: 10,
  })
  async getPostsByCategory(
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.forumPostService.getPostsByCategory(
      BigInt(categoryId),
      Number(page),
      Number(limit),
    );
  }

  @Get('posts/:slug')
  @ApiOperation({ summary: 'Получить пост по slug' })
  @ApiResponse({ status: 200, description: 'Пост найден' })
  @ApiResponse({ status: 404, description: 'Пост не найден' })
  async getPostBySlug(@Param('slug') slug: string) {
    return this.forumPostService.getPostBySlug(slug);
  }

  @Post('posts/:postId/replies')
  @ApiOperation({ summary: 'Создать ответ на пост' })
  @ApiResponse({ status: 201, description: 'Ответ успешно создан' })
  @ApiResponse({ status: 404, description: 'Пост не найден' })
  async createReply(
    @Param('postId', ParseIntPipe) postId: number,
    @Body() createReplyDto: CreateForumReplyDto,
    @Request() req: any,
  ) {
    const userId = BigInt(req.user?.id || 1);
    return this.forumPostService.createReply(BigInt(postId), userId, createReplyDto);
  }

  @Get('posts/:postId/replies')
  @ApiOperation({ summary: 'Получить ответы на пост' })
  @ApiResponse({ status: 200, description: 'Список ответов' })
  @ApiQuery({ name: 'page', required: false, description: 'Номер страницы', example: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Количество ответов на странице',
    example: 20,
  })
  async getRepliesByPost(
    @Param('postId', ParseIntPipe) postId: number,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.forumPostService.getRepliesByPost(BigInt(postId), Number(page), Number(limit));
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: 'Удалить пост' })
  @ApiResponse({ status: 200, description: 'Пост удален' })
  @ApiResponse({ status: 404, description: 'Пост не найден' })
  @ApiResponse({ status: 409, description: 'Только автор может удалить пост' })
  async deletePost(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const userId = BigInt(req.user?.id || 1);
    return this.forumPostService.deletePost(BigInt(id), userId);
  }

  @Delete('replies/:id')
  @ApiOperation({ summary: 'Удалить ответ' })
  @ApiResponse({ status: 200, description: 'Ответ удален' })
  @ApiResponse({ status: 404, description: 'Ответ не найден' })
  @ApiResponse({ status: 409, description: 'Только автор может удалить ответ' })
  async deleteReply(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const userId = BigInt(req.user?.id || 1);
    return this.forumPostService.deleteReply(BigInt(id), userId);
  }
}
