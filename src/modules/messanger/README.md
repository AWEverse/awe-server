# Messenger Module

## Overview

The Messenger Module provides comprehensive real-time messaging functionality for the AWE platform. It includes direct messaging, group chats, file sharing, real-time notifications, message encryption, and advanced chat features like reactions, replies, and typing indicators.

## Features

### Core Messaging
- **Direct Messaging**: One-on-one private conversations
- **Group Chats**: Multi-user group conversations
- **Message Threading**: Reply to specific messages
- **Message Editing**: Edit sent messages with revision history
- **Message Deletion**: Delete messages with optional recall
- **Message Forwarding**: Forward messages between chats

### Real-time Communication
- **WebSocket Integration**: Real-time message delivery
- **Typing Indicators**: Show when users are typing
- **Read Receipts**: Message read status tracking
- **Online Status**: User presence and activity status
- **Push Notifications**: Cross-platform notification delivery
- **Offline Message Queue**: Store messages for offline users

### Media & File Sharing
- **File Attachments**: Support for various file types
- **Image/Video Sharing**: Media message support
- **Voice Messages**: Audio message recording and playback
- **Document Sharing**: PDF, Office documents, etc.
- **Link Previews**: Auto-generate previews for shared links
- **File Compression**: Automatic file optimization

### Advanced Features
- **Message Reactions**: Emoji reactions to messages
- **Message Search**: Full-text search across conversations
- **Chat Backup**: Message history backup and export
- **Message Encryption**: End-to-end encryption option
- **Chat Themes**: Customizable chat appearance
- **Message Scheduling**: Schedule messages for later delivery

### Group Management
- **Group Creation**: Create and configure group chats
- **Member Management**: Add/remove group members
- **Admin Controls**: Group admin permissions and settings
- **Group Settings**: Chat settings and preferences
- **Member Roles**: Different permission levels for members
- **Group Info**: Group description, avatar, and metadata

## API Endpoints

### Direct Messages

```
POST   /messenger/chats                - Create new chat/conversation
GET    /messenger/chats                - Get user's chat list
GET    /messenger/chats/:id            - Get chat details
DELETE /messenger/chats/:id            - Delete chat

POST   /messenger/chats/:id/messages   - Send message
GET    /messenger/chats/:id/messages   - Get chat messages
PUT    /messenger/messages/:id         - Edit message
DELETE /messenger/messages/:id         - Delete message
```

### Group Chats

```
POST   /messenger/groups               - Create group chat
GET    /messenger/groups/:id           - Get group details
PUT    /messenger/groups/:id           - Update group settings
DELETE /messenger/groups/:id           - Delete group

POST   /messenger/groups/:id/members   - Add group member
DELETE /messenger/groups/:id/members/:userId - Remove member
PUT    /messenger/groups/:id/members/:userId/role - Update member role
```

### Messages

```
POST   /messenger/messages/:id/react   - Add reaction to message
DELETE /messenger/messages/:id/react   - Remove reaction
POST   /messenger/messages/:id/reply   - Reply to message
POST   /messenger/messages/:id/forward - Forward message
POST   /messenger/messages/:id/read    - Mark message as read
```

### File Sharing

```
POST   /messenger/upload               - Upload file attachment
GET    /messenger/files/:id            - Download file
POST   /messenger/voice                - Upload voice message
GET    /messenger/voice/:id            - Download voice message
```

### Search & Notifications

```
GET    /messenger/search               - Search messages
POST   /messenger/notifications/settings - Update notification settings
GET    /messenger/notifications        - Get notification history
POST   /messenger/typing/:chatId       - Send typing indicator
```

### Real-time Events

```
WebSocket Events:
- message.new                         - New message received
- message.edited                      - Message was edited
- message.deleted                     - Message was deleted
- message.read                        - Message read receipt
- typing.start                        - User started typing
- typing.stop                         - User stopped typing
- user.online                         - User came online
- user.offline                        - User went offline
- chat.created                        - New chat created
- group.member.added                  - Member added to group
- group.member.removed                - Member removed from group
```

## Usage Examples

### Sending a Message

```typescript
const message = await messengerService.sendMessage({
  chatId: 'chat123',
  content: 'Hello, how are you?',
  type: 'text',
  replyToMessageId: null, // optional reply
  attachments: [] // optional file attachments
}, userId);
```

### Creating a Group Chat

```typescript
const group = await messengerService.createGroup({
  name: 'Project Team',
  description: 'Discussion for our project',
  memberIds: ['user1', 'user2', 'user3'],
  isPrivate: false,
  settings: {
    allowMemberInvite: true,
    allowFileSharing: true,
    messageHistory: 'visible'
  }
}, userId);
```

### Searching Messages

```typescript
const searchResults = await messengerService.searchMessages({
  query: 'project deadline',
  chatId: 'chat123', // optional, search specific chat
  userId: userId,
  limit: 20,
  offset: 0,
  dateFrom: '2025-01-01',
  dateTo: '2025-12-31'
});
```

### Real-time Message Handling

