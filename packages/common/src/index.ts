import { NestFactory } from '@nestjs/core';
import { INestApplication, Type, ValidationPipe, Logger, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { config } from 'dotenv';
import morgan from 'morgan';

// Load environment variables early
config();

export interface BootstrapOptions {
  port?: number;
  logger?: boolean;
  swaggerPath?: string;
  swaggerEnabled?: boolean;
  globalPrefix?: string;
  beforeStart?: (app: INestApplication) => Promise<void> | void;
  afterStart?: (app: INestApplication) => Promise<void> | void;
}

export async function bootstrap(
  module: Type<any>,
  options: BootstrapOptions = {}
): Promise<INestApplication> {
  const {
    port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    logger = true,
    swaggerPath = '/api-docs',
    swaggerEnabled = process.env.NODE_ENV !== 'production',
    globalPrefix = '/api',
    beforeStart,
    afterStart,
  } = options;

  const app = await NestFactory.create(module, {
    logger: logger ? ['error', 'warn', 'log', 'debug'] : false,
  });

  const configService = app.get(ConfigService);
  const appName = configService.get<string>('APP_NAME', module.name || 'NestApp');

  app.setGlobalPrefix(globalPrefix, {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });

  app.use(helmet());
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN', '*'),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });

  app.use(compression());


  app.use(
    morgan('combined', {
      stream: { write: (message: string) => Logger.log(message.trim(), 'HTTP') },
    })
  );

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  );

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(`${appName} API`)
      .setDescription(`API documentation for ${appName}`)
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerPath, app, document);
    Logger.log(`Swagger UI available at ${globalPrefix}${swaggerPath}`, 'Bootstrap');
  }

  if (beforeStart) await beforeStart(app);

  await app.listen(port);
  Logger.log(`Application "${appName}" is running on: ${await app.getUrl()}`, 'Bootstrap');

  enableGracefulShutdown(app);

  if (afterStart) await afterStart(app);

  return app;
}

function enableGracefulShutdown(app: INestApplication) {
  const logger = new Logger('Shutdown');

  process.on('SIGTERM', async () => {
    logger.log('Received SIGTERM, shutting down gracefully...');
    await app.close();
    process.exit(0);

  });
  process.on('SIGINT', async () => {
    logger.log('Received SIGINT, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });
}

export function runBootstrap(module: Type<any>, options?: BootstrapOptions) {
  bootstrap(module, options).catch((err) => {
    Logger.error('Bootstrap failed:', err, 'Bootstrap');
    process.exit(1);
  });
}