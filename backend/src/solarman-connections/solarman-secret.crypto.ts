import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function encryptionKey(configService: ConfigService) {
  const configuredSecret =
    configService.get<string>('SOLARMAN_SETTINGS_SECRET') ||
    configService.get<string>('AI_SETTINGS_SECRET') ||
    configService.get<string>('JWT_SECRET');
  const isProduction =
    String(configService.get<string>('NODE_ENV') || process.env.NODE_ENV || '').toLowerCase() ===
    'production';
  if (isProduction && !configuredSecret) {
    throw new Error('SOLARMAN_SETTINGS_SECRET is required in production.');
  }
  // Preserve the existing local encryption key so legacy development records
  // remain readable. Production never falls back to this value.
  const secret = configuredSecret || 'moka-solar-solarman-settings';

  return createHash('sha256').update(secret).digest();
}

export function encryptSolarmanSecret(value: string, configService: ConfigService) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(configService), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSolarmanSecret(
  value: string | null | undefined,
  configService: ConfigService,
) {
  if (!value) {
    return null;
  }

  try {
    const [ivBase64, authTagBase64, payloadBase64] = value.split(':');
    if (!ivBase64 || !authTagBase64 || !payloadBase64) {
      return null;
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(configService),
      Buffer.from(ivBase64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(payloadBase64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
