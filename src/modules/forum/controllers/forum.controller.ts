import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ForumService } from '../services/forum.service';
import { CreateForumDto, CreateForumCategoryDto } from '../dto';

@ApiTags('Forum')
@Controller('forum')
export class ForumController {
  constructor(private readonly forumService: ForumService) {}

  @Post()
  @ApiOperation({ summary: 'Создать новый форум' })
  @ApiResponse({ status: 201, description: 'Форум успешно создан' })
  @ApiResponse({ status: 409, description: 'Форум с таким slug уже существует' })
  async createForum(@Body() createForumDto: CreateForumDto, @Request() req: any) {
    // В реальном приложении userId должен браться из JWT токена
    const userId = BigInt(req.user?.id || 1);
    return this.forumService.createForum(createForumDto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Получить список всех форумов' })
  @ApiResponse({ status: 200, description: 'Список форумов' })
  async getForums() {
    return this.forumService.getForums();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Получить форум по slug' })
  @ApiResponse({ status: 200, description: 'Форум найден' })
  @ApiResponse({ status: 404, description: 'Форум не найден' })
  async getForumBySlug(@Param('slug') slug: string) {
    return this.forumService.getForumBySlug(slug);
  }

  @Post(':forumId/categories')
  @ApiOperation({ summary: 'Создать категорию в форуме' })
  @ApiResponse({ status: 201, description: 'Категория успешно создана' })
  @ApiResponse({ status: 404, description: 'Форум не найден' })
  @ApiResponse({ status: 409, description: 'Категория с таким slug уже существует' })
  async createCategory(
    @Param('forumId', ParseIntPipe) forumId: number,
    @Body() createCategoryDto: CreateForumCategoryDto,
  ) {
    return this.forumService.createCategory(BigInt(forumId), createCategoryDto);
  }

  @Get(':forumId/categories')
  @ApiOperation({ summary: 'Получить категории форума' })
  @ApiResponse({ status: 200, description: 'Список категорий' })
  async getCategoriesByForumId(@Param('forumId', ParseIntPipe) forumId: number) {
    return this.forumService.getCategoriesByForumId(BigInt(forumId));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить форум' })
  @ApiResponse({ status: 200, description: 'Форум удален' })
  @ApiResponse({ status: 404, description: 'Форум не найден' })
  @ApiResponse({ status: 409, description: 'Только владелец может удалить форум' })
  async deleteForum(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const userId = BigInt(req.user?.id || 1);
    return this.forumService.deleteForum(BigInt(id), userId);
  }
}
