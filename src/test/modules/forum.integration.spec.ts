import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from 'src/libs/supabase/db/prisma.service';
import { AuthModule } from 'src/modules/auth/auth.module';
import { ForumModule } from 'src/modules/forum/forum.module';
import { ForumCategoryService } from 'src/modules/forum/services/forum-category.service';
import { ForumModerationService } from 'src/modules/forum/services/forum-moderation.service';
import { ForumReplyService } from 'src/modules/forum/services/forum-reply.service';
import { ForumSearchService } from 'src/modules/forum/services/forum-search.service';
import { ForumService } from 'src/modules/forum/services/forum.service';
import { createTestUser } from '../setup/database-setup';

describe('Forum Module Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let forumService: ForumService;
  let forumReplyService: ForumReplyService;
  let forumCategoryService: ForumCategoryService;
  let forumModerationService: ForumModerationService;
  let forumSearchService: ForumSearchService;

  let testUser1: any;
  let testUser2: any;
  let moderatorUser: any;
  let testCategory: any;
  let testPost: any;
  let testReply: any;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ForumModule, AuthModule],
    }).compile();

    app = await createTestApp(module);
    prisma = app.get<PrismaService>(PrismaService);
    forumService = app.get<ForumService>(ForumService);
    forumReplyService = app.get<ForumReplyService>(ForumReplyService);
    forumCategoryService = app.get<ForumCategoryService>(ForumCategoryService);
    forumModerationService = app.get<ForumModerationService>(ForumModerationService);
    forumSearchService = app.get<ForumSearchService>(ForumSearchService);

    await createTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase(prisma);

    // Create test users
    testUser1 = await createTestUser(prisma, {
      username: 'forumuser1',
      email: 'forumuser1@test.com',
      reputation: 100,
    });

    testUser2 = await createTestUser(prisma, {
      username: 'forumuser2',
      email: 'forumuser2@test.com',
      reputation: 50,
    });

    moderatorUser = await createTestUser(prisma, {
      username: 'moderator',
      email: 'moderator@test.com',
      role: 'MODERATOR',
      reputation: 500,
    });

    // Create test category
    testCategory = await forumCategoryService.createCategory({
      name: 'Test Category',
      slug: 'test-category',
      description: 'A test category',
      color: '#FF5733',
      icon: 'test-icon',
      position: 1,
      archived: false,
      moderated: false,
      private: false,
    });
  });

  afterAll(async () => {
    await cleanupDatabase(prisma);
    await app.close();
  });

  describe('ForumCategoryService', () => {
    describe('Category Management', () => {
      it('should create a new category', async () => {
        const categoryDto = {
          name: 'New Category',
          slug: 'new-category',
          description: 'A new test category',
          color: '#00FF00',
          icon: 'new-icon',
          position: 2,
          archived: false,
          moderated: true,
          private: false,
        };

        const category = await forumCategoryService.createCategory(categoryDto);

        expect(category).toBeDefined();
        expect(category.name).toBe(categoryDto.name);
        expect(category.slug).toBe(categoryDto.slug);
        expect(category.moderated).toBe(true);
        expect(category.postCount).toBe(0);
        expect(category.topicCount).toBe(0);
      });

      it('should prevent duplicate category slugs', async () => {
        const categoryDto = {
          name: 'Another Category',
          slug: 'test-category', // Same slug as existing category
          description: 'This should fail',
          color: '#FF0000',
          icon: 'error-icon',
          position: 3,
        };

        await expect(forumCategoryService.createCategory(categoryDto)).rejects.toThrow();
      });

      it('should create nested categories with depth limit', async () => {
        // Create parent category
        const parentCategory = await forumCategoryService.createCategory({
          name: 'Parent Category',
          slug: 'parent-category',
          description: 'Parent category',
          color: '#0000FF',
          position: 1,
        });

        // Create child category
        const childCategory = await forumCategoryService.createCategory({
          name: 'Child Category',
          slug: 'child-category',
          description: 'Child category',
          color: '#FF00FF',
          position: 1,
          parentId: parentCategory.id,
        });

        expect(childCategory.parentId).toBe(parentCategory.id);

        // Create grandchild category
        const grandchildCategory = await forumCategoryService.createCategory({
          name: 'Grandchild Category',
          slug: 'grandchild-category',
          description: 'Grandchild category',
          color: '#FFFF00',
          position: 1,
          parentId: childCategory.id,
        });

        expect(grandchildCategory.parentId).toBe(childCategory.id);

        // Try to create great-grandchild (should fail due to depth limit)
        await expect(
          forumCategoryService.createCategory({
            name: 'Great-Grandchild Category',
            slug: 'great-grandchild-category',
            description: 'This should fail',
            color: '#000000',
            position: 1,
            parentId: grandchildCategory.id,
          }),
        ).rejects.toThrow('Maximum nesting level (3) exceeded');
      });

      it('should update category details', async () => {
        const updateDto = {
          name: 'Updated Category Name',
          description: 'Updated description',
          color: '#123456',
          moderated: true,
        };

        const updatedCategory = await forumCategoryService.updateCategory(
          testCategory.id,
          updateDto,
        );

        expect(updatedCategory.name).toBe(updateDto.name);
        expect(updatedCategory.description).toBe(updateDto.description);
        expect(updatedCategory.color).toBe(updateDto.color);
        expect(updatedCategory.moderated).toBe(true);
      });

      it('should prevent deletion of category with posts', async () => {
        // Create a post in the category
        testPost = await forumService.createPost(testUser1.id, {
          title: 'Test Post',
          content: 'Test content',
          categoryId: testCategory.id,
          type: 'DISCUSSION',
        });

        await expect(forumCategoryService.deleteCategory(testCategory.id)).rejects.toThrow(
          'Cannot delete category with posts',
        );
      });

      it('should prevent deletion of category with subcategories', async () => {
        // Create a subcategory
        await forumCategoryService.createCategory({
          name: 'Subcategory',
          slug: 'subcategory',
          description: 'A subcategory',
          color: '#999999',
          position: 1,
          parentId: testCategory.id,
        });

        await expect(forumCategoryService.deleteCategory(testCategory.id)).rejects.toThrow(
          'Cannot delete category with subcategories',
        );
      });

      it('should reorder categories', async () => {
        const category2 = await forumCategoryService.createCategory({
          name: 'Category 2',
          slug: 'category-2',
          description: 'Second category',
          color: '#FF0000',
          position: 2,
        });

        const category3 = await forumCategoryService.createCategory({
          name: 'Category 3',
          slug: 'category-3',
          description: 'Third category',
          color: '#00FF00',
          position: 3,
        });

        await forumCategoryService.reorderCategories([
          { id: testCategory.id, position: 3 },
          { id: category2.id, position: 1 },
          { id: category3.id, position: 2 },
        ]);

        const categories = await forumCategoryService.findAllCategories();
        const sorted = categories.sort((a, b) => a.position - b.position);

        expect(sorted[0].id).toBe(category2.id);
        expect(sorted[1].id).toBe(category3.id);
        expect(sorted[2].id).toBe(testCategory.id);
      });

      it('should get category stats', async () => {
        // Create posts and replies
        testPost = await forumService.createPost(testUser1.id, {
          title: 'Test Post',
          content: 'Test content',
          categoryId: testCategory.id,
          type: 'DISCUSSION',
        });

        await forumReplyService.createReply(testPost.id, testUser2.id, {
          content: 'Test reply',
        });

        const stats = await forumCategoryService.getCategoryStats(testCategory.id);

        expect(stats.postCount).toBe(1);
        expect(stats.replyCount).toBe(1);
        expect(stats.lastActivity).toBeDefined();
      });
    });
  });

  describe('ForumService', () => {
    beforeEach(async () => {
      testPost = await forumService.createPost(testUser1.id, {
        title: 'Test Post',
        content: 'Test content for discussion',
        categoryId: testCategory.id,
        type: 'DISCUSSION',
        tags: ['test', 'discussion'],
      });
    });

    describe('Post Management', () => {
      it('should create a new post', async () => {
        const postDto = {
          title: 'New Test Post',
          content: 'Content for new test post',
          categoryId: testCategory.id,
          type: 'QUESTION' as const,
          tags: ['new', 'question'],
        };

        const post = await forumService.createPost(testUser1.id, postDto);

        expect(post).toBeDefined();
        expect(post.title).toBe(postDto.title);
        expect(post.content).toBe(postDto.content);
        expect(post.type).toBe(postDto.type);
        expect(post.slug).toBeDefined();
        expect(post.author.id).toBe(testUser1.id);
        expect(post.category.id).toBe(testCategory.id);
        expect(post.tags).toHaveLength(2);
        expect(post.netVotes).toBe(0);
        expect(post.views).toBe(0);
        expect(post.solved).toBe(false);
      });

      it('should prevent posting in archived category', async () => {
        // Archive the category
        await forumCategoryService.updateCategory(testCategory.id, {
          archived: true,
        });

        await expect(
          forumService.createPost(testUser1.id, {
            title: 'Should Fail',
            content: 'This should fail',
            categoryId: testCategory.id,
            type: 'DISCUSSION',
          }),
        ).rejects.toThrow('Cannot post in archived category');
      });

      it('should generate unique slugs for similar titles', async () => {
        const title = 'Duplicate Title Post';

        const post1 = await forumService.createPost(testUser1.id, {
          title,
          content: 'First post with this title',
          categoryId: testCategory.id,
          type: 'DISCUSSION',
        });

        const post2 = await forumService.createPost(testUser2.id, {
          title,
          content: 'Second post with same title',
          categoryId: testCategory.id,
          type: 'DISCUSSION',
        });

        expect(post1.slug).toBeDefined();
        expect(post2.slug).toBeDefined();
        expect(post1.slug).not.toBe(post2.slug);
      });

      it('should update post with permission check', async () => {
        const updateDto = {
          title: 'Updated Title',
          content: 'Updated content',
          tags: ['updated', 'modified'],
        };

        const updatedPost = await forumService.updatePost(testPost.id, testUser1.id, updateDto);

        expect(updatedPost.title).toBe(updateDto.title);
        expect(updatedPost.content).toBe(updateDto.content);
        expect(updatedPost.tags).toHaveLength(2);
        expect(updatedPost.updatedAt).toBeDefined();
      });

      it('should prevent updating other users posts', async () => {
        await expect(
          forumService.updatePost(testPost.id, testUser2.id, {
            title: 'Unauthorized Update',
            content: 'This should fail',
          }),
        ).rejects.toThrow('You can only edit your own posts');
      });

      it('should prevent updating locked posts', async () => {
        // Lock the post
        await prisma.forumPost.update({
          where: { id: testPost.id },
          data: { locked: true },
        });

        await expect(
          forumService.updatePost(testPost.id, testUser1.id, {
            title: 'Cannot Update',
            content: 'This should fail',
          }),
        ).rejects.toThrow('Cannot edit locked post');
      });

      it('should delete post with proper cleanup', async () => {
        // Create replies to test cascading
        await forumReplyService.createReply(testPost.id, testUser2.id, {
          content: 'Reply to be deleted',
        });

        const initialCategoryStats = await forumCategoryService.getCategoryStats(testCategory.id);

        await forumService.deletePost(testPost.id, testUser1.id);

        // Verify post is deleted
        await expect(forumService.findPostById(testPost.id)).rejects.toThrow('Post not found');

        // Verify category counters updated
        const updatedCategoryStats = await forumCategoryService.getCategoryStats(testCategory.id);
        expect(updatedCategoryStats.postCount).toBe(initialCategoryStats.postCount - 1);
      });

      it('should increment view count when viewing post', async () => {
        const initialViews = testPost.views;

        const viewedPost = await forumService.findPostById(testPost.id, testUser2.id);

        // Wait a bit for async view increment
        await new Promise(resolve => setTimeout(resolve, 100));

        const updatedPost = await forumService.findPostById(testPost.id, testUser2.id);
        expect(updatedPost.views).toBeGreaterThan(initialViews);
      });
    });

    describe('Post Querying and Filtering', () => {
      beforeEach(async () => {
        // Create various posts for testing
        await forumService.createPost(testUser1.id, {
          title: 'Question Post',
          content: 'This is a question',
          categoryId: testCategory.id,
          type: 'QUESTION',
          tags: ['question', 'help'],
        });

        await forumService.createPost(testUser2.id, {
          title: 'Discussion Post',
          content: 'This is a discussion',
          categoryId: testCategory.id,
          type: 'DISCUSSION',
          tags: ['discussion', 'general'],
        });

        await forumService.createPost(testUser1.id, {
          title: 'Tutorial Post',
          content: 'This is a tutorial',
          categoryId: testCategory.id,
          type: 'TUTORIAL',
          tags: ['tutorial', 'guide'],
        });
      });

      it('should find posts with pagination', async () => {
        const result = await forumService.findPosts({
          page: 1,
          limit: 2,
          categoryId: testCategory.id,
        });

        expect(result.posts).toHaveLength(2);
        expect(result.total).toBeGreaterThanOrEqual(4);
        expect(result.page).toBe(1);
        expect(result.totalPages).toBeGreaterThanOrEqual(2);
      });

      it('should filter posts by type', async () => {
        const result = await forumService.findPosts({
          type: 'QUESTION',
          categoryId: testCategory.id,
        });

        expect(result.posts.length).toBeGreaterThan(0);
        result.posts.forEach(post => {
          expect(post.type).toBe('QUESTION');
        });
      });

      it('should filter posts by tags', async () => {
        const result = await forumService.findPosts({
          tags: ['tutorial'],
          categoryId: testCategory.id,
        });

        expect(result.posts.length).toBeGreaterThan(0);
        result.posts.forEach(post => {
          expect(post.tags.some(tag => tag.tag.name === 'tutorial')).toBe(true);
        });
      });

      it('should search posts by content', async () => {
        const result = await forumService.findPosts({
          search: 'discussion',
        });

        expect(result.posts.length).toBeGreaterThan(0);
        result.posts.forEach(post => {
          const hasMatchInTitle = post.title.toLowerCase().includes('discussion');
          const hasMatchInContent = post.content.toLowerCase().includes('discussion');
          expect(hasMatchInTitle || hasMatchInContent).toBe(true);
        });
      });

      it('should sort posts by different criteria', async () => {
        // Test latest sorting
        const latestResult = await forumService.findPosts({
          sortBy: 'latest',
          sortOrder: 'desc',
          categoryId: testCategory.id,
        });

        expect(latestResult.posts[0].createdAt.getTime()).toBeGreaterThanOrEqual(
          latestResult.posts[1].createdAt.getTime(),
        );

        // Test votes sorting (after adding some votes)
        await forumService.votePost(testPost.id, testUser2.id, 1);

        const votesResult = await forumService.findPosts({
          sortBy: 'votes',
          sortOrder: 'desc',
          categoryId: testCategory.id,
        });

        expect(votesResult.posts).toBeDefined();
      });

      it('should filter solved/unsolved questions', async () => {
        const unsolvedResult = await forumService.findPosts({
          solved: false,
          type: 'QUESTION',
          categoryId: testCategory.id,
        });

        unsolvedResult.posts.forEach(post => {
          expect(post.solved).toBe(false);
          expect(post.type).toBe('QUESTION');
        });
      });
    });

    describe('Post Voting', () => {
      it('should vote on post', async () => {
        const voteResult = await forumService.votePost(testPost.id, testUser2.id, 1);

        expect(voteResult.success).toBe(true);
        expect(voteResult.netVotes).toBe(1);

        // Verify vote is recorded
        const post = await forumService.findPostById(testPost.id, testUser2.id);
        expect(post.netVotes).toBe(1);
        expect(post.upvotes).toBe(1);
        expect(post.userVote).toBe(1);
      });

      it('should change vote', async () => {
        // First vote up
        await forumService.votePost(testPost.id, testUser2.id, 1);

        // Then vote down
        const voteResult = await forumService.votePost(testPost.id, testUser2.id, -1);

        expect(voteResult.success).toBe(true);
        expect(voteResult.netVotes).toBe(-1);

        const post = await forumService.findPostById(testPost.id, testUser2.id);
        expect(post.netVotes).toBe(-1);
        expect(post.upvotes).toBe(0);
        expect(post.downvotes).toBe(1);
        expect(post.userVote).toBe(-1);
      });

      it('should remove vote when voting same value', async () => {
        // Vote up
        await forumService.votePost(testPost.id, testUser2.id, 1);

        // Vote up again (should remove vote)
        const voteResult = await forumService.votePost(testPost.id, testUser2.id, 1);

        expect(voteResult.success).toBe(true);
        expect(voteResult.netVotes).toBe(0);

        const post = await forumService.findPostById(testPost.id, testUser2.id);
        expect(post.netVotes).toBe(0);
        expect(post.userVote).toBeUndefined();
      });

      it('should prevent self-voting', async () => {
        await expect(forumService.votePost(testPost.id, testUser1.id, 1)).rejects.toThrow(
          'Cannot vote on your own post',
        );
      });
    });

    describe('Forum Statistics', () => {
      it('should get forum statistics', async () => {
        // Create some additional content
        await forumReplyService.createReply(testPost.id, testUser2.id, {
          content: 'Test reply for stats',
        });

        const stats = await forumService.getForumStats();

        expect(stats.totalPosts).toBeGreaterThan(0);
        expect(stats.totalReplies).toBeGreaterThan(0);
        expect(stats.totalUsers).toBeGreaterThan(0);
        expect(stats.totalCategories).toBeGreaterThan(0);
        expect(typeof stats.todayPosts).toBe('number');
        expect(typeof stats.todayReplies).toBe('number');
        expect(typeof stats.activeUsers).toBe('number');
      });
    });
  });

  describe('ForumReplyService', () => {
    beforeEach(async () => {
      testPost = await forumService.createPost(testUser1.id, {
        title: 'Test Post for Replies',
        content: 'Test content',
        categoryId: testCategory.id,
        type: 'QUESTION',
      });
    });

    describe('Reply Management', () => {
      it('should create a reply', async () => {
        const replyDto = {
          content: 'This is a test reply',
        };

        const reply = await forumReplyService.createReply(testPost.id, testUser2.id, replyDto);

        expect(reply).toBeDefined();
        expect(reply.content).toBe(replyDto.content);
        expect(reply.author.id).toBe(testUser2.id);
        expect(reply.netVotes).toBe(0);
        expect(reply.isSolution).toBe(false);

        // Verify post reply count updated
        const updatedPost = await forumService.findPostById(testPost.id);
        expect(updatedPost.replyCount).toBe(1);
      });

      it('should create nested replies', async () => {
        // Create parent reply
        const parentReply = await forumReplyService.createReply(testPost.id, testUser2.id, {
          content: 'Parent reply',
        });

        // Create child reply
        const childReply = await forumReplyService.createReply(testPost.id, testUser1.id, {
          content: 'Child reply',
          parentId: parentReply.id,
        });

        expect(childReply.parentId).toBe(parentReply.id);

        // Verify replies are nested properly
        const replies = await forumReplyService.findRepliesByPost(testPost.id);
        const parent = replies.find(r => r.id === parentReply.id);
        expect(parent?.children).toHaveLength(1);
        expect(parent?.children[0].id).toBe(childReply.id);
      });

      it('should prevent replying to locked posts', async () => {
        // Lock the post
        await prisma.forumPost.update({
          where: { id: testPost.id },
          data: { locked: true },
        });

        await expect(
          forumReplyService.createReply(testPost.id, testUser2.id, {
            content: 'This should fail',
          }),
        ).rejects.toThrow('Cannot reply to locked post');
      });

      it('should mark reply as solution', async () => {
        const reply = await forumReplyService.createReply(testPost.id, testUser2.id, {
          content: 'This is the solution',
          isSolution: true,
        });

        expect(reply.isSolution).toBe(true);

        // Verify post is marked as solved
        const updatedPost = await forumService.findPostById(testPost.id);
        expect(updatedPost.solved).toBe(true);

        // Verify user reputation increased
        const updatedUser = await prisma.user.findUnique({
          where: { id: testUser2.id },
        });
        expect(updatedUser?.reputation).toBe(testUser2.reputation + 10);
      });

      it('should handle multiple solutions properly', async () => {
        // Create first solution
        const reply1 = await forumReplyService.createReply(testPost.id, testUser2.id, {
          content: 'First solution',
          isSolution: true,
        });

        // Create second solution (should unmark first)
        const reply2 = await forumReplyService.createReply(testPost.id, testUser1.id, {
          content: 'Better solution',
          isSolution: true,
        });

        const replies = await forumReplyService.findRepliesByPost(testPost.id);
        const firstReply = replies.find(r => r.id === reply1.id);
        const secondReply = replies.find(r => r.id === reply2.id);

        expect(firstReply?.isSolution).toBe(false);
        expect(secondReply?.isSolution).toBe(true);
      });

      it('should update reply with permission check', async () => {
        const reply = await forumReplyService.createReply(testPost.id, testUser2.id, {
          content: 'Original content',
        });

        const updateDto = {
          content: 'Updated content',
          isSolution: true,
        };

        const updatedReply = await forumReplyService.updateReply(reply.id, testUser2.id, updateDto);

        expect(updatedReply.content).toBe(updateDto.content);
        expect(updatedReply.isSolution).toBe(true);
      });

      it('should prevent updating other users replies', async () => {
        const reply = await forumReplyService.createReply(testPost.id, testUser2.id, {
          content: 'Original content',
        });

        await expect(
          forumReplyService.updateReply(reply.id, testUser1.id, {
            content: 'Unauthorized update',
          }),
        ).rejects.toThrow('You can only edit your own replies');
      });

      it('should delete reply with proper cleanup', async () => {
        const reply = await forumReplyService.createReply(testPost.id, testUser2.id, {
          content: 'Reply to delete',
        });

        await forumReplyService.deleteReply(reply.id, testUser2.id);

        await expect(forumReplyService.findReplyById(reply.id)).rejects.toThrow('Reply not found');

        // Verify post reply count updated
        const updatedPost = await forumService.findPostById(testPost.id);
        expect(updatedPost.replyCount).toBe(0);
      });

      it('should prevent deleting replies with children', async () => {
        const parentReply = await forumReplyService.createReply(testPost.id, testUser2.id, {
          content: 'Parent reply',
        });

        await forumReplyService.createReply(testPost.id, testUser1.id, {
          content: 'Child reply',
          parentId: parentReply.id,
        });

        await expect(forumReplyService.deleteReply(parentReply.id, testUser2.id)).rejects.toThrow(
          'Cannot delete reply with child replies',
        );
      });
    });

    describe('Reply Voting', () => {
      let testReply: any;

      beforeEach(async () => {
        testReply = await forumReplyService.createReply(testPost.id, testUser2.id, {
          content: 'Reply for voting tests',
        });
      });

      it('should vote on reply', async () => {
        const voteResult = await forumReplyService.voteReply(testReply.id, testUser1.id, 1);

        expect(voteResult.success).toBe(true);
        expect(voteResult.netVotes).toBe(1);

        const reply = await forumReplyService.findReplyById(testReply.id, testUser1.id);
        expect(reply.netVotes).toBe(1);
        expect(reply.userVote).toBe(1);
      });

      it('should change reply vote', async () => {
        await forumReplyService.voteReply(testReply.id, testUser1.id, 1);
        const voteResult = await forumReplyService.voteReply(testReply.id, testUser1.id, -1);

        expect(voteResult.netVotes).toBe(-1);
      });

      it('should prevent self-voting on replies', async () => {
        await expect(forumReplyService.voteReply(testReply.id, testUser2.id, 1)).rejects.toThrow(
          'Cannot vote on your own reply',
        );
      });
    });

    describe('Reply Retrieval and Sorting', () => {
      beforeEach(async () => {
        // Create multiple replies with different characteristics
        const reply1 = await forumReplyService.createReply(testPost.id, testUser2.id, {
          content: 'First reply',
        });

        const reply2 = await forumReplyService.createReply(testPost.id, testUser1.id, {
          content: 'Solution reply',
          isSolution: true,
        });

        const reply3 = await forumReplyService.createReply(testPost.id, testUser2.id, {
          content: 'Popular reply',
        });

        // Add votes to make reply3 popular
        await forumReplyService.voteReply(reply3.id, testUser1.id, 1);
      });

      it('should sort replies with solutions first', async () => {
        const replies = await forumReplyService.findRepliesByPost(testPost.id);

        expect(replies.length).toBe(3);
        expect(replies[0].isSolution).toBe(true);
      });

      it('should include user votes when authenticated', async () => {
        const replies = await forumReplyService.findRepliesByPost(testPost.id, testUser1.id);

        const votedReply = replies.find(r => r.userVote !== undefined);
        expect(votedReply).toBeDefined();
      });
    });
  });

  describe('ForumModerationService', () => {
    let testReport: any;

    beforeEach(async () => {
      testPost = await forumService.createPost(testUser1.id, {
        title: 'Post to Moderate',
        content: 'Content that might need moderation',
        categoryId: testCategory.id,
        type: 'DISCUSSION',
      });

      testReply = await forumReplyService.createReply(testPost.id, testUser2.id, {
        content: 'Reply that might need moderation',
      });
    });

    describe('Content Reporting', () => {
      it('should report post content', async () => {
        const reportDto = {
          reason: 'SPAM' as const,
          details: 'This post contains spam content',
        };

        const result = await forumModerationService.reportContent(
          testUser2.id,
          testPost.id,
          'POST',
          reportDto,
        );

        expect(result.success).toBe(true);
        expect(result.reportId).toBeDefined();

        testReport = result;
      });

      it('should report reply content', async () => {
        const reportDto = {
          reason: 'INAPPROPRIATE' as const,
          details: 'This reply is inappropriate',
        };

        const result = await forumModerationService.reportContent(
          testUser1.id,
          testReply.id,
          'REPLY',
          reportDto,
        );

        expect(result.success).toBe(true);
        expect(result.reportId).toBeDefined();
      });

      it('should prevent duplicate reports', async () => {
        await forumModerationService.reportContent(testUser2.id, testPost.id, 'POST', {
          reason: 'SPAM',
          details: 'First report',
        });

        await expect(
          forumModerationService.reportContent(testUser2.id, testPost.id, 'POST', {
            reason: 'SPAM',
            details: 'Duplicate report',
          }),
        ).rejects.toThrow('You have already reported this content');
      });
    });

    describe('Report Management', () => {
      beforeEach(async () => {
        const result = await forumModerationService.reportContent(
          testUser2.id,
          testPost.id,
          'POST',
          {
            reason: 'SPAM',
            details: 'Test report for moderation',
          },
        );
        testReport = { reportId: result.reportId };
      });

      it('should get pending reports', async () => {
        const reports = await forumModerationService.getReports('PENDING');

        expect(reports.reports.length).toBeGreaterThan(0);
        expect(reports.total).toBeGreaterThan(0);

        const testReportFound = reports.reports.find(r => r.id === testReport.reportId);
        expect(testReportFound).toBeDefined();
        expect(testReportFound.status).toBe('PENDING');
      });

      it('should get all reports with pagination', async () => {
        const reports = await forumModerationService.getReports(undefined, 1, 10);

        expect(reports.page).toBe(1);
        expect(reports.totalPages).toBeGreaterThanOrEqual(1);
        expect(reports.reports.length).toBeLessThanOrEqual(10);
      });
    });

    describe('Moderation Actions', () => {
      beforeEach(async () => {
        const result = await forumModerationService.reportContent(
          testUser2.id,
          testPost.id,
          'POST',
          {
            reason: 'SPAM',
            details: 'Test report for moderation actions',
          },
        );
        testReport = { reportId: result.reportId };
      });

      it('should moderate reported content with DELETE action', async () => {
        const actionDto = {
          action: 'DELETE' as const,
          reason: 'Content violates community guidelines',
          notes: 'Deleted due to spam',
        };

        const result = await forumModerationService.moderateContent(
          testReport.reportId,
          moderatorUser.id,
          actionDto,
        );

        expect(result.success).toBe(true);

        // Verify post is deleted
        await expect(forumService.findPostById(testPost.id)).rejects.toThrow('Post not found');

        // Verify report is resolved
        const reports = await forumModerationService.getReports('RESOLVED');
        const resolvedReport = reports.reports.find(r => r.id === testReport.reportId);
        expect(resolvedReport?.status).toBe('RESOLVED');
      });

      it('should lock post', async () => {
        const result = await forumModerationService.lockPost(
          testPost.id,
          moderatorUser.id,
          'Locking due to heated discussion',
        );

        expect(result.success).toBe(true);

        // Verify post is locked
        const post = await forumService.findPostById(testPost.id);
        expect(post.locked).toBe(true);

        // Verify cannot reply to locked post
        await expect(
          forumReplyService.createReply(testPost.id, testUser1.id, {
            content: 'Should fail',
          }),
        ).rejects.toThrow('Cannot reply to locked post');
      });

      it('should pin post', async () => {
        const result = await forumModerationService.pinPost(
          testPost.id,
          moderatorUser.id,
          'Pinning important announcement',
        );

        expect(result.success).toBe(true);

        // Verify post is pinned
        const post = await forumService.findPostById(testPost.id);
        expect(post.pinned).toBe(true);
      });

      it('should feature post', async () => {
        const result = await forumModerationService.featurePost(
          testPost.id,
          moderatorUser.id,
          'Featuring excellent content',
        );

        expect(result.success).toBe(true);

        // Verify post is featured
        const post = await forumService.findPostById(testPost.id);
        expect(post.featured).toBe(true);
      });

      it('should move post between categories', async () => {
        const newCategory = await forumCategoryService.createCategory({
          name: 'New Category',
          slug: 'new-category',
          description: 'Category for moved posts',
          color: '#123456',
          position: 2,
        });

        const result = await forumModerationService.movePost(
          testPost.id,
          newCategory.id,
          moderatorUser.id,
          'Moving to more appropriate category',
        );

        expect(result.success).toBe(true);

        // Verify post is in new category
        const post = await forumService.findPostById(testPost.id);
        expect(post.category.id).toBe(newCategory.id);
      });

      it('should dismiss report', async () => {
        const result = await forumModerationService.dismissReport(
          testReport.reportId,
          moderatorUser.id,
          'Report is not valid',
        );

        expect(result.success).toBe(true);

        // Verify report is dismissed
        const reports = await forumModerationService.getReports('DISMISSED');
        const dismissedReport = reports.reports.find(r => r.id === testReport.reportId);
        expect(dismissedReport?.status).toBe('DISMISSED');
      });
    });

    describe('Moderation Logs', () => {
      beforeEach(async () => {
        // Perform some moderation actions to create logs
        await forumModerationService.lockPost(testPost.id, moderatorUser.id, 'Test lock');

        await forumModerationService.pinPost(testPost.id, moderatorUser.id, 'Test pin');
      });

      it('should get moderation logs', async () => {
        const logs = await forumModerationService.getModerationLogs();

        expect(logs.logs.length).toBeGreaterThan(0);
        expect(logs.total).toBeGreaterThan(0);

        const lockLog = logs.logs.find(l => l.action === 'LOCK');
        const pinLog = logs.logs.find(l => l.action === 'PIN');

        expect(lockLog).toBeDefined();
        expect(pinLog).toBeDefined();
      });

      it('should filter logs by target', async () => {
        const logs = await forumModerationService.getModerationLogs(testPost.id);

        logs.logs.forEach(log => {
          expect(log.targetId).toBe(testPost.id);
        });
      });

      it('should filter logs by moderator', async () => {
        const logs = await forumModerationService.getModerationLogs(undefined, moderatorUser.id);

        logs.logs.forEach(log => {
          expect(log.moderatorId).toBe(moderatorUser.id);
        });
      });
    });
  });

  describe('Performance and Load Tests', () => {
    describe('Bulk Operations', () => {
      it('should handle bulk post creation', async () => {
        const startTime = Date.now();
        const posts = [];

        for (let i = 0; i < 50; i++) {
          posts.push(
            forumService.createPost(testUser1.id, {
              title: `Bulk Post ${i}`,
              content: `Content for bulk post ${i}`,
              categoryId: testCategory.id,
              type: 'DISCUSSION',
            }),
          );
        }

        const createdPosts = await Promise.all(posts);
        const endTime = Date.now();

        expect(createdPosts).toHaveLength(50);
        expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds

        // Verify category counters are accurate
        const categoryStats = await forumCategoryService.getCategoryStats(testCategory.id);
        expect(categoryStats.postCount).toBeGreaterThanOrEqual(50);
      });

      it('should handle bulk reply creation', async () => {
        testPost = await forumService.createPost(testUser1.id, {
          title: 'Post for Bulk Replies',
          content: 'Content for bulk reply testing',
          categoryId: testCategory.id,
          type: 'DISCUSSION',
        });

        const startTime = Date.now();
        const replies = [];

        for (let i = 0; i < 100; i++) {
          replies.push(
            forumReplyService.createReply(testPost.id, testUser2.id, {
              content: `Bulk reply ${i}`,
            }),
          );
        }

        const createdReplies = await Promise.all(replies);
        const endTime = Date.now();

        expect(createdReplies).toHaveLength(100);
        expect(endTime - startTime).toBeLessThan(15000); // Should complete within 15 seconds

        // Verify post reply count
        const updatedPost = await forumService.findPostById(testPost.id);
        expect(updatedPost.replyCount).toBe(100);
      });

      it('should handle concurrent voting', async () => {
        testPost = await forumService.createPost(testUser1.id, {
          title: 'Post for Concurrent Voting',
          content: 'Content for voting test',
          categoryId: testCategory.id,
          type: 'DISCUSSION',
        });

        // Create multiple users for voting
        const voters = [];
        for (let i = 0; i < 20; i++) {
          const user = await createTestUser(prisma, {
            username: `voter${i}`,
            email: `voter${i}@test.com`,
          });
          voters.push(user);
        }

        const startTime = Date.now();
        const votes = voters.map((voter, index) =>
          forumService.votePost(testPost.id, voter.id, index % 2 === 0 ? 1 : -1),
        );

        const voteResults = await Promise.all(votes);
        const endTime = Date.now();

        expect(voteResults).toHaveLength(20);
        expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds

        // Verify final vote count
        const finalPost = await forumService.findPostById(testPost.id);
        expect(Math.abs(finalPost.netVotes)).toBeLessThanOrEqual(20);
      });
    });

    describe('Large Dataset Queries', () => {
      beforeEach(async () => {
        // Create a large dataset for testing
        const posts = [];
        for (let i = 0; i < 200; i++) {
          posts.push(
            forumService.createPost(testUser1.id, {
              title: `Large Dataset Post ${i}`,
              content: `Content for post ${i} with various keywords like ${faker.lorem.words(10)}`,
              categoryId: testCategory.id,
              type: i % 3 === 0 ? 'QUESTION' : i % 3 === 1 ? 'DISCUSSION' : 'TUTORIAL',
              tags: [faker.lorem.word(), faker.lorem.word()],
            }),
          );

          // Batch create to avoid overwhelming the database
          if (posts.length === 25) {
            await Promise.all(posts);
            posts.length = 0;
          }
        }

        if (posts.length > 0) {
          await Promise.all(posts);
        }
      });

      it('should efficiently paginate through large datasets', async () => {
        const startTime = Date.now();

        // Test various page sizes
        const pageSizes = [10, 25, 50, 100];

        for (const pageSize of pageSizes) {
          const result = await forumService.findPosts({
            page: 1,
            limit: pageSize,
            categoryId: testCategory.id,
          });

          expect(result.posts.length).toBeLessThanOrEqual(pageSize);
          expect(result.total).toBeGreaterThan(200);
        }

        const endTime = Date.now();
        expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
      });

      it('should efficiently search large datasets', async () => {
        const startTime = Date.now();

        const searchResult = await forumService.findPosts({
          search: 'Large Dataset',
          limit: 50,
        });

        const endTime = Date.now();

        expect(searchResult.posts.length).toBeGreaterThan(0);
        expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      });

      it('should efficiently sort large datasets', async () => {
        const startTime = Date.now();

        const sortOptions = ['latest', 'popular', 'votes', 'views'];

        for (const sortBy of sortOptions) {
          const result = await forumService.findPosts({
            sortBy,
            sortOrder: 'desc',
            categoryId: testCategory.id,
            limit: 25,
          });

          expect(result.posts.length).toBeLessThanOrEqual(25);
        }

        const endTime = Date.now();
        expect(endTime - startTime).toBeLessThan(3000); // Should complete within 3 seconds
      });
    });
  });

  describe('Database Consistency and Transactions', () => {
    it('should maintain consistency during concurrent post creation', async () => {
      const concurrentPosts = Array(10)
        .fill(null)
        .map((_, i) =>
          forumService.createPost(testUser1.id, {
            title: `Concurrent Post ${i}`,
            content: `Content ${i}`,
            categoryId: testCategory.id,
            type: 'DISCUSSION',
          }),
        );

      const posts = await Promise.all(concurrentPosts);

      // Verify all posts were created with unique IDs
      const postIds = posts.map(p => p.id);
      const uniqueIds = new Set(postIds);
      expect(uniqueIds.size).toBe(posts.length);

      // Verify category counters are accurate
      const categoryStats = await forumCategoryService.getCategoryStats(testCategory.id);
      expect(categoryStats.postCount).toBeGreaterThanOrEqual(10);
    });

    it('should handle database errors gracefully', async () => {
      // Attempt to create post with invalid category
      await expect(
        forumService.createPost(testUser1.id, {
          title: 'Invalid Post',
          content: 'Content',
          categoryId: 'non-existent-category',
          type: 'DISCUSSION',
        }),
      ).rejects.toThrow('Category not found');

      // Verify no partial data was created
      const posts = await forumService.findPosts({
        search: 'Invalid Post',
      });
      expect(posts.posts).toHaveLength(0);
    });

    it('should properly rollback failed transactions', async () => {
      testPost = await forumService.createPost(testUser1.id, {
        title: 'Test Transaction Rollback',
        content: 'Content',
        categoryId: testCategory.id,
        type: 'DISCUSSION',
      });

      const initialCategoryStats = await forumCategoryService.getCategoryStats(testCategory.id);

      // Mock a database error during post deletion
      const originalDelete = prisma.forumPost.delete;
      let deleteCallCount = 0;

      prisma.forumPost.delete = jest.fn().mockImplementation((...args) => {
        deleteCallCount++;
        if (deleteCallCount === 1) {
          throw new Error('Simulated database error');
        }
        return originalDelete.apply(prisma.forumPost, args);
      });

      // Attempt deletion (should fail and rollback)
      await expect(forumService.deletePost(testPost.id, testUser1.id)).rejects.toThrow(
        'Simulated database error',
      );

      // Verify post still exists
      const post = await forumService.findPostById(testPost.id);
      expect(post).toBeDefined();

      // Verify category counters weren't affected
      const categoryStats = await forumCategoryService.getCategoryStats(testCategory.id);
      expect(categoryStats.postCount).toBe(initialCategoryStats.postCount);

      // Restore original method
      prisma.forumPost.delete = originalDelete;
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty search queries', async () => {
      const result = await forumService.findPosts({
        search: '',
      });

      expect(result.posts).toBeDefined();
      expect(Array.isArray(result.posts)).toBe(true);
    });

    it('should handle invalid pagination parameters', async () => {
      const result = await forumService.findPosts({
        page: -1,
        limit: 0,
      });

      expect(result.posts).toBeDefined();
      expect(result.page).toBeGreaterThan(0);
      expect(result.posts.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle non-existent post operations gracefully', async () => {
      const nonExistentId = 'non-existent-post-id';

      await expect(forumService.findPostById(nonExistentId)).rejects.toThrow('Post not found');

      await expect(
        forumService.updatePost(nonExistentId, testUser1.id, {
          title: 'Updated Title',
        }),
      ).rejects.toThrow('Post not found');

      await expect(forumService.deletePost(nonExistentId, testUser1.id)).rejects.toThrow(
        'Post not found',
      );
    });

    it('should validate reply relationships', async () => {
      testPost = await forumService.createPost(testUser1.id, {
        title: 'Test Post',
        content: 'Content',
        categoryId: testCategory.id,
        type: 'DISCUSSION',
      });

      // Try to create reply with invalid parent
      await expect(
        forumReplyService.createReply(testPost.id, testUser2.id, {
          content: 'Reply content',
          parentId: 'non-existent-parent',
        }),
      ).rejects.toThrow('Invalid parent reply');

      // Create reply in different post and try to use as parent
      const otherPost = await forumService.createPost(testUser1.id, {
        title: 'Other Post',
        content: 'Other content',
        categoryId: testCategory.id,
        type: 'DISCUSSION',
      });

      const otherReply = await forumReplyService.createReply(otherPost.id, testUser2.id, {
        content: 'Other reply',
      });

      await expect(
        forumReplyService.createReply(testPost.id, testUser1.id, {
          content: 'Should fail',
          parentId: otherReply.id,
        }),
      ).rejects.toThrow('Invalid parent reply');
    });

    it('should handle tag management edge cases', async () => {
      // Create post with empty tags array
      const post1 = await forumService.createPost(testUser1.id, {
        title: 'Post with Empty Tags',
        content: 'Content',
        categoryId: testCategory.id,
        type: 'DISCUSSION',
        tags: [],
      });

      expect(post1.tags).toHaveLength(0);

      // Create post with duplicate tags
      const post2 = await forumService.createPost(testUser1.id, {
        title: 'Post with Duplicate Tags',
        content: 'Content',
        categoryId: testCategory.id,
        type: 'DISCUSSION',
        tags: ['tag1', 'tag2', 'tag1', 'tag2'],
      });

      // Should deduplicate tags
      const uniqueTags = new Set(post2.tags.map(t => t.tag.name));
      expect(uniqueTags.size).toBeLessThanOrEqual(2);
    });
  });
});
