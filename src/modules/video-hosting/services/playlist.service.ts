import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CreatePlaylistDto, UpdatePlaylistDto, AddToPlaylistDto } from '../dto/playlist.dto';
import { Playlist } from 'generated/client';
import { PrismaService } from 'src/libs/db/prisma.service';

@Injectable()
export class PlaylistService {
  constructor(private readonly prisma: PrismaService) {}

  async createPlaylist(authorId: bigint, createPlaylistDto: CreatePlaylistDto): Promise<Playlist> {
    const { public: isPublic, collaborative, ...playlistData } = createPlaylistDto;

    // Создаем битовые флаги
    let flags = 0;
    if (isPublic) flags |= 1; // public(1)
    if (collaborative) flags |= 2; // collaborative(2)

    const playlist = await this.prisma.playlist.create({
      data: {
        ...playlistData,
        authorId,
        flags,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        items: {
          take: 5,
          include: {
            content: {
              select: {
                id: true,
                title: true,
                thumbnailUrl: true,
                viewsCount: true,
                createdAt: true,
                author: {
                  select: {
                    username: true,
                    fullName: true,
                  },
                },
              },
            },
          },
          orderBy: {
            position: 'asc',
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    return playlist;
  }

  async updatePlaylist(
    playlistId: bigint,
    authorId: bigint,
    updatePlaylistDto: UpdatePlaylistDto,
  ): Promise<Playlist> {
    const playlist = await this.findPlaylistById(playlistId);

    if (playlist.authorId !== authorId) {
      throw new ForbiddenException('You can only edit your own playlists');
    }

    const { public: isPublic, collaborative, ...playlistData } = updatePlaylistDto;

    // Обновляем битовые флаги
    let flags = playlist.flags;
    if (isPublic !== undefined) {
      flags = isPublic ? flags | 1 : flags & ~1;
    }
    if (collaborative !== undefined) {
      flags = collaborative ? flags | 2 : flags & ~2;
    }

    const updatedPlaylist = await this.prisma.playlist.update({
      where: { id: playlistId },
      data: {
        ...playlistData,
        flags,
        updatedAt: new Date(),
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        items: {
          take: 5,
          include: {
            content: {
              select: {
                id: true,
                title: true,
                thumbnailUrl: true,
                viewsCount: true,
                createdAt: true,
                author: {
                  select: {
                    username: true,
                    fullName: true,
                  },
                },
              },
            },
          },
          orderBy: {
            position: 'asc',
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    return updatedPlaylist;
  }

  async deletePlaylist(playlistId: bigint, authorId: bigint): Promise<void> {
    const playlist = await this.findPlaylistById(playlistId);

    if (playlist.authorId !== authorId) {
      throw new ForbiddenException('You can only delete your own playlists');
    }

    await this.prisma.playlist.delete({
      where: { id: playlistId },
    });
  }

  async findPlaylistById(playlistId: bigint): Promise<Playlist> {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        items: {
          include: {
            content: {
              select: {
                id: true,
                title: true,
                description: true,
                thumbnailUrl: true,
                viewsCount: true,
                createdAt: true,
                metadata: true,
                author: {
                  select: {
                    username: true,
                    fullName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
          orderBy: {
            position: 'asc',
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    if (!playlist) {
      throw new NotFoundException('Playlist not found');
    }

    return playlist;
  }

  async addVideoToPlaylist(
    playlistId: bigint,
    userId: bigint,
    addToPlaylistDto: AddToPlaylistDto,
  ): Promise<void> {
    const playlist = await this.findPlaylistById(playlistId);
    const videoId = BigInt(addToPlaylistDto.videoId);

    // Проверяем права доступа
    const canEdit = playlist.authorId === userId || playlist.flags & 2; // owner или collaborative
    if (!canEdit) {
      throw new ForbiddenException('You cannot add videos to this playlist');
    }

    // Проверяем существование видео
    const video = await this.prisma.content.findUnique({
      where: { id: videoId },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    // Проверяем, не добавлено ли уже видео в плейлист
    const existingItem = await this.prisma.playlistItem.findUnique({
      where: {
        playlistId_contentId: {
          playlistId,
          contentId: videoId,
        },
      },
    });

    if (existingItem) {
      return; // Видео уже в плейлисте
    }

    // Получаем следующую позицию
    const lastItem = await this.prisma.playlistItem.findFirst({
      where: { playlistId },
      orderBy: { position: 'desc' },
    });

    const position = addToPlaylistDto.position ?? (lastItem ? lastItem.position + 1 : 0);

    await this.prisma.playlistItem.create({
      data: {
        playlistId,
        contentId: videoId,
        position,
      },
    });

    // Обновляем время последнего изменения плейлиста
    await this.prisma.playlist.update({
      where: { id: playlistId },
      data: { updatedAt: new Date() },
    });
  }

  async removeVideoFromPlaylist(
    playlistId: bigint,
    videoId: bigint,
    userId: bigint,
  ): Promise<void> {
    const playlist = await this.findPlaylistById(playlistId);

    // Проверяем права доступа
    const canEdit = playlist.authorId === userId || playlist.flags & 2; // owner или collaborative
    if (!canEdit) {
      throw new ForbiddenException('You cannot remove videos from this playlist');
    }

    const playlistItem = await this.prisma.playlistItem.findUnique({
      where: {
        playlistId_contentId: {
          playlistId,
          contentId: videoId,
        },
      },
    });

    if (!playlistItem) {
      throw new NotFoundException('Video not found in playlist');
    }

    await this.prisma.playlistItem.delete({
      where: {
        playlistId_contentId: {
          playlistId,
          contentId: videoId,
        },
      },
    });

    // Обновляем позиции оставшихся элементов
    await this.prisma.playlistItem.updateMany({
      where: {
        playlistId,
        position: {
          gt: playlistItem.position,
        },
      },
      data: {
        position: {
          decrement: 1,
        },
      },
    });

    // Обновляем время последнего изменения плейлиста
    await this.prisma.playlist.update({
      where: { id: playlistId },
      data: { updatedAt: new Date() },
    });
  }

  async reorderPlaylist(playlistId: bigint, userId: bigint, videoIds: bigint[]): Promise<void> {
    const playlist = await this.findPlaylistById(playlistId);

    // Проверяем права доступа
    const canEdit = playlist.authorId === userId || playlist.flags & 2; // owner или collaborative
    if (!canEdit) {
      throw new ForbiddenException('You cannot reorder this playlist');
    }

    // Обновляем позиции всех элементов
    const updatePromises = videoIds.map((videoId, index) =>
      this.prisma.playlistItem.update({
        where: {
          playlistId_contentId: {
            playlistId,
            contentId: videoId,
          },
        },
        data: {
          position: index,
        },
      }),
    );

    await Promise.all(updatePromises);

    // Обновляем время последнего изменения плейлиста
    await this.prisma.playlist.update({
      where: { id: playlistId },
      data: { updatedAt: new Date() },
    });
  }

  async getUserPlaylists(userId: bigint, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [playlists, total] = await Promise.all([
      this.prisma.playlist.findMany({
        where: { authorId: userId },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          items: {
            take: 3, // Первые 3 видео для превью
            include: {
              content: {
                select: {
                  id: true,
                  title: true,
                  thumbnailUrl: true,
                  viewsCount: true,
                  createdAt: true,
                },
              },
            },
            orderBy: {
              position: 'asc',
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
      this.prisma.playlist.count({
        where: { authorId: userId },
      }),
    ]);

    return {
      playlists,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPublicPlaylists(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [playlists, total] = await Promise.all([
      this.prisma.playlist.findMany({
        where: {
          flags: {
            // Публичные плейлисты (public = 1)
            gte: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
          items: {
            take: 3, // Первые 3 видео для превью
            include: {
              content: {
                select: {
                  id: true,
                  title: true,
                  thumbnailUrl: true,
                  viewsCount: true,
                  createdAt: true,
                },
              },
            },
            orderBy: {
              position: 'asc',
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
      this.prisma.playlist.count({
        where: {
          flags: {
            gte: 1,
          },
        },
      }),
    ]);

    return {
      playlists,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
