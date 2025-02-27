import { Controller, Get } from '@nestjs/common';
import { ThreadsService } from './threads.service';

@Controller()
export class ThreadsController {
  constructor(private readonly threadsService: ThreadsService) {}

  @Get()
  getHello(): string {
    return this.threadsService.getHello();
  }
}
