import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZaloNotificationsService } from '../../zalo-notifications/zalo-notifications.service';
import { OtpProvider, OtpSendParams, OtpSendResult } from './otp-provider.interface';

@Injectable()
export class ZaloOtpProvider implements OtpProvider {
  readonly name = 'ZALO_OTP';

  constructor(
    private readonly configService: ConfigService,
    private readonly zaloNotificationsService: ZaloNotificationsService,
  ) {}

  async sendOtp(params: OtpSendParams): Promise<OtpSendResult> {
    const result = await this.zaloNotificationsService.sendOtpTemplate({
      phone: params.phone,
      otpCode: params.otpCode,
      requestId: params.requestId,
      purpose: params.purpose,
      customerName: params.fullName || 'Quy khach',
      expiresInMinutes: params.expiresInMinutes,
      dryRun: this.isDebugMode(),
    });

    return {
      success: result.success,
      provider: this.name,
      channel: 'ZALO',
      sendStatus:
        result.status === 'SENT' || result.status === 'DRY_RUN'
          ? result.status
          : result.status === 'BLOCKED'
            ? 'BLOCKED'
            : 'FAILED',
      providerCode: result.providerCode || null,
      providerMessage: result.providerMessage || 'Khong the gui OTP qua Zalo.',
      requestPayload:
        result.requestPayload &&
        typeof result.requestPayload === 'object' &&
        !Array.isArray(result.requestPayload)
          ? (result.requestPayload as Record<string, unknown>)
          : null,
      responsePayload:
        result.responsePayload &&
        typeof result.responsePayload === 'object' &&
        !Array.isArray(result.responsePayload)
          ? (result.responsePayload as Record<string, unknown>)
          : null,
      debugCode: this.isDebugMode() ? params.otpCode : null,
    };
  }

  private isDebugMode() {
    const configured = String(this.configService.get('AUTH_OTP_DEBUG_MODE') || '')
      .trim()
      .toLowerCase();

    if (configured === 'true') {
      return true;
    }

    if (configured === 'false') {
      return false;
    }

    return this.configService.get('NODE_ENV') !== 'production';
  }
}
