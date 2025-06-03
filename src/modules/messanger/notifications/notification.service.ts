import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface NotificationPayload {
  userId: bigint;
  type: 'message' | 'mention' | 'reaction' | 'chat_invite';
  title: string;
  body: string;
  data?: Record<string, any>;
  chatId?: bigint;
  messageId?: bigint;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private eventEmitter: EventEmitter2) {}

  /**
   * Отправка уведомления пользователю
   */
  async sendNotification(payload: NotificationPayload): Promise<void> {
    try {
      this.logger.debug(`Sending notification to user ${payload.userId}: ${payload.title}`);

      // Эмитим событие для других сервисов
      this.eventEmitter.emit('notification.send', payload);

      // Здесь можно добавить логику отправки через WebSocket, Push notifications и т.д.
      await this.sendWebSocketNotification(payload);
    } catch (error) {
      this.logger.error('Error sending notification:', error);
    }
  }

  /**
   * Отправка уведомления о новом сообщении
   */
  async sendMessageNotification(
    recipientId: bigint,
    chatId: bigint,
    messageId: bigint,
    senderName: string,
    content: string,
  ): Promise<void> {
    await this.sendNotification({
      userId: recipientId,
      type: 'message',
      title: `Новое сообщение от ${senderName}`,
      body: content.length > 100 ? content.substring(0, 100) + '...' : content,
      chatId,
      messageId,
      data: {
        chatId: chatId.toString(),
        messageId: messageId.toString(),
      },
    });
  }

  /**
   * Отправка уведомления о реакции
   */
  async sendReactionNotification(
    recipientId: bigint,
    chatId: bigint,
    messageId: bigint,
    reactorName: string,
    emoji: string,
  ): Promise<void> {
    await this.sendNotification({
      userId: recipientId,
      type: 'reaction',
      title: `${reactorName} отреагировал`,
      body: `${emoji} на ваше сообщение`,
      chatId,
      messageId,
      data: {
        chatId: chatId.toString(),
        messageId: messageId.toString(),
        emoji,
      },
    });
  }

  /**
   * Отправка уведомления через WebSocket
   */
  private async sendWebSocketNotification(payload: NotificationPayload): Promise<void> {
    // Эмитим событие для WebSocket gateway
    this.eventEmitter.emit('websocket.notification', {
      userId: payload.userId.toString(),
      type: 'notification',
      data: payload,
    });
  }

  /**
   * Массовая отправка уведомлений
   */
  async sendBulkNotifications(notifications: NotificationPayload[]): Promise<void> {
    const promises = notifications.map(notification =>
      this.sendNotification(notification).catch(error => {
        this.logger.error(`Failed to send notification to user ${notification.userId}:`, error);
      }),
    );

    await Promise.allSettled(promises);
  }
}
