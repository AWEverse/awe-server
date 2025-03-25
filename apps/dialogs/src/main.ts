import { NestFactory } from '@nestjs/core';
import { DialogsModule } from './dialogs.module';

async function bootstrap() {
  const app = await NestFactory.create(DialogsModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