```typescript
// WebSocket event handlers
@SubscribeMessage('sendMessage')
async handleMessage(client: Socket, payload: SendMessageDto) {
  const message = await this.messengerService.sendMessage(payload, client.userId);
  
  // Broadcast to chat participants
  this.server.to(`chat-${payload.chatId}`).emit('message.new', message);
  
  // Send push notifications to offline users
  await this.notificationService.sendMessageNotification(message);
  
  return message;
}

@SubscribeMessage('typing')
async handleTyping(client: Socket, payload: { chatId: string, isTyping: boolean }) {
  client.to(`chat-${payload.chatId}`).emit('typing.status', {
    userId: client.userId,
    isTyping: payload.isTyping
  });
}
```

## Configuration

### Message Limits

```typescript
const messageConfig = {
  maxMessageLength: 4000,
  maxAttachmentsPerMessage: 10,
  maxVoiceMessageDuration: 300, // 5 minutes
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedFileTypes: [
    'image/*', 'video/*', 'audio/*',
    'application/pdf', 'text/*',
    'application/msword', 'application/vnd.openxmlformats-officedocument.*'
  ]
};
```

### Group Settings

```typescript
const groupConfig = {
  maxGroupSize: 1000,
  maxGroupNameLength: 100,
  maxGroupDescriptionLength: 500,
  defaultMessageHistory: 'visible', // visible, hidden
  allowGuestAccess: false
};
```

### Real-time Configuration

```typescript
const realtimeConfig = {
  typingTimeout: 3000, // ms
  presenceTimeout: 30000, // ms
  messageDeliveryTimeout: 10000, // ms
  maxConcurrentConnections: 10000,
  heartbeatInterval: 25000 // ms
};
```

## Database Schema

The module uses the following Prisma models:

- `Chat` - Chat conversations (DM and groups)
- `Message` - Individual messages
- `MessageAttachment` - File attachments
- `MessageReaction` - Message reactions
- `ChatMember` - Chat participation and roles
- `MessageRead` - Read receipt tracking
- `ChatSettings` - Chat-specific settings
- `NotificationSetting` - User notification preferences

## Security Features

### Message Encryption
- Optional end-to-end encryption for sensitive chats
- Key exchange and management
- Forward secrecy implementation
- Encrypted message storage

### Access Control
- Chat member verification
- Role-based permissions in groups
- Private chat privacy controls
- Admin override capabilities

### Content Security
- File upload validation and scanning
- Link safety checking
- Spam and abuse detection
- Content filtering options

### Privacy Features
- Message deletion with recall
- Self-destructing messages (optional)
- Anonymous messaging mode
- Data export and deletion (GDPR compliance)

## Performance Optimizations

### Real-time Performance
- WebSocket connection pooling
- Message batching for high traffic
- Efficient presence tracking
- Optimized event broadcasting

### Database Optimizations
- Message pagination with efficient queries
- Indexing for search performance
- Connection pooling
- Read replicas for message history

### Caching Strategy
- Recent messages caching
- User presence caching
- Chat metadata caching
- File metadata caching

### Media Optimization
- Image/video compression
- Thumbnail generation
- Progressive file uploads
- CDN integration for media delivery

## Notification System

### Push Notifications
- Cross-platform push notification delivery
- Customizable notification settings
- Rich notifications with message previews
- Silent notifications for background sync

### In-app Notifications
- Real-time notification badges
- Sound and vibration preferences
- Do not disturb mode
- Notification history

### Email Notifications
- Missed message summaries
- Weekly activity digests
- Important message highlights
- Notification delivery preferences

## Integration

To use this module in your application:

```typescript
import { MessengerModule } from './modules/messanger';

@Module({
  imports: [
    MessengerModule,
    // other modules...
  ],
})
export class AppModule {}
```

## Dependencies

- `@nestjs/common` - Core NestJS functionality
- `@nestjs/websockets` - WebSocket support
- `@nestjs/platform-socket.io` - Socket.IO integration
- `prisma` - Database ORM
- `class-validator` - DTO validation
- `multer` - File upload handling
- `sharp` - Image processing
- `redis` - Caching and pub/sub
- `node-cron` - Scheduled tasks

## Real-time Architecture

### WebSocket Connection Management
- Connection authentication and authorization
- Room-based message broadcasting
- Connection recovery and reconnection
- Scalable connection distribution

### Message Delivery
- Guaranteed message delivery
- Offline message queueing
- Message acknowledgments
- Retry mechanisms for failed deliveries

### Presence System
- Real-time user presence tracking
- Activity status updates
- Last seen timestamps
- Efficient presence broadcasting

## Monitoring & Analytics

### Message Analytics
- Message volume metrics
- User engagement statistics
- Chat activity patterns
- Performance monitoring

### Error Tracking
- Message delivery failures
- Connection issues
- File upload errors
- Performance bottlenecks

### User Behavior
- Chat usage patterns
- Feature adoption metrics
- User retention analysis
- A/B testing support

## Future Enhancements

- [ ] AI-powered message suggestions
- [ ] Advanced message search with ML
- [ ] Video calling integration
- [ ] Screen sharing capabilities
- [ ] Message translation support
- [ ] Advanced chat moderation tools
- [ ] Integration with external messaging platforms
- [ ] Blockchain-based message verification
