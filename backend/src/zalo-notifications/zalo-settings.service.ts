import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { decryptSecret, encryptSecret, maskSecret } from '../common/helpers/secret.helper';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateZaloSettingsDto } from './dto/update-zalo-settings.dto';

export type ZaloTemplateType = 'INVOICE' | 'REMINDER' | 'PAID';

export type ResolvedZaloConfig = {
  appId: string | null;
  appSecret: string | null;
  oaId: string | null;
  accessToken: string | null;
  apiBaseUrl: string;
  dryRun: boolean;
  templateIds: Record<ZaloTemplateType, string | null>;
  missingRequired: string[];
  missingRecommended: string[];
  hasStoredAppSecret: boolean;
  hasStoredAccessToken: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
};

const ZALO_PROVIDER = 'ZALO_OA';
const DEFAULT_ZALO_API_BASE_URL = 'https://openapi.zalo.me/v3.0/oa';

@Injectable()
export class ZaloSettingsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  private get providerConfigs() {
    return (this.prisma as PrismaClient).zaloProviderConfig;
  }

  async getSettings() {
    const resolved = await this.resolveConfig();

    return {
      provider: ZALO_PROVIDER,
      configuredForSend: resolved.missingRequired.length === 0,
      dryRun: resolved.dryRun,
      appId: resolved.appId,
      oaId: resolved.oaId,
      apiBaseUrl: resolved.apiBaseUrl,
      templateInvoiceId: resolved.templateIds.INVOICE,
      templateReminderId: resolved.templateIds.REMINDER,
      templatePaidId: resolved.templateIds.PAID,
      hasAppSecret: Boolean(resolved.appSecret),
      appSecretPreview: maskSecret(resolved.appSecret, 3, 3),
      hasAccessToken: Boolean(resolved.accessToken),
      accessTokenPreview: maskSecret(resolved.accessToken, 4, 3),
      hasStoredAppSecret: resolved.hasStoredAppSecret,
      hasStoredAccessToken: resolved.hasStoredAccessToken,
      missingRequired: resolved.missingRequired,
      missingRecommended: resolved.missingRecommended,
      lastTestedAt: resolved.lastTestedAt,
      lastTestStatus: resolved.lastTestStatus,
      lastTestMessage: resolved.lastTestMessage,
    };
  }

  async updateSettings(dto: UpdateZaloSettingsDto, actorId: string) {
    const current = await this.providerConfigs.findUnique({
      where: { provider: ZALO_PROVIDER },
    });

    const appId = this.normalizeOptional(dto.appId, current?.appId || null);
    const oaId = this.normalizeOptional(dto.oaId, current?.oaId || null);
    const apiBaseUrl = this.normalizeOptional(
      dto.apiBaseUrl,
      current?.apiBaseUrl || DEFAULT_ZALO_API_BASE_URL,
    );
    const templateInvoiceId = this.normalizeOptional(
      dto.templateInvoiceId,
      current?.templateInvoiceId || null,
    );
    const templateReminderId = this.normalizeOptional(
      dto.templateReminderId,
      current?.templateReminderId || null,
    );
    const templatePaidId = this.normalizeOptional(
      dto.templatePaidId,
      current?.templatePaidId || null,
    );

    const appSecretEncrypted = dto.appSecret?.trim()
      ? encryptSecret(dto.appSecret.trim(), this.getEncryptionSecret())
      : current?.appSecretEncrypted || null;
    const accessTokenEncrypted = dto.accessToken?.trim()
      ? encryptSecret(dto.accessToken.trim(), this.getEncryptionSecret())
      : current?.accessTokenEncrypted || null;

    if (
      !appId &&
      !oaId &&
      !apiBaseUrl &&
      !templateInvoiceId &&
      !templateReminderId &&
      !templatePaidId &&
      !appSecretEncrypted &&
      !accessTokenEncrypted
    ) {
      throw new BadRequestException('Vui long nhap it nhat mot truong cau hinh Zalo.');
    }

    await this.providerConfigs.upsert({
      where: { provider: ZALO_PROVIDER },
      create: {
        provider: ZALO_PROVIDER,
        appId,
        appSecretEncrypted,
        oaId,
        accessTokenEncrypted,
        apiBaseUrl,
        templateInvoiceId,
        templateReminderId,
        templatePaidId,
        updatedByUserId: actorId,
      },
      update: {
        appId,
        appSecretEncrypted,
        oaId,
        accessTokenEncrypted,
        apiBaseUrl,
        templateInvoiceId,
        templateReminderId,
        templatePaidId,
        updatedByUserId: actorId,
        deletedAt: null,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'ZALO_SETTINGS_UPDATED',
      entityType: 'ZaloProviderConfig',
      entityId: ZALO_PROVIDER,
      payload: {
        provider: ZALO_PROVIDER,
        hasNewAppSecret: Boolean(dto.appSecret?.trim()),
        hasNewAccessToken: Boolean(dto.accessToken?.trim()),
        hasAppId: Boolean(appId),
        hasOaId: Boolean(oaId),
        templateInvoiceId,
        templateReminderId,
        templatePaidId,
      },
    });

    return this.getSettings();
  }

  async resolveConfig(): Promise<ResolvedZaloConfig> {
    const record = await this.providerConfigs.findUnique({
      where: { provider: ZALO_PROVIDER },
    });

    const appSecretFromDb = record?.appSecretEncrypted
      ? decryptSecret(record.appSecretEncrypted, this.getEncryptionSecret())
      : null;
    const accessTokenFromDb = record?.accessTokenEncrypted
      ? decryptSecret(record.accessTokenEncrypted, this.getEncryptionSecret())
      : null;

    const appId = record?.appId?.trim() || this.readEnv('ZALO_APP_ID');
    const appSecret = appSecretFromDb || this.readEnv('ZALO_APP_SECRET');
    const oaId = record?.oaId?.trim() || this.readEnv('ZALO_OA_ID');
    const accessToken = accessTokenFromDb || this.readEnv('ZALO_ACCESS_TOKEN');
    const apiBaseUrl =
      record?.apiBaseUrl?.trim() ||
      this.readEnv('ZALO_API_BASE_URL') ||
      DEFAULT_ZALO_API_BASE_URL;
    const templateIds = {
      INVOICE:
        record?.templateInvoiceId?.trim() || this.readEnv('ZALO_TEMPLATE_INVOICE_ID'),
      REMINDER:
        record?.templateReminderId?.trim() || this.readEnv('ZALO_TEMPLATE_REMINDER_ID'),
      PAID: record?.templatePaidId?.trim() || this.readEnv('ZALO_TEMPLATE_PAID_ID'),
    } satisfies Record<ZaloTemplateType, string | null>;
    const dryRun = this.configService.get<string>('ZALO_DRY_RUN') !== 'false';

    const missingRequired = [
      !oaId ? 'ZALO_OA_ID' : null,
      !accessToken ? 'ZALO_ACCESS_TOKEN' : null,
      !templateIds.INVOICE ? 'ZALO_TEMPLATE_INVOICE_ID' : null,
      !apiBaseUrl ? 'ZALO_API_BASE_URL' : null,
    ].filter((value): value is string => Boolean(value));

    const missingRecommended = [
      !appId ? 'ZALO_APP_ID' : null,
      !appSecret ? 'ZALO_APP_SECRET' : null,
      !templateIds.REMINDER ? 'ZALO_TEMPLATE_REMINDER_ID' : null,
      !templateIds.PAID ? 'ZALO_TEMPLATE_PAID_ID' : null,
    ].filter((value): value is string => Boolean(value));

    return {
      appId,
      appSecret,
      oaId,
      accessToken,
      apiBaseUrl,
      dryRun,
      templateIds,
      missingRequired,
      missingRecommended,
      hasStoredAppSecret: Boolean(record?.appSecretEncrypted),
      hasStoredAccessToken: Boolean(record?.accessTokenEncrypted),
      lastTestedAt: record?.lastTestedAt?.toISOString() || null,
      lastTestStatus: record?.lastTestStatus || null,
      lastTestMessage: record?.lastTestMessage || null,
    };
  }

  async recordTestResult(params: {
    actorId?: string;
    status: string;
    message: string;
  }) {
    await this.providerConfigs.upsert({
      where: { provider: ZALO_PROVIDER },
      create: {
        provider: ZALO_PROVIDER,
        lastTestedAt: new Date(),
        lastTestStatus: params.status,
        lastTestMessage: params.message,
        updatedByUserId: params.actorId || null,
      },
      update: {
        lastTestedAt: new Date(),
        lastTestStatus: params.status,
        lastTestMessage: params.message,
        updatedByUserId: params.actorId || undefined,
        deletedAt: null,
      },
    });
  }

  private normalizeOptional(value: string | undefined, currentValue: string | null) {
    if (value === undefined) {
      return currentValue;
    }

    const trimmed = value.trim();
    return trimmed || null;
  }

  private readEnv(name: string) {
    const value = this.configService.get<string>(name)?.trim();
    return value || null;
  }

  private getEncryptionSecret() {
    return (
      this.configService.get<string>('ZALO_SETTINGS_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'moka-solar-zalo-settings'
    );
  }
}
