import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptSecret, maskSecret, sha256Lowercase } from '../common/helpers/secret.helper';
import { PrismaService } from '../prisma/prisma.service';
import { DeyeApiService } from './deye-api.service';

type DeyeConnectionRecord = any;

type DeyeSession = {
  connection: DeyeConnectionRecord;
  authHeader: string;
};

@Injectable()
export class DeyeAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly deyeApiService: DeyeApiService,
  ) {}

  async ensureAuthorizedConnection(connectionInput: string | DeyeConnectionRecord, force = false) {
    const connection =
      typeof connectionInput === 'string'
        ? await this.getConnectionOrThrow(connectionInput)
        : connectionInput;

    if (!force && this.isTokenValid(connection)) {
      return {
        connection,
        authHeader: this.buildAuthHeader(connection.accessToken, connection.tokenType),
      } satisfies DeyeSession;
    }

    const secrets = this.readSecrets(connection);
    if (!secrets.appSecret || !secrets.password) {
      throw new BadRequestException(
        'Khong the giai ma APP_SECRET hoac password Deye. Hay luu lai ket noi voi thong tin moi.',
      );
    }

    const tokenBody = (await this.deyeApiService.post(
      connection.baseUrl,
      '/v1.0/account/token',
      {
        appSecret: secrets.appSecret,
        email: connection.email,
        password: sha256Lowercase(secrets.password),
      },
      {
        query: { appId: connection.appId },
        description: 'Deye token',
      },
    )) as Record<string, unknown>;

    this.ensureSuccess(tokenBody, 'Lay access token Deye that bai.');

    const expiresIn = Number(tokenBody.expiresIn || 0) || 0;
    const tokenExpiredAt = expiresIn
      ? new Date(Date.now() + Math.max(expiresIn - 600, 60) * 1000)
      : null;

    const updated = await this.prisma.deyeConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: String(tokenBody.accessToken || ''),
        refreshToken: tokenBody.refreshToken ? String(tokenBody.refreshToken) : null,
        tokenType: tokenBody.tokenType ? String(tokenBody.tokenType) : 'bearer',
        expiresIn: expiresIn || null,
        tokenExpiredAt,
        uid:
          tokenBody.uid !== undefined && tokenBody.uid !== null
            ? Number(tokenBody.uid)
            : null,
        status: 'AUTHORIZED',
        lastError: null,
      },
    });

    return {
      connection: updated,
      authHeader: this.buildAuthHeader(updated.accessToken, updated.tokenType),
    } satisfies DeyeSession;
  }

  async testConnection(connectionId: string) {
    const session = await this.ensureAuthorizedConnection(connectionId, true);
    const accountInfo = await this.fetchAccountInfo(session.connection);

    const org = accountInfo.orgInfoList?.[0];
    const updated = await this.prisma.deyeConnection.update({
      where: { id: session.connection.id },
      data: {
        companyId:
          org?.companyId !== undefined && org?.companyId !== null
            ? Number(org.companyId)
            : null,
        companyName: org?.companyName ? String(org.companyName) : null,
        roleName: org?.roleName ? String(org.roleName) : null,
        status: 'CONNECTED',
        lastError: null,
      },
    });

    return {
      connection: updated,
      accountInfo,
    };
  }

  async fetchAccountInfo(connectionInput: string | DeyeConnectionRecord) {
    const session = await this.ensureAuthorizedConnection(connectionInput);
    const payload = (await this.deyeApiService.post(
      session.connection.baseUrl,
      '/v1.0/account/info',
      {},
      {
        headers: {
          Authorization: session.authHeader,
        },
        description: 'Deye account info',
      },
    )) as Record<string, unknown>;

    this.ensureSuccess(payload, 'Lay thong tin account Deye that bai.');
    return payload;
  }

  async withAuthorizedRequest<T>(
    connectionInput: string | DeyeConnectionRecord,
    callback: (session: DeyeSession) => Promise<T>,
  ) {
    try {
      const session = await this.ensureAuthorizedConnection(connectionInput);
      return await callback(session);
    } catch (error) {
      if (!this.shouldRefreshToken(error)) {
        throw error;
      }

      const session = await this.ensureAuthorizedConnection(connectionInput, true);
      return callback(session);
    }
  }

  getAccessTokenPreview(accessToken?: string | null) {
    return maskSecret(accessToken, 10, 4);
  }

  private shouldRefreshToken(error: unknown) {
    if (error instanceof UnauthorizedException) {
      return true;
    }

    if (error instanceof BadGatewayException) {
      const response = error.getResponse();
      if (response && typeof response === 'object') {
        const payload = response as Record<string, unknown>;
        return payload.statusCode === 401 || payload.statusCode === 403;
      }
    }

    return false;
  }

  private ensureSuccess(payload: Record<string, unknown>, fallbackMessage: string) {
    const success = payload.success === true || String(payload.code || '') === '1000000';
    if (!success) {
      throw new BadGatewayException({
        message: String(payload.msg || fallbackMessage),
        provider: 'DEYE',
        code: payload.code || null,
        requestId: payload.requestId || null,
      });
    }
  }

  private buildAuthHeader(accessToken?: string | null, tokenType?: string | null) {
    if (!accessToken) {
      throw new UnauthorizedException('Deye access token is missing.');
    }

    if (/^bearer\s+/i.test(accessToken)) {
      return accessToken;
    }

    return `${tokenType || 'Bearer'} ${accessToken}`;
  }

  private isTokenValid(connection: DeyeConnectionRecord) {
    if (!connection.accessToken || !connection.tokenExpiredAt) {
      return false;
    }

    const expiresAt = new Date(connection.tokenExpiredAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt > Date.now() + 5 * 60 * 1000;
  }

  private readSecrets(connection: DeyeConnectionRecord) {
    const secret =
      this.configService.get<string>('DEYE_SETTINGS_SECRET') ||
      this.configService.get<string>('AI_SETTINGS_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'moka-solar-deye-settings';

    return {
      appSecret: decryptSecret(connection.appSecretEncrypted, secret),
      password: decryptSecret(connection.passwordEncrypted, secret),
    };
  }

  private async getConnectionOrThrow(id: string) {
    const connection = await this.prisma.deyeConnection.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!connection) {
      throw new BadRequestException('Deye connection not found.');
    }

    return connection;
  }
}
