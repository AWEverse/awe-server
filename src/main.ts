import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BigIntInterceptor } from './modules/common/interceptors/bigint.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { ready } from 'libsodium-wrappers';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger, ValidationError } from '@nestjs/common';

const compression = require('compression');
const helmet = require('helmet');

(async () => {
  const logger = new Logger('Bootstrap');

  try {
    await ready;

    const app = await NestFactory.create(AppModule, {
      logger:
        process.env.NODE_ENV === 'production'
          ? ['error', 'warn']
          : ['log', 'error', 'warn', 'debug', 'verbose'],
      bufferLogs: true,
      cors: false,
    });

    app.use(
      compression({
        level: 6,
        threshold: 1024, // 1KB
        filter: (req: { headers: { [x: string]: any } }, res: any) => {
          if (req.headers['x-no-compression']) {
            return false;
          }
          return compression.filter(req, res);
        },
      }),
    );

    app.use(
      helmet({
        contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
      }),
    );

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
        disableErrorMessages: process.env.NODE_ENV === 'production',
        enableDebugMessages: false,
        exceptionFactory: (errors: ValidationError[]) => {
          logger.error('Validation failed', errors);
          throw new Error(
            `Validation failed: ${JSON.stringify(errors, (key, value) =>
              typeof value === 'bigint' ? value.toString() : value,
            )}`,
          );
        },
      }),
    );

    app.useGlobalInterceptors(new BigIntInterceptor());

    app.enableCors({
      origin:
        process.env.NODE_ENV === 'production'
          ? process.env.FRONTEND_URL?.split(',') || false
          : true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400, // 24 часа
    });

    if (process.env.NODE_ENV !== 'production') {
      const config = new DocumentBuilder()
        .setTitle('AWE API')
        .setDescription('Advanced Multimedia Platform API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api', app, document);
    }

    const server = app.getHttpServer();
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    const port = process.env.PORT ?? 3000;
    await app.listen(port, '0.0.0.0');

    logger.log(`🚀 Application is running on: http://localhost:${port}`);
    if (process.env.NODE_ENV !== 'production') {
      logger.log(`📖 Swagger is available on: http://localhost:${port}/api`);
    }
  } catch (error) {
    logger.error('Application failed to start', error.stack);
    throw error;
  }
})();
