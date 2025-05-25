
export interface EncryptionKeys {
  identityKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKeys: {
    keyId: number;
    publicKey: string;
  }[];
}

export interface EncryptedMessage {
  type: 'prekey' | 'signal';
  body: string;
  registrationId: number;
}

export interface MessageBundle {
  identityKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKey?: {
    keyId: number;
    publicKey: string;
  };
}

export interface SignalSession {
  userId: bigint;
  deviceId: number;
  sessionState: Buffer;
  lastMessage: Date;
  trustLevel: 'untrusted' | 'trusted' | 'verified';
}

export interface PreKeyBundle {
  registrationId: number;
  deviceId: number;
  preKeyId?: number;
  preKeyPublic?: string;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  identityKey: string;
}

export interface SignalProtocolStore {
  getIdentityKeyPair(): Promise<Buffer>;
  getLocalRegistrationId(): Promise<number>;
  saveIdentity(identifier: string, identityKey: Buffer): Promise<boolean>;
  isTrustedIdentity(identifier: string, identityKey: Buffer): Promise<boolean>;
  loadPreKey(keyId: number): Promise<Buffer>;
  storePreKey(keyId: number, keyPair: Buffer): Promise<void>;
  removePreKey(keyId: number): Promise<void>;
  loadSignedPreKey(keyId: number): Promise<Buffer>;
  storeSignedPreKey(keyId: number, keyPair: Buffer): Promise<void>;
  loadSession(identifier: string): Promise<Buffer>;
  storeSession(identifier: string, record: Buffer): Promise<void>;
}

export interface ChatSecuritySettings {
  chatId: bigint;
  encryptionEnabled: boolean;
  forwardSecrecy: boolean;
  verificationRequired: boolean;
  autoDeleteMessages: boolean;
  autoDeleteDuration?: number;
  screenshotNotifications: boolean;
  allowUnverifiedContacts: boolean;
  encryptionProtocol: 'signal' | 'matrix' | 'custom';
  keyRotationInterval: number;
  lastKeyRotation: Date;
}

export interface SafetyNumber {
  localFingerprint: string;
  remoteFingerprint: string;
  combinedFingerprint: string;
  isVerified: boolean;
  verifiedAt?: Date;
}

export interface SecurityEvent {
  id: bigint;
  userId: bigint;
  chatId?: bigint;
  eventType: 'key_change' | 'verification' | 'safety_number_change' | 'device_change' | 'session_reset';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, any>;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: bigint;
  createdAt: Date;
}
