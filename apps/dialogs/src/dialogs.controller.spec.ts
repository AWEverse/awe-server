import { Test, TestingModule } from '@nestjs/testing';
import { DialogsController } from './dialogs.controller';
import { DialogsService } from './dialogs.service';

describe('DialogsController', () => {
  let dialogsController: DialogsController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [DialogsController],
      providers: [DialogsService],
    }).compile();

    dialogsController = app.get<DialogsController>(DialogsController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(dialogsController.getHello()).toBe('Hello World!');
    });
  });
});
