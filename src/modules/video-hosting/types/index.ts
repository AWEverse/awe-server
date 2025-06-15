// Video Hosting Types
export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  bitrate: number;
  codec: string;
  fps: number;
  size: number;
}

export interface VideoQuality {
  resolution: string;
  bitrate: number;
  url: string;
  size: number;
}

export interface VideoProcessingStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  qualities: VideoQuality[];
  error?: string;
}

export interface VideoStats {
  views: number;
  likes: number;
  dislikes: number;
  shares: number;
  comments: number;
  averageRating: number;
}

export interface VideoSearchFilters {
  duration?: 'short' | 'medium' | 'long'; // <4min, 4-20min, >20min
  uploadDate?: 'hour' | 'today' | 'week' | 'month' | 'year';
  quality?: '720p' | '1080p' | '4k';
  sortBy?: 'relevance' | 'upload_date' | 'view_count' | 'rating';
}

export interface ChannelStats {
  subscribersCount: number;
  totalViews: number;
  totalVideos: number;
  totalLikes: number;
}

export interface RecommendationContext {
  userId?: bigint;
  videoId?: bigint;
  watchHistory: bigint[];
  likedVideos: bigint[];
  subscribedChannels: bigint[];
}

export interface AnalyticsData {
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  subscribers?: number;
}

export interface TopVideoData {
  id: bigint;
  title: string;
  thumbnailUrl: string;
  views: number;
  likes: number;
  publishedAt: Date;
}

export interface StreamingSession {
  id: string;
  channelId: bigint;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  streamKey: string;
  rtmpUrl: string;
  hlsUrl: string;
  status: 'preparing' | 'live' | 'ended' | 'error';
  viewerCount: number;
  startedAt?: Date;
  endedAt?: Date;
}
