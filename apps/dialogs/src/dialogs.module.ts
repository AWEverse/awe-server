import { Module } from '@nestjs/common';
import { DialogsController } from './dialogs.controller';
import { DialogsService } from './dialogs.service';

@Module({
  imports: [],
  controllers: [DialogsController],
  providers: [DialogsService],
})
export class DialogsModule {}
