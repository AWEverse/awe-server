import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  HttpStatus,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { VideoService } from '../services/video.service';
import { VideoProcessingService } from '../services/video-processing.service';
import {
  CreateVideoDto,
  UpdateVideoDto,
  VideoSearchDto,
  VideoInteractionDto,
} from '../dto/video.dto';

@ApiTags('Videos')
@Controller('videos')
export class VideoController {
  constructor(
    private readonly videoService: VideoService,
    private readonly videoProcessingService: VideoProcessingService,
  ) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('video'))
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Upload a video file' })
  @ApiResponse({ status: 201, description: 'Video uploaded successfully' })
  async uploadVideo(
    @Request() req,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 * 1024 }), // 2GB
          new FileTypeValidator({ fileType: /(mp4|avi|mov|wmv|flv|webm|mkv)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() metadata?: any,
  ) {
    const userId = BigInt(req.user.sub);
    return this.videoProcessingService.uploadVideo(userId, file, metadata);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new video entry' })
  @ApiResponse({ status: 201, description: 'Video created successfully' })
  async createVideo(@Request() req, @Body() createVideoDto: CreateVideoDto) {
    const userId = BigInt(req.user.sub);
    return this.videoService.createVideo(userId, createVideoDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search videos' })
  @ApiResponse({ status: 200, description: 'Search results returned successfully' })
  async searchVideos(@Query() searchDto: VideoSearchDto) {
    return this.videoService.searchVideos(searchDto);
  }

  @Get('trending')
  @ApiOperation({ summary: 'Get trending videos' })
  @ApiResponse({ status: 200, description: 'Trending videos returned successfully' })
  async getTrendingVideos(
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 20,
  ) {
    return this.videoService.searchVideos({
      sortBy: 'view_count',
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get video by ID' })
  @ApiResponse({ status: 200, description: 'Video returned successfully' })
  @ApiResponse({ status: 404, description: 'Video not found' })
  async getVideo(
    @Param('id') id: string,
    @Request() req,
    @Query('increment_view') incrementView: boolean = true,
  ) {
    const videoId = BigInt(id);
    const video = await this.videoService.findVideoById(videoId);

    if (incrementView) {
      const userId = req.user?.sub ? BigInt(req.user.sub) : undefined;
      await this.videoService.incrementView(videoId, userId);
    }

    return video;
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update video' })
  @ApiResponse({ status: 200, description: 'Video updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Video not found' })
  async updateVideo(
    @Param('id') id: string,
    @Request() req,
    @Body() updateVideoDto: UpdateVideoDto,
  ) {
    const videoId = BigInt(id);
    const userId = BigInt(req.user.sub);
    return this.videoService.updateVideo(videoId, userId, updateVideoDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete video' })
  @ApiResponse({ status: 200, description: 'Video deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Video not found' })
  async deleteVideo(@Param('id') id: string, @Request() req) {
    const videoId = BigInt(id);
    const userId = BigInt(req.user.sub);
    await this.videoService.deleteVideo(videoId, userId);

    // Также удаляем файлы видео
    await this.videoProcessingService.deleteVideoFiles(videoId);

    return { message: 'Video deleted successfully' };
  }

  @Post(':id/interact')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Like/dislike video' })
  @ApiResponse({ status: 200, description: 'Interaction recorded successfully' })
  async interactWithVideo(
    @Param('id') id: string,
    @Request() req,
    @Body() interactionDto: VideoInteractionDto,
  ) {
    const videoId = BigInt(id);
    const userId = BigInt(req.user.sub);
    await this.videoService.interactWithVideo(videoId, userId, interactionDto);
    return { message: 'Interaction recorded successfully' };
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get video statistics' })
  @ApiResponse({ status: 200, description: 'Video stats returned successfully' })
  async getVideoStats(@Param('id') id: string) {
    const videoId = BigInt(id);
    return this.videoService.getVideoStats(videoId);
  }

  @Get(':id/processing-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get video processing status' })
  @ApiResponse({ status: 200, description: 'Processing status returned successfully' })
  async getProcessingStatus(@Param('id') id: string, @Request() req) {
    const videoId = BigInt(id);
    return this.videoProcessingService.getProcessingStatus(videoId);
  }

  @Post(':id/retry-processing')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Retry video processing' })
  @ApiResponse({ status: 200, description: 'Processing restarted successfully' })
  async retryProcessing(@Param('id') id: string, @Request() req) {
    const videoId = BigInt(id);
    await this.videoProcessingService.retryProcessing(videoId);
    return { message: 'Processing restarted successfully' };
  }

  @Get(':id/qualities')
  @ApiOperation({ summary: 'Get available video qualities' })
  @ApiResponse({ status: 200, description: 'Video qualities returned successfully' })
  async getVideoQualities(@Param('id') id: string) {
    const videoId = BigInt(id);
    return this.videoProcessingService.getVideoQualities(videoId);
  }

  @Post(':id/thumbnail')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Generate video thumbnail' })
  @ApiResponse({ status: 200, description: 'Thumbnail generated successfully' })
  async generateThumbnail(
    @Param('id') id: string,
    @Request() req,
    @Query('timestamp', ParseIntPipe) timestamp: number = 10,
  ) {
    const videoId = BigInt(id);
    const thumbnailUrl = await this.videoProcessingService.generateThumbnail(videoId, timestamp);
    return { thumbnailUrl };
  }

  @Get()
  @ApiOperation({ summary: 'Get videos with pagination' })
  @ApiResponse({ status: 200, description: 'Videos returned successfully' })
  async getVideos(
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 20,
    @Query('sort') sort: string = 'recent',
  ) {
    const sortBy = sort === 'popular' ? 'view_count' : 'upload_date';

    return this.videoService.searchVideos({
      sortBy,
      page,
      limit,
    });
  }
}
