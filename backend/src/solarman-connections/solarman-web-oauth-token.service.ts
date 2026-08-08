import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SolarmanPersistedSession } from './solarman-client.service';
import { SolarmanConnectionLockService } from './solarman-connection-lock.service';
import {
  decryptSolarmanSecret,
  encryptSolarmanSecret,
} from './solarman-secret.crypto';
import {
  SolarmanWebOAuthClient,
  SolarmanWebOAuthRefreshError,
} from './solarman-web-oauth.client';

type TokenRecord = {
  id: string;
  status: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  accessTokenExpiresAt: Date | null;
  lastSuccessfulRefreshAt: Date | null;
};

type CachedAccessToken = {
  accessToken: string;
  expiresAt: Date;
};

const MAX_REFRESH_TOKEN_LENGTH = 16_384;

@Injectable()
export class SolarmanWebOAuthTokenService {
  private readonly accessTokenCache = new Map<string, CachedAccessToken>();

  constructor(
    private readonly lockService: SolarmanConnectionLockService,
    private readonly oauthClient: SolarmanWebOAuthClient,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async authorize(connectionId: string, submittedRefreshToken: string) {
    let refreshToken = submittedRefreshToken.trim();
    if (!refreshToken) {
      throw new BadRequestException('SOLARMAN refresh token is required.');
    }
    if (refreshToken.length > MAX_REFRESH_TOKEN_LENGTH) {
      refreshToken = '';
      throw new BadRequestException('Input exceeds the permitted length.');
    }

    this.invalidate(connectionId);
    try {
      return await this.withFailureStatus(connectionId, () =>
        this.lockService.withRefreshLock(connectionId, async (transaction) => {
          const connection = await this.readConnection(transaction, connectionId);
          return this.refreshLocked(transaction, connection, refreshToken, 'CONFIGURED');
        }),
      );
    } finally {
      refreshToken = '';
    }
  }

  async getValidSession(connectionId: string): Promise<SolarmanPersistedSession> {
    const cached = this.accessTokenCache.get(connectionId);
    if (cached && this.isUsable(cached.expiresAt)) {
      return this.toSession(cached.accessToken, cached.expiresAt);
    }

    return this.withFailureStatus(connectionId, () =>
      this.lockService.withRefreshLock(connectionId, async (transaction) => {
        const connection = await this.readConnection(transaction, connectionId);
        const persisted = this.readPersistedAccessToken(connection);
        if (persisted && this.isUsable(connection.accessTokenExpiresAt)) {
          await this.encryptLegacyPlaintext(transaction, connection);
          this.cache(connectionId, persisted, connection.accessTokenExpiresAt!);
          return this.toSession(persisted, connection.accessTokenExpiresAt!);
        }

        return this.refreshLocked(transaction, connection);
      }),
    );
  }

  async refreshAfterRejection(
    connectionId: string,
    rejectedAccessToken: string | null | undefined,
  ): Promise<SolarmanPersistedSession> {
    this.invalidate(connectionId);
    const rejectedFingerprint = this.fingerprint(rejectedAccessToken);

    return this.withFailureStatus(connectionId, () =>
      this.lockService.withRefreshLock(connectionId, async (transaction) => {
        const connection = await this.readConnection(transaction, connectionId);
        const persisted = this.readPersistedAccessToken(connection);

        if (
          persisted &&
          this.isUsable(connection.accessTokenExpiresAt) &&
          this.fingerprint(persisted) !== rejectedFingerprint
        ) {
          await this.encryptLegacyPlaintext(transaction, connection);
          this.cache(connectionId, persisted, connection.accessTokenExpiresAt!);
          return this.toSession(persisted, connection.accessTokenExpiresAt!);
        }

        return this.refreshLocked(transaction, connection);
      }),
    );
  }

  invalidate(connectionId: string) {
    this.accessTokenCache.delete(connectionId);
  }

  private async refreshLocked(
    transaction: Prisma.TransactionClient,
    connection: TokenRecord,
    suppliedRefreshToken?: string,
    statusAfterSuccess?: string,
  ) {
    let refreshToken =
      suppliedRefreshToken ||
      decryptSolarmanSecret(connection.refreshTokenEncrypted, this.configService) ||
      connection.refreshToken ||
      '';

    if (!refreshToken) {
      throw this.authRequired('SOLARMAN authorization is required.');
    }

    try {
      const refreshed = await this.oauthClient.refresh(refreshToken);
      const expiresAt = new Date(Date.now() + refreshed.expiresInSeconds * 1000);
      const nextRefreshToken = refreshed.rotatedRefreshToken || refreshToken;
      const now = new Date();

      await transaction.solarmanConnection.update({
        where: { id: connection.id },
        data: {
          accessToken: null,
          refreshToken: null,
          accessTokenEncrypted: encryptSolarmanSecret(
            refreshed.accessToken,
            this.configService,
          ),
          refreshTokenEncrypted: encryptSolarmanSecret(
            nextRefreshToken,
            this.configService,
          ),
          accessTokenExpiresAt: expiresAt,
          lastSuccessfulRefreshAt: now,
          lastRefreshErrorCode: null,
          lastRefreshErrorMessage: null,
          reauthorizationRequiredAt: null,
          cookieJar: statusAfterSuccess ? Prisma.DbNull : undefined,
          cookieJarEncrypted: statusAfterSuccess ? null : undefined,
          status: statusAfterSuccess || connection.status,
        },
      });

      this.cache(connection.id, refreshed.accessToken, expiresAt);
      return this.toSession(refreshed.accessToken, expiresAt);
    } catch (error) {
      const providerError =
        error instanceof SolarmanWebOAuthRefreshError
          ? error
          : new SolarmanWebOAuthRefreshError(
              'SOLARMAN token refresh failed.',
              'REFRESH_FAILED',
              false,
            );
      const message = providerError.authRejected
        ? 'SOLARMAN refresh token was rejected. Manual authorization is required.'
        : providerError.message;

      if (providerError.authRejected) {
        throw this.authRequired(message, providerError.statusCode);
      }

      throw new BadGatewayException({
        code: providerError.code,
        provider: 'SOLARMAN',
        statusCode: providerError.statusCode,
        message,
      });
    } finally {
      refreshToken = '';
    }
  }

  private async readConnection(
    transaction: Prisma.TransactionClient,
    connectionId: string,
  ): Promise<TokenRecord> {
    const connection = await transaction.solarmanConnection.findFirst({
      where: { id: connectionId, deletedAt: null },
      select: {
        id: true,
        status: true,
        accessToken: true,
        refreshToken: true,
        accessTokenEncrypted: true,
        refreshTokenEncrypted: true,
        accessTokenExpiresAt: true,
        lastSuccessfulRefreshAt: true,
      },
    });

    if (!connection) {
      throw new NotFoundException('SOLARMAN connection not found');
    }
    return connection;
  }

  private readPersistedAccessToken(connection: TokenRecord) {
    return (
      decryptSolarmanSecret(connection.accessTokenEncrypted, this.configService) ||
      connection.accessToken ||
      null
    );
  }

  private async encryptLegacyPlaintext(
    transaction: Prisma.TransactionClient,
    connection: TokenRecord,
  ) {
    if (!connection.accessToken && !connection.refreshToken) {
      return;
    }

    const accessToken =
      decryptSolarmanSecret(connection.accessTokenEncrypted, this.configService) ||
      connection.accessToken;
    const refreshToken =
      decryptSolarmanSecret(connection.refreshTokenEncrypted, this.configService) ||
      connection.refreshToken;
    await transaction.solarmanConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: null,
        refreshToken: null,
        accessTokenEncrypted:
          connection.accessTokenEncrypted ||
          (accessToken
            ? encryptSolarmanSecret(accessToken, this.configService)
            : undefined),
        refreshTokenEncrypted:
          connection.refreshTokenEncrypted ||
          (refreshToken
            ? encryptSolarmanSecret(refreshToken, this.configService)
            : undefined),
      },
    });
  }

  private cache(connectionId: string, accessToken: string, expiresAt: Date) {
    this.accessTokenCache.set(connectionId, { accessToken, expiresAt });
  }

  private async withFailureStatus<T>(connectionId: string, operation: () => Promise<T>) {
    const operationStartedAt = new Date();
    try {
      return await operation();
    } catch (error) {
      const failure = this.readSafeFailure(error);
      if (failure) {
        await this.lockService.withRefreshLock(connectionId, async (transaction) => {
          const connection = await this.readConnection(transaction, connectionId);
          await this.encryptLegacyPlaintext(transaction, connection);

          // A different PM2 worker may have refreshed successfully while this
          // failed request was releasing and reacquiring the advisory lock.
          if (
            connection.lastSuccessfulRefreshAt &&
            connection.lastSuccessfulRefreshAt > operationStartedAt
          ) {
            return;
          }

          await transaction.solarmanConnection.update({
            where: { id: connectionId },
            data: {
              status: failure.authRequired ? 'AUTH_REQUIRED' : 'ERROR',
              lastRefreshErrorCode: failure.code,
              lastRefreshErrorMessage: failure.message,
              reauthorizationRequiredAt: failure.authRequired ? new Date() : null,
            },
          });
        });
      }
      throw error;
    }
  }

  private readSafeFailure(error: unknown) {
    if (!(error instanceof BadGatewayException)) {
      return null;
    }
    const response = error.getResponse();
    if (!response || typeof response !== 'object') {
      return null;
    }
    const payload = response as Record<string, unknown>;
    if (payload.provider !== 'SOLARMAN') {
      return null;
    }
    const code = typeof payload.code === 'string' ? payload.code : 'REFRESH_FAILED';
    const message =
      typeof payload.message === 'string'
        ? payload.message
        : 'SOLARMAN token refresh failed.';
    return {
      code,
      message,
      authRequired: code === 'AUTH_REQUIRED',
    };
  }

  private isUsable(expiresAt: Date | null | undefined) {
    const configuredMinutes = Number(
      this.configService.get('SOLARMAN_WEB_TOKEN_REFRESH_MARGIN_MINUTES') || 10,
    );
    const refreshWindowMs =
      Math.min(Math.max(configuredMinutes, 1), 60) * 60 * 1000;
    return Boolean(
      expiresAt && expiresAt.getTime() - refreshWindowMs > Date.now(),
    );
  }

  private toSession(accessToken: string, expiresAt: Date): SolarmanPersistedSession {
    return {
      mode: 'web',
      token: accessToken,
      cookieJar: null,
      expiresAt: expiresAt.getTime(),
      authorizationScheme: 'bearer',
      allowCookies: false,
    };
  }

  private fingerprint(value: string | null | undefined) {
    return value ? createHash('sha256').update(value).digest('hex') : '';
  }

  private authRequired(message: string, statusCode = 401) {
    return new BadGatewayException({
      code: 'AUTH_REQUIRED',
      provider: 'SOLARMAN',
      statusCode,
      message,
    });
  }
}
