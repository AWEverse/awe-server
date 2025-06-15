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
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PlaylistService } from '../services/playlist.service';
import { CreatePlaylistDto, UpdatePlaylistDto, AddToPlaylistDto } from '../dto/playlist.dto';

@ApiTags('Playlists')
@Controller('playlists')
export class PlaylistController {
  constructor(private readonly playlistService: PlaylistService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new playlist' })
  @ApiResponse({ status: 201, description: 'Playlist created successfully' })
  async createPlaylist(@Request() req, @Body() createPlaylistDto: CreatePlaylistDto) {
    const userId = BigInt(req.user.sub);
    return this.playlistService.createPlaylist(userId, createPlaylistDto);
  }

  @Get('public')
  @ApiOperation({ summary: 'Get public playlists' })
  @ApiResponse({ status: 200, description: 'Public playlists returned successfully' })
  async getPublicPlaylists(
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 20,
  ) {
    return this.playlistService.getPublicPlaylists(page, limit);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user playlists' })
  @ApiResponse({ status: 200, description: 'User playlists returned successfully' })
  async getUserPlaylists(
    @Request() req,
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 20,
  ) {
    const userId = BigInt(req.user.sub);
    return this.playlistService.getUserPlaylists(userId, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get playlist by ID' })
  @ApiResponse({ status: 200, description: 'Playlist returned successfully' })
  @ApiResponse({ status: 404, description: 'Playlist not found' })
  async getPlaylist(@Param('id') id: string) {
    const playlistId = BigInt(id);
    return this.playlistService.findPlaylistById(playlistId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update playlist' })
  @ApiResponse({ status: 200, description: 'Playlist updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Playlist not found' })
  async updatePlaylist(
    @Param('id') id: string,
    @Request() req,
    @Body() updatePlaylistDto: UpdatePlaylistDto,
  ) {
    const playlistId = BigInt(id);
    const userId = BigInt(req.user.sub);
    return this.playlistService.updatePlaylist(playlistId, userId, updatePlaylistDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete playlist' })
  @ApiResponse({ status: 200, description: 'Playlist deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Playlist not found' })
  async deletePlaylist(@Param('id') id: string, @Request() req) {
    const playlistId = BigInt(id);
    const userId = BigInt(req.user.sub);
    await this.playlistService.deletePlaylist(playlistId, userId);
    return { message: 'Playlist deleted successfully' };
  }

  @Post(':id/videos')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Add video to playlist' })
  @ApiResponse({ status: 200, description: 'Video added to playlist successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Playlist or video not found' })
  async addVideoToPlaylist(
    @Param('id') id: string,
    @Request() req,
    @Body() addToPlaylistDto: AddToPlaylistDto,
  ) {
    const playlistId = BigInt(id);
    const userId = BigInt(req.user.sub);
    await this.playlistService.addVideoToPlaylist(playlistId, userId, addToPlaylistDto);
    return { message: 'Video added to playlist successfully' };
  }

  @Delete(':id/videos/:videoId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Remove video from playlist' })
  @ApiResponse({ status: 200, description: 'Video removed from playlist successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Playlist or video not found' })
  async removeVideoFromPlaylist(
    @Param('id') id: string,
    @Param('videoId') videoId: string,
    @Request() req,
  ) {
    const playlistId = BigInt(id);
    const videoIdBigInt = BigInt(videoId);
    const userId = BigInt(req.user.sub);
    await this.playlistService.removeVideoFromPlaylist(playlistId, videoIdBigInt, userId);
    return { message: 'Video removed from playlist successfully' };
  }

  @Put(':id/reorder')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Reorder playlist videos' })
  @ApiResponse({ status: 200, description: 'Playlist reordered successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Playlist not found' })
  async reorderPlaylist(
    @Param('id') id: string,
    @Request() req,
    @Body() body: { videoIds: string[] },
  ) {
    const playlistId = BigInt(id);
    const userId = BigInt(req.user.sub);
    const videoIds = body.videoIds.map(id => BigInt(id));
    await this.playlistService.reorderPlaylist(playlistId, userId, videoIds);
    return { message: 'Playlist reordered successfully' };
  }
}
