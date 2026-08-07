import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OtpRequestPurpose, OtpRequestStatus, Prisma } from '@prisma/client';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { assertPasswordPolicy } from '../common/auth/password-policy';
import {
  isValidEmail,
  normalizeEmail,
  normalizeVietnamPhone,
} from '../common/helpers/identity.helper';
import { RequestContextService } from '../common/request-context/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  STAFF_MAIL_PROVIDER,
  StaffMailProvider,
} from './mail/staff-mail-provider.interface';
import { OTP_PROVIDER, OtpProvider, OtpSendResult } from './otp/otp-provider.interface';

const INTERNAL_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']);
const GENERIC_REQUEST_MESSAGE =
  'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.';
const GENERIC_RESET_ERROR = 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.';
const GENERIC_OTP_REQUEST_MESSAGE =
  'Nếu tài khoản đủ điều kiện, mã OTP sẽ được gửi qua Zalo đến số điện thoại đã đăng ký.';
const GENERIC_OTP_RESET_ERROR = 'Mã OTP không hợp lệ, đã hết hạn hoặc không còn hiệu lực.';

@Injectable()
export class StaffPasswordService {
  private readonly logger = new Logger(StaffPasswordService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
    @Inject(OTP_PROVIDER)
    private readonly otpProvider: OtpProvider,
    @Inject(STAFF_MAIL_PROVIDER)
    private readonly mailProvider: StaffMailProvider,
  ) {}

