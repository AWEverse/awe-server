# Media Assets Module

## Overview

The Media Assets Module provides comprehensive functionality for managing stickers, custom emojis, and GIFs within the AWE platform. It includes secure file upload, storage integration with Cloudflare R2, image processing, and a full REST API.

## Features

### Sticker Management
- **Sticker Packs**: Create and manage collections of stickers
- **Individual Stickers**: Upload, update, and organize stickers within packs
- **User Collections**: Personal sticker collections and favorites
- **Bulk Operations**: Efficient bulk upload and management
- **Monetization**: Premium and paid sticker packs

### Custom Emoji Management
- **Chat-specific Emojis**: Custom emojis for specific chats
- **Global Emojis**: Platform-wide custom emojis
- **Usage Tracking**: Monitor emoji popularity and usage patterns
- **Animated Support**: Support for animated emoji formats

### GIF Management
- **Categories**: Organize GIFs into categories
- **Trending/Featured**: Curated trending and featured GIF collections
- **Search**: Advanced search functionality with metadata indexing
- **Usage Analytics**: Track GIF usage and popularity

### Security & Validation
- **File Type Validation**: Strict MIME type and magic byte checking
- **Size Limits**: Configurable file size restrictions per media type
- **Rate Limiting**: Prevent abuse with upload rate limiting
- **Permission System**: Role-based access control
- **Content Moderation**: Tools for content review and moderation

### Storage & Processing
- **Cloudflare R2 Integration**: Scalable object storage
- **Image Processing**: Optimization and format conversion using Sharp
- **Preview Generation**: Automatic thumbnail/preview creation
- **CDN Integration**: Fast global content delivery

## API Endpoints

### Stickers

```
POST   /media/stickers/packs           - Create sticker pack
GET    /media/stickers/packs           - List sticker packs
GET    /media/stickers/packs/:id       - Get pack details
PUT    /media/stickers/packs/:id       - Update pack
DELETE /media/stickers/packs/:id       - Delete pack

POST   /media/stickers                 - Create sticker
GET    /media/stickers/:id             - Get sticker
PUT    /media/stickers/:id             - Update sticker
DELETE /media/stickers/:id             - Delete sticker

POST   /media/stickers/bulk-upload     - Bulk upload stickers
DELETE /media/stickers/bulk            - Bulk delete stickers
```

### Custom Emojis

```
POST   /media/emojis                   - Create custom emoji
GET    /media/emojis                   - List emojis
GET    /media/emojis/:id               - Get emoji details
PUT    /media/emojis/:id               - Update emoji
DELETE /media/emojis/:id               - Delete emoji

POST   /media/emojis/bulk-upload       - Bulk upload emojis
DELETE /media/emojis/bulk              - Bulk delete emojis
POST   /media/emojis/:id/track-usage   - Track emoji usage
```

### GIFs

```
POST   /media/gifs/categories          - Create GIF category
GET    /media/gifs/categories          - List categories
PUT    /media/gifs/categories/:id      - Update category
DELETE /media/gifs/categories/:id      - Delete category

POST   /media/gifs                     - Create GIF
GET    /media/gifs                     - List GIFs (with search)
GET    /media/gifs/trending            - Get trending GIFs
GET    /media/gifs/featured            - Get featured GIFs
GET    /media/gifs/search              - Search GIFs
GET    /media/gifs/:id                 - Get GIF details
PUT    /media/gifs/:id                 - Update GIF
DELETE /media/gifs/:id                 - Delete GIF

POST   /media/gifs/bulk-upload         - Bulk upload GIFs
DELETE /media/gifs/bulk                - Bulk delete GIFs
POST   /media/gifs/:id/usage           - Track GIF usage
```

## Usage Examples

### Creating a Sticker Pack

```typescript
const stickerPack = await stickerService.createStickerPack({
  name: 'my-awesome-pack',
  title: 'My Awesome Pack',
  description: 'A collection of awesome stickers',
  category: 'general',
  price: 0, // Free pack
  isAnimated: false,
  isOfficial: false
}, userId);
```

### Uploading a Custom Emoji

```typescript
const emoji = await emojiService.createCustomEmoji({
  name: 'my_emoji',
  fileName: 'emoji.png',
  chatId: 'chat123', // null for global emoji
  isAnimated: false
}, uploadDto, userId);
```

### Searching GIFs

```typescript
const gifs = await gifService.getGifs({
  search: 'funny cats',
  categoryId: 'animals',
  limit: 20,
  offset: 0,
  sortBy: 'popular'
});
```

## Configuration

### File Upload Limits

```typescript
const maxFileSizes = {
  sticker: 2 * 1024 * 1024, // 2MB
  emoji: 512 * 1024,        // 512KB
  gif: 8 * 1024 * 1024,     // 8MB
};
```

### Allowed MIME Types

```typescript
const allowedMimeTypes = {
  sticker: ['image/png', 'image/webp', 'image/gif'],
  emoji: ['image/png', 'image/webp', 'image/gif'],
  gif: ['image/gif'],
};
```

### Rate Limits

```typescript
const rateLimits = {
  maxUploadsPerHour: 100,
  maxUploadsPerMinute: 10,
};
```

## Security Features

### File Validation
- MIME type verification
- Magic byte checking
- Suspicious filename detection
- Content header validation

### Access Control
- JWT-based authentication
- Role-based permissions
- Resource ownership validation
- Moderation capabilities

### Rate Limiting
- Per-user upload limits
- Time-based restrictions
- Automatic cleanup of expired entries

## Database Schema

The module uses the following Prisma models:

- `StickerPack` - Sticker pack collections
- `Sticker` - Individual stickers
- `CustomEmoji` - Custom emoji instances
- `GifCategory` - GIF categories
- `Gif` - GIF instances
- `MediaAsset` - Base media asset tracking
- `UserStickerCollection` - User sticker collections

## Error Handling

All services include comprehensive error handling with:
- Detailed error messages
- Proper HTTP status codes
- Logging for debugging
- Graceful fallbacks

## Performance Considerations

- Efficient database queries with proper indexing
- Optimized image processing pipeline
- CDN integration for fast delivery
- Bulk operations for large datasets
- Caching strategies for frequently accessed data

## Integration

To use this module in your application:

```typescript
import { MediaAssetModule } from './modules/media-assets';

@Module({
  imports: [
    MediaAssetModule,
    // other modules...
  ],
})
export class AppModule {}
```

## Dependencies

- `@nestjs/common` - Core NestJS functionality
- `@nestjs/platform-express` - File upload handling
- `prisma` - Database ORM
- `sharp` - Image processing
- `class-validator` - DTO validation
- `@nestjs/swagger` - API documentation

## Future Enhancements

- [ ] Advanced content moderation with AI
- [ ] Real-time synchronization
- [ ] Advanced analytics dashboard
- [ ] Mobile-optimized formats
- [ ] Video sticker support
- [ ] Collaborative collections
- [ ] Advanced search with ML
- [ ] CDN cache optimization
