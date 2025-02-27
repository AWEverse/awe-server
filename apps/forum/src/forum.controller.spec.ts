import { Test, TestingModule } from '@nestjs/testing';
import { ForumController } from './forum.controller';
import { ForumService } from './forum.service';

describe('ForumController', () => {
  let forumController: ForumController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ForumController],
      providers: [ForumService],
    }).compile();

    forumController = app.get<ForumController>(ForumController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(forumController.getHello()).toBe('Hello World!');
    });
  });
});
