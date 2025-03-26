import { NestFactory } from '@nestjs/core';
import { 
  INestApplication, 
  Type, 
  ValidationPipe, 
  Logger, 
  RequestMethod, 
  VersioningType 
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { config } from 'dotenv';
import compression from 'compression';
import { readFileSync } from 'fs';
import cluster from 'node:cluster';
import * as os from 'os';
import * as winston from 'winston';

export interface BootstrapOptions {
  port?: number;
  logger?: winston.Logger;
  swaggerPath?: string;
  globalPrefix?: string;
  beforeStart?: (app: INestApplication) => Promise<void>;
  afterStart?: (app: INestApplication) => Promise<void>;
  ssl?: { cert: string; key: string };
  clustering?: boolean;
  healthCheckPath?: string;
  rateLimit?: { ttl: number; limit: number; message?: string };
  cors?: { origin?: string | string[] | boolean; methods?: string[]; credentials?: boolean };
}

export async function bootstrap(
  module: Type<any>,
  options: BootstrapOptions = {}
): Promise<INestApplication> {
  config();
  const configService = new ConfigService();

  const {
    port = configService.get<number>('PORT', 3000),
    logger = createDefaultLogger(),
    swaggerPath = '/api-docs',
    globalPrefix = '/api',
    beforeStart,
    afterStart,
    ssl,
    clustering = false,
    healthCheckPath = '/health',
    rateLimit = { ttl: 60, limit: 100 },
    cors = {},
  } = options;

  const isProduction = configService.get('NODE_ENV') === 'production';

  try {
    const app = await NestFactory.create(module, {
      logger,
      httpsOptions: ssl ? {
        cert: readFileSync(ssl.cert),
        key: readFileSync(ssl.key),
      } : undefined,
    });

    app.use(helmet({ hsts: { maxAge: 31536000 } }));
    app.use(compression({ threshold: 1024 }));

    app.enableCors({
      origin: cors.origin ?? (isProduction ? false : true),
      methods: cors.methods || ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: cors.credentials ?? true,
    });

    app.setGlobalPrefix(globalPrefix, {
      exclude: [{ path: healthCheckPath, method: RequestMethod.GET }],
    });
    app.enableVersioning({ type: VersioningType.URI });
    app.useGlobalPipes(new ValidationPipe({ 
      transform: true, 
      whitelist: true,
    }));

    if (!isProduction) {
      const swaggerConfig = new DocumentBuilder()
        .setTitle(configService.get('APP_NAME', 'API'))
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, swaggerConfig);
      SwaggerModule.setup(swaggerPath, app, document);
    }

    app.getHttpAdapter().get(healthCheckPath, (_req, res) =>
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      })
    );

    if (beforeStart) await beforeStart(app);
    await app.listen(port);
    if (afterStart) await afterStart(app);

    Logger.log(`Application running on: ${await app.getUrl()}`, 'Bootstrap');
    enableGracefulShutdown(app);

    return app;
  } catch (error) {
    Logger.error('Bootstrap failed:', error);
    throw error;
  }
}

export async function runBootstrap(module: Type<any>, options: BootstrapOptions = {}) {
  const logger = options.logger || createDefaultLogger();

  if (options.clustering && cluster.isPrimary) {
    const numWorkers = Math.min(os.cpus().length, 4);
    logger.log(`Starting ${numWorkers} workers...`, 'Bootstrap');

    for (let i = 0; i < numWorkers; i++) {
      cluster.fork();
    }

    cluster.on('exit', (worker, code) => {
      logger.warn(`Worker ${worker.process.pid} died (code: ${code}). Restarting...`);
      cluster.fork();
    });
  } else {
    await bootstrap(module, options).catch((err) => {
      logger.error('Application failed to start:', err);
      process.exit(1);
    });
  }
}

function enableGracefulShutdown(app: INestApplication) {
  const logger = app.get(Logger);
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}. Shutting down...`);
    await app.close().catch((err) => logger.error('Shutdown error:', err));
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
  });
}

function createDefaultLogger(): winston.Logger {
  return winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      }),
      new winston.transports.File({ 
        filename: 'logs/error.log', 
        level: 'error',
        maxsize: 5242880,
      }),
    ],
  });
}