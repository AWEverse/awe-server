import { Test, TestingModule } from '@nestjs/testing';
import { ThreadsController } from './threads.controller';
import { ThreadsService } from './threads.service';

describe('ThreadsController', () => {
  let threadsController: ThreadsController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ThreadsController],
      providers: [ThreadsService],
    }).compile();

    threadsController = app.get<ThreadsController>(ThreadsController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(threadsController.getHello()).toBe('Hello World!');
    });
  });
});
