import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  CreateKeysDto,
  UploadPreKeysDto,
  GetKeyBundleDto,
  RotateSignedPreKeyDto,
  KeyBundleResponse,
  KeyStatusResponse,
} from './dto/crypto.dto';
import { PrismaService } from '../../../libs/db/prisma.service';

@Injectable()
export class CryptoService {
  constructor(private prisma: PrismaService) {}

  // X3DH Protocol Implementation

  async createIdentityKey(userId: bigint, createKeysDto: CreateKeysDto) {
    const { identityKeyPublic } = createKeysDto;

    try {
      // Check if user already has identity key
      const existingCrypto = await this.prisma.userCrypto.findUnique({
        where: { userId },
      });

      if (existingCrypto) {
        throw new ConflictException('Identity key already exists for this user');
      }

      // Validate key format (basic validation)
      if (!this.isValidPublicKey(identityKeyPublic)) {
        throw new BadRequestException('Invalid identity key format');
      }

      const userCrypto = await this.prisma.userCrypto.create({
        data: {
          userId,
          identityKeyPublic,
        },
      });

      return {
        success: true,
        userCryptoId: userCrypto.id,
        message: 'Identity key created successfully',
      };
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to create identity key');
    }
  }

  async getIdentityKey(userId: bigint) {
    const userCrypto = await this.prisma.userCrypto.findUnique({
      where: { userId },
      select: {
        identityKeyPublic: true,
        createdAt: true,
      },
    });

    if (!userCrypto) {
      throw new NotFoundException('Identity key not found for user');
    }

    return {
      identityKeyPublic: userCrypto.identityKeyPublic,
      createdAt: userCrypto.createdAt,
    };
  }

