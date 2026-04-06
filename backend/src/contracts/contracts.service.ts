import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { generateCode } from '../common/helpers/domain.helper';
import {
  MOKA_DEFAULT_PPA_UNIT_PRICE,
  MOKA_DEFAULT_VAT_RATE,
} from '../common/config/moka-billing-policy';

@Injectable()
export class ContractsService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  findAll() {
    return this.prisma.contract.findMany({
      where: { deletedAt: null },
      include: {
        customer: { include: { user: true } },
        solarSystem: true,
        servicePackage: true,
        invoices: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMine(customerId: string) {
    await this.normalizeCustomerMappings(customerId);

    const contracts = await this.prisma.contract.findMany({
      where: {
        deletedAt: null,
        OR: [
          { customerId },
          {
            solarSystem: {
              customerId,
              deletedAt: null,
            },
          },
        ],
      },
      include: {
        customer: { include: { user: true } },
        solarSystem: true,
        servicePackage: true,
        invoices: {
          where: { deletedAt: null },
          orderBy: { issuedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return contracts.sort((left, right) => {
      if (left.status === 'ACTIVE' && right.status !== 'ACTIVE') {
        return -1;
      }

      if (left.status !== 'ACTIVE' && right.status === 'ACTIVE') {
        return 1;
      }

      return right.startDate.getTime() - left.startDate.getTime();
    });
  }

  async findOne(id: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: { include: { user: true } },
        solarSystem: true,
        servicePackage: true,
        invoices: { where: { deletedAt: null }, include: { payments: true } },
      },
    });

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    return contract;
  }

  async create(dto: CreateContractDto, actorId?: string) {
    const system = await this.prisma.solarSystem.findFirst({
      where: { id: dto.solarSystemId, deletedAt: null },
    });

    if (!system || system.customerId !== dto.customerId) {
      throw new BadRequestException('Solar system does not belong to this customer');
    }

    const contract = await this.prisma.contract.create({
      data: {
        customerId: dto.customerId,
        solarSystemId: dto.solarSystemId,
        servicePackageId: dto.servicePackageId,
        contractNumber: generateCode('CTR'),
        type: dto.type,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        termMonths: dto.termMonths,
        pricePerKwh:
          dto.pricePerKwh ??
          (dto.type === 'PPA_KWH' ? MOKA_DEFAULT_PPA_UNIT_PRICE : undefined),
        fixedMonthlyFee: dto.fixedMonthlyFee,
        interestRate: dto.interestRate,
        vatRate: dto.vatRate ?? MOKA_DEFAULT_VAT_RATE,
        contractFileUrl: dto.contractFileUrl,
        status: dto.status ?? 'ACTIVE',
      },
      include: {
        customer: { include: { user: true } },
        solarSystem: true,
        servicePackage: true,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'CONTRACT_CREATED',
      moduleKey: 'contracts',
      entityType: 'Contract',
      entityId: contract.id,
      payload: dto as unknown as Record<string, unknown>,
      afterState: this.serializeContractAuditState(contract),
    });

    if (actorId) {
      await this.auditLogsService.touchEntity({
        entityType: 'Contract',
        entityId: contract.id,
        actorId,
        moduleKey: 'contracts',
      });
    }

    return contract;
  }

  async update(id: string, dto: UpdateContractDto, actorId?: string) {
    await this.findOne(id);

    if (dto.customerId && dto.solarSystemId) {
      const system = await this.prisma.solarSystem.findFirst({
        where: { id: dto.solarSystemId, deletedAt: null },
      });

      if (!system || system.customerId !== dto.customerId) {
        throw new BadRequestException('Solar system does not belong to this customer');
      }
    }

    const current = await this.findOne(id);

    const updated = await this.prisma.contract.update({
      where: { id },
      data: {
        customerId: dto.customerId,
        solarSystemId: dto.solarSystemId,
        servicePackageId: dto.servicePackageId,
        type: dto.type,
        status: dto.status,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        termMonths: dto.termMonths,
        pricePerKwh: dto.pricePerKwh,
        fixedMonthlyFee: dto.fixedMonthlyFee,
        interestRate: dto.interestRate,
        vatRate: dto.vatRate,
        contractFileUrl: dto.contractFileUrl,
      },
      include: {
        customer: { include: { user: true } },
        solarSystem: true,
        servicePackage: true,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'CONTRACT_UPDATED',
      moduleKey: 'contracts',
      entityType: 'Contract',
      entityId: id,
      payload: dto as unknown as Record<string, unknown>,
      beforeState: this.serializeContractAuditState(current),
      afterState: this.serializeContractAuditState(updated),
    });

    if (actorId) {
      await this.auditLogsService.touchEntity({
        entityType: 'Contract',
        entityId: id,
        actorId,
        moduleKey: 'contracts',
      });
    }

    return updated;
  }

  async remove(id: string, actorId?: string) {
    const contract = await this.findOne(id);

    await this.prisma.contract.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'TERMINATED' },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'CONTRACT_ARCHIVED',
      moduleKey: 'contracts',
      entityType: 'Contract',
      entityId: id,
      beforeState: this.serializeContractAuditState(contract),
      afterState: {
        ...this.serializeContractAuditState(contract),
        deletedAt: new Date().toISOString(),
        status: 'TERMINATED',
      },
    });

    if (actorId) {
      await this.auditLogsService.touchEntity({
        entityType: 'Contract',
        entityId: id,
        actorId,
        moduleKey: 'contracts',
      });
    }

    return { success: true };
  }

  private async normalizeCustomerMappings(customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        deletedAt: null,
      },
      include: {
        solarSystems: {
          where: { deletedAt: null },
          orderBy: [{ updatedAt: 'desc' }],
        },
        contracts: {
          where: { deletedAt: null, status: 'ACTIVE' },
          orderBy: [{ startDate: 'desc' }],
        },
      },
    });

    if (!customer || customer.solarSystems.length !== 1 || customer.contracts.length !== 1) {
      return;
    }

    const [system] = customer.solarSystems;
    const [contract] = customer.contracts;

    if (contract.solarSystemId === system.id) {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.contract.update({
        where: { id: contract.id },
        data: {
          solarSystemId: system.id,
          pricePerKwh:
            contract.type === 'PPA_KWH'
              ? contract.pricePerKwh || MOKA_DEFAULT_PPA_UNIT_PRICE
              : contract.pricePerKwh,
          vatRate: contract.vatRate ?? MOKA_DEFAULT_VAT_RATE,
        },
      }),
      this.prisma.monthlyPvBilling.updateMany({
        where: {
          customerId,
          solarSystemId: system.id,
          contractId: null,
          deletedAt: null,
        },
        data: {
          contractId: contract.id,
        },
      }),
    ]);
  }

  private serializeContractAuditState(contract: any) {
    return {
      customerId: contract.customerId || null,
      solarSystemId: contract.solarSystemId || null,
      servicePackageId: contract.servicePackageId || null,
      type: contract.type || null,
      status: contract.status || null,
      startDate: contract.startDate?.toISOString?.() || null,
      endDate: contract.endDate?.toISOString?.() || null,
      termMonths: contract.termMonths ?? null,
      pricePerKwh: contract.pricePerKwh != null ? Number(contract.pricePerKwh) : null,
      fixedMonthlyFee: contract.fixedMonthlyFee != null ? Number(contract.fixedMonthlyFee) : null,
      vatRate: contract.vatRate != null ? Number(contract.vatRate) : null,
    };
  }
}
