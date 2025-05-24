export interface IChannelService {
  isUsernameAvailable(username: string): Promise<boolean>;
  upgradeToGigagroup(channelId: string): Promise<void>;
  createNewChannel(name: string, options?: object): Promise<string>;
  removeChannel(channelId: string): Promise<void>;
  clearChatHistory(channelId: string): Promise<void>;
  removeMessages(channelId: string, messageIds: string[]): Promise<void>;
  clearParticipantHistory(
    channelId: string,
    participantId: string,
  ): Promise<void>;
  updateAdminPermissions(
    channelId: string,
    adminId: string,
    permissions: object,
  ): Promise<void>;
  updateBannedUsers(
    channelId: string,
    userId: string,
    banOptions: object,
  ): Promise<void>;
  changeChannelCreator(channelId: string, newCreatorId: string): Promise<void>;
  updateChannelLocation(channelId: string, location: string): Promise<void>;
  updateChannelPhoto(channelId: string, photo: File): Promise<void>;
  updateChannelTitle(channelId: string, title: string): Promise<void>;
  generateMessageLink(channelId: string, messageId: string): Promise<string>;
  fetchManagedPublicChannels(): Promise<string[]>;
  fetchAdminActivityLog(channelId: string): Promise<object[]>;
  fetchUserChannels(): Promise<string[]>;
  fetchChannelDetails(channelId: string): Promise<object>;
  fetchDiscussionGroups(): Promise<string[]>;
  fetchInactiveChannels(): Promise<string[]>;
  fetchLeftChannels(): Promise<string[]>;
  fetchMessages(channelId: string, options?: object): Promise<object[]>;
  fetchParticipantInfo(
    channelId: string,
    participantId: string,
  ): Promise<object>;
  fetchAllParticipants(channelId: string): Promise<object[]>;
  fetchSendAsOptions(channelId: string): Promise<object[]>;
  fetchSponsoredMessages(channelId: string): Promise<object[]>;
  inviteUsersToChannel(channelId: string, userIds: string[]): Promise<void>;
  subscribeToChannel(channelId: string): Promise<void>;
  exitChannel(channelId: string): Promise<void>;
  markHistoryAsRead(channelId: string): Promise<void>;
  markMessagesAsRead(channelId: string, messageIds: string[]): Promise<void>;
  flagAsSpam(channelId: string, messageId: string): Promise<void>;
  assignDiscussionGroup(
    channelId: string,
    discussionGroupId: string,
  ): Promise<void>;
  updateChannelStickers(channelId: string, stickerSetId: string): Promise<void>;
  enableJoinRequests(channelId: string, enabled: boolean): Promise<void>;
  restrictSendingToMembers(channelId: string, enabled: boolean): Promise<void>;
  hidePreJoinMessages(channelId: string, hidden: boolean): Promise<void>;
  enableMessageSignatures(channelId: string, enabled: boolean): Promise<void>;
  adjustSlowMode(channelId: string, duration: number): Promise<void>;
  changeChannelUsername(channelId: string, newUsername: string): Promise<void>;
  trackSponsoredMessage(channelId: string, messageId: string): Promise<void>;
}
