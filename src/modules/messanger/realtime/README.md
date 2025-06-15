# Realtime Messenger Module

## 📁 File Structure

```
realtime/
├── messanger.gateway.ts              # Optimized WebSocket Gateway
├── websocket.config.ts               # Configuration constants
├── websocket-rate-limiter.service.ts # Rate limiting service
├── websocket-monitor.service.ts      # Performance monitoring
└── OPTIMIZATION_SUMMARY.md           # Detailed optimization report
```

## 🚀 Key Features

### ✅ Optimized WebSocket Gateway
- **Efficient Connection Management**: Connection pooling with limits
- **Rate Limiting**: Prevents abuse with configurable limits
- **Auto-cleanup**: Stale connections and typing indicators
- **Memory Optimization**: Efficient data structures and minimal memory footprint
- **Performance Monitoring**: Real-time metrics and logging

### ✅ Core Events Supported
- `send_message` - Send text messages with attachments
- `edit_message` - Edit existing messages
- `delete_message` - Delete messages
- `join_chat` / `leave_chat` - Chat room management
- `typing_start` / `typing_stop` - Typing indicators
- `add_reaction` / `remove_reaction` - Message reactions

### ✅ Configuration
All settings centralized in `websocket.config.ts`:
- Connection limits (3 per user, 10k total)
- Rate limits (30 msg/min, 60 reactions/min, 120 typing/min)
- Cleanup intervals and timeouts
- Message and attachment limits

### ✅ Rate Limiting
- Per-user rate limiting for messages, reactions, and typing
- Automatic cleanup of expired rate limit data
- Configurable limits per action type

### ✅ Monitoring
- Real-time connection metrics
- Message throughput tracking
- Rate limit violation logging
- Performance statistics

## 🗑️ Removed for Performance

### ❌ Heavy Features Removed:
- Sticker/GIF/Custom Emoji WebSocket events (use REST API instead)
- Complex online status broadcasting
- Device ID tracking
- Excessive event emission
- Heavy database operations in WebSocket handlers

## 🔧 Usage

### Client Connection
```javascript
const socket = io('/messenger', {
  transports: ['websocket'],
  auth: {
    token: 'your-jwt-token'
  }
});
```

### Sending Messages
```javascript
socket.emit('send_message', {
  chatId: '123',
  content: 'Hello world!',
  messageType: 'TEXT',
  tempId: 'temp-123' // For delivery confirmation
});
```

### Handling Events
```javascript
socket.on('new_message', (data) => {
  console.log('New message:', data);
});

socket.on('message_sent', (data) => {
  console.log('Message delivered:', data.messageId);
});
```

## 📊 Performance Metrics

Expected improvements over the original implementation:
- **Memory Usage**: ~60% reduction
- **CPU Usage**: ~40% reduction  
- **Network Bandwidth**: ~30% reduction
- **Connection Capacity**: 10,000+ concurrent connections

## 🛠️ Configuration

Modify `websocket.config.ts` to adjust:
- Connection limits
- Rate limiting rules
- Cleanup intervals
- Message size limits
- Buffer sizes

## 📈 Monitoring

The module provides real-time metrics:
- Total connections
- Active users
- Messages per minute
- Rate limit violations
- Room count

Access metrics via the `WebSocketMonitor` service or check logs for periodic reports.

## 🚨 Important Notes

1. **File Uploads**: Use dedicated REST endpoints, not WebSocket
2. **Heavy Media**: Handle stickers/GIFs via REST API
3. **Database Operations**: Keep minimal in WebSocket handlers
4. **Error Handling**: All events include proper error handling and validation
5. **Security**: JWT authentication required for all connections

This optimized realtime module prioritizes **performance**, **scalability**, and **resource efficiency** while maintaining essential real-time messaging functionality.
