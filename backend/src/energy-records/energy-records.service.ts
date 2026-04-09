import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createDecipheriv, createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEnergyRecordDto } from './dto/create-energy-record.dto';
import { UpdateEnergyRecordDto } from './dto/update-energy-record.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SemsSyncDto } from './dto/sems-sync.dto';
import { SemsPortalService } from './sems-portal.service';
import { SolarmanSyncDto } from './dto/solarman-sync.dto';
import { SolarmanService } from './solarman.service';

type SyncMonitorSnapshot = {
  provider: string;
  todayGeneratedKwh: number | null;
  todayLoadConsumedKwh: number | null;
  todayGridImportedKwh: number | null;
  todayGridExportedKwh: number | null;
  fetchedAt: string;
  plantName?: string | null;
};

type SyncRecordOptions = {
  recordDate?: string;
  loadConsumedKwh?: number;
  gridImportedKwh?: number;
  gridExportedKwh?: number;
};

@Injectable()
export class EnergyRecordsService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
    private semsPortalService: SemsPortalService,
    private solarmanService: SolarmanService,
  ) {}

  findAll(systemId?: string) {
    return this.prisma.energyRecord.findMany({
      where: systemId ? { solarSystemId: systemId } : undefined,
      orderBy: { recordDate: 'desc' },
      take: 120,
    });
  }

  async findMine(customerId: string) {
    const systems = await this.prisma.solarSystem.findMany({
      where: {
        customerId,
        deletedAt: null,
      },
      include: {
        energyRecords: {
          orderBy: { recordDate: 'desc' },
          take: 60,
        },
      },
    });

    return systems.flatMap((system) =>
      system.energyRecords.map((record) => ({
        ...record,
        systemName: system.name,
        systemCode: system.systemCode,
      })),
    );
  }

  async create(dto: CreateEnergyRecordDto, actorId?: string) {
    const record = await this.upsertRecord(dto);

    await this.auditLogsService.log({
      userId: actorId,
      action: 'ENERGY_RECORD_UPSERTED',
      entityType: 'EnergyRecord',
      entityId: record.id,
      payload: dto as unknown as Record<string, unknown>,
    });

    return record;
  }

  async update(id: string, dto: UpdateEnergyRecordDto, actorId?: string) {
    const existing = await this.prisma.energyRecord.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Energy record not found');
    }

    const updated = await this.prisma.energyRecord.update({
      where: { id },
      data: {
        solarSystemId: dto.solarSystemId,
        recordDate: dto.recordDate ? new Date(dto.recordDate) : undefined,
        solarGeneratedKwh: dto.solarGeneratedKwh,
        loadConsumedKwh: dto.loadConsumedKwh,
        gridImportedKwh: dto.gridImportedKwh,
        gridExportedKwh: dto.gridExportedKwh,
        selfConsumedKwh: dto.selfConsumedKwh,
        savingAmount: dto.savingAmount,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'ENERGY_RECORD_UPDATED',
      entityType: 'EnergyRecord',
      entityId: id,
      payload: dto as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async mockSync(systemId: string, days: number, actorId?: string) {
    const system = await this.prisma.solarSystem.findFirst({
      where: { id: systemId, deletedAt: null },
    });

    if (!system) {
      throw new NotFoundException('Solar system not found');
    }

    const records = [];

    for (let offset = 0; offset < days; offset += 1) {
      const recordDate = new Date();
      recordDate.setUTCHours(0, 0, 0, 0);
      recordDate.setUTCDate(recordDate.getUTCDate() - offset);

      const solarGeneratedKwh = Number((24 + Math.random() * 22).toFixed(2));
      const loadConsumedKwh = Number((28 + Math.random() * 20).toFixed(2));
      const gridImportedKwh = Number(Math.max(4, loadConsumedKwh - solarGeneratedKwh * 0.72).toFixed(2));
      const gridExportedKwh = Number(Math.max(1, solarGeneratedKwh * 0.18).toFixed(2));
      const selfConsumedKwh = Number(Math.max(0, solarGeneratedKwh - gridExportedKwh).toFixed(2));
      const savingAmount = Number((selfConsumedKwh * 2100 + gridExportedKwh * 850).toFixed(2));

      const record = await this.prisma.energyRecord.upsert({
        where: {
          solarSystemId_recordDate: {
            solarSystemId: systemId,
            recordDate,
          },
        },
        update: {
          solarGeneratedKwh,
          loadConsumedKwh,
          gridImportedKwh,
          gridExportedKwh,
          selfConsumedKwh,
          savingAmount,
        },
        create: {
          solarSystemId: systemId,
          recordDate,
          solarGeneratedKwh,
          loadConsumedKwh,
          gridImportedKwh,
          gridExportedKwh,
          selfConsumedKwh,
          savingAmount,
        },
      });

      records.push(record);
    }

    await this.auditLogsService.log({
      userId: actorId,
      action: 'ENERGY_RECORDS_SYNCED',
      entityType: 'SolarSystem',
      entityId: systemId,
      payload: { days },
    });

    return {
      synced: records.length,
      systemCode: system.systemCode,
    };
  }

  async previewSems(dto: SemsSyncDto) {
    return this.semsPortalService.fetchMonitorSnapshot(dto);
  }

  async previewSolarman(dto: SolarmanSyncDto) {
    return this.solarmanService.fetchMonitorSnapshot(dto);
  }

  async syncFromSems(systemId: string, dto: SemsSyncDto, actorId?: string) {
    const system = await this.prisma.solarSystem.findFirst({
      where: { id: systemId, deletedAt: null },
    });

    if (!system) {
      throw new NotFoundException('Solar system not found');
    }

    const resolvedDto = {
      ...dto,
      plantId: dto.plantId || system.monitoringPlantId || system.stationId || undefined,
    };

    if (!resolvedDto.plantId) {
      throw new BadRequestException(
        'SEMS plant ID is required. Set monitoringPlantId on the system or provide plantId in the request.',
      );
    }

    const snapshot = await this.semsPortalService.fetchMonitorSnapshot(resolvedDto);
    const normalized = this.normalizeSnapshotForRecord(systemId, snapshot, resolvedDto);
    const record = await this.upsertRecord(normalized);

    await this.prisma.solarSystem.update({
      where: { id: systemId },
      data: {
        monitoringProvider: snapshot.provider,
        monitoringPlantId: resolvedDto.plantId,
        latestMonitorSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        latestMonitorAt: new Date(snapshot.fetchedAt),
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'SEMS_SYNC_COMPLETED',
      entityType: 'SolarSystem',
      entityId: systemId,
      payload: {
        provider: snapshot.provider,
        plantId: resolvedDto.plantId,
        plantName: snapshot.plantName,
        recordDate: normalized.recordDate,
      },
    });

    return {
      systemId,
      systemCode: system.systemCode,
      provider: snapshot.provider,
      snapshot,
      record,
      derivedMetrics: {
        loadConsumedKwh:
          dto.loadConsumedKwh === undefined && snapshot.todayLoadConsumedKwh === null,
        gridImportedKwh:
          dto.gridImportedKwh === undefined && snapshot.todayGridImportedKwh === null,
        gridExportedKwh:
          dto.gridExportedKwh === undefined && snapshot.todayGridExportedKwh === null,
      },
    };
  }

  async syncFromSolarman(systemId: string, dto: SolarmanSyncDto, actorId?: string) {
    const system = await this.prisma.solarSystem.findFirst({
      where: { id: systemId, deletedAt: null },
      include: {
        solarmanConnection: true,
      },
    });

    if (!system) {
      throw new NotFoundException('Solar system not found');
    }

    const resolvedDto = this.resolveSolarmanSyncDto(system, dto);
    const snapshot = await this.solarmanService.fetchMonitorSnapshot(resolvedDto);
    const normalized = this.normalizeSnapshotForRecord(systemId, snapshot, resolvedDto);
    const record = await this.upsertRecord(normalized);

    await this.prisma.solarSystem.update({
      where: { id: systemId },
      data: {
        monitoringProvider: snapshot.provider,
        monitoringPlantId: resolvedDto.stationId,
        latestMonitorSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        latestMonitorAt: new Date(snapshot.fetchedAt),
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'SOLARMAN_SYNC_COMPLETED',
      entityType: 'SolarSystem',
      entityId: systemId,
      payload: {
        provider: snapshot.provider,
        plantId: resolvedDto.stationId,
        plantName: snapshot.plantName,
        recordDate: normalized.recordDate,
      },
    });

    return {
      systemId,
      systemCode: system.systemCode,
      provider: snapshot.provider,
      snapshot,
      record,
      derivedMetrics: {
        loadConsumedKwh:
          dto.loadConsumedKwh === undefined && snapshot.todayLoadConsumedKwh === null,
        gridImportedKwh:
          dto.gridImportedKwh === undefined && snapshot.todayGridImportedKwh === null,
        gridExportedKwh:
          dto.gridExportedKwh === undefined && snapshot.todayGridExportedKwh === null,
      },
    };
  }

  private normalizeSnapshotForRecord(
    systemId: string,
    snapshot: SyncMonitorSnapshot,
    dto: SyncRecordOptions,
  ): CreateEnergyRecordDto {
    const solarGeneratedKwh = Number((snapshot.todayGeneratedKwh || 0).toFixed(2));
    const gridExportedKwh = Number(
      (dto.gridExportedKwh ?? snapshot.todayGridExportedKwh ?? 0).toFixed(2),
    );
    const gridImportedKwh = Number(
      (dto.gridImportedKwh ?? snapshot.todayGridImportedKwh ?? 0).toFixed(2),
    );
    const loadConsumedKwh = Number(
      (
        dto.loadConsumedKwh ??
        snapshot.todayLoadConsumedKwh ??
        Math.max(solarGeneratedKwh - gridExportedKwh + gridImportedKwh, 0)
      ).toFixed(2),
    );

    return {
      solarSystemId: systemId,
      recordDate: dto.recordDate || this.startOfUtcDay().toISOString(),
      solarGeneratedKwh,
      loadConsumedKwh,
      gridImportedKwh,
      gridExportedKwh,
    };
  }

  private async upsertRecord(dto: CreateEnergyRecordDto) {
    const selfConsumedKwh =
      dto.selfConsumedKwh ??
      Math.max(
        0,
        Math.min(dto.solarGeneratedKwh, dto.loadConsumedKwh - dto.gridImportedKwh),
      );

    const savingAmount =
      dto.savingAmount ?? Number((selfConsumedKwh * 2200 + dto.gridExportedKwh * 900).toFixed(2));

    return this.prisma.energyRecord.upsert({
      where: {
        solarSystemId_recordDate: {
          solarSystemId: dto.solarSystemId,
          recordDate: new Date(dto.recordDate),
        },
      },
      update: {
        solarGeneratedKwh: dto.solarGeneratedKwh,
        loadConsumedKwh: dto.loadConsumedKwh,
        gridImportedKwh: dto.gridImportedKwh,
        gridExportedKwh: dto.gridExportedKwh,
        selfConsumedKwh,
        savingAmount,
      },
      create: {
        solarSystemId: dto.solarSystemId,
        recordDate: new Date(dto.recordDate),
        solarGeneratedKwh: dto.solarGeneratedKwh,
        loadConsumedKwh: dto.loadConsumedKwh,
        gridImportedKwh: dto.gridImportedKwh,
        gridExportedKwh: dto.gridExportedKwh,
        selfConsumedKwh,
        savingAmount,
      },
    });
  }

  private startOfUtcDay() {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  private resolveSolarmanSyncDto(system: any, dto: SolarmanSyncDto): SolarmanSyncDto {
    const stationId = dto.stationId || system.monitoringPlantId || system.stationId || undefined;
    if (!stationId) {
      throw new BadRequestException(
        'SOLARMAN station ID is required. Set monitoringPlantId on the system or provide stationId in the request.',
      );
    }

    const decryptedPassword = system.solarmanConnection?.passwordEncrypted
      ? this.decryptSolarmanPassword(system.solarmanConnection.passwordEncrypted)
      : null;

    return {
      ...dto,
      stationId,
      username: dto.username || system.solarmanConnection?.usernameOrEmail || undefined,
      password: dto.password || decryptedPassword || undefined,
    };
  }

  private decryptSolarmanPassword(value: string) {
    try {
      const [ivBase64, authTagBase64, payloadBase64] = value.split(':');
      if (!ivBase64 || !authTagBase64 || !payloadBase64) {
        return null;
      }

      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.getSolarmanEncryptionKey(),
        Buffer.from(ivBase64, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payloadBase64, 'base64')),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch {
      return null;
    }
  }

  private getSolarmanEncryptionKey() {
    const secret =
      process.env.SOLARMAN_SETTINGS_SECRET ||
      process.env.AI_SETTINGS_SECRET ||
      process.env.JWT_SECRET ||
      'moka-solar-solarman-settings';

    return createHash('sha256').update(secret).digest();
  }
}
