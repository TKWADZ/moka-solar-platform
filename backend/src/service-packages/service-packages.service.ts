import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServicePackageDto } from './dto/create-service-package.dto';
import { UpdateServicePackageDto } from './dto/update-service-package.dto';

@Injectable()
export class ServicePackagesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  findAll() {
    return this.prisma.servicePackage.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const servicePackage = await this.prisma.servicePackage.findFirst({
      where: { id, deletedAt: null },
    });

    if (!servicePackage) {
      throw new NotFoundException('Service package not found');
    }

    return servicePackage;
  }

  async create(dto: CreateServicePackageDto, actorId?: string) {
    await this.ensurePackageCodeAvailable(dto.packageCode);

    const servicePackage = await this.prisma.servicePackage.create({
      data: {
        packageCode: dto.packageCode.trim().toUpperCase(),
        name: dto.name.trim(),
        contractType: dto.contractType,
        shortDescription: dto.shortDescription?.trim() || null,
        pricePerKwh: dto.pricePerKwh,
        fixedMonthlyFee: dto.fixedMonthlyFee,
        maintenanceFee: dto.maintenanceFee,
        annualEscalationRate: dto.annualEscalationRate,
        vatRate: dto.vatRate,
        lateFeeRate: dto.lateFeeRate,
        earlyDiscountRate: dto.earlyDiscountRate,
        defaultTermMonths: dto.defaultTermMonths,
        billingRule: dto.billingRule?.trim() || null,
        notes: dto.notes?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'SERVICE_PACKAGE_CREATED',
      entityType: 'ServicePackage',
      entityId: servicePackage.id,
      payload: dto as unknown as Record<string, unknown>,
    });

    return servicePackage;
  }

  async update(id: string, dto: UpdateServicePackageDto, actorId?: string) {
    const existing = await this.findOne(id);

    if (dto.packageCode && dto.packageCode.trim().toUpperCase() !== existing.packageCode) {
      await this.ensurePackageCodeAvailable(dto.packageCode, id);
    }

    const servicePackage = await this.prisma.servicePackage.update({
      where: { id },
      data: {
        packageCode: dto.packageCode?.trim().toUpperCase(),
        name: dto.name?.trim(),
        contractType: dto.contractType,
        shortDescription:
          dto.shortDescription === undefined ? undefined : dto.shortDescription.trim() || null,
        pricePerKwh: dto.pricePerKwh,
        fixedMonthlyFee: dto.fixedMonthlyFee,
        maintenanceFee: dto.maintenanceFee,
        annualEscalationRate: dto.annualEscalationRate,
        vatRate: dto.vatRate,
        lateFeeRate: dto.lateFeeRate,
        earlyDiscountRate: dto.earlyDiscountRate,
        defaultTermMonths: dto.defaultTermMonths,
        billingRule: dto.billingRule === undefined ? undefined : dto.billingRule.trim() || null,
        notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
        isActive: dto.isActive,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'SERVICE_PACKAGE_UPDATED',
      entityType: 'ServicePackage',
      entityId: servicePackage.id,
      payload: dto as unknown as Record<string, unknown>,
    });

    return servicePackage;
  }

  async remove(id: string, actorId?: string) {
    await this.findOne(id);

    await this.prisma.servicePackage.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'SERVICE_PACKAGE_ARCHIVED',
      entityType: 'ServicePackage',
      entityId: id,
    });

    return { success: true };
  }

  private async ensurePackageCodeAvailable(packageCode: string, currentId?: string) {
    const normalized = packageCode.trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException('Package code is required');
    }

    const existing = await this.prisma.servicePackage.findFirst({
      where: {
        packageCode: normalized,
        deletedAt: null,
        ...(currentId
          ? {
              NOT: {
                id: currentId,
              },
            }
          : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('Package code already exists');
    }
  }
}
