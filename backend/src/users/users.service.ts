import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { generateCode } from '../common/helpers/domain.helper';
import {
  isValidEmail,
  normalizeEmail,
  normalizeVietnamPhone,
} from '../common/helpers/identity.helper';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  findAll(actor?: AuthenticatedUser) {
    return this.prisma.user
      .findMany({
      where: {
        deletedAt: null,
        ...(actor?.role === 'ADMIN' || actor?.role === 'MANAGER'
          ? {
              role: {
                code: {
                  in: ['ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER'],
                },
              },
            }
          : {}),
      },
      include: {
        role: true,
        customer: true,
      },
      orderBy: { createdAt: 'desc' },
      })
      .then((users) => users.map((user) => this.sanitizeUser(user)));
  }

  async findMe(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        role: true,
        customer: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  async create(dto: CreateUserDto, actor?: AuthenticatedUser) {
    this.ensureActorCanManageRole(actor, dto.roleCode);
    const email = this.normalizeOptionalEmail(dto.email);
    const phone = this.normalizeOptionalPhone(dto.phone);
    this.ensureIdentityRequirements({
      roleCode: dto.roleCode,
      email,
      phone,
    });
    await this.ensureIdentityIsAvailable({ email, phone });

    const role = await this.prisma.role.findFirst({
      where: { code: dto.roleCode },
    });

    if (!role) {
      throw new BadRequestException('Role not found');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: dto.fullName.trim(),
        phone,
        roleId: role.id,
        ...(dto.roleCode === 'CUSTOMER'
          ? {
              customer: {
                create: {
                  customerCode: generateCode('CUS'),
                },
              },
            }
          : {}),
      },
      include: {
        role: true,
        customer: true,
      },
    });

    await this.auditLogsService.log({
      userId: actor?.sub,
      action: 'USER_CREATED',
      moduleKey: 'users',
      entityType: 'User',
      entityId: user.id,
      payload: {
        email,
        phone,
        roleCode: dto.roleCode,
      },
      afterState: this.serializeUserAuditState(user),
    });

    return this.sanitizeUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actor?: AuthenticatedUser) {
    const currentUser = await this.findMe(id);
    this.ensureActorCanTouchUser(actor, currentUser);
    const nextRoleCode = dto.roleCode || currentUser.role?.code || 'CUSTOMER';
    const email =
      dto.email === undefined
        ? currentUser.email || null
        : this.normalizeOptionalEmail(dto.email);
    const phone =
      dto.phone === undefined
        ? currentUser.phone || null
        : this.normalizeOptionalPhone(dto.phone);
    this.ensureIdentityRequirements({
      roleCode: nextRoleCode,
      email,
      phone,
    });
    await this.ensureIdentityIsAvailable({
      email,
      phone,
      excludeUserId: id,
    });

    if (dto.roleCode) {
      this.ensureActorCanManageRole(actor, dto.roleCode);
    }

    const role = dto.roleCode
      ? await this.prisma.role.findFirst({ where: { code: dto.roleCode } })
      : null;

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : undefined;

    const beforeState = this.serializeUserAuditState(currentUser);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        email,
        fullName: dto.fullName?.trim(),
        phone,
        ...(passwordHash ? { passwordHash } : {}),
        ...(role ? { roleId: role.id } : {}),
      },
      include: {
        role: true,
        customer: true,
      },
    });

    if (dto.roleCode === 'CUSTOMER' && !updated.customer) {
      await this.prisma.customer.create({
        data: {
          userId: updated.id,
          customerCode: generateCode('CUS'),
        },
      });
    }

    await this.auditLogsService.log({
      userId: actor?.sub,
      action: 'USER_UPDATED',
      moduleKey: 'users',
      entityType: 'User',
      entityId: id,
      payload: dto as unknown as Record<string, unknown>,
      beforeState,
      afterState: this.serializeUserAuditState(updated),
    });

    return this.findMe(id);
  }

  async remove(id: string, actorId?: string) {
    const user = await this.findMe(id);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    if (user.customer) {
      await this.prisma.customer.update({
        where: { userId: id },
        data: { deletedAt: new Date() },
      });
    }

    await this.auditLogsService.log({
      userId: actorId,
      action: 'USER_ARCHIVED',
      moduleKey: 'users',
      entityType: 'User',
      entityId: id,
      beforeState: this.serializeUserAuditState(user),
      afterState: {
        deletedAt: new Date().toISOString(),
      },
    });

    return { success: true };
  }

  private ensureActorCanManageRole(actor: AuthenticatedUser | undefined, roleCode: string) {
    if (!actor) {
      return;
    }

    if (actor.role === 'SUPER_ADMIN') {
      return;
    }

    if (actor.role === 'ADMIN' && ['ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER'].includes(roleCode)) {
      return;
    }

    if (actor.role === 'MANAGER' && ['STAFF', 'CUSTOMER'].includes(roleCode)) {
      return;
    }

    throw new ForbiddenException('Ban khong co quyen gan vai tro nay.');
  }

  private ensureActorCanTouchUser(
    actor: AuthenticatedUser | undefined,
    user: { role?: { code?: string | null } | null; id: string },
  ) {
    if (!actor) {
      return;
    }

    if (actor.role === 'SUPER_ADMIN') {
      return;
    }

    const targetRole = user.role?.code || '';
    if (actor.role === 'ADMIN' && ['ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER'].includes(targetRole)) {
      return;
    }

    if (actor.role === 'MANAGER' && ['STAFF', 'CUSTOMER'].includes(targetRole)) {
      return;
    }

    throw new ForbiddenException('Ban khong co quyen cap nhat tai khoan nay.');
  }

  private serializeUserAuditState(user: any) {
    return {
      email: user.email || null,
      fullName: user.fullName || null,
      phone: user.phone || null,
      roleCode: user.role?.code || null,
      customerId: user.customer?.id || null,
      deletedAt: user.deletedAt?.toISOString?.() || null,
    };
  }

  private sanitizeUser(user: any) {
    if (!user) {
      return user;
    }

    const sanitized = {
      ...user,
    };

    delete sanitized.passwordHash;
    delete sanitized.refreshToken;

    return sanitized;
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

  private ensureIdentityRequirements(params: {
    roleCode: string;
    email: string | null;
    phone: string | null;
  }) {
    const internalRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF'];
    if (internalRoles.includes(params.roleCode) && !params.email) {
      throw new BadRequestException('Internal users must have an email address');
    }

    if (!params.email && !params.phone) {
      throw new BadRequestException('At least one of email or phone is required');
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
      const existingByPhone = await this.prisma.user.findUnique({
        where: { phone: params.phone },
      });

      if (existingByPhone && existingByPhone.id !== params.excludeUserId) {
        throw new BadRequestException('Phone already exists');
      }
    }
  }
}
