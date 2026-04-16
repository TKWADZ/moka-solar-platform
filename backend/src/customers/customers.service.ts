import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { ChangeMyPasswordDto } from './dto/change-my-password.dto';
import {
  createTemporaryPassword,
  generateCode,
} from '../common/helpers/domain.helper';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  isValidEmail,
  normalizeEmail,
  normalizeVietnamPhone,
} from '../common/helpers/identity.helper';
import { normalizePercentRate } from '../common/helpers/billing.helper';
import { MediaService } from '../media/media.service';

const safeRoleSelect = {
  select: {
    id: true,
    code: true,
    name: true,
    createdAt: true,
    updatedAt: true,
  },
} as const;

const safeUserSelect = {
  select: {
    id: true,
    email: true,
    fullName: true,
    avatarUrl: true,
    phone: true,
    createdAt: true,
    updatedAt: true,
    role: safeRoleSelect,
  },
} as const;

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
    private mediaService: MediaService,
  ) {}

  findAll() {
    return this.prisma.customer.findMany({
      where: { deletedAt: null },
      include: {
        user: safeUserSelect,
        ownerUser: safeUserSelect,
        solarSystems: {
          where: { deletedAt: null },
        },
        contracts: {
          where: { deletedAt: null },
        },
        invoices: {
          where: { deletedAt: null },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        user: safeUserSelect,
        ownerUser: safeUserSelect,
        solarSystems: { where: { deletedAt: null } },
        contracts: { where: { deletedAt: null }, include: { servicePackage: true } },
        invoices: { where: { deletedAt: null }, include: { payments: true } },
        supportTickets: { where: { deletedAt: null } },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  getMyProfile(customerId: string) {
    return this.findOne(customerId);
  }

  async updateMyProfile(customerId: string, dto: UpdateMyProfileDto, actorId?: string) {
    const customer = await this.findOne(customerId);
    const fullName =
      dto.fullName === undefined ? undefined : this.normalizeRequiredName(dto.fullName);
    const email =
      dto.email === undefined
        ? customer.user.email || null
        : this.normalizeOptionalEmail(dto.email);
    const phone =
      dto.phone === undefined
        ? customer.user.phone || null
        : this.normalizeOptionalPhone(dto.phone);
    const contactAddress =
      dto.contactAddress === undefined
        ? customer.billingAddress || null
        : this.normalizeOptionalText(dto.contactAddress, 240);

    this.ensureCustomerIdentity({ email, phone });
    await this.ensureIdentityIsAvailable({
      email,
      phone,
      excludeUserId: customer.userId,
    });

    const beforeState = this.serializeCustomerAuditState(customer);
    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        billingAddress: contactAddress,
        user: {
          update: {
            email,
            phone,
            ...(fullName !== undefined ? { fullName } : {}),
          },
        },
      },
      include: {
        user: safeUserSelect,
        ownerUser: safeUserSelect,
        solarSystems: { where: { deletedAt: null } },
        contracts: { where: { deletedAt: null }, include: { servicePackage: true } },
        invoices: { where: { deletedAt: null }, include: { payments: true } },
        supportTickets: { where: { deletedAt: null } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'CUSTOMER_SELF_PROFILE_UPDATED',
      moduleKey: 'customers',
      entityType: 'Customer',
      entityId: updated.id,
      payload: {
        fullName: fullName ?? customer.user.fullName,
        email,
        phone,
        contactAddress,
      },
      beforeState,
      afterState: this.serializeCustomerAuditState(updated),
    });

    if (actorId) {
      await this.auditLogsService.touchEntity({
        entityType: 'Customer',
        entityId: updated.id,
        actorId,
        moduleKey: 'customers',
      });
    }

    return updated;
  }

  async changeMyPassword(customerId: string, dto: ChangeMyPasswordDto, actorId?: string) {
    const customer = await this.findOne(customerId);
    const user = await this.prisma.user.findFirst({
      where: {
        id: customer.userId,
        deletedAt: null,
      },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Customer login account not found');
    }

    const currentPassword = dto.currentPassword.trim();
    const newPassword = dto.newPassword.trim();

    if (!currentPassword || !newPassword) {
      throw new BadRequestException('Current password and new password are required');
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!matches) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        failedPasswordLoginCount: 0,
        lockedUntil: null,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'CUSTOMER_SELF_PASSWORD_UPDATED',
      moduleKey: 'customers',
      entityType: 'Customer',
      entityId: customerId,
      payload: {
        passwordChanged: true,
      },
    });

    if (actorId) {
      await this.auditLogsService.touchEntity({
        entityType: 'Customer',
        entityId: customerId,
        actorId,
        moduleKey: 'customers',
      });
    }

    return { success: true };
  }

  async uploadMyAvatar(customerId: string, file: any, actorId?: string) {
    if (!file) {
      throw new BadRequestException('Please choose an avatar image');
    }

    const customer = await this.findOne(customerId);
    const uploadedAssets = await this.mediaService.uploadMany(
      [file],
      {
        folder: 'customer-avatars',
        tags: 'customer,avatar',
        title: `${customer.user.fullName} avatar`,
        altText: customer.user.fullName,
      },
      actorId,
    );

    const avatarUrl = uploadedAssets[0]?.fileUrl || uploadedAssets[0]?.previewUrl || null;

    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        user: {
          update: {
            avatarUrl,
          },
        },
      },
      include: {
        user: safeUserSelect,
        ownerUser: safeUserSelect,
        solarSystems: { where: { deletedAt: null } },
        contracts: { where: { deletedAt: null }, include: { servicePackage: true } },
        invoices: { where: { deletedAt: null }, include: { payments: true } },
        supportTickets: { where: { deletedAt: null } },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'CUSTOMER_SELF_AVATAR_UPDATED',
      moduleKey: 'customers',
      entityType: 'Customer',
      entityId: updated.id,
      payload: {
        avatarUrl,
      },
      beforeState: this.serializeCustomerAuditState(customer),
      afterState: this.serializeCustomerAuditState(updated),
    });

    if (actorId) {
      await this.auditLogsService.touchEntity({
        entityType: 'Customer',
        entityId: updated.id,
        actorId,
        moduleKey: 'customers',
      });
    }

    return updated;
  }

  async create(dto: CreateCustomerDto, actorId?: string) {
    const email = this.normalizeOptionalEmail(dto.email);
    const phone = this.normalizeOptionalPhone(dto.phone);
    this.ensureCustomerIdentity({ email, phone });
    const normalizedVatRate =
      dto.defaultVatRate !== undefined
        ? normalizePercentRate(dto.defaultVatRate)
        : dto.defaultTaxAmount !== undefined
          ? normalizePercentRate(dto.defaultTaxAmount)
          : null;

    await this.ensureIdentityIsAvailable({ email, phone });

    const role = await this.prisma.role.findFirst({
      where: { code: 'CUSTOMER' },
    });

    if (!role) {
      throw new BadRequestException('Customer role not found');
    }

    if (dto.ownerUserId) {
      await this.ensureOwnerExists(dto.ownerUserId);
    }

    const passwordHash = await bcrypt.hash(
      dto.password || createTemporaryPassword(),
      10,
    );
    const customer = await this.prisma.customer.create({
      data: {
        customerCode: generateCode('CUS'),
        companyName: dto.companyName,
        installationAddress: dto.installationAddress,
        billingAddress: dto.billingAddress,
        notes: dto.notes,
        defaultUnitPrice: dto.defaultUnitPrice,
        defaultVatRate: normalizedVatRate,
        defaultTaxAmount: dto.defaultTaxAmount,
        defaultDiscountAmount: dto.defaultDiscountAmount,
        status: dto.status || 'ACTIVE',
        ...(dto.ownerUserId
          ? {
              ownerUser: {
                connect: { id: dto.ownerUserId },
              },
            }
          : {}),
        user: {
          create: {
            email,
            fullName: dto.fullName.trim(),
            phone,
            passwordHash,
            roleId: role.id,
          },
        },
      },
      include: {
        user: safeUserSelect,
        ownerUser: safeUserSelect,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'CUSTOMER_CREATED',
      moduleKey: 'customers',
      entityType: 'Customer',
      entityId: customer.id,
      payload: {
        email,
        phone,
        companyName: dto.companyName,
      },
      afterState: this.serializeCustomerAuditState(customer),
    });

    if (dto.ownerUserId && actorId) {
      await this.auditLogsService.assignEntity({
        entityType: 'Customer',
        entityId: customer.id,
        assignedToUserId: dto.ownerUserId,
        actorId,
        moduleKey: 'customers',
      });
    } else if (actorId) {
      await this.auditLogsService.touchEntity({
        entityType: 'Customer',
        entityId: customer.id,
        actorId,
        moduleKey: 'customers',
      });
    }

    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto, actorId?: string) {
    const customer = await this.findOne(id);
    const email =
      dto.email === undefined
        ? customer.user.email || null
        : this.normalizeOptionalEmail(dto.email);
    const phone =
      dto.phone === undefined
        ? customer.user.phone || null
        : this.normalizeOptionalPhone(dto.phone);
    this.ensureCustomerIdentity({ email, phone });
    await this.ensureIdentityIsAvailable({
      email,
      phone,
      excludeUserId: customer.userId,
    });
    const normalizedVatRate =
      dto.defaultVatRate !== undefined
        ? normalizePercentRate(dto.defaultVatRate)
        : dto.defaultTaxAmount !== undefined
          ? normalizePercentRate(dto.defaultTaxAmount)
          : undefined;

    if (dto.ownerUserId) {
      await this.ensureOwnerExists(dto.ownerUserId);
    }

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : undefined;

    const beforeState = this.serializeCustomerAuditState(customer);
    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        companyName: dto.companyName,
        installationAddress: dto.installationAddress,
        billingAddress: dto.billingAddress,
        notes: dto.notes,
        defaultUnitPrice: dto.defaultUnitPrice,
        defaultVatRate: normalizedVatRate,
        defaultTaxAmount: dto.defaultTaxAmount,
        defaultDiscountAmount: dto.defaultDiscountAmount,
        status: dto.status,
        ...(dto.ownerUserId === undefined
          ? {}
          : dto.ownerUserId
            ? {
                ownerUser: {
                  connect: { id: dto.ownerUserId },
                },
              }
            : {
                ownerUser: {
                  disconnect: true,
                },
              }),
        user: {
          update: {
            email,
            fullName: dto.fullName?.trim(),
            phone,
            ...(passwordHash ? { passwordHash } : {}),
          },
        },
      },
      include: {
        user: safeUserSelect,
        ownerUser: safeUserSelect,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'CUSTOMER_UPDATED',
      moduleKey: 'customers',
      entityType: 'Customer',
      entityId: updated.id,
      payload: dto as unknown as Record<string, unknown>,
      beforeState,
      afterState: this.serializeCustomerAuditState(updated),
    });

    if (actorId) {
      if (dto.ownerUserId !== undefined) {
        await this.auditLogsService.assignEntity({
          entityType: 'Customer',
          entityId: updated.id,
          assignedToUserId: dto.ownerUserId || null,
          actorId,
          moduleKey: 'customers',
        });
      } else {
        await this.auditLogsService.touchEntity({
          entityType: 'Customer',
          entityId: updated.id,
          actorId,
          moduleKey: 'customers',
        });
      }
    }

    return updated;
  }

  async remove(id: string, actorId?: string) {
    const customer = await this.findOne(id);

    await this.prisma.$transaction([
      this.prisma.customer.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: customer.userId },
        data: { deletedAt: new Date() },
      }),
    ]);

    await this.auditLogsService.log({
      userId: actorId,
      action: 'CUSTOMER_ARCHIVED',
      moduleKey: 'customers',
      entityType: 'Customer',
      entityId: id,
      beforeState: this.serializeCustomerAuditState(customer),
      afterState: {
        deletedAt: new Date().toISOString(),
      },
    });

    return { success: true };
  }

  private async ensureOwnerExists(ownerUserId: string) {
    const owner = await this.prisma.user.findFirst({
      where: {
        id: ownerUserId,
        deletedAt: null,
        role: {
          code: {
            in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF'],
          },
        },
      },
      select: { id: true },
    });

    if (!owner) {
      throw new BadRequestException('Assigned owner was not found');
    }
  }

  private serializeCustomerAuditState(customer: any) {
    return {
      companyName: customer.companyName || null,
      status: customer.status || null,
      ownerUserId: customer.ownerUserId || null,
      installationAddress: customer.installationAddress || null,
      billingAddress: customer.billingAddress || null,
      email: customer.user?.email || null,
      phone: customer.user?.phone || null,
      fullName: customer.user?.fullName || null,
      avatarUrl: customer.user?.avatarUrl || null,
    };
  }

  private normalizeRequiredName(value: string) {
    const normalized = value.trim();

    if (normalized.length < 2) {
      throw new BadRequestException('Full name must contain at least 2 characters');
    }

    return normalized.slice(0, 120);
  }

  private normalizeOptionalText(value?: string | null, maxLength = 240) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return null;
    }

    return String(value).trim().slice(0, maxLength);
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

  private ensureCustomerIdentity(params: { email: string | null; phone: string | null }) {
    if (!params.email && !params.phone) {
      throw new BadRequestException('Customer must have at least an email or phone number');
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
