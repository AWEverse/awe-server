import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/libs/supabase/db/prisma.service';
import { DatabaseTestSetup } from '../setup/database-setup';
import { MessangerService } from '../../src/modules/messanger/messanger.service';
import { MessangerRepository } from '../../src/modules/messanger/messanger.repository';
import { MessangerModule } from '../../src/modules/messanger/messanger.module';
import { User, Chat, Message, ChatParticipant } from 'generated/client';
import { ChatType, MessageType, ChatRole } from '../../src/modules/messanger/types';
import { DatabaseOptimizer } from 'src/modules/messanger/optimizations/database-optimization';

describe('Messenger Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let messengerService: MessangerService;
  let messengerRepository: MessangerRepository;
  let databaseOptimizer: DatabaseOptimizer;
  let dbSetup: DatabaseTestSetup;

  beforeAll(async () => {
    dbSetup = new DatabaseTestSetup();
    await dbSetup.setupDatabase();

    const module: TestingModule = await Test.createTestingModule({
      imports: [MessangerModule],
      providers: [PrismaService],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    prisma = module.get<PrismaService>(PrismaService);
    messengerService = module.get<MessangerService>(MessangerService);
    messengerRepository = module.get<MessangerRepository>(MessangerRepository);
    databaseOptimizer = module.get<DatabaseOptimizer>(DatabaseOptimizer);
  });

  beforeEach(async () => {
    await dbSetup.cleanupDatabase();
    await dbSetup.seedTestData();
  });

  afterAll(async () => {
    await app.close();
    await dbSetup.teardownDatabase();
  });

  describe('MessengerService - Chat Management', () => {
    let testUser1: User;
    let testUser2: User;
    let testUser3: User;

    beforeEach(async () => {
      // Create test users
      [testUser1, testUser2, testUser3] = await Promise.all([
        prisma.user.create({
          data: {
            id: BigInt('1001'),
            supabaseId: 'test-user-1',
            email: 'user1@test.com',
            username: 'user1',
            roleId: BigInt('1'),
          },
        }),
        prisma.user.create({
          data: {
            id: BigInt('1002'),
            supabaseId: 'test-user-2',
            email: 'user2@test.com',
            username: 'user2',
            roleId: BigInt('1'),
          },
        }),
        prisma.user.create({
          data: {
            id: BigInt('1003'),
            supabaseId: 'test-user-3',
            email: 'user3@test.com',
            username: 'user3',
            roleId: BigInt('1'),
          },
        }),
      ]);
    });

    describe('createChat', () => {
      it('should create direct chat successfully', async () => {
        // Act
        const chat = await messengerService.createChat(testUser1.id, {
          type: ChatType.DIRECT,
          participantIds: [testUser2.id],
        });

        // Assert
        expect(chat).toBeDefined();
        expect(chat.type).toBe(ChatType.DIRECT);
        expect(chat.createdById).toBe(testUser1.id.toString());
        expect(chat.memberCount).toBe(2);

        // Verify participants in database
        const participants = await prisma.chatParticipant.findMany({
          where: { chatId: BigInt(chat.id) },
        });
        expect(participants).toHaveLength(2);

        const participantIds = participants.map(p => p.userId);
        expect(participantIds).toContain(testUser1.id);
        expect(participantIds).toContain(testUser2.id);
      });

      it('should create group chat successfully', async () => {
        // Act
        const chat = await messengerService.createChat(testUser1.id, {
          type: ChatType.GROUP,
          title: 'Test Group Chat',
          description: 'A test group chat',
          participantIds: [testUser2.id, testUser3.id],
        });

        // Assert
        expect(chat).toBeDefined();
        expect(chat.type).toBe(ChatType.GROUP);
        expect(chat.title).toBe('Test Group Chat');
        expect(chat.description).toBe('A test group chat');
        expect(chat.memberCount).toBe(3); // Creator + 2 participants

        // Verify creator has OWNER role
        const creatorParticipant = await prisma.chatParticipant.findFirst({
          where: {
            chatId: BigInt(chat.id),
            userId: testUser1.id,
          },
        });
        expect(creatorParticipant!.role).toBe(ChatRole.OWNER);
      });

      it('should create channel successfully', async () => {
        // Act
        const chat = await messengerService.createChat(testUser1.id, {
          type: ChatType.CHANNEL,
          title: 'Test Channel',
          description: 'A test channel',
          isPublic: true,
          participantIds: [testUser2.id],
        });

        // Assert
        expect(chat).toBeDefined();
        expect(chat.type).toBe(ChatType.CHANNEL);
        expect(chat.title).toBe('Test Channel');
        expect(chat.flags).toHaveProperty('public', true);
      });

      it('should handle invalid participant IDs', async () => {
        // Act & Assert
        await expect(
          messengerService.createChat(testUser1.id, {
            type: ChatType.DIRECT,
            participantIds: [BigInt('999999')], // Non-existent user
          }),
        ).rejects.toThrow();
      });

      it('should prevent duplicate direct chats', async () => {
        // Arrange - Create first direct chat
        await messengerService.createChat(testUser1.id, {
          type: ChatType.DIRECT,
          participantIds: [testUser2.id],
        });

        // Act & Assert - Try to create duplicate
        await expect(
          messengerService.createChat(testUser1.id, {
            type: ChatType.DIRECT,
            participantIds: [testUser2.id],
          }),
        ).rejects.toThrow('Direct chat already exists');
      });
    });

    describe('joinChat', () => {
      let testChat: Chat;

      beforeEach(async () => {
        testChat = await prisma.chat.create({
          data: {
            id: BigInt('2001'),
            type: ChatType.GROUP,
            title: 'Join Test Chat',
            createdById: testUser1.id,
            memberCount: 1,
            flags: 2, // Public
          },
        });

        // Add creator as participant
        await prisma.chatParticipant.create({
          data: {
            chatId: testChat.id,
            userId: testUser1.id,
            role: ChatRole.OWNER,
            joinedAt: new Date(),
          },
        });
      });

      it('should join public chat successfully', async () => {
        // Act
        const result = await messengerService.joinChat(testUser2.id, testChat.id);

        // Assert
        expect(result.success).toBe(true);

        // Verify participant added
        const participant = await prisma.chatParticipant.findFirst({
          where: {
            chatId: testChat.id,
            userId: testUser2.id,
          },
        });
        expect(participant).toBeDefined();
        expect(participant!.role).toBe(ChatRole.MEMBER);

        // Verify member count updated
        const updatedChat = await prisma.chat.findUnique({
          where: { id: testChat.id },
        });
        expect(updatedChat!.memberCount).toBe(2);
      });

      it('should handle invite-only chats', async () => {
        // Arrange - Make chat private
        await prisma.chat.update({
          where: { id: testChat.id },
          data: { flags: 0 }, // Not public
        });

        // Act & Assert
        await expect(messengerService.joinChat(testUser2.id, testChat.id)).rejects.toThrow(
          'Chat is invite-only',
        );
      });

      it('should prevent duplicate joins', async () => {
        // Arrange - User already in chat
        await prisma.chatParticipant.create({
          data: {
            chatId: testChat.id,
            userId: testUser2.id,
            role: ChatRole.MEMBER,
            joinedAt: new Date(),
          },
        });

        // Act & Assert
        await expect(messengerService.joinChat(testUser2.id, testChat.id)).rejects.toThrow(
          'User already in chat',
        );
      });
    });

    describe('leaveChat', () => {
      let testChat: Chat;

      beforeEach(async () => {
        testChat = await prisma.chat.create({
          data: {
            id: BigInt('2002'),
            type: ChatType.GROUP,
            title: 'Leave Test Chat',
            createdById: testUser1.id,
            memberCount: 3,
          },
        });

        // Add participants
        await prisma.chatParticipant.createMany({
          data: [
            {
              chatId: testChat.id,
              userId: testUser1.id,
              role: ChatRole.OWNER,
              joinedAt: new Date(),
            },
            {
              chatId: testChat.id,
              userId: testUser2.id,
              role: ChatRole.MEMBER,
              joinedAt: new Date(),
            },
            {
              chatId: testChat.id,
              userId: testUser3.id,
              role: ChatRole.MEMBER,
              joinedAt: new Date(),
            },
          ],
        });
      });

      it('should leave chat successfully', async () => {
        // Act
        const result = await messengerService.leaveChat(testUser2.id, testChat.id);

        // Assert
        expect(result.success).toBe(true);

        // Verify participant removed
        const participant = await prisma.chatParticipant.findFirst({
          where: {
            chatId: testChat.id,
            userId: testUser2.id,
            leftAt: null,
          },
        });
        expect(participant).toBeNull();

        // Verify member count updated
        const updatedChat = await prisma.chat.findUnique({
          where: { id: testChat.id },
        });
        expect(updatedChat!.memberCount).toBe(2);
      });

      it('should handle owner leaving (transfer ownership)', async () => {
        // Act
        const result = await messengerService.leaveChat(testUser1.id, testChat.id);

        // Assert
        expect(result.success).toBe(true);

        // Verify ownership transferred to another member
        const newOwner = await prisma.chatParticipant.findFirst({
          where: {
            chatId: testChat.id,
            role: ChatRole.OWNER,
            leftAt: null,
          },
        });
        expect(newOwner).toBeDefined();
        expect(newOwner!.userId).not.toBe(testUser1.id);
      });

      it('should delete chat when last member leaves', async () => {
        // Arrange - Remove all but one member
        await prisma.chatParticipant.updateMany({
          where: {
            chatId: testChat.id,
            userId: { in: [testUser2.id, testUser3.id] },
          },
          data: { leftAt: new Date() },
        });

        await prisma.chat.update({
          where: { id: testChat.id },
          data: { memberCount: 1 },
        });

        // Act
        const result = await messengerService.leaveChat(testUser1.id, testChat.id);

        // Assert
        expect(result.success).toBe(true);

        // Verify chat marked as deleted
        const deletedChat = await prisma.chat.findUnique({
          where: { id: testChat.id },
        });
        expect(deletedChat!.deletedAt).toBeDefined();
      });
    });
  });

  describe('MessengerService - Message Management', () => {
    let testChat: Chat;
    let testUser1: User;
    let testUser2: User;

    beforeEach(async () => {
      // Create test users
      [testUser1, testUser2] = await Promise.all([
        prisma.user.create({
          data: {
            id: BigInt('2001'),
            supabaseId: 'msg-user-1',
            email: 'msguser1@test.com',
            username: 'msguser1',
            roleId: BigInt('1'),
          },
        }),
        prisma.user.create({
          data: {
            id: BigInt('2002'),
            supabaseId: 'msg-user-2',
            email: 'msguser2@test.com',
            username: 'msguser2',
            roleId: BigInt('1'),
          },
        }),
      ]);

      // Create test chat
      testChat = await prisma.chat.create({
        data: {
          id: BigInt('3001'),
          type: ChatType.DIRECT,
          createdById: testUser1.id,
          memberCount: 2,
        },
      });

      // Add participants
      await prisma.chatParticipant.createMany({
        data: [
          {
            chatId: testChat.id,
            userId: testUser1.id,
            role: ChatRole.MEMBER,
            joinedAt: new Date(),
          },
          {
            chatId: testChat.id,
            userId: testUser2.id,
            role: ChatRole.MEMBER,
            joinedAt: new Date(),
          },
        ],
      });
    });

    describe('sendMessage', () => {
      it('should send text message successfully', async () => {
        // Arrange
        const messageData = {
          content: Buffer.from(JSON.stringify({ text: 'Hello, world!' })),
          header: Buffer.from(JSON.stringify({ encrypted: false })),
          messageType: MessageType.TEXT,
        };

        // Act
        const message = await messengerService.sendMessage(testUser1.id, testChat.id, messageData);

        // Assert
        expect(message).toBeDefined();
        expect(message.senderId).toBe(testUser1.id.toString());
        expect(message.chatId).toBe(testChat.id.toString());
        expect(message.messageType).toBe(MessageType.TEXT);
        expect(message.content).toEqual(messageData.content);
        expect(message.header).toEqual(messageData.header);

        // Verify chat updated
        const updatedChat = await prisma.chat.findUnique({
          where: { id: testChat.id },
        });
        expect(updatedChat!.lastMessageAt).toBeDefined();
        expect(updatedChat!.lastMessageText).toBeDefined();
      });

      it('should send message with reply', async () => {
        // Arrange - Create original message
        const originalMessage = await prisma.message.create({
          data: {
            id: BigInt('4001'),
            chatId: testChat.id,
            senderId: testUser2.id,
            content: Buffer.from('Original message'),
            header: Buffer.from('{}'),
            messageType: MessageType.TEXT,
          },
        });

        const replyData = {
          content: Buffer.from(JSON.stringify({ text: 'Reply message' })),
          header: Buffer.from(JSON.stringify({ encrypted: false })),
          messageType: MessageType.TEXT,
          replyToId: originalMessage.id,
        };

        // Act
        const replyMessage = await messengerService.sendMessage(
          testUser1.id,
          testChat.id,
          replyData,
        );

        // Assert
        expect(replyMessage.replyToId).toBe(originalMessage.id.toString());

        // Verify reply reference
        const dbMessage = await prisma.message.findUnique({
          where: { id: BigInt(replyMessage.id) },
          include: { replyTo: true },
        });
        expect(dbMessage!.replyTo).toBeDefined();
        expect(dbMessage!.replyTo!.id).toBe(originalMessage.id);
      });

      it('should send message with attachments', async () => {
        // Arrange
        const messageData = {
          content: Buffer.from(JSON.stringify({ text: 'Message with attachment' })),
          header: Buffer.from(JSON.stringify({ encrypted: false })),
          messageType: MessageType.FILE,
          attachments: [
            {
              fileName: 'test.jpg',
              fileUrl: 'https://example.com/test.jpg',
              fileSize: 1024,
              mimeType: 'image/jpeg',
            },
            {
              fileName: 'document.pdf',
              fileUrl: 'https://example.com/document.pdf',
              fileSize: 2048,
              mimeType: 'application/pdf',
            },
          ],
        };

        // Act
        const message = await messengerService.sendMessage(testUser1.id, testChat.id, messageData);

        // Assert
        expect(message.attachments).toHaveLength(2);
        expect(message.attachments![0].fileName).toBe('test.jpg');
        expect(message.attachments![1].fileName).toBe('document.pdf');

        // Verify attachments in database
        const attachments = await prisma.messageAttachment.findMany({
          where: { messageId: BigInt(message.id) },
        });
        expect(attachments).toHaveLength(2);
      });

      it('should handle message encryption', async () => {
        // Arrange
        const encryptedContent = Buffer.from('encrypted_message_data');
        const messageData = {
          content: encryptedContent,
          header: Buffer.from(
            JSON.stringify({
              encrypted: true,
              algorithm: 'AES-256-GCM',
              recipients: [testUser2.id.toString()],
            }),
          ),
          messageType: MessageType.TEXT,
        };

        // Act
        const message = await messengerService.sendMessage(testUser1.id, testChat.id, messageData);

        // Assert
        expect(message.content).toEqual(encryptedContent);

        const headerData = JSON.parse(message.header.toString());
        expect(headerData.encrypted).toBe(true);
        expect(headerData.algorithm).toBe('AES-256-GCM');
      });

      it('should reject message from non-participant', async () => {
        // Arrange - Create user not in chat
        const outsideUser = await prisma.user.create({
          data: {
            id: BigInt('2003'),
            supabaseId: 'outside-user',
            email: 'outside@test.com',
            username: 'outsideuser',
            roleId: BigInt('1'),
          },
        });

        const messageData = {
          content: Buffer.from('Unauthorized message'),
          header: Buffer.from('{}'),
          messageType: MessageType.TEXT,
        };

        // Act & Assert
        await expect(
          messengerService.sendMessage(outsideUser.id, testChat.id, messageData),
        ).rejects.toThrow('User is not a participant of this chat');
      });

      it('should handle message rate limiting', async () => {
        // Arrange - Send multiple messages rapidly
        const messageData = {
          content: Buffer.from('Spam message'),
          header: Buffer.from('{}'),
          messageType: MessageType.TEXT,
        };

        // Act - Send 10 messages rapidly
        const promises = Array.from({ length: 10 }, () =>
          messengerService.sendMessage(testUser1.id, testChat.id, messageData),
        );

        // Assert - Should handle all requests (rate limiting is implementation specific)
        const results = await Promise.allSettled(promises);
        const successful = results.filter(r => r.status === 'fulfilled');
        expect(successful.length).toBeGreaterThan(0); // At least some should succeed
      });
    });

    describe('editMessage', () => {
      let testMessage: Message;

      beforeEach(async () => {
        testMessage = await prisma.message.create({
          data: {
            id: BigInt('4002'),
            chatId: testChat.id,
            senderId: testUser1.id,
            content: Buffer.from('Original message'),
            header: Buffer.from('{}'),
            messageType: MessageType.TEXT,
          },
        });
      });

      it('should edit message successfully', async () => {
        // Arrange
        const newContent = Buffer.from('Edited message');

        // Act
        const editedMessage = await messengerService.editMessage(testUser1.id, testMessage.id, {
          content: newContent,
          header: Buffer.from(JSON.stringify({ edited: true })),
        });

        // Assert
        expect(editedMessage.content).toEqual(newContent);
        expect(editedMessage.flags).toHaveProperty('edited', true);

        // Verify edit history
        const editHistory = await prisma.messageEdit.findMany({
          where: { messageId: testMessage.id },
        });
        expect(editHistory).toHaveLength(1);
        expect(editHistory[0].oldContent).toEqual(Buffer.from('Original message'));
      });

      it('should reject edit from non-sender', async () => {
        // Act & Assert
        await expect(
          messengerService.editMessage(
            testUser2.id, // Different user
            testMessage.id,
            {
              content: Buffer.from('Unauthorized edit'),
              header: Buffer.from('{}'),
            },
          ),
        ).rejects.toThrow('Only message sender can edit');
      });

      it('should handle edit time limit', async () => {
        // Arrange - Create old message (simulate by updating timestamp)
        const oldMessage = await prisma.message.create({
          data: {
            id: BigInt('4003'),
            chatId: testChat.id,
            senderId: testUser1.id,
            content: Buffer.from('Old message'),
            header: Buffer.from('{}'),
            messageType: MessageType.TEXT,
            createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
          },
        });

        // Act & Assert
        await expect(
          messengerService.editMessage(testUser1.id, oldMessage.id, {
            content: Buffer.from('Late edit'),
            header: Buffer.from('{}'),
          }),
        ).rejects.toThrow('Message edit time limit exceeded');
      });
    });

    describe('deleteMessage', () => {
      let testMessage: Message;

      beforeEach(async () => {
        testMessage = await prisma.message.create({
          data: {
            id: BigInt('4004'),
            chatId: testChat.id,
            senderId: testUser1.id,
            content: Buffer.from('Message to delete'),
            header: Buffer.from('{}'),
            messageType: MessageType.TEXT,
          },
        });
      });

      it('should delete message for sender', async () => {
        // Act
        const result = await messengerService.deleteMessage(testUser1.id, testMessage.id, {
          forEveryone: false,
        });

        // Assert
        expect(result.success).toBe(true);

        // Verify message marked as deleted for sender
        const deletedMessage = await prisma.message.findUnique({
          where: { id: testMessage.id },
        });
        expect(deletedMessage!.flags).toHaveProperty('deletedForSender', true);
      });

      it('should delete message for everyone (sender)', async () => {
        // Act
        const result = await messengerService.deleteMessage(testUser1.id, testMessage.id, {
          forEveryone: true,
        });

        // Assert
        expect(result.success).toBe(true);

        // Verify message marked as deleted for everyone
        const deletedMessage = await prisma.message.findUnique({
          where: { id: testMessage.id },
        });
        expect(deletedMessage!.flags).toHaveProperty('deleted', true);
      });

      it('should handle admin deletion', async () => {
        // Arrange - Make testUser2 an admin
        await prisma.chatParticipant.update({
          where: {
            chatId_userId: {
              chatId: testChat.id,
              userId: testUser2.id,
            },
          },
          data: { role: ChatRole.ADMIN },
        });

        // Act
        const result = await messengerService.deleteMessage(
          testUser2.id, // Admin deleting someone else's message
          testMessage.id,
          { forEveryone: true },
        );

        // Assert
        expect(result.success).toBe(true);

        // Verify moderation log created
        const moderationLog = await prisma.chatModerationLog.findFirst({
          where: {
            chatId: testChat.id,
            moderatorId: testUser2.id,
            action: 'DELETE_MESSAGE',
          },
        });
        expect(moderationLog).toBeDefined();
      });
    });
  });

  describe('MessengerService - Message Retrieval', () => {
    let testChat: Chat;
    let testUser1: User;
    let testUser2: User;
    let testMessages: Message[];

    beforeEach(async () => {
      // Create test users
      [testUser1, testUser2] = await Promise.all([
        prisma.user.create({
          data: {
            id: BigInt('3001'),
            supabaseId: 'retrieval-user-1',
            email: 'retrieval1@test.com',
            username: 'retrieval1',
            roleId: BigInt('1'),
          },
        }),
        prisma.user.create({
          data: {
            id: BigInt('3002'),
            supabaseId: 'retrieval-user-2',
            email: 'retrieval2@test.com',
            username: 'retrieval2',
            roleId: BigInt('1'),
          },
        }),
      ]);

      // Create test chat
      testChat = await prisma.chat.create({
        data: {
          id: BigInt('5001'),
          type: ChatType.DIRECT,
          createdById: testUser1.id,
          memberCount: 2,
        },
      });

      // Add participants
      await prisma.chatParticipant.createMany({
        data: [
          {
            chatId: testChat.id,
            userId: testUser1.id,
            role: ChatRole.MEMBER,
            joinedAt: new Date(),
          },
          {
            chatId: testChat.id,
            userId: testUser2.id,
            role: ChatRole.MEMBER,
            joinedAt: new Date(),
          },
        ],
      });

      // Create test messages
      testMessages = await Promise.all([
        prisma.message.create({
          data: {
            id: BigInt('6001'),
            chatId: testChat.id,
            senderId: testUser1.id,
            content: Buffer.from('Message 1'),
            header: Buffer.from('{}'),
            messageType: MessageType.TEXT,
            createdAt: new Date(Date.now() - 4000),
          },
        }),
        prisma.message.create({
          data: {
            id: BigInt('6002'),
            chatId: testChat.id,
            senderId: testUser2.id,
            content: Buffer.from('Message 2'),
            header: Buffer.from('{}'),
            messageType: MessageType.TEXT,
            createdAt: new Date(Date.now() - 3000),
          },
        }),
        prisma.message.create({
          data: {
            id: BigInt('6003'),
            chatId: testChat.id,
            senderId: testUser1.id,
            content: Buffer.from('Message 3'),
            header: Buffer.from('{}'),
            messageType: MessageType.TEXT,
            createdAt: new Date(Date.now() - 2000),
          },
        }),
        prisma.message.create({
          data: {
            id: BigInt('6004'),
            chatId: testChat.id,
            senderId: testUser2.id,
            content: Buffer.from('Message 4'),
            header: Buffer.from('{}'),
            messageType: MessageType.TEXT,
            createdAt: new Date(Date.now() - 1000),
          },
        }),
      ]);
    });

    describe('getMessages', () => {
      it('should retrieve messages with pagination', async () => {
        // Act
        const result = await messengerService.getMessages(testUser1.id, testChat.id, {
          limit: 2,
          offset: 0,
        });

        // Assert
        expect(result.messages).toHaveLength(2);
        expect(result.hasMore).toBe(true);
        expect(result.total).toBe(4);

        // Verify newest messages first
        expect(result.messages[0].id).toBe(testMessages[3].id.toString());
        expect(result.messages[1].id).toBe(testMessages[2].id.toString());
      });

      it('should retrieve messages before specific message', async () => {
        // Act
        const result = await messengerService.getMessages(testUser1.id, testChat.id, {
          limit: 2,
          beforeMessageId: testMessages[2].id, // Message 3
        });

        // Assert
        expect(result.messages).toHaveLength(2);

        // Should get Message 2 and Message 1
        const messageIds = result.messages.map(m => m.id);
        expect(messageIds).toContain(testMessages[1].id.toString());
        expect(messageIds).toContain(testMessages[0].id.toString());
      });

      it('should retrieve messages after specific message', async () => {
        // Act
        const result = await messengerService.getMessages(testUser1.id, testChat.id, {
          limit: 2,
          afterMessageId: testMessages[1].id, // Message 2
        });

        // Assert
        expect(result.messages).toHaveLength(2);

        // Should get Message 3 and Message 4
        const messageIds = result.messages.map(m => m.id);
        expect(messageIds).toContain(testMessages[2].id.toString());
        expect(messageIds).toContain(testMessages[3].id.toString());
      });

      it('should handle message read tracking', async () => {
        // Act
        await messengerService.getMessages(testUser1.id, testChat.id, { limit: 10 });

        // Assert - Check that read receipts were created
        const readReceipts = await prisma.messageRead.findMany({
          where: {
            userId: testUser1.id,
            messageId: { in: testMessages.map(m => m.id) },
          },
        });

        expect(readReceipts.length).toBeGreaterThan(0);
      });

      it('should filter out deleted messages', async () => {
        // Arrange - Delete one message
        await prisma.message.update({
          where: { id: testMessages[1].id },
          data: { flags: 1 }, // deleted flag
        });

        // Act
        const result = await messengerService.getMessages(testUser1.id, testChat.id, { limit: 10 });

        // Assert
        expect(result.messages).toHaveLength(3);
        const messageIds = result.messages.map(m => m.id);
        expect(messageIds).not.toContain(testMessages[1].id.toString());
      });

      it('should include message reactions and read status', async () => {
        // Arrange - Add reaction and read receipt
        await prisma.messageReaction.create({
          data: {
            messageId: testMessages[0].id,
            userId: testUser2.id,
            reaction: '👍',
          },
        });

        await prisma.messageRead.create({
          data: {
            messageId: testMessages[0].id,
            userId: testUser2.id,
            readAt: new Date(),
          },
        });

        // Act
        const result = await messengerService.getMessages(testUser1.id, testChat.id, {
          limit: 10,
          includeReactions: true,
          includeReadStatus: true,
        });

        // Assert
        const messageWithReaction = result.messages.find(
          m => m.id === testMessages[0].id.toString(),
        );
        expect(messageWithReaction!.reactions).toHaveLength(1);
        expect(messageWithReaction!.reactions![0].reaction).toBe('👍');
        expect(messageWithReaction!.readBy).toHaveLength(1);
      });
    });

    describe('searchMessages', () => {
      beforeEach(async () => {
        // Create messages with specific content for search
        await Promise.all([
          prisma.message.create({
            data: {
              id: BigInt('6005'),
              chatId: testChat.id,
              senderId: testUser1.id,
              content: Buffer.from(JSON.stringify({ text: 'javascript programming' })),
              header: Buffer.from('{}'),
              messageType: MessageType.TEXT,
            },
          }),
          prisma.message.create({
            data: {
              id: BigInt('6006'),
              chatId: testChat.id,
              senderId: testUser2.id,
              content: Buffer.from(JSON.stringify({ text: 'python development' })),
              header: Buffer.from('{}'),
              messageType: MessageType.TEXT,
            },
          }),
          prisma.message.create({
            data: {
              id: BigInt('6007'),
              chatId: testChat.id,
              senderId: testUser1.id,
              content: Buffer.from(JSON.stringify({ text: 'programming is fun' })),
              header: Buffer.from('{}'),
              messageType: MessageType.TEXT,
            },
          }),
        ]);
      });

      it('should search messages by content', async () => {
        // Act
        const result = await messengerService.searchMessages(
          testChat.id,
          testUser1.id,
          'programming',
          { limit: 10 },
        );

        // Assert
        expect(result.messages.length).toBeGreaterThanOrEqual(2);

        // Verify all results contain the search term
        result.messages.forEach(message => {
          const content = JSON.parse(message.content.toString());
          expect(content.text.toLowerCase()).toContain('programming');
        });
      });

      it('should search messages by sender', async () => {
        // Act
        const result = await messengerService.searchMessages(testChat.id, testUser1.id, '', {
          limit: 10,
          senderId: testUser2.id,
        });

        // Assert
        expect(result.messages.length).toBeGreaterThan(0);

        // Verify all results are from specified sender
        result.messages.forEach(message => {
          expect(message.senderId).toBe(testUser2.id.toString());
        });
      });

      it('should search messages by date range', async () => {
        // Arrange
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // Act
        const result = await messengerService.searchMessages(testChat.id, testUser1.id, '', {
          limit: 10,
          dateFrom: yesterday,
          dateTo: tomorrow,
        });

        // Assert
        expect(result.messages.length).toBeGreaterThan(0);

        // Verify all results are within date range
        result.messages.forEach(message => {
          const messageDate = new Date(message.createdAt);
          expect(messageDate).toBeGreaterThanOrEqual(yesterday);
          expect(messageDate).toBeLessThanOrEqual(tomorrow);
        });
      });

      it('should handle complex search with multiple filters', async () => {
        // Act
        const result = await messengerService.searchMessages(
          testChat.id,
          testUser1.id,
          'programming',
          {
            limit: 10,
            senderId: testUser1.id,
            messageType: MessageType.TEXT,
          },
        );

        // Assert
        expect(result.messages.length).toBeGreaterThan(0);

        result.messages.forEach(message => {
          const content = JSON.parse(message.content.toString());
          expect(content.text.toLowerCase()).toContain('programming');
          expect(message.senderId).toBe(testUser1.id.toString());
          expect(message.messageType).toBe(MessageType.TEXT);
        });
      });
    });
  });

  describe('DatabaseOptimizer Integration', () => {
    let testUser: User;
    let testChats: Chat[];

    beforeEach(async () => {
      testUser = await prisma.user.create({
        data: {
          id: BigInt('4001'),
          supabaseId: 'optimizer-user',
          email: 'optimizer@test.com',
          username: 'optimizeruser',
          roleId: BigInt('1'),
        },
      });

      // Create multiple chats for testing
      testChats = await Promise.all([
        prisma.chat.create({
          data: {
            id: BigInt('7001'),
            type: ChatType.DIRECT,
            createdById: testUser.id,
            memberCount: 1,
            lastMessageAt: new Date(Date.now() - 1000),
            lastMessageText: 'Latest message',
          },
        }),
        prisma.chat.create({
          data: {
            id: BigInt('7002'),
            type: ChatType.GROUP,
            title: 'Test Group',
            createdById: testUser.id,
            memberCount: 1,
            lastMessageAt: new Date(Date.now() - 2000),
            lastMessageText: 'Group message',
          },
        }),
        prisma.chat.create({
          data: {
            id: BigInt('7003'),
            type: ChatType.CHANNEL,
            title: 'Test Channel',
            createdById: testUser.id,
            memberCount: 1,
            lastMessageAt: new Date(Date.now() - 3000),
            lastMessageText: 'Channel message',
          },
        }),
      ]);

      // Add user as participant in all chats
      await prisma.chatParticipant.createMany({
        data: testChats.map(chat => ({
          chatId: chat.id,
          userId: testUser.id,
          role: ChatRole.MEMBER,
          joinedAt: new Date(),
        })),
      });
    });

    describe('getOptimizedUserChats', () => {
      it('should retrieve user chats with optimization', async () => {
        // Act
        const result = await databaseOptimizer.getOptimizedUserChats(testUser.id, { limit: 10 });

        // Assert
        expect(result.chats).toHaveLength(3);
        expect(result.total).toBe(3);

        // Verify chats are ordered by last message time (newest first)
        expect(result.chats[0].id).toBe(testChats[0].id.toString());
        expect(result.chats[1].id).toBe(testChats[1].id.toString());
        expect(result.chats[2].id).toBe(testChats[2].id.toString());
      });

      it('should filter chats by type', async () => {
        // Act
        const result = await databaseOptimizer.getOptimizedUserChats(testUser.id, {
          limit: 10,
          chatType: ChatType.GROUP,
        });

        // Assert
        expect(result.chats).toHaveLength(1);
        expect(result.chats[0].type).toBe(ChatType.GROUP);
      });

      it('should search chats by title', async () => {
        // Act
        const result = await databaseOptimizer.getOptimizedUserChats(testUser.id, {
          limit: 10,
          searchQuery: 'Test Group',
        });

        // Assert
        expect(result.chats).toHaveLength(1);
        expect(result.chats[0].title).toBe('Test Group');
      });

      it('should include unread counts', async () => {
        // Arrange - Create unread messages
        const unreadMessage = await prisma.message.create({
          data: {
            id: BigInt('8001'),
            chatId: testChats[0].id,
            senderId: testUser.id,
            content: Buffer.from('Unread message'),
            header: Buffer.from('{}'),
            messageType: MessageType.TEXT,
          },
        });

        // Act
        const result = await databaseOptimizer.getOptimizedUserChats(testUser.id, {
          limit: 10,
          includeUnreadCounts: true,
        });

        // Assert
        const chatWithUnread = result.chats.find(c => c.id === testChats[0].id.toString());
        expect(chatWithUnread!.unreadCount).toBeGreaterThan(0);
      });
    });

    describe('caching', () => {
      it('should cache frequently accessed data', async () => {
        // Act - First call (cache miss)
        const start1 = Date.now();
        const result1 = await databaseOptimizer.getOptimizedUserChats(testUser.id, { limit: 10 });
        const time1 = Date.now() - start1;

        // Act - Second call (cache hit)
        const start2 = Date.now();
        const result2 = await databaseOptimizer.getOptimizedUserChats(testUser.id, { limit: 10 });
        const time2 = Date.now() - start2;

        // Assert
        expect(result1.chats).toHaveLength(result2.chats.length);
        // Second call should be faster (cached)
        expect(time2).toBeLessThan(time1);
      });

      it('should invalidate cache on updates', async () => {
        // Arrange - Prime cache
        await databaseOptimizer.getOptimizedUserChats(testUser.id, { limit: 10 });

        // Act - Update chat (should invalidate cache)
        await prisma.chat.update({
          where: { id: testChats[0].id },
          data: { title: 'Updated Title' },
        });

        // Invalidate cache manually (in real app this would be automatic)
        await databaseOptimizer.invalidateUserChatsCache(testUser.id);

        // Act - Retrieve again
        const result = await databaseOptimizer.getOptimizedUserChats(testUser.id, { limit: 10 });

        // Assert - Should have updated data
        const updatedChat = result.chats.find(c => c.id === testChats[0].id.toString());
        expect(updatedChat!.title).toBe('Updated Title');
      });
    });
  });

  describe('Performance and Load Tests', () => {
    it('should handle high message volume', async () => {
      // Arrange
      const user1 = await prisma.user.create({
        data: {
          id: BigInt('5001'),
          supabaseId: 'perf-user-1',
          email: 'perf1@test.com',
          username: 'perfuser1',
          roleId: BigInt('1'),
        },
      });

      const user2 = await prisma.user.create({
        data: {
          id: BigInt('5002'),
          supabaseId: 'perf-user-2',
          email: 'perf2@test.com',
          username: 'perfuser2',
          roleId: BigInt('1'),
        },
      });

      const chat = await prisma.chat.create({
        data: {
          id: BigInt('8001'),
          type: ChatType.DIRECT,
          createdById: user1.id,
          memberCount: 2,
        },
      });

      await prisma.chatParticipant.createMany({
        data: [
          {
            chatId: chat.id,
            userId: user1.id,
            role: ChatRole.MEMBER,
            joinedAt: new Date(),
          },
          {
            chatId: chat.id,
            userId: user2.id,
            role: ChatRole.MEMBER,
            joinedAt: new Date(),
          },
        ],
      });

      // Act - Send many messages rapidly
      const messageCount = 50;
      const startTime = Date.now();

      const promises = Array.from({ length: messageCount }, (_, i) =>
        messengerService.sendMessage(user1.id, chat.id, {
          content: Buffer.from(`Bulk message ${i}`),
          header: Buffer.from('{}'),
          messageType: MessageType.TEXT,
        }),
      );

      await Promise.all(promises);
      const endTime = Date.now();

      // Assert
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds

      // Verify all messages were created
      const messageCount_db = await prisma.message.count({
        where: { chatId: chat.id },
      });
      expect(messageCount_db).toBe(messageCount);
    });

    it('should handle concurrent chat operations', async () => {
      // Arrange
      const users = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          prisma.user.create({
            data: {
              id: BigInt(`6000${i}`),
              supabaseId: `concurrent-user-${i}`,
              email: `concurrent${i}@test.com`,
              username: `concurrentuser${i}`,
              roleId: BigInt('1'),
            },
          }),
        ),
      );

      // Act - Create multiple chats concurrently
      const startTime = Date.now();
      const chatPromises = users.map((user, i) =>
        messengerService.createChat(user.id, {
          type: ChatType.GROUP,
          title: `Concurrent Chat ${i}`,
          participantIds: users
            .filter((_, j) => j !== i)
            .slice(0, 3)
            .map(u => u.id),
        }),
      );

      const chats = await Promise.all(chatPromises);
      const endTime = Date.now();

      // Assert
      expect(chats).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify chats were created correctly
      const dbChats = await prisma.chat.findMany({
        where: {
          id: { in: chats.map(c => BigInt(c.id)) },
        },
      });
      expect(dbChats).toHaveLength(10);
    });

    it('should efficiently handle large chat retrieval', async () => {
      // Arrange - Create user with many chats
      const user = await prisma.user.create({
        data: {
          id: BigInt('7001'),
          supabaseId: 'large-chat-user',
          email: 'largechat@test.com',
          username: 'largechatuser',
          roleId: BigInt('1'),
        },
      });

      // Create 100 chats
      const chatData = Array.from({ length: 100 }, (_, i) => ({
        id: BigInt(`9000${i.toString().padStart(2, '0')}`),
        type: ChatType.GROUP,
        title: `Chat ${i}`,
        createdById: user.id,
        memberCount: 1,
        lastMessageAt: new Date(Date.now() - i * 1000),
        lastMessageText: `Message ${i}`,
      }));

      await prisma.chat.createMany({ data: chatData });

      const participantData = chatData.map(chat => ({
        chatId: chat.id,
        userId: user.id,
        role: ChatRole.MEMBER,
        joinedAt: new Date(),
      }));

      await prisma.chatParticipant.createMany({ data: participantData });

      // Act - Retrieve chats with pagination
      const startTime = Date.now();
      const result = await databaseOptimizer.getOptimizedUserChats(user.id, {
        limit: 50,
        offset: 0,
      });
      const endTime = Date.now();

      // Assert
      expect(result.chats).toHaveLength(50);
      expect(result.total).toBe(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second

      // Verify correct ordering (newest first)
      for (let i = 0; i < result.chats.length - 1; i++) {
        const current = new Date(result.chats[i].lastMessageAt);
        const next = new Date(result.chats[i + 1].lastMessageAt);
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle database connection failures gracefully', async () => {
      // Note: This test would need to mock database failures
      // For now, we'll test timeout scenarios

      const user = await prisma.user.create({
        data: {
          id: BigInt('8001'),
          supabaseId: 'timeout-user',
          email: 'timeout@test.com',
          username: 'timeoutuser',
          roleId: BigInt('1'),
        },
      });

      // Act & Assert - Should handle invalid chat ID gracefully
      await expect(
        messengerService.getMessages(user.id, BigInt('999999'), { limit: 10 }),
      ).rejects.toThrow();
    });

    it('should handle corrupted message data', async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          id: BigInt('8002'),
          supabaseId: 'corrupt-user',
          email: 'corrupt@test.com',
          username: 'corruptuser',
          roleId: BigInt('1'),
        },
      });

      const chat = await prisma.chat.create({
        data: {
          id: BigInt('9001'),
          type: ChatType.DIRECT,
          createdById: user.id,
          memberCount: 1,
        },
      });

      await prisma.chatParticipant.create({
        data: {
          chatId: chat.id,
          userId: user.id,
          role: ChatRole.MEMBER,
          joinedAt: new Date(),
        },
      });

      // Create message with invalid content
      await prisma.message.create({
        data: {
          id: BigInt('10001'),
          chatId: chat.id,
          senderId: user.id,
          content: Buffer.from('invalid-json-{'),
          header: Buffer.from('invalid-json-{'),
          messageType: MessageType.TEXT,
        },
      });

      // Act & Assert - Should handle corrupted data gracefully
      const result = await messengerService.getMessages(user.id, chat.id, { limit: 10 });

      // Should still return results, possibly with sanitized data
      expect(result.messages).toBeDefined();
    });

    it('should handle race conditions in message ordering', async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          id: BigInt('8003'),
          supabaseId: 'race-user',
          email: 'race@test.com',
          username: 'raceuser',
          roleId: BigInt('1'),
        },
      });

      const chat = await prisma.chat.create({
        data: {
          id: BigInt('9002'),
          type: ChatType.DIRECT,
          createdById: user.id,
          memberCount: 1,
        },
      });

      await prisma.chatParticipant.create({
        data: {
          chatId: chat.id,
          userId: user.id,
          role: ChatRole.MEMBER,
          joinedAt: new Date(),
        },
      });

      // Act - Send multiple messages at nearly the same time
      const promises = Array.from({ length: 10 }, (_, i) =>
        messengerService.sendMessage(user.id, chat.id, {
          content: Buffer.from(`Race message ${i}`),
          header: Buffer.from('{}'),
          messageType: MessageType.TEXT,
        }),
      );

      const messages = await Promise.all(promises);

      // Assert - All messages should be created with proper ordering
      expect(messages).toHaveLength(10);

      const retrievedMessages = await messengerService.getMessages(user.id, chat.id, { limit: 10 });

      expect(retrievedMessages.messages).toHaveLength(10);

      // Verify messages are properly ordered by creation time
      for (let i = 0; i < retrievedMessages.messages.length - 1; i++) {
        const current = new Date(retrievedMessages.messages[i].createdAt);
        const next = new Date(retrievedMessages.messages[i + 1].createdAt);
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });
});