  async uploadSignedPreKey(userId: bigint, uploadDto: UploadPreKeysDto) {
    const { keyId, publicKey, signature, expiresAt } = uploadDto;

    const userCrypto = await this.findUserCrypto(userId);

    if (!keyId || !publicKey || !signature) {
      throw new BadRequestException('keyId, publicKey, and signature are required');
    }

    // Validate signature
    if (
      !userCrypto.identityKeyPublic ||
      !this.verifySignedPreKeySignature(publicKey, signature, userCrypto.identityKeyPublic)
    ) {
      throw new BadRequestException('Invalid signed pre-key signature');
    }

    try {
      // Check if keyId already exists for this user
      const existingKey = await this.prisma.signedPreKey.findUnique({
        where: {
          userCryptoId_keyId: {
            userCryptoId: userCrypto.id,
            keyId,
          },
        },
      });

      if (existingKey) {
        throw new ConflictException(`Signed pre-key with ID ${keyId} already exists`);
      }

      const signedPreKey = await this.prisma.signedPreKey.create({
        data: {
          userCryptoId: userCrypto.id,
          keyId,
          publicKey,
          signature,
          expiresAt: expiresAt
            ? new Date(expiresAt)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
        },
      });

      return {
        success: true,
        signedPreKeyId: signedPreKey.id,
        keyId: signedPreKey.keyId,
        expiresAt: signedPreKey.expiresAt,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException('Failed to upload signed pre-key');
    }
  }

  async rotateSignedPreKey(userId: bigint, rotateDto: RotateSignedPreKeyDto) {
    const { oldKeyId, newKeyId, publicKey, signature, expiresAt } = rotateDto;

    const userCrypto = await this.findUserCrypto(userId);

    try {
      return await this.prisma.$transaction(async tx => {
        // Mark old key as used (set flag)
        if (oldKeyId) {
          await tx.signedPreKey.updateMany({
            where: {
              userCryptoId: userCrypto.id,
              keyId: oldKeyId,
            },
            data: {
              flags: 1, // Set isUsed flag
            },
          });
        }

        // Create new signed pre-key
        const newSignedPreKey = await tx.signedPreKey.create({
          data: {
            userCryptoId: userCrypto.id,
            keyId: newKeyId,
            publicKey,
            signature,
            expiresAt: expiresAt
              ? new Date(expiresAt)
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });

        return {
          success: true,
          newKeyId: newSignedPreKey.keyId,
          oldKeyId,
          expiresAt: newSignedPreKey.expiresAt,
        };
      });
    } catch (error) {
      throw new BadRequestException('Failed to rotate signed pre-key');
    }
  }

  async uploadOneTimePreKeys(userId: bigint, uploadDto: UploadPreKeysDto) {
    const { keys } = uploadDto;

    if (!keys || keys.length === 0) {
      throw new BadRequestException('No keys provided');
    }

    if (keys.length > 100) {
      throw new BadRequestException('Too many keys (max 100 per batch)');
    }

    const userCrypto = await this.findUserCrypto(userId);

    try {
      // Check for duplicate keyIds
      const keyIds = keys.map(k => k.keyId);
      const duplicateIds = keyIds.filter((id, index) => keyIds.indexOf(id) !== index);

      if (duplicateIds.length > 0) {
        throw new BadRequestException(`Duplicate key IDs found: ${duplicateIds.join(', ')}`);
      }

      // Check if any keyIds already exist
      const existingKeys = await this.prisma.oneTimePreKey.findMany({
        where: {
          userCryptoId: userCrypto.id,
          keyId: { in: keyIds },
        },
        select: { keyId: true },
      });

      if (existingKeys.length > 0) {
        const existingIds = existingKeys.map(k => k.keyId);
        throw new ConflictException(`Keys with IDs already exist: ${existingIds.join(', ')}`);
      }

      // Validate all keys
      for (const key of keys) {
        if (!this.isValidPublicKey(key.publicKey)) {
          throw new BadRequestException(`Invalid public key format for keyId ${key.keyId}`);
        }
      }

      const oneTimePreKeys = await this.prisma.oneTimePreKey.createMany({
        data: keys.map(key => ({
          userCryptoId: userCrypto.id,
          keyId: key.keyId,
          publicKey: key.publicKey,
        })),
      });

      return {
        success: true,
        keysUploaded: oneTimePreKeys.count,
        keyIds: keyIds,
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException('Failed to upload one-time pre-keys');
    }
  }

  async getOneTimePreKeyCount(userId: bigint): Promise<{ count: number; unusedCount: number }> {
    const userCrypto = await this.findUserCrypto(userId);

    const [totalCount, unusedCount] = await Promise.all([
      this.prisma.oneTimePreKey.count({
        where: { userCryptoId: userCrypto.id },
      }),
      this.prisma.oneTimePreKey.count({
        where: {
          userCryptoId: userCrypto.id,
          flags: 0, // Not used
        },
      }),
    ]);

    return { count: totalCount, unusedCount };
  }

  async getKeyBundle(userId: bigint, query: GetKeyBundleDto): Promise<KeyBundleResponse> {
    const { includeOneTimeKey = true } = query;

    const userCrypto = await this.findUserCrypto(userId);

    // Get identity key
    const identityKey = userCrypto.identityKeyPublic;

    // Get current signed pre-key (not used and not expired)
    const signedPreKey = await this.prisma.signedPreKey.findFirst({
      where: {
        userCryptoId: userCrypto.id,
        flags: 0, // Not used
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!signedPreKey) {
      throw new NotFoundException('No valid signed pre-key available');
    }

    let oneTimePreKey: {
      keyId: number;
      publicKey: string;
    } | null = null;
    if (includeOneTimeKey) {
      oneTimePreKey = await this.prisma.$transaction(async tx => {
        const key = await tx.oneTimePreKey.findFirst({
          where: {
            userCryptoId: userCrypto.id,
            flags: 0, // Not used
          },
          orderBy: { createdAt: 'asc' }, // FIFO
        });

        if (key) {
          // Mark as used
          await tx.oneTimePreKey.update({
            where: { id: key.id },
            data: { flags: 1 }, // Set isUsed flag
          });

          // Record usage
          await tx.usedOneTimePreKey.create({
            data: {
              userCryptoId: userCrypto.id,
              keyId: key.keyId,
            },
          });
        }

        return key;
      });
    }

    return {
      identityKey,
      signedPreKey: {
        keyId: signedPreKey.keyId,
        publicKey: signedPreKey.publicKey,
        signature: signedPreKey.signature,
      },
      oneTimePreKey: oneTimePreKey
        ? {
            keyId: oneTimePreKey.keyId,
            publicKey: oneTimePreKey.publicKey,
          }
        : null,
    };
  }

  async markOneTimePreKeyAsUsed(userId: bigint, keyId: number) {
    const userCrypto = await this.findUserCrypto(userId);

    const key = await this.prisma.oneTimePreKey.findUnique({
      where: {
        userCryptoId_keyId: {
          userCryptoId: userCrypto.id,
          keyId,
        },
      },
    });

    if (!key) {
      throw new NotFoundException('One-time pre-key not found');
    }

    if (key.flags & 1) {
      // Already used
      throw new BadRequestException('One-time pre-key already used');
    }

    try {
      await this.prisma.$transaction(async tx => {
        // Mark as used
        await tx.oneTimePreKey.update({
          where: { id: key.id },
          data: { flags: 1 },
        });

        // Record usage
        await tx.usedOneTimePreKey.create({
          data: {
            userCryptoId: userCrypto.id,
            keyId,
          },
        });
      });

      return { success: true, message: 'One-time pre-key marked as used' };
    } catch (error) {
      throw new BadRequestException('Failed to mark one-time pre-key as used');
    }
  }

  async getCurrentSignedPreKey(userId: bigint) {
    const userCrypto = await this.findUserCrypto(userId);

    const signedPreKey = await this.prisma.signedPreKey.findFirst({
      where: {
        userCryptoId: userCrypto.id,
        flags: 0, // Not used
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!signedPreKey) {
      throw new NotFoundException('No valid signed pre-key found');
    }

    return {
      keyId: signedPreKey.keyId,
      publicKey: signedPreKey.publicKey,
      signature: signedPreKey.signature,
      createdAt: signedPreKey.createdAt,
      expiresAt: signedPreKey.expiresAt,
    };
  }

  async cleanupExpiredSignedPreKeys(userId: bigint) {
    const userCrypto = await this.findUserCrypto(userId);

    const deletedCount = await this.prisma.signedPreKey.deleteMany({
      where: {
        userCryptoId: userCrypto.id,
        expiresAt: { lt: new Date() },
      },
    });

    return {
      success: true,
      deletedCount: deletedCount.count,
      message: `Cleaned up ${deletedCount.count} expired signed pre-keys`,
    };
  }

  async getKeyStatus(userId: bigint): Promise<KeyStatusResponse> {
    const userCrypto = await this.findUserCrypto(userId);

    const [
      signedPreKeysCount,
      validSignedPreKeysCount,
      oneTimePreKeysCount,
      unusedOneTimePreKeysCount,
      usedOneTimePreKeysCount,
    ] = await Promise.all([
      this.prisma.signedPreKey.count({
        where: { userCryptoId: userCrypto.id },
      }),
      this.prisma.signedPreKey.count({
        where: {
          userCryptoId: userCrypto.id,
          flags: 0,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      this.prisma.oneTimePreKey.count({
        where: { userCryptoId: userCrypto.id },
      }),
      this.prisma.oneTimePreKey.count({
        where: {
          userCryptoId: userCrypto.id,
          flags: 0,
        },
      }),
      this.prisma.usedOneTimePreKey.count({
        where: { userCryptoId: userCrypto.id },
      }),
    ]);

    return {
      identityKey: {
        exists: true,
        createdAt: userCrypto.createdAt,
      },
      signedPreKeys: {
        total: signedPreKeysCount,
        valid: validSignedPreKeysCount,
        expired: signedPreKeysCount - validSignedPreKeysCount,
      },
      oneTimePreKeys: {
        total: oneTimePreKeysCount,
        unused: unusedOneTimePreKeysCount,
        used: usedOneTimePreKeysCount,
      },
    };
  }

  private async findUserCrypto(userId: bigint) {
    const userCrypto = await this.prisma.userCrypto.findUnique({
      where: { userId },
    });

    if (!userCrypto) {
      throw new NotFoundException(
        'User crypto profile not found. Please create identity key first.',
      );
    }

    return userCrypto;
  }

  private isValidPublicKey(publicKey: string): boolean {
    // Basic validation - check if it's a valid base64 string of expected length
    try {
      const buffer = Buffer.from(publicKey, 'base64');
      return buffer.length === 32; // Curve25519 public key length
    } catch {
      return false;
    }
  }

  private verifySignedPreKeySignature(
    publicKey: string,
    signature: string,
    identityKey: string,
  ): boolean {
    // This is a simplified validation - in production, implement proper signature verification
    // using the actual cryptographic library (e.g., libsignal)
    try {
      const pubKeyBuffer = Buffer.from(publicKey, 'base64');
      const sigBuffer = Buffer.from(signature, 'base64');
      const identityBuffer = Buffer.from(identityKey, 'base64');

      // Placeholder validation - replace with actual signature verification
      return pubKeyBuffer.length === 32 && sigBuffer.length === 64 && identityBuffer.length === 32;
    } catch {
      return false;
    }
  }
}
