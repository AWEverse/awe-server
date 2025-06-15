import { Injectable, Logger } from '@nestjs/common';

export interface WebSocketMetrics {
  totalConnections: number;
  activeUsers: number;
  totalRooms: number;
  messagesPerMinute: number;
  rateLimitViolations: number;
  lastUpdated: Date;
}

@Injectable()
export class WebSocketMonitor {
  private readonly logger = new Logger(WebSocketMonitor.name);
  private metrics: WebSocketMetrics = {
    totalConnections: 0,
    activeUsers: 0,
    totalRooms: 0,
    messagesPerMinute: 0,
    rateLimitViolations: 0,
    lastUpdated: new Date(),
  };

  private messageCount = 0;
  private lastMessageCountReset = Date.now();

  updateConnectionCount(count: number) {
    this.metrics.totalConnections = count;
    this.updateTimestamp();
  }

  updateActiveUsers(count: number) {
    this.metrics.activeUsers = count;
    this.updateTimestamp();
  }

  updateRoomCount(count: number) {
    this.metrics.totalRooms = count;
    this.updateTimestamp();
  }

  incrementMessageCount() {
    this.messageCount++;

    const now = Date.now();
    if (now - this.lastMessageCountReset >= 60000) {
      // 1 minute
      this.metrics.messagesPerMinute = this.messageCount;
      this.messageCount = 0;
      this.lastMessageCountReset = now;
      this.updateTimestamp();
    }
  }

  incrementRateLimitViolation() {
    this.metrics.rateLimitViolations++;
    this.updateTimestamp();
  }

  getMetrics(): WebSocketMetrics {
    return { ...this.metrics };
  }

  logMetrics() {
    this.logger.log(`WebSocket Metrics: ${JSON.stringify(this.metrics, null, 2)}`);
  }

  private updateTimestamp() {
    this.metrics.lastUpdated = new Date();
  }

  // Method to be called periodically to log stats
  startPeriodicLogging(intervalMs: number = 300000) {
    // 5 minutes default
    setInterval(() => {
      this.logMetrics();
    }, intervalMs);
  }
}
