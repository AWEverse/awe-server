import { Controller, Get } from '@nestjs/common';
import { ForumService } from './forum.service';

@Controller()
export class ForumController {
  constructor(private readonly forumService: ForumService) {}

  @Get()
  getHello(): string {
    return this.forumService.getHello();
  }
}
