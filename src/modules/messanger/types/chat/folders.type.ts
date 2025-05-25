import { ChatInfo } from './chat.type';

export interface ChatFolder {
  id: bigint;
  userId: bigint;
  name: string;
  emoji?: string;
  position: number;
  flags: number;
  createdAt: Date;
  updatedAt: Date;
  items: ChatFolderItem[];
}

export interface ChatFolderItem {
  id: bigint;
  folderId: bigint;
  chatId: bigint;
  position: number;
  addedAt: Date;
  chat: ChatInfo;
}
