import {
  BadRequestException,
  Inject,
  Injectable,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OtpRequestPurpose, OtpRequestStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { resolvePermissionsForRole } from '../common/auth/permissions';
import {
  detectLoginIdentifierKind,
  isValidEmail,
  maskPhoneNumber,
  normalizeEmail,
  normalizeVietnamPhone,
  toLegacyVietnamPhone,
} from '../common/helpers/identity.helper';
import { generateCode } from '../common/helpers/domain.helper';
import { RequestContextService } from '../common/request-context/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestLoginOtpDto } from './dto/request-login-otp.dto';
import { VerifyLoginOtpDto } from './dto/verify-login-otp.dto';
import { OTP_PROVIDER, OtpProvider } from './otp/otp-provider.interface';
import { RequestRegisterOtpDto } from './dto/request-register-otp.dto';
import { VerifyRegisterOtpDto } from './dto/verify-register-otp.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly requestContextService: RequestContextService,
    @Inject(OTP_PROVIDER)
    private readonly otpProvider: OtpProvider,
  ) {}

  async register(dto: RegisterDto) {
    const email = this.normalizeOptionalEmail(dto.email);
    const phone = this.normalizeOptionalPhone(dto.phone);

    this.ensureIdentifierPresent({
      email,
      phone,
      message: 'Email or phone is required',
    });

    await this.ensureIdentityIsAvailable({ email, phone });

    const customerRole = await this.prisma.role.findFirst({
      where: { code: 'CUSTOMER' },
    });

    if (!customerRole) {
      throw new BadRequestException('Customer role not found');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: dto.fullName.trim(),
        phone,
        roleId: customerRole.id,
        customer: {
          create: {
            customerCode: generateCode('CUS'),
          },
        },
      },
      include: {
        role: true,
        customer: true,
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const identity = this.resolveIdentifier(dto.identifier);

    if (identity.kind !== 'EMAIL' || !identity.email) {
      throw new UnauthorizedException('Internal accounts must sign in with email');
    }

    const user = await this.findUserForIdentifier(identity);

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.role.code === 'CUSTOMER') {
      throw new UnauthorizedException('Customers sign in with phone OTP');
    }

    const matched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matched) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  async requestLoginOtp(dto: RequestLoginOtpDto) {
    const phone = this.requireVietnamPhone(dto.phone);
    const user = await this.findCustomerByPhone(phone);

    if (!user || user.deletedAt) {
      throw new BadRequestException('Customer account for this phone number was not found');
    }

    await this.ensureOtpRequestAllowed({ phone });
    await this.expireActiveOtpRequests({
      phone,
      purpose: OtpRequestPurpose.CUSTOMER_LOGIN,
    });

    const otpCode = this.generateOtpCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.getOtpTtlMinutes() * 60 * 1000);
    const resendAvailableAt = new Date(
      now.getTime() + this.getOtpResendCooldownSeconds() * 1000,
    );
    const requestContext = this.requestContextService.get();

    const otpRequest = await this.prisma.otpRequest.create({
      data: {
        userId: user.id,
        purpose: OtpRequestPurpose.CUSTOMER_LOGIN,
        provider: this.otpProvider.name,
        phone,
        emailSnapshot: user.email,
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

    const sendResult = await this.otpProvider.sendOtp({
      requestId: otpRequest.id,
      phone,
      otpCode,
      expiresInMinutes: this.getOtpTtlMinutes(),
      purpose: 'CUSTOMER_LOGIN',
      fullName: user.fullName,
      ipAddress: requestContext?.ipAddress || null,
      userAgent: requestContext?.userAgent || null,
    });

    const updatedRequest = await this.prisma.otpRequest.update({
      where: { id: otpRequest.id },
      data: this.buildOtpSendUpdate(sendResult),
    });

    this.ensureOtpSendSucceeded(sendResult);

    return this.buildOtpRequestResponse(updatedRequest, sendResult);
  }

  async verifyLoginOtp(dto: VerifyLoginOtpDto) {
    const phone = this.requireVietnamPhone(dto.phone);
    const otpRequest = await this.findOtpRequestForVerification({
      requestId: dto.requestId,
      phone,
      purpose: OtpRequestPurpose.CUSTOMER_LOGIN,
    });

    const user = otpRequest.user;
    if (!user || user.deletedAt || user.role.code !== 'CUSTOMER') {
      throw new UnauthorizedException('Customer account for this OTP request is no longer available');
    }

    await this.assertOtpCodeOrThrow(otpRequest, dto.otpCode);
    await this.markOtpRequestVerified({ requestId: otpRequest.id });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        phoneVerifiedAt: user.phoneVerifiedAt || new Date(),
      },
    });

    const nextUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { role: true, customer: true },
    });

    if (!nextUser) {
      throw new UnauthorizedException('User not found');
    }

    return this.buildAuthResponse(nextUser);
  }

  async requestRegisterOtp(dto: RequestRegisterOtpDto) {
    const phone = this.requireVietnamPhone(dto.phone);
    const email = this.normalizeOptionalEmail(dto.email);
    const fullName = String(dto.fullName || '').trim();

    if (!fullName) {
      throw new BadRequestException('Full name is required');
    }

    await this.ensureIdentityIsAvailable({ email, phone });
    await this.ensureOtpRequestAllowed({ phone });
    await this.expireActiveOtpRequests({
      phone,
      purpose: OtpRequestPurpose.CUSTOMER_REGISTER,
    });

    const otpCode = this.generateOtpCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.getOtpTtlMinutes() * 60 * 1000);
    const resendAvailableAt = new Date(
      now.getTime() + this.getOtpResendCooldownSeconds() * 1000,
    );
    const requestContext = this.requestContextService.get();

    const otpRequest = await this.prisma.otpRequest.create({
      data: {
        purpose: OtpRequestPurpose.CUSTOMER_REGISTER,
        provider: this.otpProvider.name,
        phone,
        emailSnapshot: email,
        fullNameSnapshot: fullName,
        codeHash: await bcrypt.hash(otpCode, 10),
        expiresAt,
        resendAvailableAt,
        maxAttempts: this.getOtpMaxAttempts(),
        requestedIp: requestContext?.ipAddress || null,
        requestedUserAgent: requestContext?.userAgent || null,
        sendStatus: OtpRequestStatus.PENDING,
      },
    });

    const sendResult = await this.otpProvider.sendOtp({
      requestId: otpRequest.id,
      phone,
      otpCode,
      expiresInMinutes: this.getOtpTtlMinutes(),
      purpose: 'CUSTOMER_REGISTER',
      fullName,
      ipAddress: requestContext?.ipAddress || null,
      userAgent: requestContext?.userAgent || null,
    });

    const updatedRequest = await this.prisma.otpRequest.update({
      where: { id: otpRequest.id },
      data: this.buildOtpSendUpdate(sendResult),
    });

    this.ensureOtpSendSucceeded(sendResult);

    return this.buildOtpRequestResponse(updatedRequest, sendResult);
  }

  async verifyRegisterOtp(dto: VerifyRegisterOtpDto) {
    const phone = this.requireVietnamPhone(dto.phone);
    const otpRequest = await this.findOtpRequestForVerification({
      requestId: dto.requestId,
      phone,
      purpose: OtpRequestPurpose.CUSTOMER_REGISTER,
    });

    const fullName = String(otpRequest.fullNameSnapshot || '').trim();
    if (!fullName) {
      throw new BadRequestException('Registration snapshot is missing full name');
    }

    const email = this.normalizeOptionalEmail(otpRequest.emailSnapshot);
    await this.ensureIdentityIsAvailable({ email, phone });
    await this.assertOtpCodeOrThrow(otpRequest, dto.otpCode);

    const customerRole = await this.prisma.role.findFirst({
      where: { code: 'CUSTOMER' },
    });

    if (!customerRole) {
      throw new BadRequestException('Customer role not found');
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        phoneVerifiedAt: new Date(),
        fullName,
        passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
        roleId: customerRole.id,
        customer: {
          create: {
            customerCode: generateCode('CUS'),
          },
        },
      },
      include: {
        role: true,
        customer: true,
      },
    });

    await this.markOtpRequestVerified({
      requestId: otpRequest.id,
      userId: user.id,
    });

    return this.buildAuthResponse(user);
  }

  async refresh(refreshToken: string) {
    let payload: Record<string, any>;

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_SECRET || 'super_secret_key',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true, customer: true },
    });

    if (!user?.refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const validRefreshToken = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!validRefreshToken) {
      throw new UnauthorizedException('Refresh token mismatch');
    }

    return this.buildAuthResponse(user);
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, customer: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.mapUser(user);
  }

  private async buildAuthResponse(user: any) {
    const permissions = resolvePermissionsForRole(user.role.code, user.role.permissions);
    const payload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role.code,
      roleId: user.role.id,
      permissions,
      customerId: user.customer?.id || null,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
      secret: process.env.JWT_SECRET || 'super_secret_key',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      expiresIn: '7d',
      secret: process.env.JWT_SECRET || 'super_secret_key',
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshTokenHash },
    });

    return {
      accessToken,
      refreshToken,
      user: this.mapUser(user),
    };
  }

  private mapUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      phoneVerifiedAt: user.phoneVerifiedAt?.toISOString?.() || null,
      role: user.role.code,
      permissions: resolvePermissionsForRole(user.role.code, user.role.permissions),
      customerId: user.customer?.id || null,
      secondFactorReady: user.role.code !== 'CUSTOMER',
    };
  }

  private resolveIdentifier(identifier: string) {
    const normalizedInput = String(identifier || '').trim();
    const kind = detectLoginIdentifierKind(normalizedInput);

    if (kind === 'EMAIL') {
      return {
        kind,
        email: normalizeEmail(normalizedInput),
        phone: null,
      } as const;
    }

    if (kind === 'PHONE') {
      return {
        kind,
        email: null,
        phone: normalizeVietnamPhone(normalizedInput),
        legacyPhone: toLegacyVietnamPhone(normalizedInput),
      } as const;
    }

    throw new BadRequestException('Please enter a valid email or Vietnamese phone number');
  }

  private async findUserForIdentifier(identifier: {
    kind: 'EMAIL' | 'PHONE' | 'UNKNOWN';
    email: string | null;
    phone: string | null;
    legacyPhone?: string | null;
  }) {
    if (identifier.kind === 'EMAIL' && identifier.email) {
      return this.prisma.user.findUnique({
        where: { email: identifier.email },
        include: { role: true, customer: true },
      });
    }

    if (identifier.kind === 'PHONE' && identifier.phone) {
      return this.prisma.user.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { phone: identifier.phone },
            ...(identifier.legacyPhone && identifier.legacyPhone !== identifier.phone
              ? [{ phone: identifier.legacyPhone }]
              : []),
          ],
        },
        include: { role: true, customer: true },
      });
    }

    return null;
  }

  private async findCustomerByPhone(phone: string) {
    const legacyPhone = toLegacyVietnamPhone(phone);

    return this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { phone },
          ...(legacyPhone && legacyPhone !== phone ? [{ phone: legacyPhone }] : []),
        ],
        role: {
          is: {
            code: 'CUSTOMER',
          },
        },
      },
      include: {
        role: true,
        customer: true,
      },
    });
  }

  private async findOtpRequestForVerification(params: {
    requestId: string;
    phone: string;
    purpose: OtpRequestPurpose;
  }) {
    const otpRequest = await this.prisma.otpRequest.findFirst({
      where: {
        id: params.requestId,
        phone: params.phone,
        purpose: params.purpose,
        deletedAt: null,
      },
      include: {
        user: {
          include: {
            role: true,
            customer: true,
          },
        },
      },
    });

    if (!otpRequest) {
      throw new UnauthorizedException('OTP request is not valid');
    }

    if (otpRequest.verifiedAt || otpRequest.consumedAt) {
      throw new UnauthorizedException('OTP has expired or is no longer valid');
    }

    if (otpRequest.expiresAt.getTime() < Date.now()) {
      await this.prisma.otpRequest.update({
        where: { id: otpRequest.id },
        data: {
          sendStatus: OtpRequestStatus.EXPIRED,
          consumedAt: new Date(),
        },
      });
      throw new UnauthorizedException('OTP has expired or is no longer valid');
    }

    if (otpRequest.attemptCount >= otpRequest.maxAttempts) {
      await this.prisma.otpRequest.update({
        where: { id: otpRequest.id },
        data: {
          sendStatus: OtpRequestStatus.BLOCKED,
          consumedAt: new Date(),
        },
      });
      throw new UnauthorizedException('OTP has exceeded the maximum number of attempts');
    }

    return otpRequest;
  }

  private async assertOtpCodeOrThrow(otpRequest: {
    id: string;
    codeHash: string;
    attemptCount: number;
    maxAttempts: number;
  }, otpCode: string) {
    const matched = await bcrypt.compare(String(otpCode || '').trim(), otpRequest.codeHash);

    if (!matched) {
      const nextAttempts = otpRequest.attemptCount + 1;
      await this.prisma.otpRequest.update({
        where: { id: otpRequest.id },
        data: {
          attemptCount: nextAttempts,
          lastAttemptAt: new Date(),
          ...(nextAttempts >= otpRequest.maxAttempts
            ? {
                sendStatus: OtpRequestStatus.BLOCKED,
                consumedAt: new Date(),
              }
            : {}),
        },
      });

      throw new UnauthorizedException(
        nextAttempts >= otpRequest.maxAttempts
          ? 'OTP has exceeded the maximum number of attempts'
          : 'OTP is incorrect',
      );
    }
  }

  private async markOtpRequestVerified(params: {
    requestId: string;
    userId?: string;
  }) {
    await this.prisma.otpRequest.update({
      where: { id: params.requestId },
      data: {
        ...(params.userId ? { userId: params.userId } : {}),
        verifiedAt: new Date(),
        consumedAt: new Date(),
        sendStatus: OtpRequestStatus.VERIFIED,
        lastAttemptAt: new Date(),
      },
    });
  }

  private async expireActiveOtpRequests(params: {
    phone: string;
    purpose: OtpRequestPurpose;
  }) {
    await this.prisma.otpRequest.updateMany({
      where: {
        phone: params.phone,
        purpose: params.purpose,
        deletedAt: null,
        verifiedAt: null,
        consumedAt: null,
      },
      data: {
        sendStatus: OtpRequestStatus.EXPIRED,
        consumedAt: new Date(),
      },
    });
  }

  private async ensureOtpRequestAllowed(params: { phone: string }) {
    const requestContext = this.requestContextService.get();
    const now = new Date();
    const recentPhoneWindow = new Date(
      now.getTime() - this.getOtpPhoneRateLimitWindowMinutes() * 60 * 1000,
    );
    const recentIpWindow = new Date(
      now.getTime() - this.getOtpIpRateLimitWindowMinutes() * 60 * 1000,
    );

    const [latestRequest, recentPhoneCount, recentIpCount] = await Promise.all([
      this.prisma.otpRequest.findFirst({
        where: {
          phone: params.phone,
          deletedAt: null,
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.otpRequest.count({
        where: {
          phone: params.phone,
          deletedAt: null,
          createdAt: {
            gte: recentPhoneWindow,
          },
        },
      }),
      requestContext?.ipAddress
        ? this.prisma.otpRequest.count({
            where: {
              requestedIp: requestContext.ipAddress,
              deletedAt: null,
              createdAt: {
                gte: recentIpWindow,
              },
            },
          })
        : Promise.resolve(0),
    ]);

    if (latestRequest?.resendAvailableAt && latestRequest.resendAvailableAt.getTime() > now.getTime()) {
      const remainingSeconds = Math.max(
        1,
        Math.ceil((latestRequest.resendAvailableAt.getTime() - now.getTime()) / 1000),
      );
      throw new HttpException(
        `Please wait ${remainingSeconds} seconds before requesting another OTP`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (recentPhoneCount >= this.getOtpPhoneRateLimitMax()) {
      throw new HttpException(
        'This phone number has requested OTP too many times. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (recentIpCount >= this.getOtpIpRateLimitMax()) {
      throw new HttpException(
        'This IP address has requested OTP too many times. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private buildOtpSendUpdate(sendResult: {
    sendStatus: 'SENT' | 'DRY_RUN' | 'FAILED' | 'BLOCKED';
    providerCode?: string | null;
    providerMessage: string;
    requestPayload?: Record<string, unknown> | null;
    responsePayload?: Record<string, unknown> | null;
  }) {
    return {
      sendStatus: this.mapOtpRequestStatus(sendResult.sendStatus),
      providerCode: sendResult.providerCode || null,
      providerMessage: sendResult.providerMessage,
      requestPayload: sendResult.requestPayload
        ? (sendResult.requestPayload as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      responsePayload: sendResult.responsePayload
        ? (sendResult.responsePayload as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    };
  }

  private buildOtpRequestResponse(
    otpRequest: {
      id: string;
      phone: string;
      expiresAt: Date;
      resendAvailableAt: Date;
    },
    sendResult: {
      provider: string;
      channel: 'ZALO';
      sendStatus: 'SENT' | 'DRY_RUN' | 'FAILED' | 'BLOCKED';
      providerMessage: string;
      debugCode?: string | null;
    },
  ) {
    return {
      success: true,
      requestId: otpRequest.id,
      provider: sendResult.provider,
      deliveryChannel: sendResult.channel,
      deliveryMode: sendResult.sendStatus,
      expiresAt: otpRequest.expiresAt.toISOString(),
      resendAvailableAt: otpRequest.resendAvailableAt.toISOString(),
      cooldownSeconds: this.getOtpResendCooldownSeconds(),
      phonePreview: maskPhoneNumber(otpRequest.phone),
      debugCode: sendResult.debugCode || undefined,
      message:
        sendResult.providerMessage ||
        (sendResult.sendStatus === 'DRY_RUN'
          ? 'OTP generated in debug mode'
          : 'OTP generated successfully'),
    };
  }

  private ensureOtpSendSucceeded(sendResult: {
    sendStatus: 'SENT' | 'DRY_RUN' | 'FAILED' | 'BLOCKED';
    providerMessage: string;
  }) {
    if (sendResult.sendStatus === 'BLOCKED') {
      throw new BadRequestException(sendResult.providerMessage);
    }

    if (sendResult.sendStatus === 'FAILED') {
      throw new ServiceUnavailableException(sendResult.providerMessage);
    }
  }

  private mapOtpRequestStatus(status: 'SENT' | 'DRY_RUN' | 'FAILED' | 'BLOCKED') {
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

  private requireVietnamPhone(value?: string | null) {
    const phone = normalizeVietnamPhone(value);

    if (!phone) {
      throw new BadRequestException('Vietnamese phone number is invalid');
    }

    return phone;
  }

  private normalizeOptionalEmail(value?: string | null) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return null;
    }

    if (!isValidEmail(value)) {
      throw new BadRequestException('Email is invalid');
    }

    return normalizeEmail(value);
  }

  private normalizeOptionalPhone(value?: string | null) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return null;
    }

    const phone = normalizeVietnamPhone(value);
    if (!phone) {
      throw new BadRequestException('Vietnamese phone number is invalid');
    }

    return phone;
  }

  private ensureIdentifierPresent(params: {
    email: string | null;
    phone: string | null;
    message: string;
  }) {
    if (!params.email && !params.phone) {
      throw new BadRequestException(params.message);
    }
  }

  private async ensureIdentityIsAvailable(params: {
    email: string | null;
    phone: string | null;
    excludeUserId?: string;
  }) {
    if (params.email) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: params.email },
      });

      if (existingByEmail && existingByEmail.id !== params.excludeUserId) {
        throw new BadRequestException('Email already exists');
      }
    }

    if (params.phone) {
      const existingByPhone = await this.prisma.user.findFirst({
        where: {
          OR: [
            { phone: params.phone },
            ...(toLegacyVietnamPhone(params.phone) ? [{ phone: toLegacyVietnamPhone(params.phone)! }] : []),
          ],
        },
      });

      if (existingByPhone && existingByPhone.id !== params.excludeUserId) {
        throw new BadRequestException('Phone already exists');
      }
    }
  }

  private generateOtpCode() {
    return `${Math.floor(100000 + Math.random() * 900000)}`;
  }

  private getOtpTtlMinutes() {
    const ttl = Number(process.env.AUTH_OTP_TTL_MINUTES || 5);
    return Number.isFinite(ttl) && ttl > 0 ? ttl : 5;
  }

  private getOtpMaxAttempts() {
    const maxAttempts = Number(process.env.AUTH_OTP_MAX_ATTEMPTS || 5);
    return Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : 5;
  }

  private getOtpResendCooldownSeconds() {
    const seconds = Number(process.env.AUTH_OTP_RESEND_COOLDOWN_SECONDS || 60);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 60;
  }

  private getOtpPhoneRateLimitWindowMinutes() {
    const minutes = Number(process.env.AUTH_OTP_RATE_LIMIT_PHONE_WINDOW_MINUTES || 15);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 15;
  }

  private getOtpPhoneRateLimitMax() {
    const max = Number(process.env.AUTH_OTP_RATE_LIMIT_PHONE_MAX || 5);
    return Number.isFinite(max) && max > 0 ? max : 5;
  }

  private getOtpIpRateLimitWindowMinutes() {
    const minutes = Number(process.env.AUTH_OTP_RATE_LIMIT_IP_WINDOW_MINUTES || 15);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 15;
  }

  private getOtpIpRateLimitMax() {
    const max = Number(process.env.AUTH_OTP_RATE_LIMIT_IP_MAX || 20);
    return Number.isFinite(max) && max > 0 ? max : 20;
  }
}
