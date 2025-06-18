import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export class SwaggerConfig {
  static setup(app: INestApplication): void {
    if (process.env.NODE_ENV === 'production') {
      return;
    }
    const config = new DocumentBuilder()
      .setTitle('AWE API')
      .setDescription(
        'Advanced Multimedia Platform API - Повнофункціональна платформа для роботи з мультимедіа контентом',
      )
      .setVersion('2.0.0')
      .setContact('AWE Team', 'https://github.com/awe-team', 'support@awe-platform.com')
      .setLicense('UNLICENSED', '')
      .addServer('http://localhost:3001', 'Сервер розробки')
      .addServer('https://api.awe-platform.com', 'Продакшн сервер')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Введіть JWT токен',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Auth', 'Аутентифікація та авторизація')
      .addTag('Users', 'Управління користувачами')
      .addTag('Forum', 'Форум та обговорення')
      .addTag('Messenger', 'Система повідомлень')
      .addTag('Media Assets', 'Управління медіа ресурсами')
      .addTag('Video Hosting', 'Хостинг відео та управління контентом')
      .addTag('Common', 'Загальні утиліти та сервіси')
      .addTag('Security', 'Безпека та моніторинг')
      .addTag('Analytics', 'Аналітика та статистика')
      .addTag('Notifications', 'Сповіщення та алерти')
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
      deepScanRoutes: true,
    });

    SwaggerModule.setup('api', app, document, {
      explorer: true,
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        filter: true,
        showRequestHeaders: true,
        tryItOutEnabled: true,
      },
      customCss: `
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info .title { color: #3b82f6; font-size: 2.5rem; font-weight: bold; }
        .swagger-ui .scheme-container { background: #f8fafc; border-radius: 8px; margin: 20px 0; }
        .swagger-ui .info .description { font-size: 16px; line-height: 1.6; color: #4a5568; }
        .swagger-ui .info { margin: 30px 0; }
        .swagger-ui .scheme-container .schemes { 
          display: flex; 
          justify-content: center; 
          gap: 10px;
        }
        .swagger-ui .info .title small { 
          font-size: 0.6em; 
          color: #718096; 
          font-weight: normal;
        }
        .swagger-ui .opblock-summary { 
          font-weight: 600;
        }
        .swagger-ui .opblock.opblock-post { 
          border-color: #48bb78; 
        }
        .swagger-ui .opblock.opblock-get { 
          border-color: #4299e1; 
        }
        .swagger-ui .opblock.opblock-put { 
          border-color: #ed8936; 
        }
        .swagger-ui .opblock.opblock-delete { 
          border-color: #f56565; 
        }
        .swagger-ui .btn.authorize { 
          background: #3b82f6; 
          border-color: #3b82f6;
        }
        .swagger-ui .auth-wrapper .auth-container { 
          border: 2px solid #e2e8f0; 
          border-radius: 8px; 
        }
      `,
      customSiteTitle: 'AWE API - Документація',
      customfavIcon: '/favicon.ico',
    });
  }
}
