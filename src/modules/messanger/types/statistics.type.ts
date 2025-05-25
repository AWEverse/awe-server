// Типы для статистики чатов и пользователей
export interface ChatStatistics {
  id: bigint;
  chatId: bigint;
  messageCount: number;
  participantCount: number;
  activeParticipants: number;
  totalMessages: number;
  mediaMessages: number;
  textMessages: number;
  averageResponseTime: number; // в секундах
  peakActivity: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserChatStatistics {
  userId: bigint;
  totalChats: number;
  activeChats: number;
  archivedChats: number;
  messagesSent: number;
  messagesReceived: number;
  mediaShared: number;
  averageResponseTime: number; // в секундах
  mostActiveChat: {
    chatId: bigint;
    messageCount: number;
    chatTitle?: string;
  };
  dailyActivity: Array<{
    date: Date;
    messageCount: number;
    chatsActive: number;
  }>;
  lastActivity: Date;
}

export interface ChatActivityStats {
  hourlyActivity: number[]; // 24 элемента для каждого часа
  dailyActivity: number[]; // 7 элементов для дней недели
  weeklyActivity: number[]; // активность по неделям
  monthlyActivity: number[]; // активность по месяцам
  peakHours: number[]; // часы наибольшей активности
  averageSessionDuration: number; // в минутах
}

export interface MessageDistribution {
  textMessages: number;
  imageMessages: number;
  videoMessages: number;
  audioMessages: number;
  documentMessages: number;
  stickerMessages: number;
  voiceMessages: number;
  otherMessages: number;
}
