import { Injectable } from '@nestjs/common';

@Injectable()
export class ForumService {
  getHello(): string {
    return 'Hello World!';
  }
}
