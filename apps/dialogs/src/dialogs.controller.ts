import { Controller, Get } from '@nestjs/common';
import { DialogsService } from './dialogs.service';

@Controller()
export class DialogsController {
  constructor(private readonly dialogsService: DialogsService) {}

  @Get()
  getHello(): string {
    return this.dialogsService.getHello();
  }
}
