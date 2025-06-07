// Test database setup utilities
import { PrismaClient } from 'generated/client';
import { randomBytes } from 'crypto';

export class DatabaseTestSetup {
  private static instance: DatabaseTestSetup;
  private prisma: PrismaClient;
  private testDatabaseUrl: string;

  private constructor() {
    // Generate unique test database name
    const testSuffix = randomBytes(8).toString('hex');
    this.testDatabaseUrl = `postgres://prisma.vvlasqnbwgvsbzgqwnds:2003motoblok2003@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;

    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: this.testDatabaseUrl,
        },
      },
      log: ['warn', 'error'],
    });
  }

  static getInstance(): DatabaseTestSetup {
    if (!DatabaseTestSetup.instance) {
      DatabaseTestSetup.instance = new DatabaseTestSetup();
    }
    return DatabaseTestSetup.instance;
  }

  getPrismaClient(): PrismaClient {
    return this.prisma;
  }

  async setupDatabase(): Promise<void> {
    try {
      await this.prisma.$connect(); // Run migrations
      const { execSync } = require('child_process');
      const isWindows = process.platform === 'win32';

      if (isWindows) {
        // For Windows PowerShell, use environment variable syntax
        execSync(`$env:DATABASE_URL="${this.testDatabaseUrl}"; npx prisma migrate deploy`, {
          stdio: 'inherit',
          shell: 'powershell.exe',
          env: { ...process.env, DATABASE_URL: this.testDatabaseUrl },
        });
      } else {
        // For Unix/Linux systems
        execSync(`DATABASE_URL="${this.testDatabaseUrl}" npx prisma migrate deploy`, {
          stdio: 'inherit',
          env: { ...process.env, DATABASE_URL: this.testDatabaseUrl },
        });
      }

      console.log('✅ Test database setup complete');
    } catch (error) {
      console.error('❌ Failed to setup test database:', error);
      throw error;
    }
  }

  async cleanDatabase(): Promise<void> {
    try {
      // Get all table names
      const tables = await this.prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public';
      `;

      // Disable foreign key checks and truncate all tables
      for (const table of tables) {
        if (!table.tablename.startsWith('_prisma')) {
          await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table.tablename}" CASCADE;`);
        }
      }

      // Reset sequences
      const sequences = await this.prisma.$queryRaw<Array<{ sequence_name: string }>>`
        SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public';
      `;

      for (const seq of sequences) {
        await this.prisma.$executeRawUnsafe(
          `ALTER SEQUENCE "${seq.sequence_name}" RESTART WITH 1;`,
        );
      }

      console.log('✅ Test database cleaned');
    } catch (error) {
      console.error('❌ Failed to clean test database:', error);
      throw error;
    }
  }

  async teardownDatabase(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      console.log('✅ Test database connection closed');
    } catch (error) {
      console.error('❌ Failed to close test database connection:', error);
    }
  }

  async seedTestData(): Promise<TestDataFixtures> {
    try {
      // Create test role
      const userRole = await this.prisma.roleGlobally.upsert({
        where: { name: 'USER' },
        update: {},
        create: {
          name: 'USER',
          permissions: ['READ_CONTENT', 'CREATE_CONTENT'],
        },
      });

      const adminRole = await this.prisma.roleGlobally.upsert({
        where: { name: 'ADMIN' },
        update: {},
        create: {
          name: 'ADMIN',
          permissions: ['ALL'],
        },
      });

      // Create test users
      const testUser1 = await this.prisma.user.create({
        data: {
          email: 'test1@example.com',
          username: 'testuser1',
          fullName: 'Test User 1',
          roleId: userRole.id,
          status: 'ACTIVE',
        },
      });

      const testUser2 = await this.prisma.user.create({
        data: {
          email: 'test2@example.com',
          username: 'testuser2',
          fullName: 'Test User 2',
          roleId: userRole.id,
          status: 'ACTIVE',
        },
      });

      const adminUser = await this.prisma.user.create({
        data: {
          email: 'admin@example.com',
          username: 'admin',
          fullName: 'Administrator',
          roleId: adminRole.id,
          status: 'ACTIVE',
        },
      });

      // Create test chat
      const testChat = await this.prisma.chat.create({
        data: {
          type: 'PRIVATE',
          title: 'Test Chat',
          description: 'Test chat for integration tests',
          createdById: BigInt(testUser1.id),
          memberCount: 2,
        },
      });

      // Add participants to chat
      await this.prisma.chatParticipant.createMany({
        data: [
          {
            chatId: testChat.id,
            userId: BigInt(testUser1.id),
            role: 'OWNER',
            joinedAt: new Date(),
          },
          {
            chatId: testChat.id,
            userId: testUser2.id,
            role: 'MEMBER',
            joinedAt: new Date(),
          },
        ],
      });

      // Create test forum category
      const forumCategory = await this.prisma.forumCategory.create({
        data: {
          name: 'General Discussion',
          description: 'General discussion category',
          slug: 'general',
        },
      });

      console.log('✅ Test data seeded');

      return {
        users: { testUser1, testUser2, adminUser },
        roles: { userRole, adminRole },
        chat: testChat,
        forumCategory,
      };
    } catch (error) {
      console.error('❌ Failed to seed test data:', error);
      throw error;
    }
  }
}

export interface TestDataFixtures {
  users: {
    testUser1: any;
    testUser2: any;
    adminUser: any;
  };
  roles: {
    userRole: any;
    adminRole: any;
  };
  chat: any;
  forumCategory: any;
}

// Helper functions for creating test data
export const createTestUser = async (prisma: PrismaClient, overrides: Partial<any> = {}) => {
  const defaultRole = await prisma.roleGlobally.findFirst({ where: { name: 'USER' } });

  return prisma.user.create({
    data: {
      email: `test${Date.now()}@example.com`,
      username: `testuser${Date.now()}`,
      fullName: 'Test User',
      roleId: defaultRole?.id,
      status: 'ACTIVE',
      ...overrides,
    },
  });
};

export const createTestChat = async (
  prisma: PrismaClient,
  creatorId: bigint,
  participantIds: bigint[] = [],
) => {
  const chat = await prisma.chat.create({
    data: {
      type: 'GROUP',
      title: `Test Chat ${Date.now()}`,
      createdBy: { connect: { id: creatorId } },
      memberCount: participantIds.length + 1,
    },
  });

  // Add creator as owner
  await prisma.chatParticipant.create({
    data: {
      chatId: chat.id,
      userId: creatorId,
      role: 'OWNER',
      joinedAt: new Date(),
    },
  });

  // Add other participants
  if (participantIds.length > 0) {
    await prisma.chatParticipant.createMany({
      data: participantIds.map(userId => ({
        chatId: chat.id,
        userId,
        role: 'MEMBER' as const,
        joinedAt: new Date(),
      })),
    });
  }

  return chat;
};
