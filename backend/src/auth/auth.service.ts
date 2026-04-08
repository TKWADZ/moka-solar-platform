import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OtpRequestPurpose, OtpRequestStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AppRoleCode, resolvePermissionsForRole } from '../common/auth/permissions';
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
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestLoginOtpDto } from './dto/request-login-otp.dto';
import { VerifyLoginOtpDto } from './dto/verify-login-otp.dto';
import { OTP_PROVIDER, OtpProvider } from './otp/otp-provider.interface';
import { RequestRegisterOtpDto } from './dto/request-register-otp.dto';
import { VerifyRegisterOtpDto } from './dto/verify-register-otp.dto';
import { RequestPasswordResetOtpDto } from './dto/request-password-reset-otp.dto';
import { ResetPasswordWithOtpDto } from './dto/reset-password-with-otp.dto';

type AuthUser = Prisma.UserGetPayload<{
  include: {
    role: true;
    customer: true;
  };
}>;

type ResolvedIdentifier =
  | {
      kind: 'EMAIL';
      value: string;
      email: string;
      phone: null;
      legacyPhone: null;
    }
  | {
      kind: 'PHONE';
      value: string;
      email: null;
      phone: string;
      legacyPhone: string | null;
    };

type OtpSendResult = {
  provider: string;
  channel: 'ZALO';
  sendStatus: 'SENT' | 'DRY_RUN' | 'FAILED' | 'BLOCKED';
  providerCode?: string | null;
  providerMessage: string;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  debugCode?: string | null;
};

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

    const customerRole = await this.findRoleOrThrow('CUSTOMER');
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: dto.fullName.trim(),
        phone,
        phoneVerifiedAt: phone ? new Date() : null,
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

    return this.buildAuthResponse(user, {
      authMethod: phone ? 'PHONE_PASSWORD' : 'EMAIL_PASSWORD',
      identifierType: phone ? 'PHONE' : 'EMAIL',
      identifierValue: phone || email,
    });
  }

  async login(dto: LoginDto) {
    const identity = this.resolveIdentifier(dto.identifier);
    await this.assertPasswordLoginAllowed(identity);

    const user = await this.findUserForIdentifier(identity);
    const authMethod = identity.kind === 'PHONE' ? 'PHONE_PASSWORD' : 'EMAIL_PASSWORD';

    if (!user || user.deletedAt) {
      await this.recordLoginAttempt({
        userId: null,
        authMethod,
        identifierType: identity.kind,
        identifierValue: identity.value,
        success: false,
        outcome: 'INVALID_CREDENTIALS',
        failureReason: 'User not found',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    this.assertUserCanUsePasswordLogin(user, identity.kind);
    this.assertUserIsNotLocked(user);

    const matched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matched) {
      await this.recordFailedPasswordLogin({
        user,
        authMethod,
        identifierType: identity.kind,
        identifierValue: identity.value,
        failureReason: 'Invalid password',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user, {
      authMethod,
      identifierType: identity.kind,
      identifierValue: identity.value,
    });
  }

  async requestLoginOtp(dto: RequestLoginOtpDto) {
    const phone = this.requireVietnamPhone(dto.phone);
    const user = await this.findCustomerByPhone(phone);

    if (!user || user.deletedAt) {
      throw new BadRequestException('Customer account for this phone number was not found');
    }

    return this.createAndSendOtpRequest({
      userId: user.id,
      purpose: OtpRequestPurpose.CUSTOMER_SENSITIVE_ACTION,
      phone,
      emailSnapshot: user.email,
      fullNameSnapshot: user.fullName,
      providerPurpose: 'CUSTOMER_SENSITIVE_ACTION',
    });
  }

  async verifyLoginOtp(dto: VerifyLoginOtpDto) {
    const phone = this.requireVietnamPhone(dto.phone);
    const otpRequest = await this.findOtpRequestForVerification({
      requestId: dto.requestId,
      phone,
      purpose: OtpRequestPurpose.CUSTOMER_SENSITIVE_ACTION,
    });

    const user = otpRequest.user;
    if (!user || user.deletedAt || user.role.code !== 'CUSTOMER') {
      throw new UnauthorizedException('Customer account for this OTP request is no longer available');
    }

    await this.assertOtpCodeOrThrow(otpRequest, dto.otpCode);
    await this.markOtpRequestVerified({ requestId: otpRequest.id });

    if (!user.phoneVerifiedAt) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          phoneVerifiedAt: new Date(),
        },
      });
    }

    const nextUser = await this.findUserByIdOrThrow(user.id);
    return this.buildAuthResponse(nextUser, {
      authMethod: 'PHONE_OTP',
      identifierType: 'PHONE',
      identifierValue: phone,
    });
  }

  async requestRegisterOtp(dto: RequestRegisterOtpDto) {
    const phone = this.requireVietnamPhone(dto.phone);
    const email = this.normalizeOptionalEmail(dto.email);
    const fullName = String(dto.fullName || '').trim();

    if (!fullName) {
      throw new BadRequestException('Full name is required');
    }

    await this.ensureIdentityIsAvailable({ email, phone });

    return this.createAndSendOtpRequest({
      purpose: OtpRequestPurpose.CUSTOMER_REGISTER,
      phone,
      emailSnapshot: email,
      fullNameSnapshot: fullName,
      providerPurpose: 'CUSTOMER_REGISTER',
    });
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

    const customerRole = await this.findRoleOrThrow('CUSTOMER');
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        phoneVerifiedAt: new Date(),
        fullName,
        passwordHash,
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

    return this.buildAuthResponse(user, {
      authMethod: 'PHONE_OTP_REGISTER',
      identifierType: 'PHONE',
      identifierValue: phone,
    });
  }

  async requestPasswordResetOtp(dto: RequestPasswordResetOtpDto) {
    const phone = this.requireVietnamPhone(dto.phone);
    const user = await this.findCustomerByPhone(phone);

    if (!user || user.deletedAt) {
      throw new BadRequestException('Customer account for this phone number was not found');
    }

    return this.createAndSendOtpRequest({
      userId: user.id,
      purpose: OtpRequestPurpose.CUSTOMER_PASSWORD_RESET,
      phone,
      emailSnapshot: user.email,
      fullNameSnapshot: user.fullName,
      providerPurpose: 'CUSTOMER_PASSWORD_RESET',
    });
  }

  async resetPasswordWithOtp(dto: ResetPasswordWithOtpDto) {
    const phone = this.requireVietnamPhone(dto.phone);
    const otpRequest = await this.findOtpRequestForVerification({
      requestId: dto.requestId,
      phone,
      purpose: OtpRequestPurpose.CUSTOMER_PASSWORD_RESET,
    });

    const user = otpRequest.user;
    if (!user || user.deletedAt || user.role.code !== 'CUSTOMER') {
      throw new UnauthorizedException('Customer account for this OTP request is no longer available');
    }

    await this.assertOtpCodeOrThrow(otpRequest, dto.otpCode);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          phoneVerifiedAt: user.phoneVerifiedAt || now,
          failedPasswordLoginCount: 0,
          lockedUntil: null,
          refreshToken: null,
        },
      }),
      this.prisma.authSession.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedReason: 'PASSWORD_RESET',
        },
      }),
      this.prisma.otpRequest.update({
        where: { id: otpRequest.id },
        data: {
          verifiedAt: now,
          consumedAt: now,
          sendStatus: OtpRequestStatus.VERIFIED,
          lastAttemptAt: now,
        },
      }),
    ]);

    const nextUser = await this.findUserByIdOrThrow(user.id);
    return this.buildAuthResponse(nextUser, {
      authMethod: 'PHONE_OTP_PASSWORD_RESET',
      identifierType: 'PHONE',
      identifierValue: phone,
    });
  }

  async refresh(refreshToken: string) {
    let payload: AuthenticatedUser & Record<string, any>;

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_SECRET || 'super_secret_key',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.findUserByIdOrThrow(payload.sub);
    const sessionId = String(payload.sid || '').trim() || null;

    if (sessionId) {
      const authSession = await this.prisma.authSession.findUnique({
        where: { id: sessionId },
      });

      if (
        !authSession ||
        authSession.userId !== user.id ||
        authSession.revokedAt ||
        authSession.expiresAt.getTime() <= Date.now()
      ) {
        throw new UnauthorizedException('Refresh session is no longer valid');
      }

      const validRefreshToken = await bcrypt.compare(refreshToken, authSession.refreshTokenHash);
      if (!validRefreshToken) {
        throw new UnauthorizedException('Refresh token mismatch');
      }

      return this.rotateSessionTokens(user, authSession.id);
    }

    if (!user.refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const validRefreshToken = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!validRefreshToken) {
      throw new UnauthorizedException('Refresh token mismatch');
    }

    return this.buildAuthResponse(user, {
      authMethod: user.role.code === 'CUSTOMER' ? 'PHONE_PASSWORD' : 'EMAIL_PASSWORD',
      identifierType: user.role.code === 'CUSTOMER' ? 'PHONE' : 'EMAIL',
      identifierValue: user.role.code === 'CUSTOMER' ? user.phone : user.email,
    });
  }

  async logout(userId: string, sessionId?: string | null) {
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { refreshToken: null },
      }),
      sessionId
        ? this.prisma.authSession.updateMany({
            where: {
              id: sessionId,
              userId,
              revokedAt: null,
            },
            data: {
              revokedAt: now,
              revokedReason: 'LOGOUT',
            },
          })
        : this.prisma.authSession.updateMany({
            where: {
              userId,
              revokedAt: null,
            },
            data: {
              revokedAt: now,
              revokedReason: 'LOGOUT_ALL',
            },
          }),
    ]);

    return { success: true };
  }

  async me(userId: string) {
    const user = await this.findUserByIdOrThrow(userId);
    return this.mapUser(user);
  }

  private async buildAuthResponse(
    user: AuthUser,
    params: {
      authMethod: string;
      identifierType: 'EMAIL' | 'PHONE';
      identifierValue?: string | null;
    },
  ) {
    const permissions = resolvePermissionsForRole(
      user.role.code as AppRoleCode,
      user.role.permissions,
    );
    const requestContext = this.requestContextService.get();
    const sessionId = randomBytes(18).toString('hex');
    const tokenPayload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role.code,
      roleId: user.role.id,
      permissions,
      customerId: user.customer?.id || null,
      sid: sessionId,
    };

    const accessToken = await this.jwtService.signAsync(tokenPayload, {
      expiresIn: '15m',
      secret: process.env.JWT_SECRET || 'super_secret_key',
    });

    const refreshToken = await this.jwtService.signAsync(tokenPayload, {
      expiresIn: '7d',
      secret: process.env.JWT_SECRET || 'super_secret_key',
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.authSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          authMethod: params.authMethod,
          identifierType: params.identifierType,
          identifierValue: params.identifierValue || null,
          ipAddress: requestContext?.ipAddress || null,
          userAgent: requestContext?.userAgent || null,
          deviceLabel: this.buildDeviceLabel(requestContext?.userAgent),
          refreshTokenHash,
          lastSeenAt: now,
          expiresAt: this.buildRefreshExpiryAt(),
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken: refreshTokenHash,
          failedPasswordLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: now,
          lastLoginIp: requestContext?.ipAddress || null,
          lastLoginUserAgent: requestContext?.userAgent || null,
        },
      }),
      this.prisma.authLoginAttempt.create({
        data: {
          userId: user.id,
          authMethod: params.authMethod,
          identifierType: params.identifierType,
          identifierValue: params.identifierValue || null,
          ipAddress: requestContext?.ipAddress || null,
          userAgent: requestContext?.userAgent || null,
          success: true,
          outcome: 'SUCCESS',
        },
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      user: this.mapUser(user),
    };
  }

  private async rotateSessionTokens(user: AuthUser, sessionId: string) {
    const permissions = resolvePermissionsForRole(
      user.role.code as AppRoleCode,
      user.role.permissions,
    );
    const payload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role.code,
      roleId: user.role.id,
      permissions,
      customerId: user.customer?.id || null,
      sid: sessionId,
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

    await this.prisma.$transaction([
      this.prisma.authSession.update({
        where: { id: sessionId },
        data: {
          refreshTokenHash,
          lastSeenAt: new Date(),
          expiresAt: this.buildRefreshExpiryAt(),
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken: refreshTokenHash,
        },
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      user: this.mapUser(user),
    };
  }

  private mapUser(user: AuthUser) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      phoneVerifiedAt: user.phoneVerifiedAt?.toISOString?.() || null,
      role: user.role.code,
      permissions: resolvePermissionsForRole(
        user.role.code as AppRoleCode,
        user.role.permissions,
      ),
      customerId: user.customer?.id || null,
      secondFactorReady: user.role.code !== 'CUSTOMER',
    };
  }

  private resolveIdentifier(identifier: string): ResolvedIdentifier {
    const normalizedInput = String(identifier || '').trim();
    const kind = detectLoginIdentifierKind(normalizedInput);

    if (kind === 'EMAIL') {
      const email = normalizeEmail(normalizedInput);
      if (!email) {
        throw new BadRequestException('Please enter a valid email or Vietnamese phone number');
      }

      return {
        kind,
        value: email,
        email,
        phone: null,
        legacyPhone: null,
      };
    }

    if (kind === 'PHONE') {
      const phone = normalizeVietnamPhone(normalizedInput);
      if (!phone) {
        throw new BadRequestException('Please enter a valid email or Vietnamese phone number');
      }

      return {
        kind,
        value: phone,
        email: null,
        phone,
        legacyPhone: toLegacyVietnamPhone(normalizedInput),
      };
    }

    throw new BadRequestException('Please enter a valid email or Vietnamese phone number');
  }

  private async findUserForIdentifier(identifier: ResolvedIdentifier) {
    if (identifier.kind === 'EMAIL') {
      return this.prisma.user.findUnique({
        where: { email: identifier.email },
        include: { role: true, customer: true },
      });
    }

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

  private async findUserByIdOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, customer: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
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

  private async findRoleOrThrow(code: string) {
    const role = await this.prisma.role.findFirst({
      where: { code },
    });

    if (!role) {
      throw new BadRequestException(`${code} role not found`);
    }

    return role;
  }

  private assertUserCanUsePasswordLogin(user: AuthUser, identifierKind: 'EMAIL' | 'PHONE') {
    if (identifierKind === 'EMAIL' && user.role.code === 'CUSTOMER') {
      throw new UnauthorizedException('Customers sign in with phone number and password');
    }

    if (identifierKind === 'PHONE' && user.role.code !== 'CUSTOMER') {
      throw new UnauthorizedException('Internal accounts must sign in with email');
    }
  }

  private assertUserIsNotLocked(user: AuthUser) {
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new HttpException(
        'This account is temporarily locked. Please try again later.',
        423,
      );
    }
  }

  private async assertPasswordLoginAllowed(identifier: ResolvedIdentifier) {
    const requestContext = this.requestContextService.get();
    const recentWindow = new Date(
      Date.now() - this.getPasswordLoginRateLimitWindowMinutes() * 60 * 1000,
    );

    const [recentIdentifierAttempts, recentIpAttempts] = await Promise.all([
      this.prisma.authLoginAttempt.count({
        where: {
          identifierType: identifier.kind,
          identifierValue: identifier.value,
          success: false,
          createdAt: {
            gte: recentWindow,
          },
        },
      }),
      requestContext?.ipAddress
        ? this.prisma.authLoginAttempt.count({
            where: {
              ipAddress: requestContext.ipAddress,
              success: false,
              createdAt: {
                gte: recentWindow,
              },
            },
          })
        : Promise.resolve(0),
    ]);

    if (recentIdentifierAttempts >= this.getPasswordLoginRateLimitIdentifierMax()) {
      throw new HttpException(
        'Too many failed login attempts for this account. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (recentIpAttempts >= this.getPasswordLoginRateLimitIpMax()) {
      throw new HttpException(
        'Too many failed login attempts from this IP address. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordFailedPasswordLogin(params: {
    user: AuthUser;
    authMethod: string;
    identifierType: 'EMAIL' | 'PHONE';
    identifierValue?: string | null;
    failureReason: string;
  }) {
    const requestContext = this.requestContextService.get();
    const nextFailedCount = (params.user.failedPasswordLoginCount || 0) + 1;
    const lockThreshold = this.getPasswordLoginLockoutThreshold();
    const shouldLock = nextFailedCount >= lockThreshold;

    await this.prisma.$transaction([
      this.prisma.authLoginAttempt.create({
        data: {
          userId: params.user.id,
          authMethod: params.authMethod,
          identifierType: params.identifierType,
          identifierValue: params.identifierValue || null,
          ipAddress: requestContext?.ipAddress || null,
          userAgent: requestContext?.userAgent || null,
          success: false,
          outcome: shouldLock ? 'LOCKED' : 'FAILED',
          failureReason: params.failureReason,
        },
      }),
      this.prisma.user.update({
        where: { id: params.user.id },
        data: {
          failedPasswordLoginCount: nextFailedCount,
          lockedUntil: shouldLock ? this.buildAccountLockExpiryAt() : params.user.lockedUntil,
          lastLoginIp: requestContext?.ipAddress || null,
          lastLoginUserAgent: requestContext?.userAgent || null,
        },
      }),
    ]);
  }

  private async recordLoginAttempt(params: {
    userId: string | null;
    authMethod: string;
    identifierType: 'EMAIL' | 'PHONE';
    identifierValue?: string | null;
    success: boolean;
    outcome: string;
    failureReason?: string | null;
  }) {
    const requestContext = this.requestContextService.get();

    await this.prisma.authLoginAttempt.create({
      data: {
        userId: params.userId,
        authMethod: params.authMethod,
        identifierType: params.identifierType,
        identifierValue: params.identifierValue || null,
        ipAddress: requestContext?.ipAddress || null,
        userAgent: requestContext?.userAgent || null,
        success: params.success,
        outcome: params.outcome,
        failureReason: params.failureReason || null,
      },
    });
  }

  private async createAndSendOtpRequest(params: {
    userId?: string | null;
    purpose: OtpRequestPurpose;
    phone: string;
    emailSnapshot?: string | null;
    fullNameSnapshot?: string | null;
    providerPurpose:
      | 'CUSTOMER_LOGIN'
      | 'CUSTOMER_REGISTER'
      | 'CUSTOMER_PASSWORD_RESET'
      | 'CUSTOMER_PHONE_VERIFICATION'
      | 'CUSTOMER_SENSITIVE_ACTION';
  }) {
    await this.ensureOtpRequestAllowed({ phone: params.phone });
    await this.expireActiveOtpRequests({
      phone: params.phone,
      purpose: params.purpose,
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
        userId: params.userId || null,
        purpose: params.purpose,
        provider: this.otpProvider.name,
        phone: params.phone,
        emailSnapshot: params.emailSnapshot || null,
        fullNameSnapshot: params.fullNameSnapshot || null,
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
      phone: params.phone,
      otpCode,
      expiresInMinutes: this.getOtpTtlMinutes(),
      purpose: params.providerPurpose,
      fullName: params.fullNameSnapshot || null,
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

  private async assertOtpCodeOrThrow(
    otpRequest: {
      id: string;
      codeHash: string;
      attemptCount: number;
      maxAttempts: number;
    },
    otpCode: string,
  ) {
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

  private buildOtpSendUpdate(sendResult: OtpSendResult) {
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
    sendResult: OtpSendResult,
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

  private ensureOtpSendSucceeded(sendResult: OtpSendResult) {
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
      const legacyPhone = toLegacyVietnamPhone(params.phone);
      const existingByPhone = await this.prisma.user.findFirst({
        where: {
          OR: [
            { phone: params.phone },
            ...(legacyPhone ? [{ phone: legacyPhone }] : []),
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

  private buildDeviceLabel(userAgent?: string | null) {
    const value = String(userAgent || '').toLowerCase();
    if (!value) {
      return 'Unknown device';
    }

    if (value.includes('iphone')) {
      return 'iPhone';
    }

    if (value.includes('ipad')) {
      return 'iPad';
    }

    if (value.includes('android')) {
      return 'Android device';
    }

    if (value.includes('windows')) {
      return 'Windows browser';
    }

    if (value.includes('macintosh') || value.includes('mac os')) {
      return 'Mac browser';
    }

    if (value.includes('linux')) {
      return 'Linux browser';
    }

    return 'Browser session';
  }

  private buildRefreshExpiryAt() {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  private buildAccountLockExpiryAt() {
    return new Date(Date.now() + this.getPasswordLoginLockoutMinutes() * 60 * 1000);
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

  private getPasswordLoginRateLimitWindowMinutes() {
    const minutes = Number(process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MINUTES || 15);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 15;
  }

  private getPasswordLoginRateLimitIdentifierMax() {
    const max = Number(process.env.AUTH_LOGIN_RATE_LIMIT_IDENTIFIER_MAX || 10);
    return Number.isFinite(max) && max > 0 ? max : 10;
  }

  private getPasswordLoginRateLimitIpMax() {
    const max = Number(process.env.AUTH_LOGIN_RATE_LIMIT_IP_MAX || 30);
    return Number.isFinite(max) && max > 0 ? max : 30;
  }

  private getPasswordLoginLockoutThreshold() {
    const max = Number(process.env.AUTH_LOGIN_LOCKOUT_THRESHOLD || 5);
    return Number.isFinite(max) && max > 0 ? max : 5;
  }

  private getPasswordLoginLockoutMinutes() {
    const minutes = Number(process.env.AUTH_LOGIN_LOCKOUT_MINUTES || 15);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 15;
  }
}
