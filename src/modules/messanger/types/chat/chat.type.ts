import { UserInfo } from '../user.type';
import { ChatType, ChatRole } from './enum.type';

export interface ChatInfo {
  id: bigint;
  type: ChatType;
  title?: string;
  description?: string;
  avatarUrl?: string;
  flags: number;
  memberCount: number;
  lastMessageAt?: Date;
  lastMessageText?: string;
  inviteLink?: string;
  createdAt: Date;
  createdBy: UserInfo;
}

export interface ChatParticipantInfo {
  id: bigint;
  chatId: bigint;
  userId: bigint;
  role: ChatRole;
  flags: number;
  joinedAt: Date;
  leftAt: Date | null;
  mutedUntil: Date | null;
  user: UserInfo;
}

export interface ChatSettings {
  id: bigint;
  chatId: bigint;
  settings: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
