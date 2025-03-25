import { Injectable } from '@nestjs/common';

@Injectable()
export class DialogsService {
  getHello(): string {
    return 'Hello World!';
  }
}
