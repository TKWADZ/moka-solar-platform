import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { assertPasswordPolicy } from '../common/auth/password-policy';
import { isValidEmail, normalizeEmail } from '../common/helpers/identity.helper';
import { RequestContextService } from '../common/request-context/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  STAFF_MAIL_PROVIDER,
  StaffMailProvider,
} from './mail/staff-mail-provider.interface';

const INTERNAL_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']);
const GENERIC_REQUEST_MESSAGE =
  'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.';
const GENERIC_RESET_ERROR = 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.';

@Injectable()
export class StaffPasswordService {
  private readonly logger = new Logger(StaffPasswordService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
    @Inject(STAFF_MAIL_PROVIDER)
    private readonly mailProvider: StaffMailProvider,
  ) {}

  async requestPasswordReset(rawEmail: string) {
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

  private async assertRequestRateLimit(email: string, ipAddress: string | null) {
    const windowStart = new Date(Date.now() - 60 * 60 * 1000);
    const max = this.getRequestRateLimitMax();
    const [emailCount, ipCount] = await Promise.all([
      this.prisma.authLoginAttempt.count({
        where: {
          authMethod: 'STAFF_PASSWORD_RESET_REQUEST',
          identifierValue: email,
          createdAt: { gte: windowStart },
        },
      }),
      ipAddress
        ? this.prisma.authLoginAttempt.count({
            where: {
              authMethod: 'STAFF_PASSWORD_RESET_REQUEST',
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
        authMethod: 'STAFF_PASSWORD_RESET_SUBMIT',
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
}
