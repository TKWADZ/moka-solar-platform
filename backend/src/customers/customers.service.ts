import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import {
  createTemporaryPassword,
  generateCode,
} from '../common/helpers/domain.helper';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { normalizePercentRate } from '../common/helpers/billing.helper';

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

  async create(dto: CreateCustomerDto, actorId?: string) {
    const normalizedVatRate =
      dto.defaultVatRate !== undefined
        ? normalizePercentRate(dto.defaultVatRate)
        : dto.defaultTaxAmount !== undefined
          ? normalizePercentRate(dto.defaultTaxAmount)
          : null;

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already exists');
    }

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
            email: dto.email,
            fullName: dto.fullName,
            phone: dto.phone,
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
        email: dto.email,
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
    const normalizedVatRate =
      dto.defaultVatRate !== undefined
        ? normalizePercentRate(dto.defaultVatRate)
        : dto.defaultTaxAmount !== undefined
          ? normalizePercentRate(dto.defaultTaxAmount)
          : undefined;

    const customer = await this.findOne(id);

    if (dto.email && dto.email !== customer.user.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (existingUser) {
        throw new BadRequestException('Email already exists');
      }
    }

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
            email: dto.email,
            fullName: dto.fullName,
            phone: dto.phone,
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
      fullName: customer.user?.fullName || null,
    };
  }
}
