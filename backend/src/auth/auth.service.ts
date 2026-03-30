import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { generateCode } from '../common/helpers/domain.helper';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    const customerRole = await this.prisma.role.findFirst({
      where: { code: 'CUSTOMER' },
    });

    if (!customerRole) {
      throw new BadRequestException('Customer role not found');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        phone: dto.phone,
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
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true, customer: true },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matched) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  async refresh(refreshToken: string) {
    let payload: any;

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
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role.code,
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
      role: user.role.code,
      customerId: user.customer?.id || null,
    };
  }
}
