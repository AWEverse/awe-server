import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
import { ExecutionContext } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  const mockAuthService = {
    register: jest.fn().mockResolvedValue({ user: { id: 1, email: 'test@mail.com' }, session: {} }),
    login: jest.fn().mockResolvedValue({ user: { id: 1, email: 'test@mail.com' }, session: {} }),
    logout: jest.fn().mockResolvedValue({ message: 'Signed out successfully' }),
    getUserProfile: jest
      .fn()
      .mockResolvedValue({ id: 1, email: 'test@mail.com', supabaseUser: {} }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: (ctx: ExecutionContext) => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should register a user', async () => {
    const result = await controller.register({
      email: 'test@mail.com',
      password: '123',
      username: 'user',
    });
    expect(result).toHaveProperty('user');
    expect(service.register).toHaveBeenCalledWith('test@mail.com', '123', 'user');
  });

  it('should login a user', async () => {
    const result = await controller.login({ email: 'test@mail.com', password: '123' });
    expect(result).toHaveProperty('user');
    expect(service.login).toHaveBeenCalledWith('test@mail.com', '123');
  });

  it('should logout a user', async () => {
    const req = { user: { access_token: 'jwt' } };
    const result = await controller.logout(req);
    expect(result).toEqual({ message: 'Signed out successfully' });
    expect(service.logout).toHaveBeenCalledWith('jwt');
  });

  it('should get user profile', async () => {
    const req = { user: { access_token: 'jwt' } };
    const result = await controller.getProfile(req);
    expect(result).toHaveProperty('email', 'test@mail.com');
    expect(service.getUserProfile).toHaveBeenCalledWith('jwt');
  });
});