  async requestPasswordResetOtp(rawEmail: string) {
    const email = normalizeEmail(rawEmail);
    if (!email || !isValidEmail(email)) {
      throw new BadRequestException('Email is invalid.');
    }

    const requestContext = this.requestContextService.get();
    await this.assertRequestRateLimit(email, requestContext?.ipAddress || null);

    const matches = await this.prisma.user.findMany({
      where: {
        email: { equals: email, mode: 'insensitive' },
      },
      include: { role: true },
      take: 2,
    });
    const matchedUser =
      matches.length === 1 &&
      !matches[0].deletedAt &&
      INTERNAL_ROLES.has(matches[0].role.code)
        ? matches[0]
        : null;
    const phone = matchedUser ? normalizeVietnamPhone(matchedUser.phone) : null;
    const user = matchedUser && phone ? matchedUser : null;

    await this.prisma.authLoginAttempt.create({
      data: {
        userId: matchedUser?.id || null,
        authMethod: 'STAFF_PASSWORD_RESET_OTP_REQUEST',
        identifierType: 'EMAIL',
        identifierValue: email,
        ipAddress: requestContext?.ipAddress || null,
        userAgent: requestContext?.userAgent || null,
        success: true,
        outcome: user ? 'ACCEPTED' : 'GENERIC_ACCEPTED',
        failureReason: matchedUser && !phone ? 'REGISTERED_PHONE_UNAVAILABLE' : null,
      },
    });

    if (!user || !phone) {
      return this.buildDecoyOtpRequestResponse();
    }

    const now = new Date();
    const latestRequest = await this.prisma.otpRequest.findFirst({
      where: {
        phone,
        purpose: OtpRequestPurpose.STAFF_PASSWORD_RESET,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (
      latestRequest?.resendAvailableAt &&
      latestRequest.resendAvailableAt.getTime() > now.getTime()
    ) {
      return this.buildDecoyOtpRequestResponse();
    }

    if (await this.isOtpPhoneRateLimited(phone)) {
      return this.buildDecoyOtpRequestResponse();
    }

    await this.prisma.otpRequest.updateMany({
      where: {
        userId: user.id,
        purpose: OtpRequestPurpose.STAFF_PASSWORD_RESET,
        verifiedAt: null,
        consumedAt: null,
        deletedAt: null,
      },
      data: {
        sendStatus: OtpRequestStatus.EXPIRED,
        consumedAt: now,
      },
    });

    const otpCode = String(randomInt(100000, 1000000));
    const expiresAt = new Date(now.getTime() + this.getOtpTtlMinutes() * 60 * 1000);
    const resendAvailableAt = new Date(
      now.getTime() + this.getOtpResendCooldownSeconds() * 1000,
    );
    const otpRequest = await this.prisma.otpRequest.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        purpose: OtpRequestPurpose.STAFF_PASSWORD_RESET,
        provider: this.otpProvider.name,
        phone,
        emailSnapshot: email,
        fullNameSnapshot: user.fullName,
        codeHash: await bcrypt.hash(otpCode, 10),
        expiresAt,
        resendAvailableAt,
        maxAttempts: this.getOtpMaxAttempts(),
        requestedIp: requestContext?.ipAddress || null,
        requestedUserAgent: requestContext?.userAgent || null,
        sendStatus: OtpRequestStatus.PENDING,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'STAFF_PASSWORD_RESET_OTP_REQUESTED',
        moduleKey: 'security',
        entityType: 'User',
        entityId: user.id,
        payload: {
          source: 'public_staff_zalo_otp_recovery',
          otpRequestId: otpRequest.id,
          expiresAt: expiresAt.toISOString(),
        },
        ipAddress: requestContext?.ipAddress || null,
        userAgent: requestContext?.userAgent || null,
      },
    });

    let sendResult: OtpSendResult;
    try {
      sendResult = await this.otpProvider.sendOtp({
        requestId: otpRequest.id,
        phone,
        otpCode,
        expiresInMinutes: this.getOtpTtlMinutes(),
        purpose: 'STAFF_PASSWORD_RESET',
        fullName: user.fullName,
        ipAddress: requestContext?.ipAddress || null,
        userAgent: requestContext?.userAgent || null,
      });
    } catch {
      sendResult = {
        success: false,
        provider: this.otpProvider.name,
        channel: 'ZALO',
        sendStatus: 'FAILED',
        providerCode: 'PROVIDER_EXCEPTION',
        providerMessage: 'Không thể gửi OTP qua Zalo vào lúc này.',
      };
    }

    const delivered = sendResult.sendStatus === 'SENT' || sendResult.sendStatus === 'DRY_RUN';
    const updatedRequest = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.otpRequest.update({
        where: { id: otpRequest.id },
        data: {
          sendStatus: this.mapOtpRequestStatus(sendResult.sendStatus),
          providerCode: sendResult.providerCode || null,
          providerMessage: sendResult.providerMessage,
          requestPayload: this.toSanitizedJson(sendResult.requestPayload),
          responsePayload: this.toSanitizedJson(sendResult.responsePayload),
          ...(!delivered ? { consumedAt: new Date() } : {}),
        },
      });

      await transaction.auditLog.create({
        data: {
          userId: user.id,
          action: delivered
            ? 'STAFF_PASSWORD_RESET_OTP_SENT'
            : 'STAFF_PASSWORD_RESET_OTP_DELIVERY_FAILED',
          moduleKey: 'security',
          entityType: 'User',
          entityId: user.id,
          payload: {
            source: 'zalo',
            otpRequestId: otpRequest.id,
            provider: sendResult.provider,
            providerCode: sendResult.providerCode || null,
            sendStatus: sendResult.sendStatus,
          },
          ipAddress: requestContext?.ipAddress || null,
          userAgent: requestContext?.userAgent || null,
        },
      });

      return updated;
    });

    if (!delivered) {
      this.logger.error(`Staff password reset OTP delivery failed for user ${user.id}.`);
    }

    return this.buildOtpRequestResponse(updatedRequest, sendResult.debugCode || undefined);
  }

  async resetPasswordWithOtp(params: {
    email: string;
    requestId: string;
    otpCode: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    const email = normalizeEmail(params.email);
    if (!email || !isValidEmail(email)) {
      throw new BadRequestException('Email is invalid.');
    }
    this.assertMatchingPasswords(params.newPassword, params.confirmPassword);
    this.assertPolicy(params.newPassword);

    const requestContext = this.requestContextService.get();
    await this.assertResetRateLimit(requestContext?.ipAddress || null);

    const otpRequest = await this.prisma.otpRequest.findUnique({
      where: { id: String(params.requestId || '').trim() },
      include: { user: { include: { role: true } } },
    });
    const now = new Date();
    const user = otpRequest?.user || null;
    const currentPhone = user ? normalizeVietnamPhone(user.phone) : null;
    const requestIsValid = Boolean(
      otpRequest &&
        user &&
        !user.deletedAt &&
        INTERNAL_ROLES.has(user.role.code) &&
        normalizeEmail(otpRequest.emailSnapshot) === email &&
        currentPhone === otpRequest.phone &&
        otpRequest.purpose === OtpRequestPurpose.STAFF_PASSWORD_RESET &&
        !otpRequest.verifiedAt &&
        !otpRequest.consumedAt &&
        otpRequest.expiresAt.getTime() > now.getTime() &&
        otpRequest.attemptCount < otpRequest.maxAttempts &&
        (otpRequest.sendStatus === OtpRequestStatus.SENT ||
          otpRequest.sendStatus === OtpRequestStatus.DRY_RUN),
    );

    if (!requestIsValid || !otpRequest || !user) {
      if (otpRequest && !otpRequest.consumedAt && otpRequest.expiresAt.getTime() <= now.getTime()) {
        await this.prisma.otpRequest.update({
          where: { id: otpRequest.id },
          data: { sendStatus: OtpRequestStatus.EXPIRED, consumedAt: now },
        });
      }
      await this.recordOtpResetSubmission({
        userId: user?.id || null,
        success: false,
        outcome: 'INVALID_OR_EXPIRED_OTP',
      });
      throw new BadRequestException(GENERIC_OTP_RESET_ERROR);
    }

    const otpMatches = await bcrypt.compare(String(params.otpCode || '').trim(), otpRequest.codeHash);
    if (!otpMatches) {
      const nextAttemptCount = otpRequest.attemptCount + 1;
      await this.prisma.otpRequest.update({
        where: { id: otpRequest.id },
        data: {
          attemptCount: nextAttemptCount,
          lastAttemptAt: now,
          ...(nextAttemptCount >= otpRequest.maxAttempts
            ? { sendStatus: OtpRequestStatus.BLOCKED, consumedAt: now }
            : {}),
        },
      });
      await this.recordOtpResetSubmission({
        userId: user.id,
        success: false,
        outcome:
          nextAttemptCount >= otpRequest.maxAttempts
            ? 'OTP_MAX_ATTEMPTS_EXCEEDED'
            : 'OTP_MISMATCH',
      });
      throw new BadRequestException(GENERIC_OTP_RESET_ERROR);
    }

    if (await bcrypt.compare(params.newPassword, user.passwordHash)) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại.');
    }

    const passwordHash = await bcrypt.hash(params.newPassword, 12);
    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.otpRequest.updateMany({
        where: {
          id: otpRequest.id,
          purpose: OtpRequestPurpose.STAFF_PASSWORD_RESET,
          verifiedAt: null,
          consumedAt: null,
          expiresAt: { gt: now },
          attemptCount: { lt: otpRequest.maxAttempts },
          sendStatus: { in: [OtpRequestStatus.SENT, OtpRequestStatus.DRY_RUN] },
        },
        data: {
          verifiedAt: now,
          consumedAt: now,
          lastAttemptAt: now,
          sendStatus: OtpRequestStatus.VERIFIED,
        },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException(GENERIC_OTP_RESET_ERROR);
      }

      await transaction.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          phoneVerifiedAt: user.phoneVerifiedAt || now,
          refreshToken: null,
          failedPasswordLoginCount: 0,
          lockedUntil: null,
        },
      });
      await transaction.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'STAFF_PASSWORD_RESET_ZALO_OTP' },
      });
      await transaction.otpRequest.updateMany({
        where: {
          userId: user.id,
          purpose: OtpRequestPurpose.STAFF_PASSWORD_RESET,
          id: { not: otpRequest.id },
          verifiedAt: null,
          consumedAt: null,
        },
        data: { sendStatus: OtpRequestStatus.EXPIRED, consumedAt: now },
      });
      await transaction.staffPasswordResetToken.updateMany({
        where: { userId: user.id, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.auditLog.create({
        data: {
          userId: user.id,
          action: 'STAFF_PASSWORD_RESET_OTP_COMPLETED',
          moduleKey: 'security',
          entityType: 'User',
          entityId: user.id,
          payload: {
            source: 'public_staff_zalo_otp_recovery',
            otpRequestId: otpRequest.id,
            sessionsRevoked: true,
          },
          ipAddress: requestContext?.ipAddress || null,
          userAgent: requestContext?.userAgent || null,
        },
      });
      await transaction.authLoginAttempt.create({
        data: {
          userId: user.id,
          authMethod: 'STAFF_PASSWORD_RESET_OTP_SUBMIT',
          identifierType: 'EMAIL',
          identifierValue: email,
          ipAddress: requestContext?.ipAddress || null,
          userAgent: requestContext?.userAgent || null,
          success: true,
          outcome: 'PASSWORD_RESET',
        },
      });
    });

    return {
      success: true,
      message: 'Mật khẩu đã được đặt lại. Vui lòng đăng nhập lại.',
    };
  }

  async requestPasswordReset(rawEmail: string) {
    this.assertEmailRecoveryEnabled();
    const email = normalizeEmail(rawEmail);
    if (!email || !isValidEmail(email)) {
      throw new BadRequestException('Email is invalid.');
    }

    const requestContext = this.requestContextService.get();
    await this.assertRequestRateLimit(email, requestContext?.ipAddress || null);

    const matches = await this.prisma.user.findMany({
      where: {
        email: { equals: email, mode: 'insensitive' },
      },
      include: { role: true },
      take: 2,
    });
    const user =
      matches.length === 1 &&
      !matches[0].deletedAt &&
      INTERNAL_ROLES.has(matches[0].role.code)
        ? matches[0]
        : null;

    await this.prisma.authLoginAttempt.create({
      data: {
        userId: user?.id || null,
        authMethod: 'STAFF_PASSWORD_RESET_REQUEST',
        identifierType: 'EMAIL',
        identifierValue: email,
        ipAddress: requestContext?.ipAddress || null,
        userAgent: requestContext?.userAgent || null,
        success: true,
        outcome: user ? 'ACCEPTED' : 'GENERIC_ACCEPTED',
      },
    });

    if (!user) {
      return { success: true, message: GENERIC_REQUEST_MESSAGE };
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.getResetTtlMinutes() * 60 * 1000);

    const resetRecord = await this.prisma.$transaction(async (transaction) => {
      await transaction.staffPasswordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });

      const created = await transaction.staffPasswordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          requestedIp: requestContext?.ipAddress || null,
          userAgent: requestContext?.userAgent || null,
        },
      });

      await transaction.auditLog.create({
        data: {
          userId: user.id,
          action: 'STAFF_PASSWORD_RESET_REQUESTED',
          moduleKey: 'security',
          entityType: 'User',
          entityId: user.id,
          payload: {
            source: 'public_staff_recovery',
            expiresAt: expiresAt.toISOString(),
          },
          ipAddress: requestContext?.ipAddress || null,
          userAgent: requestContext?.userAgent || null,
        },
      });

      return created;
    });

    try {
      await this.mailProvider.sendPasswordReset({
        to: user.email!,
        resetUrl: this.buildResetUrl(rawToken),
        expiresInMinutes: this.getResetTtlMinutes(),
      });
    } catch (error) {
      await this.prisma.$transaction([
        this.prisma.staffPasswordResetToken.update({
          where: { id: resetRecord.id },
          data: { revokedAt: new Date() },
        }),
        this.prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'STAFF_PASSWORD_RESET_DELIVERY_FAILED',
            moduleKey: 'security',
            entityType: 'User',
            entityId: user.id,
            payload: { source: 'smtp', reason: 'delivery_failed' },
            ipAddress: requestContext?.ipAddress || null,
            userAgent: requestContext?.userAgent || null,
          },
        }),
      ]);
      this.logger.error(`Staff password reset email delivery failed for user ${user.id}.`);
    }

    return { success: true, message: GENERIC_REQUEST_MESSAGE };
  }

  async resetPassword(params: {
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    this.assertEmailRecoveryEnabled();
    this.assertMatchingPasswords(params.newPassword, params.confirmPassword);
    this.assertPolicy(params.newPassword);

    const requestContext = this.requestContextService.get();
    await this.assertResetRateLimit(requestContext?.ipAddress || null);

    const tokenHash = this.hashToken(params.token);
    const now = new Date();
    const resetRecord = await this.prisma.staffPasswordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { role: true } } },
    });

    if (
      !resetRecord ||
      resetRecord.usedAt ||
      resetRecord.revokedAt ||
      resetRecord.expiresAt.getTime() <= now.getTime() ||
      resetRecord.user.deletedAt ||
      !INTERNAL_ROLES.has(resetRecord.user.role.code)
    ) {
      await this.recordResetSubmission({
        userId: resetRecord?.userId || null,
        success: false,
        outcome: 'INVALID_OR_EXPIRED_TOKEN',
      });
      throw new BadRequestException(GENERIC_RESET_ERROR);
    }

    if (await bcrypt.compare(params.newPassword, resetRecord.user.passwordHash)) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại.');
    }

    const passwordHash = await bcrypt.hash(params.newPassword, 12);

    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.staffPasswordResetToken.updateMany({
        where: {
          id: resetRecord.id,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        throw new BadRequestException(GENERIC_RESET_ERROR);
      }

      await transaction.user.update({
        where: { id: resetRecord.userId },
        data: {
          passwordHash,
          refreshToken: null,
          failedPasswordLoginCount: 0,
          lockedUntil: null,
        },
      });

      await transaction.authSession.updateMany({
        where: { userId: resetRecord.userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'STAFF_PASSWORD_RESET' },
      });

      await transaction.staffPasswordResetToken.updateMany({
        where: {
          userId: resetRecord.userId,
          id: { not: resetRecord.id },
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });

      await transaction.auditLog.create({
        data: {
          userId: resetRecord.userId,
          action: 'STAFF_PASSWORD_RESET_COMPLETED',
          moduleKey: 'security',
          entityType: 'User',
          entityId: resetRecord.userId,
          payload: { source: 'public_staff_recovery', sessionsRevoked: true },
          ipAddress: requestContext?.ipAddress || null,
          userAgent: requestContext?.userAgent || null,
        },
      });

      await transaction.authLoginAttempt.create({
        data: {
          userId: resetRecord.userId,
          authMethod: 'STAFF_PASSWORD_RESET_SUBMIT',
          identifierType: 'RESET_TOKEN',
          identifierValue: null,
          ipAddress: requestContext?.ipAddress || null,
          userAgent: requestContext?.userAgent || null,
          success: true,
          outcome: 'PASSWORD_RESET',
        },
      });
    });

    return { success: true, message: 'Mật khẩu đã được đặt lại. Vui lòng đăng nhập lại.' };
  }

  async changePassword(params: {
    userId: string;
    sessionId?: string | null;
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    this.assertMatchingPasswords(params.newPassword, params.confirmPassword);
    this.assertPolicy(params.newPassword);

    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      include: { role: true },
    });
    if (!user || user.deletedAt || !INTERNAL_ROLES.has(user.role.code)) {
      throw new UnauthorizedException('Staff authentication is required.');
    }

    const currentMatches = await bcrypt.compare(params.currentPassword, user.passwordHash);
    if (!currentMatches) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng.');
    }

    if (await bcrypt.compare(params.newPassword, user.passwordHash)) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại.');
    }

    const passwordHash = await bcrypt.hash(params.newPassword, 12);
    const now = new Date();
    const requestContext = this.requestContextService.get();
    const preserveCurrentSession = Boolean(params.sessionId);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          refreshToken: null,
          failedPasswordLoginCount: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.authSession.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          ...(params.sessionId ? { id: { not: params.sessionId } } : {}),
        },
        data: { revokedAt: now, revokedReason: 'STAFF_PASSWORD_CHANGED' },
      }),
      this.prisma.staffPasswordResetToken.updateMany({
        where: { userId: user.id, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'STAFF_PASSWORD_CHANGED',
          moduleKey: 'security',
          entityType: 'User',
          entityId: user.id,
          payload: {
            source: 'authenticated_staff',
            currentSessionPreserved: preserveCurrentSession,
          },
          ipAddress: requestContext?.ipAddress || null,
          userAgent: requestContext?.userAgent || null,
        },
      }),
    ]);

    return {
      success: true,
      reauthenticationRequired: !preserveCurrentSession,
      message: preserveCurrentSession
        ? 'Mật khẩu đã được thay đổi. Các phiên đăng nhập khác đã bị thu hồi.'
        : 'Mật khẩu đã được thay đổi. Vui lòng đăng nhập lại.',
    };
  }

  private buildOtpRequestResponse(
    otpRequest: {
      id: string;
      expiresAt: Date;
      resendAvailableAt: Date;
    },
    debugCode?: string,
  ) {
    return {
      success: true,
      requestId: otpRequest.id,
      expiresAt: otpRequest.expiresAt.toISOString(),
      resendAvailableAt: otpRequest.resendAvailableAt.toISOString(),
      cooldownSeconds: this.getOtpResendCooldownSeconds(),
      debugCode,
      message: GENERIC_OTP_REQUEST_MESSAGE,
    };
  }

  private buildDecoyOtpRequestResponse() {
    const now = new Date();
    return this.buildOtpRequestResponse({
      id: randomUUID(),
      expiresAt: new Date(now.getTime() + this.getOtpTtlMinutes() * 60 * 1000),
      resendAvailableAt: new Date(
        now.getTime() + this.getOtpResendCooldownSeconds() * 1000,
      ),
    });
  }

  private async isOtpPhoneRateLimited(phone: string) {
    const windowStart = new Date(
      Date.now() - this.getOtpPhoneRateLimitWindowMinutes() * 60 * 1000,
    );
    const count = await this.prisma.otpRequest.count({
      where: {
        phone,
        deletedAt: null,
        createdAt: { gte: windowStart },
      },
    });
    return count >= this.getOtpPhoneRateLimitMax();
  }

  private mapOtpRequestStatus(status: OtpSendResult['sendStatus']) {
    switch (status) {
      case 'SENT':
        return OtpRequestStatus.SENT;
      case 'DRY_RUN':
        return OtpRequestStatus.DRY_RUN;
      case 'BLOCKED':
        return OtpRequestStatus.BLOCKED;
      case 'FAILED':
      default:
        return OtpRequestStatus.FAILED;
    }
  }

  private toSanitizedJson(value?: Record<string, unknown> | null) {
    if (!value) {
      return Prisma.JsonNull;
    }
    return this.redactSensitiveProviderData(value) as Prisma.InputJsonValue;
  }

  private redactSensitiveProviderData(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactSensitiveProviderData(item));
    }
    if (!value || typeof value !== 'object') {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        /(otp|code|token|secret|authorization)/i.test(key)
          ? '[REDACTED]'
          : this.redactSensitiveProviderData(item),
      ]),
    );
  }

  private recordOtpResetSubmission(params: {
    userId: string | null;
    success: boolean;
    outcome: string;
  }) {
    const requestContext = this.requestContextService.get();
    return this.prisma.authLoginAttempt.create({
      data: {
        userId: params.userId,
        authMethod: 'STAFF_PASSWORD_RESET_OTP_SUBMIT',
        identifierType: 'EMAIL',
        identifierValue: null,
        ipAddress: requestContext?.ipAddress || null,
        userAgent: requestContext?.userAgent || null,
        success: params.success,
        outcome: params.outcome,
      },
    });
  }

  private assertEmailRecoveryEnabled() {
    if (String(process.env.STAFF_PASSWORD_RECOVERY_EMAIL_ENABLED || '').toLowerCase() !== 'true') {
      throw new NotFoundException('Email password recovery is not enabled.');
    }
  }

  private async assertRequestRateLimit(email: string, ipAddress: string | null) {
    const windowStart = new Date(Date.now() - 60 * 60 * 1000);
    const max = this.getRequestRateLimitMax();
    const authMethods = ['STAFF_PASSWORD_RESET_REQUEST', 'STAFF_PASSWORD_RESET_OTP_REQUEST'];
    const [emailCount, ipCount] = await Promise.all([
      this.prisma.authLoginAttempt.count({
        where: {
          authMethod: { in: authMethods },
          identifierValue: email,
          createdAt: { gte: windowStart },
        },
      }),
      ipAddress
        ? this.prisma.authLoginAttempt.count({
            where: {
              authMethod: { in: authMethods },
              ipAddress,
              createdAt: { gte: windowStart },
            },
          })
        : Promise.resolve(0),
    ]);

    if (emailCount >= max || ipCount >= max) {
      throw new HttpException('Vui lòng thử lại sau.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async assertResetRateLimit(ipAddress: string | null) {
    if (!ipAddress) return;
    const windowStart = new Date(Date.now() - 60 * 60 * 1000);
    const count = await this.prisma.authLoginAttempt.count({
      where: {
        authMethod: {
          in: ['STAFF_PASSWORD_RESET_SUBMIT', 'STAFF_PASSWORD_RESET_OTP_SUBMIT'],
        },
        ipAddress,
        createdAt: { gte: windowStart },
      },
    });
    if (count >= this.getResetSubmitRateLimitMax()) {
      throw new HttpException('Vui lòng thử lại sau.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private recordResetSubmission(params: {
    userId: string | null;
    success: boolean;
    outcome: string;
  }) {
    const requestContext = this.requestContextService.get();
    return this.prisma.authLoginAttempt.create({
      data: {
        userId: params.userId,
        authMethod: 'STAFF_PASSWORD_RESET_SUBMIT',
        identifierType: 'RESET_TOKEN',
        identifierValue: null,
        ipAddress: requestContext?.ipAddress || null,
        userAgent: requestContext?.userAgent || null,
        success: params.success,
        outcome: params.outcome,
      },
    });
  }

  private assertMatchingPasswords(password: string, confirmation: string) {
    if (password !== confirmation) {
      throw new BadRequestException('Mật khẩu xác nhận không khớp.');
    }
  }

  private assertPolicy(password: string) {
    try {
      assertPasswordPolicy(password);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Password is invalid.');
    }
  }

  private hashToken(token: string) {
    return createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
  }

  private buildResetUrl(token: string) {
    const publicUrl = String(process.env.APP_PUBLIC_URL || '').trim().replace(/\/+$/, '');
    if (!publicUrl) {
      throw new Error('APP_PUBLIC_URL is required for staff password reset.');
    }
    return `${publicUrl}/portal/nhan-su/dat-lai-mat-khau?token=${encodeURIComponent(token)}`;
  }

  private getResetTtlMinutes() {
    const value = Number(process.env.STAFF_PASSWORD_RESET_TTL_MINUTES || 20);
    return Number.isFinite(value) && value >= 5 && value <= 60 ? value : 20;
  }

  private getRequestRateLimitMax() {
    const value = Number(process.env.STAFF_PASSWORD_RESET_REQUEST_MAX_PER_HOUR || 5);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 5;
  }

  private getResetSubmitRateLimitMax() {
    const value = Number(process.env.STAFF_PASSWORD_RESET_SUBMIT_MAX_PER_HOUR || 10);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
  }

  private getOtpTtlMinutes() {
    const value = Number(process.env.AUTH_OTP_TTL_MINUTES || 5);
    return Number.isFinite(value) && value > 0 ? value : 5;
  }

  private getOtpMaxAttempts() {
    const value = Number(process.env.AUTH_OTP_MAX_ATTEMPTS || 5);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 5;
  }

  private getOtpResendCooldownSeconds() {
    const value = Number(process.env.AUTH_OTP_RESEND_COOLDOWN_SECONDS || 60);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 60;
  }

  private getOtpPhoneRateLimitWindowMinutes() {
    const value = Number(process.env.AUTH_OTP_RATE_LIMIT_PHONE_WINDOW_MINUTES || 15);
    return Number.isFinite(value) && value > 0 ? value : 15;
  }

  private getOtpPhoneRateLimitMax() {
    const value = Number(process.env.AUTH_OTP_RATE_LIMIT_PHONE_MAX || 5);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 5;
  }
}
