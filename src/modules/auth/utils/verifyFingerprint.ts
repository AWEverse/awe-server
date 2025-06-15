import * as sodium from 'libsodium-wrappers';
import { blake3 } from '@noble/hashes/blake3';

export async function verifyDeviceToken(deviceToken: string): Promise<string> {
  if (!deviceToken || typeof deviceToken !== 'string') {
    throw new Error('Invalid device token format');
  }

  const parts = deviceToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Device token must have three parts');
  }

  let fingerprint: Uint8Array, publicKey: Uint8Array, signature: Uint8Array;
  try {
    [fingerprint, publicKey, signature] = parts.map(part =>
      sodium.from_base64(part, sodium.base64_variants.URLSAFE_NO_PADDING),
    );
  } catch {
    throw new Error('Invalid Base64 encoding in device token');
  }

  await sodium.ready;
  const isValid = sodium.crypto_sign_verify_detached(signature, fingerprint, publicKey);
  if (!isValid) {
    throw new Error('Invalid device token signature');
  }

  return sodium.to_base64(blake3(publicKey), sodium.base64_variants.URLSAFE_NO_PADDING);
}
