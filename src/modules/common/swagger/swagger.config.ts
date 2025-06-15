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
        'Advanced Multimedia Platform API - Полнофункциональная платформа для работы с мультимедиа контентом',
      )
      .setVersion('1.0.0')
      .setContact('AWE Team', 'https://github.com/awe-team', 'support@awe-platform.com')
      .setLicense('UNLICENSED', '')
      .addServer('http://localhost:3001', 'Development server')
      .addServer('https://api.awe-platform.com', 'Production server')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Auth', 'Аутентификация и авторизация')
      .addTag('Users', 'Управление пользователями')
      .addTag('Forum', 'Форум и обсуждения')
      .addTag('Messenger', 'Система сообщений')
      .addTag('Media Assets', 'Управление медиа ресурсами')
      .addTag('Video Hosting', 'Хостинг видео и управление контентом')
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
        .swagger-ui .info .title { color: #3b82f6; }
        .swagger-ui .scheme-container { background: #f8fafc; }
        .swagger-ui .info .description { font-size: 14px; line-height: 1.5; }
        .swagger-ui .info { margin: 20px 0; }
        .swagger-ui .scheme-container .schemes { 
          display: flex; 
          justify-content: center; 
        }
      `,
      customSiteTitle: 'AWE API Documentation',
      customfavIcon: '/favicon.ico',
    });
  }
}
