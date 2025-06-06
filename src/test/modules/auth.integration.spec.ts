import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AuthService } from '../../modules/auth/auth.service';
import { AuthController } from '../../modules/auth/auth.controller';
import { SupabaseAuthService } from '../../libs/supabase/auth/supabase-auth.service';
import { PrismaService } from '../../libs/supabase/db/prisma.service';
import { DatabaseTestSetup, TestDataFixtures } from '../setup/database-setup';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

describe('Auth Module Integration Tests', () => {
  let app: INestApplication;
  let authService: AuthService;
  let authController: AuthController;
  let prisma: PrismaService;
  let dbSetup: DatabaseTestSetup;
  let testData: TestDataFixtures;

  // Mock Supabase Auth Service
  const mockSupabaseAuthService = {
    signUp: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    getUser: jest.fn(),
    refreshSession: jest.fn(),
    signInWithOAuth: jest.fn(),
  };
  beforeAll(async () => {
    // Setup test database
    dbSetup = DatabaseTestSetup.getInstance();
    await dbSetup.setupDatabase();
    prisma = dbSetup.getPrismaClient() as PrismaService;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: SupabaseAuthService,
          useValue: mockSupabaseAuthService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
    authController = moduleFixture.get<AuthController>(AuthController);

    // Seed test data
    testData = await dbSetup.seedTestData();
  }, 5000); // 5 second timeout for database setup

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Clean database except for seed data
    await prisma.userCrypto.deleteMany();
    await prisma.userSettings.deleteMany();
  });
  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await dbSetup.teardownDatabase();
  });

  describe('AuthService', () => {
    describe('register', () => {
      it('should successfully register a new user', async () => {
        // Arrange
        const email = 'newuser@example.com';
        const password = 'password123';
        const username = 'newuser';

        const mockSupabaseUser = { id: 'supabase-123', email };
        const mockSession = { access_token: 'token123', refresh_token: 'refresh123' };

        mockSupabaseAuthService.signUp.mockResolvedValue({
          user: mockSupabaseUser,
          session: mockSession,
        });

        // Act
        const result = await authService.register(email, password, username);

        // Assert
        expect(mockSupabaseAuthService.signUp).toHaveBeenCalledWith(email, password);
        expect(result.user).toBeDefined();
        expect(result.user.email).toBe(email);
        expect(result.user.username).toBe(username);
        expect(result.session).toBe(mockSession);

        // Verify user was created in database
        const dbUser = await prisma.user.findUnique({ where: { email } });
        expect(dbUser).toBeDefined();
        expect(dbUser?.username).toBe(username);
      });

      it('should throw ConflictException if email already exists', async () => {
        // Arrange
        const existingUser = testData.users.testUser1;

        // Act & Assert
        await expect(
          authService.register(existingUser.email, 'password123', 'newusername'),
        ).rejects.toThrow(ConflictException);

        expect(mockSupabaseAuthService.signUp).not.toHaveBeenCalled();
      });

      it('should handle Supabase registration failure', async () => {
        // Arrange
        mockSupabaseAuthService.signUp.mockResolvedValue(undefined);

        // Act & Assert
        await expect(
          authService.register('test@example.com', 'password123', 'testuser'),
        ).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('login', () => {
      it('should successfully login an existing user', async () => {
        // Arrange
        const user = testData.users.testUser1;
        const password = 'password123';

        const mockSupabaseUser = { id: 'supabase-123', email: user.email };
        const mockSession = { access_token: 'token123', refresh_token: 'refresh123' };

        mockSupabaseAuthService.signIn.mockResolvedValue({
          user: mockSupabaseUser,
          session: mockSession,
        });

        // Act
        const result = await authService.login(user.email, password);

        // Assert
        expect(mockSupabaseAuthService.signIn).toHaveBeenCalledWith(user.email, password);
        expect(result.user.id).toBe(user.id);
        expect(result.user.email).toBe(user.email);
        expect(result.session).toBe(mockSession);
      });

      it('should throw UnauthorizedException for invalid credentials', async () => {
        // Arrange
        mockSupabaseAuthService.signIn.mockResolvedValue(undefined);

        // Act & Assert
        await expect(authService.login('invalid@example.com', 'wrongpassword')).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('should throw UnauthorizedException if user not found in database', async () => {
        // Arrange
        const mockSupabaseUser = { id: 'supabase-123', email: 'notindb@example.com' };
        const mockSession = { access_token: 'token123', refresh_token: 'refresh123' };

        mockSupabaseAuthService.signIn.mockResolvedValue({
          user: mockSupabaseUser,
          session: mockSession,
        });

        // Act & Assert
        await expect(authService.login('notindb@example.com', 'password123')).rejects.toThrow(
          UnauthorizedException,
        );
      });
    });

    describe('logout', () => {
      it('should successfully logout user', async () => {
        // Arrange
        const jwt = 'valid-jwt-token';
        mockSupabaseAuthService.signOut.mockResolvedValue({ message: 'Signed out successfully' });

        // Act
        const result = await authService.logout(jwt);

        // Assert
        expect(mockSupabaseAuthService.signOut).toHaveBeenCalledWith(jwt);
        expect(result.message).toBe('Logout successful');
      });

      it('should handle Supabase logout failure', async () => {
        // Arrange
        const jwt = 'invalid-jwt-token';
        mockSupabaseAuthService.signOut.mockResolvedValue(undefined);

        // Act & Assert
        await expect(authService.logout(jwt)).rejects.toThrow();
      });
    });

    describe('getUserProfile', () => {
      it('should successfully get user profile', async () => {
        // Arrange
        const user = testData.users.testUser1;
        const jwt = 'valid-jwt-token';

        const mockSupabaseUser = { id: 'supabase-123', email: user.email };
        mockSupabaseAuthService.getUser.mockResolvedValue(mockSupabaseUser);

        // Act
        const result = await authService.getUserProfile(jwt);

        // Assert
        expect(mockSupabaseAuthService.getUser).toHaveBeenCalledWith(jwt);
        expect(result.id).toBe(user.id);
        expect(result.email).toBe(user.email);
        expect(result.supabaseUser).toBe(mockSupabaseUser);
      });

      it('should throw UnauthorizedException for invalid token', async () => {
        // Arrange
        const jwt = 'invalid-jwt-token';
        mockSupabaseAuthService.getUser.mockResolvedValue(null);

        // Act & Assert
        await expect(authService.getUserProfile(jwt)).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('refresh', () => {
      it('should successfully refresh session', async () => {
        // Arrange
        const user = testData.users.testUser1;
        const refreshToken = 'refresh-token';

        const mockUser = { email: user.email };
        const mockSession = { access_token: 'new-token', refresh_token: 'new-refresh' };

        mockSupabaseAuthService.refreshSession.mockResolvedValue({
          user: mockUser,
          session: mockSession,
        });

        // Act
        const result = await authService.refresh(refreshToken);

        // Assert
        expect(mockSupabaseAuthService.refreshSession).toHaveBeenCalledWith(refreshToken);
        expect(result.user.id).toBe(user.id);
        expect(result.session).toBe(mockSession);
      });
    });

    describe('socialSignIn', () => {
      it('should successfully initiate social sign in', async () => {
        // Arrange
        const provider = 'google';
        const mockUrl = 'https://accounts.google.com/oauth/authorize?...';

        mockSupabaseAuthService.signInWithOAuth.mockResolvedValue({
          provider: 'google',
          url: mockUrl,
        });

        // Act
        const result = await authService.socialSignIn(provider);

        // Assert
        expect(mockSupabaseAuthService.signInWithOAuth).toHaveBeenCalledWith(provider);
        expect(result.url).toBe(mockUrl);
      });

      it('should throw UnauthorizedException for failed OAuth initiation', async () => {
        // Arrange
        const provider = 'twitter';
        mockSupabaseAuthService.signInWithOAuth.mockResolvedValue(undefined);

        // Act & Assert
        await expect(authService.socialSignIn(provider)).rejects.toThrow(UnauthorizedException);
      });
    });
  });

  describe('Database Integration', () => {
    it('should create user with proper role relationship', async () => {
      // Arrange
      const email = 'dbtest@example.com';
      const username = 'dbtest';
      const mockSupabaseUser = { id: 'supabase-db', email };
      const mockSession = { access_token: 'token', refresh_token: 'refresh' };

      mockSupabaseAuthService.signUp.mockResolvedValue({
        user: mockSupabaseUser,
        session: mockSession,
      });

      // Act
      await authService.register(email, 'password123', username);

      // Assert
      const user = await prisma.user.findUnique({
        where: { email },
        include: { role: true },
      });

      expect(user).toBeDefined();
      expect(user?.role).toBeDefined();
      expect(user?.role.name).toBe('USER');
    });

    it('should handle concurrent registration attempts', async () => {
      // Arrange
      const email = 'concurrent@example.com';
      const mockSupabaseUser = { id: 'supabase-concurrent', email };
      const mockSession = { access_token: 'token', refresh_token: 'refresh' };

      mockSupabaseAuthService.signUp.mockResolvedValue({
        user: mockSupabaseUser,
        session: mockSession,
      });

      // Act
      const promises = [
        authService.register(email, 'password123', 'user1'),
        authService.register(email, 'password123', 'user2'),
      ];

      // Assert
      const results = await Promise.allSettled(promises);

      // One should succeed, one should fail with ConflictException
      const succeeded = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);

      if (failed[0].status === 'rejected') {
        expect(failed[0].reason).toBeInstanceOf(ConflictException);
      }
    });

    it('should properly clean up data on registration failure', async () => {
      // Arrange
      const email = 'cleanup@example.com';
      const username = 'cleanup';

      // Mock Supabase success but cause DB failure by using invalid role
      mockSupabaseAuthService.signUp.mockResolvedValue({
        user: { id: 'supabase-cleanup', email },
        session: { access_token: 'token', refresh_token: 'refresh' },
      });

      // Temporarily delete all roles to cause DB constraint failure
      await prisma.roleGlobally.deleteMany();

      // Act & Assert
      await expect(authService.register(email, 'password123', username)).rejects.toThrow();

      // Verify user was not created
      const user = await prisma.user.findUnique({ where: { email } });
      expect(user).toBeNull();

      // Restore roles for other tests
      await dbSetup.seedTestData();
    });
  });

  describe('Performance Tests', () => {
    it('should handle bulk user operations efficiently', async () => {
      // Create multiple users and measure performance
      const startTime = Date.now();
      const userCount = 10;

      const promises = Array.from({ length: userCount }, (_, i) => {
        mockSupabaseAuthService.signUp.mockResolvedValue({
          user: { id: `supabase-bulk-${i}`, email: `bulk${i}@example.com` },
          session: { access_token: `token${i}`, refresh_token: `refresh${i}` },
        });

        return authService.register(`bulk${i}@example.com`, 'password123', `bulk${i}`);
      });

      await Promise.all(promises);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should complete within reasonable time (adjust based on your requirements)
      expect(executionTime).toBeLessThan(5000); // 5 seconds

      // Verify all users were created
      const users = await prisma.user.findMany({
        where: {
          email: {
            startsWith: 'bulk',
          },
        },
      });

      expect(users).toHaveLength(userCount);
    });
  });
});
