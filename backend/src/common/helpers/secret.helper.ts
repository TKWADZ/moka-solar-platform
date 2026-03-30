import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export function deriveSecretKey(secret: string) {
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(value: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveSecretKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(value: string, secret: string) {
  try {
    const [ivBase64, authTagBase64, payloadBase64] = value.split(':');
    if (!ivBase64 || !authTagBase64 || !payloadBase64) {
      return null;
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveSecretKey(secret),
      Buffer.from(ivBase64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payloadBase64, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function sha256Lowercase(value: string) {
  return createHash('sha256').update(value).digest('hex').toLowerCase();
}

export function maskSecret(value?: string | null, visibleStart = 4, visibleEnd = 2) {
  if (!value) {
    return null;
  }

  if (value.length <= visibleStart + visibleEnd) {
    return `${value.slice(0, 1)}***`;
  }

  return `${value.slice(0, visibleStart)}***${value.slice(-visibleEnd)}`;
}
