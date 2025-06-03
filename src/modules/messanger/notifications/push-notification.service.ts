import { Injectable, Logger } from '@nestjs/common';

export interface PushNotificationPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  /**
   * Отправка push уведомления
   */
  async sendPushNotification(payload: PushNotificationPayload): Promise<boolean> {
    try {
      this.logger.debug(`Sending push notification: ${payload.title}`);

      // Здесь можно интегрировать Firebase Cloud Messaging (FCM) или другой сервис
      // Пример интеграции с FCM:
      /*
      const message = {
        token: payload.token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
        android: {
          notification: {
            sound: payload.sound || 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              badge: payload.badge || 0,
              sound: payload.sound || 'default',
            },
          },
        },
      };

      await admin.messaging().send(message);
      */

      // Для демонстрации просто логируем
      this.logger.log(`Push notification would be sent: ${JSON.stringify(payload)}`);

      return true;
    } catch (error) {
      this.logger.error('Error sending push notification:', error);
      return false;
    }
  }

  /**
   * Отправка push уведомлений для группы токенов
   */
  async sendBulkPushNotifications(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<{ successCount: number; failureCount: number }> {
    let successCount = 0;
    let failureCount = 0;

    const promises = tokens.map(async token => {
      try {
        const success = await this.sendPushNotification({
          token,
          title,
          body,
          data,
        });

        if (success) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (error) {
        failureCount++;
        this.logger.error(`Failed to send push to token ${token}:`, error);
      }
    });

    await Promise.allSettled(promises);

    return { successCount, failureCount };
  }

  /**
   * Регистрация токена устройства
   */
  async registerDeviceToken(
    userId: bigint,
    token: string,
    platform: 'ios' | 'android',
  ): Promise<void> {
    try {
      // Здесь можно сохранить токен в базе данных
      this.logger.debug(`Registering device token for user ${userId}: ${platform}`);

      // Пример сохранения в БД:
      // await this.prisma.deviceToken.upsert({
      //   where: { userId_token: { userId, token } },
      //   update: { platform, updatedAt: new Date() },
      //   create: { userId, token, platform, createdAt: new Date() }
      // });
    } catch (error) {
      this.logger.error('Error registering device token:', error);
    }
  }

  /**
   * Удаление токена устройства
   */
  async unregisterDeviceToken(userId: bigint, token: string): Promise<void> {
    try {
      this.logger.debug(`Unregistering device token for user ${userId}`);

      // Пример удаления из БД:
      // await this.prisma.deviceToken.deleteMany({
      //   where: { userId, token }
      // });
    } catch (error) {
      this.logger.error('Error unregistering device token:', error);
    }
  }
}
