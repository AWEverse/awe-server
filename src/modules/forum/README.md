# Forum Module

## Overview

The Forum Module provides comprehensive forum functionality for the AWE platform, including thread management, reply systems, categories, search capabilities, and moderation tools. It supports nested discussions, real-time updates, and advanced content moderation.

## Features

### Thread Management
- **Thread Creation**: Create discussion threads with rich content
- **Thread Categories**: Organize threads into categories and subcategories
- **Thread Pagination**: Efficient pagination for large thread lists
- **Thread Pinning**: Pin important threads to the top
- **Thread Locking**: Lock/unlock threads to control participation

### Reply System
- **Nested Replies**: Support for threaded conversations
- **Reply Quoting**: Quote previous messages in replies
- **Reply Editing**: Edit replies with revision history
- **Reply Reactions**: Like, dislike, and custom reactions
- **Reply Notifications**: Real-time notifications for new replies

### Search & Discovery
- **Full-Text Search**: Advanced search across threads and replies
- **Category Filtering**: Filter content by categories
- **Tag-based Search**: Search by custom tags
- **Trending Topics**: Identify popular and trending discussions
- **Search Suggestions**: Auto-complete search suggestions

### Moderation Tools
- **Content Moderation**: Review and moderate forum content
- **User Moderation**: Temporarily ban or restrict users
- **Automated Filters**: Auto-detect spam and inappropriate content
- **Report System**: User reporting system for content
- **Moderation Queue**: Queue system for reviewing flagged content

### Security & Performance
- **Rate Limiting**: Prevent spam and abuse
- **Content Sanitization**: XSS protection for user content
- **Caching**: Redis caching for frequently accessed content
- **Indexing**: Full-text search indexing for performance
- **Permission System**: Role-based access control

## API Endpoints

### Threads

```
POST   /forum/threads                  - Create new thread
GET    /forum/threads                  - List threads with pagination
GET    /forum/threads/:id              - Get thread details
PUT    /forum/threads/:id              - Update thread
DELETE /forum/threads/:id              - Delete thread
POST   /forum/threads/:id/pin          - Pin/unpin thread
POST   /forum/threads/:id/lock         - Lock/unlock thread
```

### Replies

```
POST   /forum/threads/:id/replies      - Add reply to thread
GET    /forum/threads/:id/replies      - Get thread replies
PUT    /forum/replies/:id              - Update reply
DELETE /forum/replies/:id              - Delete reply
POST   /forum/replies/:id/quote        - Quote reply
POST   /forum/replies/:id/react        - Add reaction to reply
```

### Categories

```
POST   /forum/categories               - Create category
GET    /forum/categories               - List categories
GET    /forum/categories/:id           - Get category details
PUT    /forum/categories/:id           - Update category
DELETE /forum/categories/:id           - Delete category
GET    /forum/categories/:id/threads   - Get threads in category
```

### Search

```
GET    /forum/search                   - Search threads and replies
GET    /forum/search/suggestions       - Get search suggestions
GET    /forum/trending                 - Get trending topics
GET    /forum/tags                     - Get available tags
GET    /forum/tags/:tag                - Get content by tag
```

### Moderation

```
GET    /forum/moderation/queue         - Get moderation queue
POST   /forum/moderation/review/:id    - Review content
POST   /forum/moderation/ban/:userId   - Ban user
POST   /forum/moderation/report        - Report content
GET    /forum/moderation/reports       - Get reported content
```

## Usage Examples

### Creating a Thread

```typescript
const thread = await forumService.createThread({
  title: 'Discussion about new features',
  content: 'What features would you like to see next?',
  categoryId: 'general',
  tags: ['features', 'feedback'],
  isPinned: false,
  isLocked: false
}, userId);
```

### Adding a Reply

```typescript
const reply = await forumReplyService.createReply({
  threadId: 'thread123',
  content: 'Great idea! I would love to see...',
  parentReplyId: null, // null for top-level reply
  quotedReplyId: 'reply456' // optional quote
}, userId);
```

### Searching Content

```typescript
const searchResults = await forumSearchService.search({
  query: 'feature request',
  categoryId: 'general',
  tags: ['features'],
  limit: 20,
  offset: 0,
  sortBy: 'relevance' // relevance, recent, popular
});
```

## Configuration

### Pagination Settings

```typescript
const forumConfig = {
  threadsPerPage: 25,
  repliesPerPage: 50,
  maxReplyDepth: 5,
  searchResultsPerPage: 20
};
```

### Rate Limiting

```typescript
const rateLimits = {
  threadCreation: '5 per hour',
  replyCreation: '30 per hour',
  searchRequests: '100 per hour',
  reportSubmission: '10 per day'
};
```

### Content Limits

```typescript
const contentLimits = {
  threadTitleMaxLength: 200,
  threadContentMaxLength: 10000,
  replyMaxLength: 5000,
  maxTagsPerThread: 10,
  maxAttachmentsPerPost: 5
};
```

## Database Schema

The module uses the following Prisma models:

- `ForumCategory` - Forum categories and subcategories
- `ForumThread` - Discussion threads
- `ForumReply` - Replies to threads
- `ForumTag` - Tags for categorizing content
- `ForumReaction` - User reactions to posts
- `ForumReport` - Content reports for moderation
- `ForumModerationAction` - Moderation history

## Security Features

### Content Security
- HTML sanitization to prevent XSS attacks
- Content filtering for spam and inappropriate content
- File upload validation for attachments
- Rate limiting to prevent abuse

### Access Control
- Role-based permissions for moderation
- Category-specific access control
- User-based thread and reply ownership
- Admin override capabilities

### Audit Trail
- Complete moderation action history
- User activity tracking
- Content revision history
- Report handling logs

## Performance Optimizations

### Caching Strategy
- Thread list caching with Redis
- Category hierarchy caching
- Search result caching
- Frequently accessed content caching

### Database Optimizations
- Proper indexing for search queries
- Efficient pagination with cursor-based approach
- Optimized queries for nested replies
- Connection pooling for high traffic

### Search Performance
- Full-text search indexes
- Search result ranking algorithms
- Auto-complete with trie structures
- Search analytics for optimization

## Integration

To use this module in your application:

```typescript
import { ForumModule } from './modules/forum';

@Module({
  imports: [
    ForumModule,
    // other modules...
  ],
})
export class AppModule {}
```

## Dependencies

- `@nestjs/common` - Core NestJS functionality
- `prisma` - Database ORM
- `class-validator` - DTO validation
- `@nestjs/swagger` - API documentation
- `redis` - Caching layer
- `dompurify` - HTML sanitization

## Real-time Features

### WebSocket Events
- New thread notifications
- Reply notifications
- Real-time thread updates
- Moderation alerts
- User activity status

### Live Updates
- Real-time reply count updates
- Live reaction updates
- Instant notification delivery
- Activity feed updates

## Moderation Workflow

### Content Review Process
1. **Automatic Detection**: AI-powered content filtering
2. **User Reports**: Community-driven reporting system
3. **Moderation Queue**: Centralized review system
4. **Action Taking**: Warn, edit, delete, or ban actions
5. **Appeals Process**: User appeal system for moderation actions

### Moderation Tools
- Bulk moderation actions
- Custom moderation rules
- Automated warning system
- Escalation procedures
- Moderation analytics

## Future Enhancements

- [ ] AI-powered content recommendations
- [ ] Advanced spam detection with ML
- [ ] Voice message support in replies
- [ ] Live polling and voting features
- [ ] Integration with external forum platforms
- [ ] Advanced analytics dashboard
- [ ] Mobile push notifications
- [ ] Content translation support
