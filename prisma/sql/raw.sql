-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.Chat (
  id bigint NOT NULL DEFAULT nextval('"Chat_id_seq"'::regclass),
  type USER-DEFINED NOT NULL,
  createdById bigint NOT NULL,
  title character varying,
  description character varying,
  avatarUrl character varying,
  bannerUrl character varying,
  color character,
  flags integer NOT NULL DEFAULT 0,
  inviteLink character varying,
  memberCount integer NOT NULL DEFAULT 0,
  lastMessageAt timestamp with time zone,
  lastMessageText character varying,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  deletedAt timestamp with time zone,
  pinnedMessageId bigint,
  CONSTRAINT Chat_pkey PRIMARY KEY (id),
  CONSTRAINT Chat_createdById_fkey FOREIGN KEY (createdById) REFERENCES public.User(id),
  CONSTRAINT Chat_pinnedMessageId_fkey FOREIGN KEY (pinnedMessageId) REFERENCES public.Message(id)
);
CREATE TABLE public.ChatFolder (
  id bigint NOT NULL DEFAULT nextval('"ChatFolder_id_seq"'::regclass),
  userId bigint NOT NULL,
  name character varying NOT NULL,
  description character varying,
  color character,
  iconUrl character varying,
  flags integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  filters jsonb,
  chatCount integer NOT NULL DEFAULT 0,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  CONSTRAINT ChatFolder_pkey PRIMARY KEY (id),
  CONSTRAINT ChatFolder_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.ChatFolderItem (
  id bigint NOT NULL DEFAULT nextval('"ChatFolderItem_id_seq"'::regclass),
  folderId bigint NOT NULL,
  chatId bigint NOT NULL,
  position integer NOT NULL DEFAULT 0,
  flags integer NOT NULL DEFAULT 0,
  addedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ChatFolderItem_pkey PRIMARY KEY (id),
  CONSTRAINT ChatFolderItem_folderId_fkey FOREIGN KEY (folderId) REFERENCES public.ChatFolder(id),
  CONSTRAINT ChatFolderItem_chatId_fkey FOREIGN KEY (chatId) REFERENCES public.Chat(id)
);
CREATE TABLE public.ChatParticipant (
  id bigint NOT NULL DEFAULT nextval('"ChatParticipant_id_seq"'::regclass),
  chatId bigint NOT NULL,
  userId bigint NOT NULL,
  role USER-DEFINED NOT NULL DEFAULT 'MEMBER'::"ChatRole",
  joinedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  leftAt timestamp with time zone,
  flags integer NOT NULL DEFAULT 0,
  mutedUntil timestamp with time zone,
  CONSTRAINT ChatParticipant_pkey PRIMARY KEY (id),
  CONSTRAINT ChatParticipant_chatId_fkey FOREIGN KEY (chatId) REFERENCES public.Chat(id),
  CONSTRAINT ChatParticipant_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.ChatSettings (
  id bigint NOT NULL DEFAULT nextval('"ChatSettings_id_seq"'::regclass),
  chatId bigint NOT NULL,
  settings jsonb,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ChatSettings_pkey PRIMARY KEY (id),
  CONSTRAINT ChatSettings_chatId_fkey FOREIGN KEY (chatId) REFERENCES public.Chat(id)
);
CREATE TABLE public.ChatStatsCache (
  chatId bigint NOT NULL,
  messageCount integer NOT NULL DEFAULT 0,
  participantCount integer NOT NULL DEFAULT 0,
  lastActivity timestamp with time zone,
  storageBytes bigint NOT NULL DEFAULT 0,
  lastUpdated timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ChatStatsCache_pkey PRIMARY KEY (chatId)
);
CREATE TABLE public.Comment (
  id bigint NOT NULL DEFAULT nextval('"Comment_id_seq"'::regclass),
  contentId bigint NOT NULL,
  authorId bigint NOT NULL,
  parentId bigint,
  text character varying NOT NULL,
  flags integer NOT NULL DEFAULT 0,
  likesCount bigint NOT NULL DEFAULT 0,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  deletedAt timestamp with time zone,
  CONSTRAINT Comment_pkey PRIMARY KEY (id),
  CONSTRAINT Comment_contentId_fkey FOREIGN KEY (contentId) REFERENCES public.Content(id),
  CONSTRAINT Comment_authorId_fkey FOREIGN KEY (authorId) REFERENCES public.User(id),
  CONSTRAINT Comment_parentId_fkey FOREIGN KEY (parentId) REFERENCES public.Comment(id)
);
CREATE TABLE public.ContactList (
  id bigint NOT NULL DEFAULT nextval('"ContactList_id_seq"'::regclass),
  userId bigint NOT NULL,
  contactId bigint NOT NULL,
  displayName character varying,
  phoneNumber character varying,
  addedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  flags integer NOT NULL DEFAULT 0,
  CONSTRAINT ContactList_pkey PRIMARY KEY (id),
  CONSTRAINT ContactList_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id),
  CONSTRAINT ContactList_contactId_fkey FOREIGN KEY (contactId) REFERENCES public.User(id)
);
CREATE TABLE public.Content (
  id bigint NOT NULL DEFAULT nextval('"Content_id_seq"'::regclass),
  authorId bigint NOT NULL,
  type USER-DEFINED NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'DRAFT'::"ContentStatus",
  title character varying NOT NULL,
  description text,
  thumbnailUrl character varying,
  flags integer NOT NULL DEFAULT 0,
  metadata jsonb,
  viewsCount bigint NOT NULL DEFAULT 0,
  likesCount bigint NOT NULL DEFAULT 0,
  dislikesCount bigint NOT NULL DEFAULT 0,
  sharesCount bigint NOT NULL DEFAULT 0,
  commentsCount integer NOT NULL DEFAULT 0,
  publishedAt timestamp with time zone,
  scheduledAt timestamp with time zone,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  deletedAt timestamp with time zone,
  CONSTRAINT Content_pkey PRIMARY KEY (id),
  CONSTRAINT Content_authorId_fkey FOREIGN KEY (authorId) REFERENCES public.User(id)
);
CREATE TABLE public.ContentArchive (
  id bigint NOT NULL DEFAULT nextval('"ContentArchive_id_seq"'::regclass),
  originalId bigint NOT NULL,
  authorId bigint NOT NULL,
  type USER-DEFINED NOT NULL,
  metadata jsonb NOT NULL,
  archiveDate timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archiveReason character varying NOT NULL,
  compressionType character varying NOT NULL DEFAULT 'gzip'::character varying,
  CONSTRAINT ContentArchive_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ContentAttachment (
  id bigint NOT NULL DEFAULT nextval('"ContentAttachment_id_seq"'::regclass),
  contentId bigint NOT NULL,
  url character varying NOT NULL,
  mimeType character varying NOT NULL,
  fileSize bigint NOT NULL,
  metadata jsonb,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ContentAttachment_pkey PRIMARY KEY (id),
  CONSTRAINT ContentAttachment_contentId_fkey FOREIGN KEY (contentId) REFERENCES public.Content(id)
);
CREATE TABLE public.ContentStatsCache (
  contentId bigint NOT NULL,
  hourlyViews jsonb,
  dailyViews jsonb,
  demographics jsonb,
  engagement jsonb,
  revenue jsonb,
  lastUpdated timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ContentStatsCache_pkey PRIMARY KEY (contentId)
);
CREATE TABLE public.ContentTag (
  id bigint NOT NULL DEFAULT nextval('"ContentTag_id_seq"'::regclass),
  contentId bigint NOT NULL,
  tagId bigint NOT NULL,
  CONSTRAINT ContentTag_pkey PRIMARY KEY (id),
  CONSTRAINT ContentTag_contentId_fkey FOREIGN KEY (contentId) REFERENCES public.Content(id),
  CONSTRAINT ContentTag_tagId_fkey FOREIGN KEY (tagId) REFERENCES public.Tag(id)
);
CREATE TABLE public.CustomEmoji (
  id bigint NOT NULL DEFAULT nextval('"CustomEmoji_id_seq"'::regclass),
  chatId bigint,
  authorId bigint NOT NULL,
  name character varying NOT NULL,
  fileUrl character varying NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  fileSize integer NOT NULL,
  mimeType character varying NOT NULL,
  flags integer NOT NULL DEFAULT 0,
  usageCount integer NOT NULL DEFAULT 0,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  CONSTRAINT CustomEmoji_pkey PRIMARY KEY (id),
  CONSTRAINT CustomEmoji_chatId_fkey FOREIGN KEY (chatId) REFERENCES public.Chat(id),
  CONSTRAINT CustomEmoji_authorId_fkey FOREIGN KEY (authorId) REFERENCES public.User(id)
);
CREATE TABLE public.Device (
  id bigint NOT NULL DEFAULT nextval('"Device_id_seq"'::regclass),
  userId bigint NOT NULL,
  deviceId text NOT NULL,
  deviceName character varying,
  deviceType character varying,
  deviceVersion character varying,
  ipAddress inet,
  userAgent character varying,
  fingerprint character varying,
  flags integer NOT NULL DEFAULT 1,
  lastUsed timestamp with time zone,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  CONSTRAINT Device_pkey PRIMARY KEY (id),
  CONSTRAINT Device_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.Forum (
  id bigint NOT NULL DEFAULT nextval('"Forum_id_seq"'::regclass),
  name character varying NOT NULL,
  slug character varying NOT NULL,
  description character varying,
  logoUrl character varying,
  bannerUrl character varying,
  flags integer NOT NULL DEFAULT 3,
  settings jsonb,
  categoriesCount integer NOT NULL DEFAULT 0,
  postsCount integer NOT NULL DEFAULT 0,
  topicsCount integer NOT NULL DEFAULT 0,
  repliesCount integer NOT NULL DEFAULT 0,
  usersCount integer NOT NULL DEFAULT 0,
  lastPostAt timestamp with time zone,
  lastPostId bigint,
  lastActivityAt timestamp with time zone,
  ownerId bigint NOT NULL,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT Forum_pkey PRIMARY KEY (id),
  CONSTRAINT Forum_ownerId_fkey FOREIGN KEY (ownerId) REFERENCES public.User(id)
);
CREATE TABLE public.ForumAnalytics (
  id bigint NOT NULL DEFAULT nextval('"ForumAnalytics_id_seq"'::regclass),
  date date NOT NULL,
  forumId bigint,
  categoryId bigint,
  newPosts integer NOT NULL DEFAULT 0,
  newReplies integer NOT NULL DEFAULT 0,
  newUsers integer NOT NULL DEFAULT 0,
  totalViews integer NOT NULL DEFAULT 0,
  uniqueVisitors integer NOT NULL DEFAULT 0,
  avgSessionTime integer NOT NULL DEFAULT 0,
  likesGiven integer NOT NULL DEFAULT 0,
  sharesCount integer NOT NULL DEFAULT 0,
  searchQueries integer NOT NULL DEFAULT 0,
  reportsCreated integer NOT NULL DEFAULT 0,
  actionsPerformed integer NOT NULL DEFAULT 0,
  CONSTRAINT ForumAnalytics_pkey PRIMARY KEY (id),
  CONSTRAINT ForumAnalytics_forumId_fkey FOREIGN KEY (forumId) REFERENCES public.Forum(id),
  CONSTRAINT ForumAnalytics_categoryId_fkey FOREIGN KEY (categoryId) REFERENCES public.ForumCategory(id)
);
CREATE TABLE public.ForumAttachment (
  id bigint NOT NULL DEFAULT nextval('"ForumAttachment_id_seq"'::regclass),
  postId bigint,
  replyId bigint,
  fileName character varying NOT NULL,
  originalName character varying NOT NULL,
  mimeType character varying NOT NULL,
  fileSize bigint NOT NULL,
  url character varying NOT NULL,
  thumbnailUrl character varying,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ForumAttachment_pkey PRIMARY KEY (id),
  CONSTRAINT ForumAttachment_postId_fkey FOREIGN KEY (postId) REFERENCES public.ForumPost(id),
  CONSTRAINT ForumAttachment_replyId_fkey FOREIGN KEY (replyId) REFERENCES public.ForumReply(id)
);
CREATE TABLE public.ForumCategory (
  id bigint NOT NULL DEFAULT nextval('"ForumCategory_id_seq"'::regclass),
  forumId bigint NOT NULL,
  name character varying NOT NULL,
  slug character varying NOT NULL,
  description character varying,
  color character,
  icon character varying,
  position integer NOT NULL DEFAULT 0,
  parentId bigint,
  level integer NOT NULL DEFAULT 0,
  flags integer NOT NULL DEFAULT 1,
  postsCount integer NOT NULL DEFAULT 0,
  repliesCount integer NOT NULL DEFAULT 0,
  topicsCount integer NOT NULL DEFAULT 0,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ForumCategory_pkey PRIMARY KEY (id),
  CONSTRAINT ForumCategory_forumId_fkey FOREIGN KEY (forumId) REFERENCES public.Forum(id),
  CONSTRAINT ForumCategory_parentId_fkey FOREIGN KEY (parentId) REFERENCES public.ForumCategory(id)
);
CREATE TABLE public.ForumCategoryModerator (
  id bigint NOT NULL DEFAULT nextval('"ForumCategoryModerator_id_seq"'::regclass),
  categoryId bigint NOT NULL,
  userId bigint NOT NULL,
  permissions bigint NOT NULL DEFAULT 0,
  assignedBy bigint NOT NULL,
  assignedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt timestamp with time zone,
  isActive boolean NOT NULL DEFAULT true,
  CONSTRAINT ForumCategoryModerator_pkey PRIMARY KEY (id),
  CONSTRAINT ForumCategoryModerator_categoryId_fkey FOREIGN KEY (categoryId) REFERENCES public.ForumCategory(id),
  CONSTRAINT ForumCategoryModerator_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id),
  CONSTRAINT ForumCategoryModerator_assignedBy_fkey FOREIGN KEY (assignedBy) REFERENCES public.User(id)
);
CREATE TABLE public.ForumCategoryPermission (
  id bigint NOT NULL DEFAULT nextval('"ForumCategoryPermission_id_seq"'::regclass),
  categoryId bigint NOT NULL,
  roleId bigint NOT NULL,
  permissions bigint NOT NULL DEFAULT 0,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ForumCategoryPermission_pkey PRIMARY KEY (id),
  CONSTRAINT ForumCategoryPermission_categoryId_fkey FOREIGN KEY (categoryId) REFERENCES public.ForumCategory(id),
  CONSTRAINT ForumCategoryPermission_roleId_fkey FOREIGN KEY (roleId) REFERENCES public.RoleGlobally(id)
);
CREATE TABLE public.ForumConfiguration (
  id integer NOT NULL DEFAULT nextval('"ForumConfiguration_id_seq"'::regclass),
  forumId bigint NOT NULL,
  key character varying NOT NULL,
  value text NOT NULL,
  type character varying NOT NULL DEFAULT 'string'::character varying,
  description character varying,
  isPublic boolean NOT NULL DEFAULT false,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ForumConfiguration_pkey PRIMARY KEY (id),
  CONSTRAINT ForumConfiguration_forumId_fkey FOREIGN KEY (forumId) REFERENCES public.Forum(id)
);
CREATE TABLE public.ForumHotTopics (
  id bigint NOT NULL DEFAULT nextval('"ForumHotTopics_id_seq"'::regclass),
  postId bigint NOT NULL,
  score double precision NOT NULL,
  position integer NOT NULL,
  period character varying NOT NULL,
  region character varying,
  calculatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt timestamp with time zone NOT NULL,
  CONSTRAINT ForumHotTopics_pkey PRIMARY KEY (id),
  CONSTRAINT ForumHotTopics_postId_fkey FOREIGN KEY (postId) REFERENCES public.ForumPost(id)
);
CREATE TABLE public.ForumModerationLog (
  id bigint NOT NULL DEFAULT nextval('"ForumModerationLog_id_seq"'::regclass),
  moderatorId bigint NOT NULL,
  targetUserId bigint,
  postId bigint,
  replyId bigint,
  action USER-DEFINED NOT NULL,
  reason character varying,
  metadata jsonb,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ForumModerationLog_pkey PRIMARY KEY (id),
  CONSTRAINT ForumModerationLog_moderatorId_fkey FOREIGN KEY (moderatorId) REFERENCES public.User(id),
  CONSTRAINT ForumModerationLog_targetUserId_fkey FOREIGN KEY (targetUserId) REFERENCES public.User(id)
);
CREATE TABLE public.ForumModerator (
  id bigint NOT NULL DEFAULT nextval('"ForumModerator_id_seq"'::regclass),
  forumId bigint NOT NULL,
  userId bigint NOT NULL,
  permissions bigint NOT NULL DEFAULT 0,
  assignedBy bigint NOT NULL,
  assignedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt timestamp with time zone,
  isActive boolean NOT NULL DEFAULT true,
  CONSTRAINT ForumModerator_pkey PRIMARY KEY (id),
  CONSTRAINT ForumModerator_forumId_fkey FOREIGN KEY (forumId) REFERENCES public.Forum(id),
  CONSTRAINT ForumModerator_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id),
  CONSTRAINT ForumModerator_assignedBy_fkey FOREIGN KEY (assignedBy) REFERENCES public.User(id)
);
CREATE TABLE public.ForumNotificationQueue (
  id bigint NOT NULL DEFAULT nextval('"ForumNotificationQueue_id_seq"'::regclass),
  userId bigint NOT NULL,
  type character varying NOT NULL,
  entityType character varying NOT NULL,
  entityId bigint NOT NULL,
  isRead boolean NOT NULL DEFAULT false,
  isEmail boolean NOT NULL DEFAULT false,
  isPush boolean NOT NULL DEFAULT false,
  title character varying NOT NULL,
  message character varying NOT NULL,
  data jsonb,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sentAt timestamp with time zone,
  readAt timestamp with time zone,
  CONSTRAINT ForumNotificationQueue_pkey PRIMARY KEY (id),
  CONSTRAINT ForumNotificationQueue_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.ForumPost (
  id bigint NOT NULL DEFAULT nextval('"ForumPost_id_seq"'::regclass),
  categoryId bigint NOT NULL,
  authorId bigint NOT NULL,
  title character varying NOT NULL,
  content text NOT NULL,
  slug character varying NOT NULL,
  flags integer NOT NULL DEFAULT 0,
  viewsCount integer NOT NULL DEFAULT 0,
  repliesCount integer NOT NULL DEFAULT 0,
  likesCount integer NOT NULL DEFAULT 0,
  dislikesCount integer NOT NULL DEFAULT 0,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  lastReplyAt timestamp with time zone,
  lastReplyBy bigint,
  searchVector tsvector,
  CONSTRAINT ForumPost_pkey PRIMARY KEY (id),
  CONSTRAINT ForumPost_categoryId_fkey FOREIGN KEY (categoryId) REFERENCES public.ForumCategory(id),
  CONSTRAINT ForumPost_authorId_fkey FOREIGN KEY (authorId) REFERENCES public.User(id)
);
CREATE TABLE public.ForumPostSEO (
  id bigint NOT NULL DEFAULT nextval('"ForumPostSEO_id_seq"'::regclass),
  postId bigint NOT NULL,
  metaTitle character varying,
  metaDesc character varying,
  keywords character varying,
  canonicalUrl character varying,
  ogImage character varying,
  schema jsonb,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ForumPostSEO_pkey PRIMARY KEY (id),
  CONSTRAINT ForumPostSEO_postId_fkey FOREIGN KEY (postId) REFERENCES public.ForumPost(id)
);
CREATE TABLE public.ForumPostTag (
  id bigint NOT NULL DEFAULT nextval('"ForumPostTag_id_seq"'::regclass),
  postId bigint NOT NULL,
  tagId bigint NOT NULL,
  CONSTRAINT ForumPostTag_pkey PRIMARY KEY (id),
  CONSTRAINT ForumPostTag_postId_fkey FOREIGN KEY (postId) REFERENCES public.ForumPost(id),
  CONSTRAINT ForumPostTag_tagId_fkey FOREIGN KEY (tagId) REFERENCES public.ForumTag(id)
);
CREATE TABLE public.ForumReply (
  id bigint NOT NULL DEFAULT nextval('"ForumReply_id_seq"'::regclass),
  postId bigint NOT NULL,
  authorId bigint NOT NULL,
  content text NOT NULL,
  parentId bigint,
  flags integer NOT NULL DEFAULT 0,
  likesCount integer NOT NULL DEFAULT 0,
  dislikesCount integer NOT NULL DEFAULT 0,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  searchVector tsvector,
  CONSTRAINT ForumReply_pkey PRIMARY KEY (id),
  CONSTRAINT ForumReply_postId_fkey FOREIGN KEY (postId) REFERENCES public.ForumPost(id),
  CONSTRAINT ForumReply_authorId_fkey FOREIGN KEY (authorId) REFERENCES public.User(id),
  CONSTRAINT ForumReply_parentId_fkey FOREIGN KEY (parentId) REFERENCES public.ForumReply(id)
);
CREATE TABLE public.ForumReputation (
  id bigint NOT NULL DEFAULT nextval('"ForumReputation_id_seq"'::regclass),
  userId bigint NOT NULL,
  points integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  badges jsonb,
  postsCreated integer NOT NULL DEFAULT 0,
  repliesCreated integer NOT NULL DEFAULT 0,
  likesReceived integer NOT NULL DEFAULT 0,
  likesGiven integer NOT NULL DEFAULT 0,
  bestAnswers integer NOT NULL DEFAULT 0,
  moderationScore integer NOT NULL DEFAULT 0,
  lastCalculated timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ForumReputation_pkey PRIMARY KEY (id),
  CONSTRAINT ForumReputation_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.ForumSubscription (
  id bigint NOT NULL DEFAULT nextval('"ForumSubscription_id_seq"'::regclass),
  userId bigint NOT NULL,
  postId bigint NOT NULL,
  flags integer NOT NULL DEFAULT 1,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ForumSubscription_pkey PRIMARY KEY (id),
  CONSTRAINT ForumSubscription_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id),
  CONSTRAINT ForumSubscription_postId_fkey FOREIGN KEY (postId) REFERENCES public.ForumPost(id)
);
CREATE TABLE public.ForumTag (
  id bigint NOT NULL DEFAULT nextval('"ForumTag_id_seq"'::regclass),
  name character varying NOT NULL,
  description character varying,
  color character,
  usageCount integer NOT NULL DEFAULT 0,
  flags integer NOT NULL DEFAULT 1,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ForumTag_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ForumTopicTracker (
  id bigint NOT NULL DEFAULT nextval('"ForumTopicTracker_id_seq"'::regclass),
  userId bigint NOT NULL,
  postId bigint NOT NULL,
  lastRead timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  readCount integer NOT NULL DEFAULT 0,
  CONSTRAINT ForumTopicTracker_pkey PRIMARY KEY (id),
  CONSTRAINT ForumTopicTracker_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id),
  CONSTRAINT ForumTopicTracker_postId_fkey FOREIGN KEY (postId) REFERENCES public.ForumPost(id)
);
CREATE TABLE public.ForumVote (
  id bigint NOT NULL DEFAULT nextval('"ForumVote_id_seq"'::regclass),
  userId bigint NOT NULL,
  postId bigint,
  replyId bigint,
  value integer NOT NULL,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ForumVote_pkey PRIMARY KEY (id),
  CONSTRAINT ForumVote_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id),
  CONSTRAINT ForumVote_postId_fkey FOREIGN KEY (postId) REFERENCES public.ForumPost(id),
  CONSTRAINT ForumVote_replyId_fkey FOREIGN KEY (replyId) REFERENCES public.ForumReply(id)
);
CREATE TABLE public.Gif (
  id bigint NOT NULL DEFAULT nextval('"Gif_id_seq"'::regclass),
  categoryId bigint NOT NULL,
  title character varying NOT NULL,
  url character varying NOT NULL,
  previewUrl character varying NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  fileSize integer NOT NULL,
  duration double precision,
  tags character varying,
  searchText character varying,
  flags integer NOT NULL DEFAULT 0,
  usageCount integer NOT NULL DEFAULT 0,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT Gif_pkey PRIMARY KEY (id),
  CONSTRAINT Gif_categoryId_fkey FOREIGN KEY (categoryId) REFERENCES public.GifCategory(id)
);
CREATE TABLE public.GifCategory (
  id bigint NOT NULL DEFAULT nextval('"GifCategory_id_seq"'::regclass),
  name character varying NOT NULL,
  description character varying,
  iconUrl character varying,
  flags integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  gifCount integer NOT NULL DEFAULT 0,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT GifCategory_pkey PRIMARY KEY (id)
);
CREATE TABLE public.Like (
  id bigint NOT NULL DEFAULT nextval('"Like_id_seq"'::regclass),
  userId bigint NOT NULL,
  contentId bigint,
  commentId bigint,
  value integer NOT NULL DEFAULT 1,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT Like_pkey PRIMARY KEY (id),
  CONSTRAINT Like_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id),
  CONSTRAINT Like_contentId_fkey FOREIGN KEY (contentId) REFERENCES public.Content(id),
  CONSTRAINT Like_commentId_fkey FOREIGN KEY (commentId) REFERENCES public.Comment(id)
);
CREATE TABLE public.Message (
  id bigint NOT NULL DEFAULT nextval('"Message_id_seq"'::regclass),
  chatId bigint NOT NULL,
  senderId bigint NOT NULL,
  content bytea NOT NULL,
  header bytea NOT NULL,
  messageType USER-DEFINED NOT NULL DEFAULT 'TEXT'::"MessageType",
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  editedAt timestamp with time zone,
  flags integer NOT NULL DEFAULT 0,
  deletedAt timestamp with time zone,
  replyToId bigint,
  forwardedFromId bigint,
  threadId bigint,
  replyDepth integer NOT NULL DEFAULT 0,
  CONSTRAINT Message_pkey PRIMARY KEY (id),
  CONSTRAINT Message_chatId_fkey FOREIGN KEY (chatId) REFERENCES public.Chat(id),
  CONSTRAINT Message_senderId_fkey FOREIGN KEY (senderId) REFERENCES public.User(id),
  CONSTRAINT Message_replyToId_fkey FOREIGN KEY (replyToId) REFERENCES public.Message(id),
  CONSTRAINT Message_forwardedFromId_fkey FOREIGN KEY (forwardedFromId) REFERENCES public.Message(id),
  CONSTRAINT Message_threadId_fkey FOREIGN KEY (threadId) REFERENCES public.MessageThread(id)
);
CREATE TABLE public.MessageArchive (
  id bigint NOT NULL DEFAULT nextval('"MessageArchive_id_seq"'::regclass),
  originalId bigint NOT NULL,
  chatId bigint NOT NULL,
  senderId bigint NOT NULL,
  content bytea NOT NULL,
  messageType USER-DEFINED NOT NULL,
  createdAt timestamp with time zone NOT NULL,
  archiveDate timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  compressionType character varying NOT NULL DEFAULT 'gzip'::character varying,
  CONSTRAINT MessageArchive_pkey PRIMARY KEY (id)
);
CREATE TABLE public.MessageAttachment (
  id bigint NOT NULL DEFAULT nextval('"MessageAttachment_id_seq"'::regclass),
  messageId bigint NOT NULL,
  fileName character varying NOT NULL,
  mimeType character varying NOT NULL,
  fileHash character varying NOT NULL,
  fileKey character varying NOT NULL,
  fileIV character varying NOT NULL,
  fileSize integer NOT NULL,
  fileType character varying NOT NULL,
  thumbnail character varying,
  description character varying,
  url character varying NOT NULL,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT MessageAttachment_pkey PRIMARY KEY (id),
  CONSTRAINT MessageAttachment_messageId_fkey FOREIGN KEY (messageId) REFERENCES public.Message(id)
);
CREATE TABLE public.MessageEdit (
  id bigint NOT NULL DEFAULT nextval('"MessageEdit_id_seq"'::regclass),
  messageId bigint NOT NULL,
  content bytea NOT NULL,
  editedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT MessageEdit_pkey PRIMARY KEY (id),
  CONSTRAINT MessageEdit_messageId_fkey FOREIGN KEY (messageId) REFERENCES public.Message(id)
);
CREATE TABLE public.MessageEmoji (
  id bigint NOT NULL DEFAULT nextval('"MessageEmoji_id_seq"'::regclass),
  messageId bigint NOT NULL,
  emojiId bigint NOT NULL,
  CONSTRAINT MessageEmoji_pkey PRIMARY KEY (id),
  CONSTRAINT MessageEmoji_messageId_fkey FOREIGN KEY (messageId) REFERENCES public.Message(id),
  CONSTRAINT MessageEmoji_emojiId_fkey FOREIGN KEY (emojiId) REFERENCES public.CustomEmoji(id)
);
CREATE TABLE public.MessageGif (
  id bigint NOT NULL DEFAULT nextval('"MessageGif_id_seq"'::regclass),
  messageId bigint NOT NULL,
  gifId bigint NOT NULL,
  CONSTRAINT MessageGif_pkey PRIMARY KEY (id),
  CONSTRAINT MessageGif_messageId_fkey FOREIGN KEY (messageId) REFERENCES public.Message(id),
  CONSTRAINT MessageGif_gifId_fkey FOREIGN KEY (gifId) REFERENCES public.Gif(id)
);
CREATE TABLE public.MessageReaction (
  id bigint NOT NULL DEFAULT nextval('"MessageReaction_id_seq"'::regclass),
  messageId bigint NOT NULL,
  userId bigint NOT NULL,
  reaction character varying NOT NULL,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT MessageReaction_pkey PRIMARY KEY (id),
  CONSTRAINT MessageReaction_messageId_fkey FOREIGN KEY (messageId) REFERENCES public.Message(id),
  CONSTRAINT MessageReaction_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.MessageRead (
  id bigint NOT NULL DEFAULT nextval('"MessageRead_id_seq"'::regclass),
  messageId bigint NOT NULL,
  userId bigint NOT NULL,
  readAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT MessageRead_pkey PRIMARY KEY (id),
  CONSTRAINT MessageRead_messageId_fkey FOREIGN KEY (messageId) REFERENCES public.Message(id),
  CONSTRAINT MessageRead_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.MessageSticker (
  id bigint NOT NULL DEFAULT nextval('"MessageSticker_id_seq"'::regclass),
  messageId bigint NOT NULL,
  stickerId bigint NOT NULL,
  CONSTRAINT MessageSticker_pkey PRIMARY KEY (id),
  CONSTRAINT MessageSticker_messageId_fkey FOREIGN KEY (messageId) REFERENCES public.Message(id),
  CONSTRAINT MessageSticker_stickerId_fkey FOREIGN KEY (stickerId) REFERENCES public.Sticker(id)
);
CREATE TABLE public.MessageThread (
  id bigint NOT NULL DEFAULT nextval('"MessageThread_id_seq"'::regclass),
  chatId bigint NOT NULL,
  creatorId bigint NOT NULL,
  title character varying,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  flags integer NOT NULL DEFAULT 0,
  CONSTRAINT MessageThread_pkey PRIMARY KEY (id)
);
CREATE TABLE public.Notification (
  id bigint NOT NULL DEFAULT nextval('"Notification_id_seq"'::regclass),
  userId bigint NOT NULL,
  type USER-DEFINED NOT NULL,
  title character varying NOT NULL,
  message character varying NOT NULL,
  data jsonb,
  flags integer NOT NULL DEFAULT 0,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  readAt timestamp with time zone,
  CONSTRAINT Notification_pkey PRIMARY KEY (id),
  CONSTRAINT Notification_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.NotificationSettings (
  id bigint NOT NULL DEFAULT nextval('"NotificationSettings_id_seq"'::regclass),
  userId bigint NOT NULL,
  chatId bigint,
  notificationType character varying NOT NULL,
  flags integer NOT NULL DEFAULT 7,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  CONSTRAINT NotificationSettings_pkey PRIMARY KEY (id),
  CONSTRAINT NotificationSettings_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id),
  CONSTRAINT NotificationSettings_chatId_fkey FOREIGN KEY (chatId) REFERENCES public.Chat(id)
);
CREATE TABLE public.OneTimePreKey (
  id bigint NOT NULL DEFAULT nextval('"OneTimePreKey_id_seq"'::regclass),
  userCryptoId bigint NOT NULL,
  keyId integer NOT NULL,
  publicKey character varying NOT NULL,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  flags integer NOT NULL DEFAULT 0,
  CONSTRAINT OneTimePreKey_pkey PRIMARY KEY (id),
  CONSTRAINT OneTimePreKey_userCryptoId_fkey FOREIGN KEY (userCryptoId) REFERENCES public.UserCrypto(id)
);
CREATE TABLE public.Playlist (
  id bigint NOT NULL DEFAULT nextval('"Playlist_id_seq"'::regclass),
  authorId bigint NOT NULL,
  title character varying NOT NULL,
  description character varying,
  thumbnailUrl character varying,
  flags integer NOT NULL DEFAULT 1,
  itemsCount integer NOT NULL DEFAULT 0,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  CONSTRAINT Playlist_pkey PRIMARY KEY (id),
  CONSTRAINT Playlist_authorId_fkey FOREIGN KEY (authorId) REFERENCES public.User(id)
);
CREATE TABLE public.PlaylistItem (
  id bigint NOT NULL DEFAULT nextval('"PlaylistItem_id_seq"'::regclass),
  playlistId bigint NOT NULL,
  contentId bigint NOT NULL,
  position integer NOT NULL,
  addedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT PlaylistItem_pkey PRIMARY KEY (id),
  CONSTRAINT PlaylistItem_playlistId_fkey FOREIGN KEY (playlistId) REFERENCES public.Playlist(id),
  CONSTRAINT PlaylistItem_contentId_fkey FOREIGN KEY (contentId) REFERENCES public.Content(id)
);
CREATE TABLE public.RefreshToken (
  id bigint NOT NULL DEFAULT nextval('"RefreshToken_id_seq"'::regclass),
  sessionId bigint NOT NULL,
  userId bigint NOT NULL,
  token character varying NOT NULL,
  tokenHash character varying NOT NULL,
  expiresAt timestamp with time zone NOT NULL,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  deviceId character varying,
  ipAddress inet,
  userAgent character varying,
  isRevoked boolean NOT NULL DEFAULT false,
  isUsed boolean NOT NULL DEFAULT false,
  CONSTRAINT RefreshToken_pkey PRIMARY KEY (id),
  CONSTRAINT RefreshToken_sessionId_fkey FOREIGN KEY (sessionId) REFERENCES public.Session(id),
  CONSTRAINT RefreshToken_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.RefreshTokenBlacklist (
  id bigint NOT NULL DEFAULT nextval('"RefreshTokenBlacklist_id_seq"'::regclass),
  tokenHash character varying NOT NULL,
  userId bigint NOT NULL,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt timestamp with time zone NOT NULL,
  CONSTRAINT RefreshTokenBlacklist_pkey PRIMARY KEY (id),
  CONSTRAINT RefreshTokenBlacklist_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.Report (
  id bigint NOT NULL DEFAULT nextval('"Report_id_seq"'::regclass),
  reporterId bigint NOT NULL,
  userId bigint,
  contentId bigint,
  postId bigint,
  replyId bigint,
  messageId bigint,
  reason USER-DEFINED NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'PENDING'::"ReportStatus",
  description character varying,
  flags integer NOT NULL DEFAULT 0,
  reviewedBy bigint,
  reviewedAt timestamp with time zone,
  resolution character varying,
  action USER-DEFINED NOT NULL DEFAULT 'NONE'::"ModerationAction",
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT Report_pkey PRIMARY KEY (id),
  CONSTRAINT Report_reporterId_fkey FOREIGN KEY (reporterId) REFERENCES public.User(id),
  CONSTRAINT Report_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id),
  CONSTRAINT Report_contentId_fkey FOREIGN KEY (contentId) REFERENCES public.Content(id),
  CONSTRAINT Report_reviewedBy_fkey FOREIGN KEY (reviewedBy) REFERENCES public.User(id)
);
CREATE TABLE public.RoleGlobally (
  id bigint NOT NULL DEFAULT nextval('"RoleGlobally_id_seq"'::regclass),
  name character varying NOT NULL,
  flags integer NOT NULL DEFAULT 0,
  permissions jsonb,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  CONSTRAINT RoleGlobally_pkey PRIMARY KEY (id)
);
CREATE TABLE public.SearchCache (
  queryHash character varying NOT NULL,
  results jsonb NOT NULL,
  expiresAt timestamp with time zone NOT NULL,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hitCount integer NOT NULL DEFAULT 1,
  CONSTRAINT SearchCache_pkey PRIMARY KEY (queryHash)
);
CREATE TABLE public.SecurityAuditLog (
  id bigint NOT NULL DEFAULT nextval('"SecurityAuditLog_id_seq"'::regclass),
  userId bigint,
  eventType character varying NOT NULL,
  severity character varying NOT NULL,
  description character varying NOT NULL,
  ipAddress inet,
  userAgent character varying,
  metadata jsonb,
  timestamp timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolvedAt timestamp with time zone,
  resolvedBy bigint,
  CONSTRAINT SecurityAuditLog_pkey PRIMARY KEY (id),
  CONSTRAINT SecurityAuditLog_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id),
  CONSTRAINT SecurityAuditLog_resolvedBy_fkey FOREIGN KEY (resolvedBy) REFERENCES public.User(id)
);
CREATE TABLE public.Session (
  id bigint NOT NULL DEFAULT nextval('"Session_id_seq"'::regclass),
  userId bigint NOT NULL,
  deviceId bigint NOT NULL,
  ratchetState bytea NOT NULL,
  sessionKey character varying,
  expiresAt timestamp with time zone,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  flags integer NOT NULL DEFAULT 1,
  CONSTRAINT Session_pkey PRIMARY KEY (id),
  CONSTRAINT Session_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id),
  CONSTRAINT Session_deviceId_fkey FOREIGN KEY (deviceId) REFERENCES public.Device(id)
);
CREATE TABLE public.SignedPreKey (
  id bigint NOT NULL DEFAULT nextval('"SignedPreKey_id_seq"'::regclass),
  userCryptoId bigint NOT NULL,
  keyId integer NOT NULL,
  publicKey character varying NOT NULL,
  signature character varying NOT NULL,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  flags integer NOT NULL DEFAULT 0,
  expiresAt timestamp with time zone,
  CONSTRAINT SignedPreKey_pkey PRIMARY KEY (id),
  CONSTRAINT SignedPreKey_userCryptoId_fkey FOREIGN KEY (userCryptoId) REFERENCES public.UserCrypto(id)
);
CREATE TABLE public.Sticker (
  id bigint NOT NULL DEFAULT nextval('"Sticker_id_seq"'::regclass),
  packId bigint NOT NULL,
  emoji character varying NOT NULL,
  fileUrl character varying NOT NULL,
  fileName character varying NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  fileSize integer NOT NULL,
  mimeType character varying NOT NULL,
  flags integer NOT NULL DEFAULT 0,
  usageCount integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT Sticker_pkey PRIMARY KEY (id),
  CONSTRAINT Sticker_packId_fkey FOREIGN KEY (packId) REFERENCES public.StickerPack(id)
);
CREATE TABLE public.StickerPack (
  id bigint NOT NULL DEFAULT nextval('"StickerPack_id_seq"'::regclass),
  name character varying NOT NULL,
  title character varying NOT NULL,
  description character varying,
  authorId bigint,
  thumbnailUrl character varying NOT NULL,
  flags integer NOT NULL DEFAULT 0,
  price integer NOT NULL DEFAULT 0,
  category character varying,
  tags character varying,
  downloadCount integer NOT NULL DEFAULT 0,
  usageCount integer NOT NULL DEFAULT 0,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  CONSTRAINT StickerPack_pkey PRIMARY KEY (id),
  CONSTRAINT StickerPack_authorId_fkey FOREIGN KEY (authorId) REFERENCES public.User(id)
);
CREATE TABLE public.StickerPurchase (
  id bigint NOT NULL DEFAULT nextval('"StickerPurchase_id_seq"'::regclass),
  userId bigint NOT NULL,
  packId bigint NOT NULL,
  price integer NOT NULL,
  currency character varying NOT NULL DEFAULT 'USD'::character varying,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT StickerPurchase_pkey PRIMARY KEY (id),
  CONSTRAINT StickerPurchase_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id),
  CONSTRAINT StickerPurchase_packId_fkey FOREIGN KEY (packId) REFERENCES public.StickerPack(id)
);
CREATE TABLE public.Subscription (
  id bigint NOT NULL DEFAULT nextval('"Subscription_id_seq"'::regclass),
  subscriberId bigint NOT NULL,
  subscribedToId bigint NOT NULL,
  flags integer NOT NULL DEFAULT 1,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT Subscription_pkey PRIMARY KEY (id),
  CONSTRAINT Subscription_subscriberId_fkey FOREIGN KEY (subscriberId) REFERENCES public.User(id),
  CONSTRAINT Subscription_subscribedToId_fkey FOREIGN KEY (subscribedToId) REFERENCES public.User(id)
);
CREATE TABLE public.Tag (
  id bigint NOT NULL DEFAULT nextval('"Tag_id_seq"'::regclass),
  name character varying NOT NULL,
  description character varying,
  flags integer NOT NULL DEFAULT 0,
  usageCount bigint NOT NULL DEFAULT 0,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT Tag_pkey PRIMARY KEY (id)
);
CREATE TABLE public.TrendingCache (
  id bigint NOT NULL DEFAULT nextval('"TrendingCache_id_seq"'::regclass),
  type character varying NOT NULL,
  data jsonb NOT NULL,
  region character varying,
  expiresAt timestamp with time zone NOT NULL,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT TrendingCache_pkey PRIMARY KEY (id)
);
CREATE TABLE public.UsedOneTimePreKey (
  id bigint NOT NULL DEFAULT nextval('"UsedOneTimePreKey_id_seq"'::regclass),
  userCryptoId bigint NOT NULL,
  keyId integer NOT NULL,
  usedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT UsedOneTimePreKey_pkey PRIMARY KEY (id),
  CONSTRAINT UsedOneTimePreKey_userCryptoId_fkey FOREIGN KEY (userCryptoId) REFERENCES public.UserCrypto(id)
);
CREATE TABLE public.User (
  id bigint NOT NULL DEFAULT nextval('"User_id_seq"'::regclass),
  email character varying NOT NULL,
  username character varying NOT NULL,
  password character varying NOT NULL,
  supabaseId character varying,
  fullName character varying,
  bio character varying,
  avatarUrl character varying,
  bannerUrl character varying,
  color character,
  phoneNumber character varying,
  flags integer NOT NULL DEFAULT 0,
  status USER-DEFINED NOT NULL DEFAULT 'ACTIVE'::"UserStatus",
  lastSeen timestamp with time zone,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  deletedAt timestamp with time zone,
  roleId bigint,
  searchVector tsvector,
  timezone character varying,
  locale character varying,
  subscribersCount integer NOT NULL DEFAULT 0,
  subscriptionsCount integer NOT NULL DEFAULT 0,
  videosCount integer NOT NULL DEFAULT 0,
  postsCount integer NOT NULL DEFAULT 0,
  totalViews bigint NOT NULL DEFAULT 0,
  totalLikes bigint NOT NULL DEFAULT 0,
  reputation integer NOT NULL DEFAULT 0,
  CONSTRAINT User_pkey PRIMARY KEY (id),
  CONSTRAINT User_roleId_fkey FOREIGN KEY (roleId) REFERENCES public.RoleGlobally(id)
);
CREATE TABLE public.UserCrypto (
  id bigint NOT NULL DEFAULT nextval('"UserCrypto_id_seq"'::regclass),
  userId bigint NOT NULL,
  identityKeyPublic character varying NOT NULL,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL,
  CONSTRAINT UserCrypto_pkey PRIMARY KEY (id),
  CONSTRAINT UserCrypto_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.UserSettings (
  id bigint NOT NULL DEFAULT nextval('"UserSettings_id_seq"'::regclass),
  userId bigint NOT NULL,
  uiSettings jsonb,
  notifications jsonb,
  privacy jsonb,
  security jsonb,
  dataStorage jsonb,
  content jsonb,
  experimental jsonb,
  blockedUsers ARRAY,
  createdAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT UserSettings_pkey PRIMARY KEY (id),
  CONSTRAINT UserSettings_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id)
);
CREATE TABLE public.UserStatsCache (
  userId bigint NOT NULL,
  messagesSent integer NOT NULL DEFAULT 0,
  chatsCount integer NOT NULL DEFAULT 0,
  contactsCount integer NOT NULL DEFAULT 0,
  storageUsed bigint NOT NULL DEFAULT 0,
  lastActivity timestamp with time zone,
  lastUpdated timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT UserStatsCache_pkey PRIMARY KEY (userId)
);
CREATE TABLE public.UserStickerPack (
  id bigint NOT NULL DEFAULT nextval('"UserStickerPack_id_seq"'::regclass),
  userId bigint NOT NULL,
  packId bigint NOT NULL,
  position integer NOT NULL DEFAULT 0,
  flags integer NOT NULL DEFAULT 0,
  addedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT UserStickerPack_pkey PRIMARY KEY (id),
  CONSTRAINT UserStickerPack_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id),
  CONSTRAINT UserStickerPack_packId_fkey FOREIGN KEY (packId) REFERENCES public.StickerPack(id)
);
CREATE TABLE public.WatchHistory (
  id bigint NOT NULL DEFAULT nextval('"WatchHistory_id_seq"'::regclass),
  userId bigint NOT NULL,
  contentId bigint NOT NULL,
  watchedAt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  watchTime integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  progress double precision NOT NULL DEFAULT 0,
  CONSTRAINT WatchHistory_pkey PRIMARY KEY (id),
  CONSTRAINT WatchHistory_userId_fkey FOREIGN KEY (userId) REFERENCES public.User(id),
  CONSTRAINT WatchHistory_contentId_fkey FOREIGN KEY (contentId) REFERENCES public.Content(id)
);