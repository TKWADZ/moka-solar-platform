export type OtpProviderPurpose =
  | 'CUSTOMER_LOGIN'
  | 'CUSTOMER_REGISTER'
  | 'CUSTOMER_PASSWORD_RESET'
  | 'CUSTOMER_PHONE_VERIFICATION'
  | 'CUSTOMER_SENSITIVE_ACTION';

export type OtpSendParams = {
  requestId: string;
  phone: string;
  otpCode: string;
  expiresInMinutes: number;
  purpose: OtpProviderPurpose;
  fullName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type OtpSendResult = {
  success: boolean;
  provider: string;
  channel: 'ZALO';
  sendStatus: 'SENT' | 'DRY_RUN' | 'FAILED' | 'BLOCKED';
  providerCode?: string | null;
  providerMessage: string;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  debugCode?: string | null;
};

export interface OtpProvider {
  readonly name: string;
  sendOtp(params: OtpSendParams): Promise<OtpSendResult>;
}

export const OTP_PROVIDER = 'OTP_PROVIDER';
