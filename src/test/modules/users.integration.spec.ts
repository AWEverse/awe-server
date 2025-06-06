import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/libs/supabase/db/prisma.service';
import { DatabaseTestSetup } from '../setup/database-setup';
import { ProfileService } from '../../src/modules/users/profile/profile.service';
import { SettingsService } from '../../src/modules/users/settings/settings.service';
import { CryptoService } from '../../src/modules/users/crypto/crypto.service';
import { UsersModule } from '../../src/modules/users/users.module';
import { User, UserSettings, UserCrypto } from '@prisma/client';

describe('Users Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let profileService: ProfileService;
  let settingsService: SettingsService;
  let cryptoService: CryptoService;
  let dbSetup: DatabaseTestSetup;

  beforeAll(async () => {
    dbSetup = new DatabaseTestSetup();
    await dbSetup.setupDatabase();

    const module: TestingModule = await Test.createTestingModule({
      imports: [UsersModule],
      providers: [PrismaService],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    prisma = module.get<PrismaService>(PrismaService);
    profileService = module.get<ProfileService>(ProfileService);
    settingsService = module.get<SettingsService>(SettingsService);
    cryptoService = module.get<CryptoService>(CryptoService);
  });

  beforeEach(async () => {
    await dbSetup.cleanupDatabase();
    await dbSetup.seedTestData();
  });

  afterAll(async () => {
    await app.close();
    await dbSetup.teardownDatabase();
  });

  describe('ProfileService', () => {
    let testUser: User;

    beforeEach(async () => {
      // Create test user
      testUser = await prisma.user.create({
        data: {
          id: BigInt('1001'),
          supabaseId: 'test-user-profile',
          email: 'profile@test.com',
          username: 'profileuser',
          fullName: 'Profile Test User',
          bio: 'Test bio',
          avatarUrl: 'https://example.com/avatar.jpg',
          bannerUrl: 'https://example.com/banner.jpg',
          color: '#FF5733',
          phoneNumber: '+1234567890',
          timezone: 'UTC',
          locale: 'en',
          flags: 5, // verified + creator
          status: 'ACTIVE',
          roleId: BigInt('1'), // USER role
        },
      });
    });

    describe('getProfile', () => {
      it('should retrieve user profile successfully', async () => {
        // Act
        const profile = await profileService.getProfile(testUser.id.toString());

        // Assert
        expect(profile).toBeDefined();
        expect(profile.id).toBe(testUser.id.toString());
        expect(profile.email).toBe(testUser.email);
        expect(profile.username).toBe(testUser.username);
        expect(profile.fullName).toBe(testUser.fullName);
        expect(profile.bio).toBe(testUser.bio);
        expect(profile.avatarUrl).toBe(testUser.avatarUrl);
        expect(profile.bannerUrl).toBe(testUser.bannerUrl);
        expect(profile.color).toBe(testUser.color);
        expect(profile.phoneNumber).toBe(testUser.phoneNumber);
        expect(profile.timezone).toBe(testUser.timezone);
        expect(profile.locale).toBe(testUser.locale);
        expect(profile.flags).toBe(testUser.flags);
        expect(profile.status).toBe(testUser.status);
      });

      it('should throw NotFoundException for non-existent user', async () => {
        // Act & Assert
        await expect(
          profileService.getProfile('999999')
        ).rejects.toThrow('User not found');
      });

      it('should handle BigInt fields correctly', async () => {
        // Arrange - Update user with some statistics
        await prisma.user.update({
          where: { id: testUser.id },
          data: {
            subscribersCount: 1000,
            subscriptionsCount: 50,
            videosCount: 25,
            postsCount: 100,
            totalViews: BigInt('1000000'),
            totalLikes: BigInt('50000'),
            reputation: 9500,
          },
        });

        // Act
        const profile = await profileService.getProfile(testUser.id.toString());

        // Assert
        expect(profile.subscribersCount).toBe(1000);
        expect(profile.subscriptionsCount).toBe(50);
        expect(profile.videosCount).toBe(25);
        expect(profile.postsCount).toBe(100);
        expect(profile.totalViews).toBe('1000000');
        expect(profile.totalLikes).toBe('50000');
        expect(profile.reputation).toBe(9500);
      });
    });

    describe('updateProfile', () => {
      it('should update user profile successfully', async () => {
        // Arrange
        const updateData = {
          fullName: 'Updated Full Name',
          bio: 'Updated bio description',
          avatarUrl: 'https://example.com/new-avatar.jpg',
          bannerUrl: 'https://example.com/new-banner.jpg',
          color: '#00FF00',
          timezone: 'America/New_York',
          locale: 'en-US',
        };

        // Act
        const updatedProfile = await profileService.updateProfile(
          testUser.id.toString(),
          updateData
        );

        // Assert
        expect(updatedProfile.fullName).toBe(updateData.fullName);
        expect(updatedProfile.bio).toBe(updateData.bio);
        expect(updatedProfile.avatarUrl).toBe(updateData.avatarUrl);
        expect(updatedProfile.bannerUrl).toBe(updateData.bannerUrl);
        expect(updatedProfile.color).toBe(updateData.color);
        expect(updatedProfile.timezone).toBe(updateData.timezone);
        expect(updatedProfile.locale).toBe(updateData.locale);

        // Verify in database
        const dbUser = await prisma.user.findUnique({
          where: { id: testUser.id },
        });
        expect(dbUser!.fullName).toBe(updateData.fullName);
        expect(dbUser!.bio).toBe(updateData.bio);
      });

      it('should handle partial updates', async () => {
        // Arrange
        const updateData = {
          bio: 'Only updating bio',
        };

        // Act
        const updatedProfile = await profileService.updateProfile(
          testUser.id.toString(),
          updateData
        );

        // Assert
        expect(updatedProfile.bio).toBe(updateData.bio);
        expect(updatedProfile.username).toBe(testUser.username); // Should remain unchanged
        expect(updatedProfile.email).toBe(testUser.email); // Should remain unchanged
      });

      it('should validate color format', async () => {
        // Act & Assert
        await expect(
          profileService.updateProfile(testUser.id.toString(), {
            color: 'invalid-color',
          })
        ).rejects.toThrow();
      });

      it('should validate timezone', async () => {
        // Act & Assert
        await expect(
          profileService.updateProfile(testUser.id.toString(), {
            timezone: 'Invalid/Timezone',
          })
        ).rejects.toThrow();
      });
    });

    describe('searchProfiles', () => {
      beforeEach(async () => {
        // Create additional test users for search
        await prisma.user.createMany({
          data: [
            {
              id: BigInt('1002'),
              supabaseId: 'search-user-1',
              email: 'john.doe@test.com',
              username: 'johndoe',
              fullName: 'John Doe',
              bio: 'Software developer',
              roleId: BigInt('1'),
            },
            {
              id: BigInt('1003'),
              supabaseId: 'search-user-2',
              email: 'jane.smith@test.com',
              username: 'janesmith',
              fullName: 'Jane Smith',
              bio: 'UI/UX designer',
              roleId: BigInt('1'),
            },
            {
              id: BigInt('1004'),
              supabaseId: 'search-user-3',
              email: 'developer@test.com',
              username: 'devuser',
              fullName: 'Dev User',
              bio: 'Backend developer',
              roleId: BigInt('1'),
            },
          ],
        });
      });

      it('should search users by username', async () => {
        // Act
        const results = await profileService.searchProfiles('john', {
          limit: 10,
          offset: 0,
        });

        // Assert
        expect(results.users).toHaveLength(1);
        expect(results.users[0].username).toBe('johndoe');
        expect(results.total).toBe(1);
      });

      it('should search users by full name', async () => {
        // Act
        const results = await profileService.searchProfiles('Jane Smith', {
          limit: 10,
          offset: 0,
        });

        // Assert
        expect(results.users).toHaveLength(1);
        expect(results.users[0].fullName).toBe('Jane Smith');
      });

      it('should search users by bio content', async () => {
        // Act
        const results = await profileService.searchProfiles('developer', {
          limit: 10,
          offset: 0,
        });

        // Assert
        expect(results.users.length).toBeGreaterThanOrEqual(2);
        const usernames = results.users.map(u => u.username);
        expect(usernames).toContain('devuser');
      });

      it('should handle pagination', async () => {
        // Act - First page
        const page1 = await profileService.searchProfiles('', {
          limit: 2,
          offset: 0,
        });

        // Act - Second page
        const page2 = await profileService.searchProfiles('', {
          limit: 2,
          offset: 2,
        });

        // Assert
        expect(page1.users).toHaveLength(2);
        expect(page2.users.length).toBeGreaterThanOrEqual(1);
        expect(page1.users[0].id).not.toBe(page2.users[0].id);
      });

      it('should return empty results for no matches', async () => {
        // Act
        const results = await profileService.searchProfiles('nonexistentuser999', {
          limit: 10,
          offset: 0,
        });

        // Assert
        expect(results.users).toHaveLength(0);
        expect(results.total).toBe(0);
      });
    });
  });

  describe('SettingsService', () => {
    let testUser: User;

    beforeEach(async () => {
      testUser = await prisma.user.create({
        data: {
          id: BigInt('2001'),
          supabaseId: 'test-user-settings',
          email: 'settings@test.com',
          username: 'settingsuser',
          roleId: BigInt('1'),
        },
      });
    });

    describe('getSettings', () => {
      it('should create default settings if none exist', async () => {
        // Act
        const settings = await settingsService.getSettings(testUser.id.toString());

        // Assert
        expect(settings).toBeDefined();
        expect(settings.userId).toBe(testUser.id.toString());
        expect(settings.privacyLevel).toBe('PUBLIC');
        expect(settings.notificationsEnabled).toBe(true);
        expect(settings.emailNotifications).toBe(true);
        expect(settings.pushNotifications).toBe(true);
        expect(settings.autoDownloadMedia).toBe(true);

        // Verify in database
        const dbSettings = await prisma.userSettings.findUnique({
          where: { userId: testUser.id },
        });
        expect(dbSettings).toBeDefined();
      });

      it('should return existing settings', async () => {
        // Arrange - Create settings first
        const existingSettings = await prisma.userSettings.create({
          data: {
            userId: testUser.id,
            privacyLevel: 'PRIVATE',
            notificationsEnabled: false,
            emailNotifications: false,
            pushNotifications: false,
            autoDownloadMedia: false,
            blockedUsers: [BigInt('123'), BigInt('456')],
          },
        });

        // Act
        const settings = await settingsService.getSettings(testUser.id.toString());

        // Assert
        expect(settings.privacyLevel).toBe('PRIVATE');
        expect(settings.notificationsEnabled).toBe(false);
        expect(settings.emailNotifications).toBe(false);
        expect(settings.pushNotifications).toBe(false);
        expect(settings.autoDownloadMedia).toBe(false);
        expect(settings.blockedUsers).toEqual(['123', '456']);
      });
    });

    describe('updateSettings', () => {
      it('should update settings successfully', async () => {
        // Arrange
        const updateData = {
          privacyLevel: 'PRIVATE' as const,
          notificationsEnabled: false,
          emailNotifications: false,
          pushNotifications: true,
          autoDownloadMedia: false,
          blockedUsers: ['789', '101112'],
        };

        // Act
        const updatedSettings = await settingsService.updateSettings(
          testUser.id.toString(),
          updateData
        );

        // Assert
        expect(updatedSettings.privacyLevel).toBe('PRIVATE');
        expect(updatedSettings.notificationsEnabled).toBe(false);
        expect(updatedSettings.emailNotifications).toBe(false);
        expect(updatedSettings.pushNotifications).toBe(true);
        expect(updatedSettings.autoDownloadMedia).toBe(false);
        expect(updatedSettings.blockedUsers).toEqual(['789', '101112']);

        // Verify in database
        const dbSettings = await prisma.userSettings.findUnique({
          where: { userId: testUser.id },
        });
        expect(dbSettings!.privacyLevel).toBe('PRIVATE');
        expect(dbSettings!.blockedUsers).toEqual([BigInt('789'), BigInt('101112')]);
      });

      it('should handle partial updates', async () => {
        // Arrange - Create initial settings
        await settingsService.getSettings(testUser.id.toString());

        const updateData = {
          notificationsEnabled: false,
        };

        // Act
        const updatedSettings = await settingsService.updateSettings(
          testUser.id.toString(),
          updateData
        );

        // Assert
        expect(updatedSettings.notificationsEnabled).toBe(false);
        expect(updatedSettings.privacyLevel).toBe('PUBLIC'); // Should remain default
        expect(updatedSettings.emailNotifications).toBe(true); // Should remain default
      });

      it('should throw NotFoundException for non-existent user', async () => {
        // Act & Assert
        await expect(
          settingsService.updateSettings('999999', {
            notificationsEnabled: false,
          })
        ).rejects.toThrow('User not found');
      });

      it('should validate privacy level enum', async () => {
        // Act & Assert
        await expect(
          settingsService.updateSettings(testUser.id.toString(), {
            privacyLevel: 'INVALID' as any,
          })
        ).rejects.toThrow();
      });
    });

    describe('privacy and blocking', () => {
      let blockedUser: User;

      beforeEach(async () => {
        blockedUser = await prisma.user.create({
          data: {
            id: BigInt('2002'),
            supabaseId: 'blocked-user',
            email: 'blocked@test.com',
            username: 'blockeduser',
            roleId: BigInt('1'),
          },
        });
      });

      it('should block and unblock users', async () => {
        // Block user
        await settingsService.updateSettings(testUser.id.toString(), {
          blockedUsers: [blockedUser.id.toString()],
        });

        let settings = await settingsService.getSettings(testUser.id.toString());
        expect(settings.blockedUsers).toContain(blockedUser.id.toString());

        // Unblock user
        await settingsService.updateSettings(testUser.id.toString(), {
          blockedUsers: [],
        });

        settings = await settingsService.getSettings(testUser.id.toString());
        expect(settings.blockedUsers).toHaveLength(0);
      });

      it('should handle multiple blocked users', async () => {
        // Arrange
        const user2 = await prisma.user.create({
          data: {
            id: BigInt('2003'),
            supabaseId: 'blocked-user-2',
            email: 'blocked2@test.com',
            username: 'blockeduser2',
            roleId: BigInt('1'),
          },
        });

        // Act
        await settingsService.updateSettings(testUser.id.toString(), {
          blockedUsers: [blockedUser.id.toString(), user2.id.toString()],
        });

        // Assert
        const settings = await settingsService.getSettings(testUser.id.toString());
        expect(settings.blockedUsers).toHaveLength(2);
        expect(settings.blockedUsers).toContain(blockedUser.id.toString());
        expect(settings.blockedUsers).toContain(user2.id.toString());
      });
    });
  });

  describe('CryptoService', () => {
    let testUser: User;

    beforeEach(async () => {
      testUser = await prisma.user.create({
        data: {
          id: BigInt('3001'),
          supabaseId: 'test-user-crypto',
          email: 'crypto@test.com',
          username: 'cryptouser',
          roleId: BigInt('1'),
        },
      });
    });

    describe('createIdentityKey', () => {
      it('should create identity key successfully', async () => {
        // Arrange
        const createKeysDto = {
          identityKeyPublic: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK',
        };

        // Act
        const result = await cryptoService.createIdentityKey(
          testUser.id,
          createKeysDto
        );

        // Assert
        expect(result.success).toBe(true);
        expect(result.userCryptoId).toBeDefined();
        expect(result.message).toBe('Identity key created successfully');

        // Verify in database
        const userCrypto = await prisma.userCrypto.findUnique({
          where: { userId: testUser.id },
        });
        expect(userCrypto).toBeDefined();
        expect(userCrypto!.identityKeyPublic).toBe(createKeysDto.identityKeyPublic);
      });

      it('should throw ConflictException if identity key already exists', async () => {
        // Arrange - Create existing crypto
        await prisma.userCrypto.create({
          data: {
            userId: testUser.id,
            identityKeyPublic: 'existing-key',
          },
        });

        const createKeysDto = {
          identityKeyPublic: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK',
        };

        // Act & Assert
        await expect(
          cryptoService.createIdentityKey(testUser.id, createKeysDto)
        ).rejects.toThrow('Identity key already exists for this user');
      });

      it('should validate key format', async () => {
        // Arrange
        const createKeysDto = {
          identityKeyPublic: 'invalid-key-format',
        };

        // Act & Assert
        await expect(
          cryptoService.createIdentityKey(testUser.id, createKeysDto)
        ).rejects.toThrow('Invalid identity key format');
      });
    });

    describe('uploadPreKeys', () => {
      let userCrypto: UserCrypto;

      beforeEach(async () => {
        userCrypto = await prisma.userCrypto.create({
          data: {
            userId: testUser.id,
            identityKeyPublic: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK',
          },
        });
      });

      it('should upload prekeys successfully', async () => {
        // Arrange
        const uploadDto = {
          preKeys: [
            { keyId: 1, publicKey: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK1' },
            { keyId: 2, publicKey: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK2' },
            { keyId: 3, publicKey: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK3' },
          ],
          signedPreKey: {
            keyId: 1,
            publicKey: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mKS',
            signature: 'signature-data',
          },
        };

        // Act
        const result = await cryptoService.uploadPreKeys(testUser.id, uploadDto);

        // Assert
        expect(result.success).toBe(true);
        expect(result.preKeysUploaded).toBe(3);
        expect(result.signedPreKeyUploaded).toBe(true);

        // Verify in database
        const preKeys = await prisma.preKey.findMany({
          where: { userCryptoId: userCrypto.id },
        });
        expect(preKeys).toHaveLength(3);

        const signedPreKey = await prisma.signedPreKey.findFirst({
          where: { userCryptoId: userCrypto.id },
        });
        expect(signedPreKey).toBeDefined();
        expect(signedPreKey!.signature).toBe(uploadDto.signedPreKey.signature);
      });

      it('should handle duplicate key IDs', async () => {
        // Arrange - Upload initial keys
        await cryptoService.uploadPreKeys(testUser.id, {
          preKeys: [
            { keyId: 1, publicKey: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK1' },
          ],
          signedPreKey: {
            keyId: 1,
            publicKey: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mKS',
            signature: 'signature-data',
          },
        });

        const uploadDto = {
          preKeys: [
            { keyId: 1, publicKey: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mKDupe' }, // Duplicate ID
          ],
          signedPreKey: {
            keyId: 2,
            publicKey: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mKS2',
            signature: 'signature-data-2',
          },
        };

        // Act & Assert
        await expect(
          cryptoService.uploadPreKeys(testUser.id, uploadDto)
        ).rejects.toThrow();
      });

      it('should throw NotFoundException for non-existent user crypto', async () => {
        // Arrange
        const newUser = await prisma.user.create({
          data: {
            id: BigInt('3002'),
            supabaseId: 'new-crypto-user',
            email: 'newcrypto@test.com',
            username: 'newcryptouser',
            roleId: BigInt('1'),
          },
        });

        const uploadDto = {
          preKeys: [
            { keyId: 1, publicKey: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK1' },
          ],
          signedPreKey: {
            keyId: 1,
            publicKey: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mKS',
            signature: 'signature-data',
          },
        };

        // Act & Assert
        await expect(
          cryptoService.uploadPreKeys(newUser.id, uploadDto)
        ).rejects.toThrow('User crypto not found');
      });
    });

    describe('getKeyBundle', () => {
      let userCrypto: UserCrypto;

      beforeEach(async () => {
        userCrypto = await prisma.userCrypto.create({
          data: {
            userId: testUser.id,
            identityKeyPublic: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK',
          },
        });

        // Upload some prekeys
        await cryptoService.uploadPreKeys(testUser.id, {
          preKeys: [
            { keyId: 1, publicKey: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK1' },
            { keyId: 2, publicKey: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK2' },
          ],
          signedPreKey: {
            keyId: 1,
            publicKey: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mKS',
            signature: 'signature-data',
          },
        });
      });

      it('should get key bundle successfully', async () => {
        // Arrange
        const getKeyBundleDto = {
          userId: testUser.id,
        };

        // Act
        const keyBundle = await cryptoService.getKeyBundle(getKeyBundleDto);

        // Assert
        expect(keyBundle.userId).toBe(testUser.id.toString());
        expect(keyBundle.identityKey).toBe('BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK');
        expect(keyBundle.signedPreKey).toBeDefined();
        expect(keyBundle.signedPreKey.keyId).toBe(1);
        expect(keyBundle.signedPreKey.publicKey).toBe('BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mKS');
        expect(keyBundle.signedPreKey.signature).toBe('signature-data');
        expect(keyBundle.preKey).toBeDefined();
        expect([1, 2]).toContain(keyBundle.preKey.keyId);

        // Verify prekey was consumed (marked as used)
        const usedPreKey = await prisma.preKey.findFirst({
          where: {
            userCryptoId: userCrypto.id,
            keyId: keyBundle.preKey.keyId,
          },
        });
        expect(usedPreKey!.used).toBe(true);
      });

      it('should throw NotFoundException for non-existent user', async () => {
        // Act & Assert
        await expect(
          cryptoService.getKeyBundle({ userId: BigInt('999999') })
        ).rejects.toThrow('User crypto not found');
      });

      it('should handle no available prekeys', async () => {
        // Arrange - Mark all prekeys as used
        await prisma.preKey.updateMany({
          where: { userCryptoId: userCrypto.id },
          data: { used: true },
        });

        // Act & Assert
        await expect(
          cryptoService.getKeyBundle({ userId: testUser.id })
        ).rejects.toThrow('No prekeys available');
      });
    });

    describe('rotateSignedPreKey', () => {
      let userCrypto: UserCrypto;

      beforeEach(async () => {
        userCrypto = await prisma.userCrypto.create({
          data: {
            userId: testUser.id,
            identityKeyPublic: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK',
          },
        });

        // Create initial signed prekey
        await prisma.signedPreKey.create({
          data: {
            userCryptoId: userCrypto.id,
            keyId: 1,
            publicKey: 'old-signed-prekey',
            signature: 'old-signature',
          },
        });
      });

      it('should rotate signed prekey successfully', async () => {
        // Arrange
        const rotateDto = {
          signedPreKey: {
            keyId: 2,
            publicKey: 'new-signed-prekey',
            signature: 'new-signature',
          },
        };

        // Act
        const result = await cryptoService.rotateSignedPreKey(testUser.id, rotateDto);

        // Assert
        expect(result.success).toBe(true);
        expect(result.newKeyId).toBe(2);
        expect(result.message).toBe('Signed prekey rotated successfully');

        // Verify new key in database
        const newSignedPreKey = await prisma.signedPreKey.findFirst({
          where: {
            userCryptoId: userCrypto.id,
            keyId: 2,
          },
        });
        expect(newSignedPreKey).toBeDefined();
        expect(newSignedPreKey!.publicKey).toBe('new-signed-prekey');
        expect(newSignedPreKey!.signature).toBe('new-signature');

        // Verify old key still exists (for grace period)
        const oldSignedPreKey = await prisma.signedPreKey.findFirst({
          where: {
            userCryptoId: userCrypto.id,
            keyId: 1,
          },
        });
        expect(oldSignedPreKey).toBeDefined();
      });

      it('should handle key ID conflicts', async () => {
        // Arrange
        const rotateDto = {
          signedPreKey: {
            keyId: 1, // Same as existing
            publicKey: 'conflicting-key',
            signature: 'conflicting-signature',
          },
        };

        // Act & Assert
        await expect(
          cryptoService.rotateSignedPreKey(testUser.id, rotateDto)
        ).rejects.toThrow();
      });
    });

    describe('getKeyStatus', () => {
      let userCrypto: UserCrypto;

      beforeEach(async () => {
        userCrypto = await prisma.userCrypto.create({
          data: {
            userId: testUser.id,
            identityKeyPublic: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK',
          },
        });
      });

      it('should get key status successfully', async () => {
        // Arrange - Create some keys
        await prisma.preKey.createMany({
          data: [
            {
              userCryptoId: userCrypto.id,
              keyId: 1,
              publicKey: 'prekey1',
              used: false,
            },
            {
              userCryptoId: userCrypto.id,
              keyId: 2,
              publicKey: 'prekey2',
              used: true,
            },
            {
              userCryptoId: userCrypto.id,
              keyId: 3,
              publicKey: 'prekey3',
              used: false,
            },
          ],
        });

        await prisma.signedPreKey.create({
          data: {
            userCryptoId: userCrypto.id,
            keyId: 1,
            publicKey: 'signed-prekey',
            signature: 'signature',
          },
        });

        // Act
        const status = await cryptoService.getKeyStatus(testUser.id);

        // Assert
        expect(status.userId).toBe(testUser.id.toString());
        expect(status.hasIdentityKey).toBe(true);
        expect(status.availablePreKeys).toBe(2); // 2 unused prekeys
        expect(status.totalPreKeys).toBe(3);
        expect(status.hasActiveSignedPreKey).toBe(true);
        expect(status.signedPreKeyCount).toBe(1);
      });

      it('should handle user with no crypto setup', async () => {
        // Arrange
        const newUser = await prisma.user.create({
          data: {
            id: BigInt('3003'),
            supabaseId: 'no-crypto-user',
            email: 'nocrypto@test.com',
            username: 'nocryptouser',
            roleId: BigInt('1'),
          },
        });

        // Act & Assert
        await expect(
          cryptoService.getKeyStatus(newUser.id)
        ).rejects.toThrow('User crypto not found');
      });
    });
  });

  describe('Database Integration Tests', () => {
    it('should handle concurrent profile updates', async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          id: BigInt('4001'),
          supabaseId: 'concurrent-user',
          email: 'concurrent@test.com',
          username: 'concurrentuser',
          roleId: BigInt('1'),
        },
      });

      // Act - Simulate concurrent updates
      const promises = Array.from({ length: 5 }, (_, i) =>
        profileService.updateProfile(user.id.toString(), {
          bio: `Updated bio ${i}`,
        })
      );

      // Assert - All updates should complete without errors
      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);

      const finalProfile = await profileService.getProfile(user.id.toString());
      expect(finalProfile.bio).toMatch(/Updated bio \d/);
    });

    it('should maintain data consistency across services', async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          id: BigInt('4002'),
          supabaseId: 'consistency-user',
          email: 'consistency@test.com',
          username: 'consistencyuser',
          roleId: BigInt('1'),
        },
      });

      // Act - Update through different services
      await profileService.updateProfile(user.id.toString(), {
        fullName: 'Updated Name',
      });

      await settingsService.updateSettings(user.id.toString(), {
        privacyLevel: 'PRIVATE',
      });

      await cryptoService.createIdentityKey(user.id, {
        identityKeyPublic: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK',
      });

      // Assert - All data should be consistent
      const profile = await profileService.getProfile(user.id.toString());
      const settings = await settingsService.getSettings(user.id.toString());
      const keyStatus = await cryptoService.getKeyStatus(user.id);

      expect(profile.fullName).toBe('Updated Name');
      expect(settings.privacyLevel).toBe('PRIVATE');
      expect(keyStatus.hasIdentityKey).toBe(true);

      // Verify in database
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          settings: true,
          crypto: true,
        },
      });

      expect(dbUser!.fullName).toBe('Updated Name');
      expect(dbUser!.settings!.privacyLevel).toBe('PRIVATE');
      expect(dbUser!.crypto!.identityKeyPublic).toBeDefined();
    });

    it('should handle transaction rollbacks correctly', async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          id: BigInt('4003'),
          supabaseId: 'transaction-user',
          email: 'transaction@test.com',
          username: 'transactionuser',
          roleId: BigInt('1'),
        },
      });

      // Act & Assert - Simulate transaction failure
      try {
        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: user.id },
            data: { fullName: 'Transaction Name' },
          });

          await tx.userSettings.create({
            data: {
              userId: user.id,
              privacyLevel: 'PRIVATE',
            },
          });

          // Force transaction failure
          throw new Error('Simulated transaction failure');
        });
      } catch (error) {
        expect(error.message).toBe('Simulated transaction failure');
      }

      // Verify rollback - changes should not be persisted
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        include: { settings: true },
      });

      expect(dbUser!.fullName).toBeNull(); // Should remain unchanged
      expect(dbUser!.settings).toBeNull(); // Should not be created
    });
  });

  describe('Performance Tests', () => {
    it('should handle bulk operations efficiently', async () => {
      // Arrange - Create test users in bulk
      const userCount = 20;
      const userPromises = Array.from({ length: userCount }, (_, i) =>
        prisma.user.create({
          data: {
            id: BigInt(`5000${i}`),
            supabaseId: `bulk-user-${i}`,
            email: `bulk${i}@test.com`,
            username: `bulkuser${i}`,
            roleId: BigInt('1'),
          },
        })
      );

      await Promise.all(userPromises);

      // Act - Measure search performance
      const startTime = Date.now();
      const searchResults = await profileService.searchProfiles('bulk', {
        limit: userCount,
        offset: 0,
      });
      const endTime = Date.now();

      // Assert
      expect(searchResults.users).toHaveLength(userCount);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second

      // Act - Measure bulk settings creation
      const settingsStartTime = Date.now();
      const settingsPromises = searchResults.users.map(user =>
        settingsService.getSettings(user.id)
      );
      await Promise.all(settingsPromises);
      const settingsEndTime = Date.now();

      // Assert
      expect(settingsEndTime - settingsStartTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should efficiently handle crypto key operations', async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          id: BigInt('5001'),
          supabaseId: 'crypto-perf-user',
          email: 'cryptoperf@test.com',
          username: 'cryptoperfuser',
          roleId: BigInt('1'),
        },
      });

      await cryptoService.createIdentityKey(user.id, {
        identityKeyPublic: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK',
      });

      // Act - Upload many prekeys
      const preKeyCount = 100;
      const preKeys = Array.from({ length: preKeyCount }, (_, i) => ({
        keyId: i + 1,
        publicKey: `BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mK${i}`,
      }));

      const uploadStartTime = Date.now();
      await cryptoService.uploadPreKeys(user.id, {
        preKeys,
        signedPreKey: {
          keyId: 1,
          publicKey: 'BQGhXJBOdKLVZj8Qjgmc2YZ8SLI5cABP0rQIZiHnL/mKS',
          signature: 'signature-data',
        },
      });
      const uploadEndTime = Date.now();

      // Assert
      expect(uploadEndTime - uploadStartTime).toBeLessThan(3000); // Should complete within 3 seconds

      // Act - Measure key bundle retrieval performance
      const retrievalTimes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await cryptoService.getKeyBundle({ userId: user.id });
        const end = Date.now();
        retrievalTimes.push(end - start);
      }

      // Assert
      const avgRetrievalTime = retrievalTimes.reduce((a, b) => a + b, 0) / retrievalTimes.length;
      expect(avgRetrievalTime).toBeLessThan(100); // Should average under 100ms
    });
  });
});
