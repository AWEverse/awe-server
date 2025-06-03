// Оптимизация WebSocket подключений
import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

interface OptimizedSocketUserInfo {
  userId: bigint;
  username: string;
  socketId: string;
  lastSeen: Date;
  isOnline: boolean;
  chatRooms: Set<string>;
  connectionTime: Date;
  heartbeatCount: number;
}

@Injectable()
export class WebSocketOptimizer {
  private readonly logger = new Logger(WebSocketOptimizer.name);

  // Используем WeakMap для автоматической сборки мусора
  private connectionMetrics = new WeakMap<Socket, { connectTime: Date; messageCount: number }>();

  // Лимиты для предотвращения DoS
  private readonly MAX_CONNECTIONS_PER_USER = 5;
  private readonly MAX_TOTAL_CONNECTIONS = 10000;
  private readonly HEARTBEAT_INTERVAL = 30000;
  private readonly STALE_CONNECTION_TIMEOUT = 300000; // 5 минут

  // Оптимизированное хранение с TTL
  private connectedUsers = new Map<string, OptimizedSocketUserInfo>();
  private userConnections = new Map<string, Set<string>>();
  private connectionPool = new Set<string>();

  constructor() {
    // Оптимизированная очистка каждые 2 минуты
    setInterval(() => this.optimizedCleanup(), 120000);

    // Сбор метрик каждые 5 минут
    setInterval(() => this.collectMetrics(), 300000);
  }

  /**
   * Регистрация подключения с проверками лимитов
   */
  registerConnection(socket: Socket, userId: bigint, username: string): boolean {
    const userIdStr = userId.toString();
    const socketId = socket.id;

    // Проверка общего лимита подключений
    if (this.connectionPool.size >= this.MAX_TOTAL_CONNECTIONS) {
      this.logger.warn(`Total connection limit reached: ${this.connectionPool.size}`);
      return false;
    }

    // Проверка лимита подключений на пользователя
    const userSockets = this.userConnections.get(userIdStr) || new Set();
    if (userSockets.size >= this.MAX_CONNECTIONS_PER_USER) {
      this.logger.warn(`User ${username} reached connection limit: ${userSockets.size}`);
      // Отключаем самое старое соединение
      const oldestSocket = Array.from(userSockets)[0];
      this.forceDisconnect(oldestSocket);
    }

    // Регистрируем новое подключение
    const userInfo: OptimizedSocketUserInfo = {
      userId,
      username,
      socketId,
      lastSeen: new Date(),
      isOnline: true,
      chatRooms: new Set(),
      connectionTime: new Date(),
      heartbeatCount: 0,
    };

    this.connectedUsers.set(socketId, userInfo);

    if (!this.userConnections.has(userIdStr)) {
      this.userConnections.set(userIdStr, new Set());
    }
    this.userConnections.get(userIdStr)!.add(socketId);
    this.connectionPool.add(socketId);

    // Метрики подключения
    this.connectionMetrics.set(socket, {
      connectTime: new Date(),
      messageCount: 0,
    });

    this.logger.debug(`User ${username} connected, total connections: ${this.connectionPool.size}`);
    return true;
  }

  /**
   * Оптимизированная очистка неактивных подключений
   */
  private optimizedCleanup(): void {
    const now = new Date();
    const disconnectedSockets: string[] = [];

    for (const [socketId, userInfo] of this.connectedUsers.entries()) {
      const timeSinceLastSeen = now.getTime() - userInfo.lastSeen.getTime();

      // Отключаем неактивные соединения
      if (timeSinceLastSeen > this.STALE_CONNECTION_TIMEOUT) {
        disconnectedSockets.push(socketId);
      }
    }

    // Batch удаление для производительности
    if (disconnectedSockets.length > 0) {
      this.logger.log(`Cleaning up ${disconnectedSockets.length} stale connections`);
      disconnectedSockets.forEach(socketId => this.removeConnection(socketId));
    }
  }

  /**
   * Принудительное отключение сокета
   */
  private forceDisconnect(socketId: string): void {
    // Эмулируем отключение через server
    // В реальной реализации нужен доступ к server instance
    this.removeConnection(socketId);
  }

  /**
   * Удаление подключения
   */
  removeConnection(socketId: string): void {
    const userInfo = this.connectedUsers.get(socketId);
    if (!userInfo) return;

    const userIdStr = userInfo.userId.toString();

    // Удаляем из всех структур данных
    this.connectedUsers.delete(socketId);
    this.connectionPool.delete(socketId);

    const userSockets = this.userConnections.get(userIdStr);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.userConnections.delete(userIdStr);
      }
    }
  }

  /**
   * Обновление активности пользователя
   */
  updateUserActivity(socketId: string): void {
    const userInfo = this.connectedUsers.get(socketId);
    if (userInfo) {
      userInfo.lastSeen = new Date();
      userInfo.heartbeatCount++;
    }
  }

  /**
   * Получение статистики подключений
   */
  getConnectionStats(): {
    totalConnections: number;
    uniqueUsers: number;
    averageConnectionTime: number;
    memoryUsage: number;
  } {
    const now = new Date();
    let totalConnectionTime = 0;

    for (const userInfo of this.connectedUsers.values()) {
      totalConnectionTime += now.getTime() - userInfo.connectionTime.getTime();
    }

    const averageConnectionTime =
      this.connectedUsers.size > 0 ? totalConnectionTime / this.connectedUsers.size : 0;

    // Примерная оценка использования памяти
    const memoryUsage = this.connectedUsers.size * 200 + this.connectionPool.size * 50;

    return {
      totalConnections: this.connectionPool.size,
      uniqueUsers: this.userConnections.size,
      averageConnectionTime,
      memoryUsage,
    };
  }

  /**
   * Сбор метрик для мониторинга
   */
  private collectMetrics(): void {
    const stats = this.getConnectionStats();
    this.logger.log(`WebSocket Stats: ${JSON.stringify(stats)}`);

    // Здесь можно отправлять метрики в систему мониторинга
    // например, в Prometheus, DataDog и т.д.
  }

  /**
   * Получение списка онлайн пользователей с батчингом
   */
  getOnlineUsersBatch(limit: number = 100): Array<{ userId: string; username: string }> {
    const users: Array<{ userId: string; username: string }> = [];
    let count = 0;

    for (const userInfo of this.connectedUsers.values()) {
      if (count >= limit) break;
      if (userInfo.isOnline) {
        users.push({
          userId: userInfo.userId.toString(),
          username: userInfo.username,
        });
        count++;
      }
    }

    return users;
  }
}
