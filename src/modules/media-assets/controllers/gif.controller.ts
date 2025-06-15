import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  ParseUUIDPipe,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { GifService } from '../services/gif.service';
import {
  CreateGifCategoryDto,
  CreateGifDto,
  UpdateGifDto,
  GifQueryDto,
  MediaUploadDto,
  BulkUploadDto,
} from '../dto';
import {
  ApiResponse as ApiResponseType,
  PaginatedResponse,
  GifCategoryInfo,
  GifInfo,
  GifUploadResult,
  BulkUploadResult,
  BulkDeleteResult,
  MediaStatistics,
} from '../types';

@ApiTags('GIFs')
@Controller('media/gifs')
@UseGuards(JwtAuthGuard)
export class GifController {
  constructor(private readonly gifService: GifService) {}
  // Category Management
  @Post('categories')
  @ApiOperation({ summary: 'Create GIF category' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Category created successfully',
  })
  async createCategory(
    @Body() createCategoryDto: CreateGifCategoryDto,
  ): Promise<ApiResponseType<GifCategoryInfo>> {
    const category = await this.gifService.createGifCategory(createCategoryDto);
    return {
      success: true,
      data: category,
      message: 'GIF category created successfully',
    };
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all GIF categories' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Categories retrieved successfully',
  })
  async getCategories(): Promise<ApiResponseType<GifCategoryInfo[]>> {
    const categories = await this.gifService.getGifCategories();
    return {
      success: true,
      data: categories,
      message: 'Categories retrieved successfully',
    };
  }

  @Get('categories/:id')
  @ApiOperation({ summary: 'Get GIF category by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category retrieved successfully',
  })
  async getCategoryById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiResponseType<GifCategoryInfo>> {
    const category = await this.gifService.getGifCategory(id);
    return {
      success: true,
      data: category,
      message: 'Category retrieved successfully',
    };
  }

  @Put('categories/:id')
  @ApiOperation({ summary: 'Update GIF category' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category updated successfully',
  })
  async updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateData: Partial<CreateGifCategoryDto>,
  ): Promise<ApiResponseType<GifCategoryInfo>> {
    const category = await this.gifService.updateGifCategory(id, updateData);
    return {
      success: true,
      data: category,
      message: 'Category updated successfully',
    };
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete GIF category' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category deleted successfully',
  })
  async deleteCategory(@Param('id', ParseUUIDPipe) id: string): Promise<ApiResponseType<void>> {
    await this.gifService.deleteGifCategory(id);
    return {
      success: true,
      data: undefined,
      message: 'Category deleted successfully',
    };
  }
  // GIF Management
  @Post()
  @ApiOperation({ summary: 'Create GIF' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'GIF created successfully',
  })
  async createGif(
    @Body() createGifDto: CreateGifDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseType<GifUploadResult>> {
    const result = await this.gifService.createGif(createGifDto, file);
    return {
      success: true,
      data: result,
      message: 'GIF created successfully',
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get GIFs with pagination and search' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'GIFs retrieved successfully',
  })
  async getGifs(@Query() query: GifQueryDto): Promise<PaginatedResponse<GifInfo>> {
    return this.gifService.getGifs(query);
  }

  @Get('trending')
  @ApiOperation({ summary: 'Get trending GIFs' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Trending GIFs retrieved successfully',
  })
  async getTrendingGifs(@Query('limit') limit: number = 20): Promise<ApiResponseType<GifInfo[]>> {
    const gifs = await this.gifService.getTrendingGifs(limit);
    return {
      success: true,
      data: gifs,
      message: 'Trending GIFs retrieved successfully',
    };
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured GIFs' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Featured GIFs retrieved successfully',
  })
  async getFeaturedGifs(@Query('limit') limit: number = 20): Promise<ApiResponseType<GifInfo[]>> {
    const gifs = await this.gifService.getFeaturedGifs(limit);
    return {
      success: true,
      data: gifs,
      message: 'Featured GIFs retrieved successfully',
    };
  }

  @Get('search')
  @ApiOperation({ summary: 'Search GIFs' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Search results retrieved successfully',
  })
  async searchGifs(
    @Query('query') query: string,
    @Query('limit') limit: number = 20,
  ): Promise<ApiResponseType<GifInfo[]>> {
    const gifs = await this.gifService.searchGifs(query, limit);
    return {
      success: true,
      data: gifs,
      message: 'Search results retrieved successfully',
    };
  }

  @Get('category/:categoryId')
  @ApiOperation({ summary: 'Get GIFs by category' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category GIFs retrieved successfully',
  })
  async getGifsByCategory(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Query('limit') limit: number = 20,
  ): Promise<ApiResponseType<GifInfo[]>> {
    const gifs = await this.gifService.getGifsByCategory(categoryId, limit);
    return {
      success: true,
      data: gifs,
      message: 'Category GIFs retrieved successfully',
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get GIF by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'GIF retrieved successfully',
  })
  async getGifById(@Param('id', ParseUUIDPipe) id: string): Promise<ApiResponseType<GifInfo>> {
    const gif = await this.gifService.getGif(id);
    return {
      success: true,
      data: gif,
      message: 'GIF retrieved successfully',
    };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update GIF' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'GIF updated successfully',
  })
  async updateGif(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateGifDto: UpdateGifDto,
  ): Promise<ApiResponseType<GifInfo>> {
    const gif = await this.gifService.updateGif(id, updateGifDto);
    return {
      success: true,
      data: gif,
      message: 'GIF updated successfully',
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete GIF' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'GIF deleted successfully',
  })
  async deleteGif(@Param('id', ParseUUIDPipe) id: string): Promise<ApiResponseType<void>> {
    await this.gifService.deleteGif(id);
    return {
      success: true,
      data: undefined,
      message: 'GIF deleted successfully',
    };
  } // Bulk Operations
  @Post('bulk-upload')
  @ApiOperation({ summary: 'Bulk upload GIFs' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('files'))
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Bulk upload completed',
  })
  async bulkUploadGifs(
    @Body('categoryId') categoryId: string,
    @UploadedFile() files: Express.Multer.File[],
  ): Promise<ApiResponseType<BulkUploadResult<GifUploadResult>>> {
    const result = await this.gifService.bulkUploadGifs(categoryId, files);
    return {
      success: true,
      data: result,
      message: 'Bulk upload completed',
    };
  }

  @Delete('bulk')
  @ApiOperation({ summary: 'Bulk delete GIFs' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bulk delete completed',
  })
  async bulkDeleteGifs(
    @Body('gifIds') gifIds: string[],
  ): Promise<ApiResponseType<BulkDeleteResult>> {
    const result = await this.gifService.bulkDeleteGifs(gifIds);
    return {
      success: true,
      data: result,
      message: `${result.summary.successful} GIFs deleted successfully`,
    };
  }

  // Usage Tracking
  @Post(':id/usage')
  @ApiOperation({ summary: 'Increment GIF usage count' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Usage count incremented',
  })
  async incrementUsage(@Param('id', ParseUUIDPipe) id: string): Promise<ApiResponseType<void>> {
    await this.gifService.incrementUsageCount(id);
    return {
      success: true,
      data: undefined,
      message: 'Usage count incremented',
    };
  }
}
