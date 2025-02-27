import { Injectable } from '@nestjs/common';

@Injectable()
export class ThreadsService {
  getHello(): string {
    return 'Hello World!';
  }
}
