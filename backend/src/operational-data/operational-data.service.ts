import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SystemStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import {
  buildOperationalFreshness,
  buildOperationalSourceLabel,
  classifyOperationalSource,
  CSV_IMPORT_OPERATIONAL_SOURCE,
  DEFAULT_OPERATIONAL_STALE_DAYS,
  MANUAL_OPERATIONAL_SOURCE,
} from '../common/config/operational-data-source';
import {
  MOKA_DEFAULT_DISCOUNT_AMOUNT,
  MOKA_DEFAULT_PPA_UNIT_PRICE,
  MOKA_DEFAULT_VAT_RATE,
} from '../common/config/moka-billing-policy';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { calculateVatAmount, normalizePercentRate, roundMoney } from '../common/helpers/billing.helper';
import { toNumber } from '../common/helpers/domain.helper';
import { buildMeterContinuityLookups } from '../common/helpers/operational-period.helper';
import { MonthlyPvBillingsService } from '../monthly-pv-billings/monthly-pv-billings.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImportOperationalDataDto } from './dto/import-operational-data.dto';
import { ListOperationalOverviewDto } from './dto/list-operational-overview.dto';
import { UpsertOperationalRecordDto } from './dto/upsert-operational-record.dto';

type NormalizedImportRow = {
  systemId?: string;
  systemCode?: string;
  projectName?: string;
  periodLabel?: string;
  timeZone?: string;
  year?: number;
  month?: number;
  pvGenerationKwh?: number;
  loadConsumedKwh?: number;
  meterReadingStart?: number;
  meterReadingEnd?: number;
  gridExportedKwh?: number;
  purchasedEnergyKwh?: number;
  selfUseRatioPct?: number;
  savingsAmount?: number;
  unitPrice?: number;
  vatRate?: number;
  discountAmount?: number;
  systemStatus?: SystemStatus;
  note?: string;
  source?: string;
  meterReset?: boolean;
  meterReplaced?: boolean;
  contractRestart?: boolean;
};

const MAX_IMPORT_FILE_SIZE = 3 * 1024 * 1024;

type FileImportResult = {
  fileName: string;
  sheetName?: string | null;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  skipped: boolean;
  message?: string | null;
};

@Injectable()
export class OperationalDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly monthlyPvBillingsService: MonthlyPvBillingsService,
  ) {}

  async listOverview(query: ListOperationalOverviewDto) {
    const staleDays = query.staleDays ?? DEFAULT_OPERATIONAL_STALE_DAYS;
    const systems = await this.prisma.solarSystem.findMany({
      where: {
        deletedAt: null,
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.systemStatus ? { status: query.systemStatus as SystemStatus } : {}),
      },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
        monthlyEnergyRecords: {
          where: { deletedAt: null },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          take: 1,
          include: {
            updatedByUser: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
        monthlyPvBillings: {
          where: { deletedAt: null },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          take: 1,
          include: {
            invoice: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    const rows = systems
      .map((system) => this.serializeOverviewRow(system, staleDays))
      .filter((row) => !query.sourceKind || row.latestSourceKind === query.sourceKind);

    return {
      summary: {
        totalSystems: rows.length,
        readySystems: rows.filter((row) => row.dataFreshness.code === 'READY').length,
        staleSystems: rows.filter((row) => row.dataFreshness.code === 'STALE').length,
        missingSystems: rows.filter((row) => row.dataFreshness.code === 'MISSING').length,
      },
      systems: rows,
    };
  }

  async listSystemRecords(systemId: string) {
    const system = await this.prisma.solarSystem.findFirst({
      where: {
        id: systemId,
        deletedAt: null,
      },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
        monthlyEnergyRecords: {
          where: { deletedAt: null },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          include: {
            updatedByUser: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
        monthlyPvBillings: {
          where: { deletedAt: null },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          include: {
            invoice: true,
          },
        },
      },
    });

    if (!system) {
      throw new NotFoundException('Khong tim thay he thong de quan ly du lieu van hanh.');
    }

    await this.recalculateMeterReadings(systemId);

    const refreshedSystem = await this.prisma.solarSystem.findFirst({
      where: {
        id: systemId,
        deletedAt: null,
      },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
        monthlyEnergyRecords: {
          where: { deletedAt: null },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          include: {
            updatedByUser: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
        monthlyPvBillings: {
          where: { deletedAt: null },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          include: {
            invoice: true,
          },
        },
      },
    });

    return {
      system: this.serializeOverviewRow(refreshedSystem, DEFAULT_OPERATIONAL_STALE_DAYS),
      records: refreshedSystem.monthlyEnergyRecords.map((record) =>
        this.serializeMonthlyRecord(record, refreshedSystem.monthlyPvBillings.find(
          (billing) => billing.year === record.year && billing.month === record.month,
        ) || null),
      ),
    };
  }

  async upsertSystemRecord(
    systemId: string,
    dto: UpsertOperationalRecordDto,
    actorId?: string,
    options?: {
      source?: string;
      syncBilling?: boolean;
      auditAction?: string;
      rawPayload?: Record<string, unknown> | null;
    },
  ) {
    const system = await this.prisma.solarSystem.findFirst({
      where: {
        id: systemId,
        deletedAt: null,
      },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!system) {
      throw new NotFoundException('Khong tim thay he thong de cap nhat du lieu.');
    }

    const source = options?.source || dto.source?.trim() || MANUAL_OPERATIONAL_SOURCE;
    const note = dto.note?.trim() || null;
    const normalizedLoadConsumedKwh =
      dto.loadConsumedKwh ??
      (dto.meterReadingStart !== undefined &&
      dto.meterReadingStart !== null &&
      dto.meterReadingEnd !== undefined &&
      dto.meterReadingEnd !== null
        ? roundMoney(dto.meterReadingEnd - dto.meterReadingStart)
        : null);
    const resolvedVatRate = normalizePercentRate(
      dto.vatRate ??
        system.defaultVatRate ??
        system.customer?.defaultVatRate ??
        MOKA_DEFAULT_VAT_RATE,
    );
    const defaultSystemUnitPrice = Number(system.defaultUnitPrice || 0);
    const defaultCustomerUnitPrice = Number(system.customer?.defaultUnitPrice || 0);
    const defaultSystemDiscountAmount = Number(system.defaultDiscountAmount || 0);
    const defaultCustomerDiscountAmount = Number(system.customer?.defaultDiscountAmount || 0);
    const resolvedUnitPrice = roundMoney(
      dto.unitPrice ??
        (defaultSystemUnitPrice > 0
          ? defaultSystemUnitPrice
          : defaultCustomerUnitPrice > 0
            ? defaultCustomerUnitPrice
            : MOKA_DEFAULT_PPA_UNIT_PRICE),
    );
    const resolvedDiscountAmount = roundMoney(
      dto.discountAmount ??
        (defaultSystemDiscountAmount > 0
          ? defaultSystemDiscountAmount
          : defaultCustomerDiscountAmount > 0
            ? defaultCustomerDiscountAmount
            : MOKA_DEFAULT_DISCOUNT_AMOUNT),
    );
    const subtotalAmount = roundMoney(dto.pvGenerationKwh * resolvedUnitPrice);
    const taxAmount = calculateVatAmount(subtotalAmount, resolvedVatRate);
    const totalAmount = roundMoney(subtotalAmount + taxAmount - resolvedDiscountAmount);
    const stationId = system.stationId || system.monitoringPlantId || system.systemCode;
    const syncTime = new Date();
    const continuityFlags = this.buildContinuityFlagsPayload(dto);

    const record = await this.prisma.monthlyEnergyRecord.upsert({
      where: {
        solarSystemId_year_month: {
          solarSystemId: systemId,
          year: dto.year,
          month: dto.month,
        },
      },
      update: {
        customerId: system.customerId || null,
        stationId,
        pvGenerationKwh: dto.pvGenerationKwh,
        loadConsumedKwh: normalizedLoadConsumedKwh,
        meterReadingStart:
          dto.meterReadingStart === undefined || dto.meterReadingStart === null
            ? null
            : dto.meterReadingStart,
        meterReadingEnd:
          dto.meterReadingEnd === undefined || dto.meterReadingEnd === null
            ? null
            : dto.meterReadingEnd,
        savingsAmount:
          dto.savingsAmount === undefined || dto.savingsAmount === null
            ? null
            : dto.savingsAmount,
        unitPrice: resolvedUnitPrice,
        subtotalAmount,
        vatRate: resolvedVatRate,
        taxAmount,
        discountAmount: resolvedDiscountAmount,
        totalAmount,
        systemStatusSnapshot: dto.systemStatus || system.status,
        updatedByUserId: actorId || null,
        source,
        syncTime,
        note,
        rawPayload: {
          mode: options?.source || source,
          dataSourceNote: dto.dataSourceNote || null,
          previousReading:
            dto.meterReadingStart === undefined || dto.meterReadingStart === null
              ? null
              : dto.meterReadingStart,
          currentReading:
            dto.meterReadingEnd === undefined || dto.meterReadingEnd === null
              ? null
              : dto.meterReadingEnd,
          ...continuityFlags,
          ...(options?.rawPayload || {}),
        } as any,
        deletedAt: null,
      },
      create: {
        solarSystemId: systemId,
        customerId: system.customerId || null,
        stationId,
        year: dto.year,
        month: dto.month,
        pvGenerationKwh: dto.pvGenerationKwh,
        loadConsumedKwh: normalizedLoadConsumedKwh,
        meterReadingStart:
          dto.meterReadingStart === undefined || dto.meterReadingStart === null
            ? null
            : dto.meterReadingStart,
        meterReadingEnd:
          dto.meterReadingEnd === undefined || dto.meterReadingEnd === null
            ? null
            : dto.meterReadingEnd,
        savingsAmount:
          dto.savingsAmount === undefined || dto.savingsAmount === null
            ? null
            : dto.savingsAmount,
        unitPrice: resolvedUnitPrice,
        subtotalAmount,
        vatRate: resolvedVatRate,
        taxAmount,
        discountAmount: resolvedDiscountAmount,
        totalAmount,
        systemStatusSnapshot: dto.systemStatus || system.status,
        updatedByUserId: actorId || null,
        source,
        syncTime,
        note,
        rawPayload: {
          mode: options?.source || source,
          dataSourceNote: dto.dataSourceNote || null,
          previousReading:
            dto.meterReadingStart === undefined || dto.meterReadingStart === null
              ? null
              : dto.meterReadingStart,
          currentReading:
            dto.meterReadingEnd === undefined || dto.meterReadingEnd === null
              ? null
              : dto.meterReadingEnd,
          ...continuityFlags,
          ...(options?.rawPayload || {}),
        } as any,
      },
      include: {
        updatedByUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    await this.prisma.solarSystem.update({
      where: { id: systemId },
      data: {
        lastMonthlySyncAt: syncTime,
        ...(dto.systemStatus ? { status: dto.systemStatus } : {}),
      },
    });

    await this.recalculateMeterReadings(systemId);

    let billingRecord: any = null;
    const shouldSyncBilling = options?.syncBilling ?? true;

    if (shouldSyncBilling && system.customerId) {
      billingRecord = await this.monthlyPvBillingsService.sync(
        systemId,
        {
          month: dto.month,
          year: dto.year,
          pvGenerationKwh: dto.pvGenerationKwh,
          unitPrice: resolvedUnitPrice,
          vatRate: resolvedVatRate,
          discountAmount: resolvedDiscountAmount,
          source,
          note,
        },
        actorId,
      );

      await this.prisma.solarSystem.update({
        where: { id: systemId },
        data: {
          lastBillingSyncAt: new Date(),
        },
      });
    }

    await this.auditLogsService.log({
      userId: actorId,
      action: options?.auditAction || 'MONTHLY_OPERATIONAL_DATA_UPSERTED',
      entityType: 'MonthlyEnergyRecord',
      entityId: record.id,
      payload: {
        solarSystemId: systemId,
        year: dto.year,
        month: dto.month,
        source,
      },
    });

    return {
      record: this.serializeMonthlyRecord(record, billingRecord),
      billing: this.serializeBillingPreview(billingRecord),
    };
  }

  async importSpreadsheet(files: any[], dto: ImportOperationalDataDto, actorId?: string) {
    if (!files?.length) {
      throw new BadRequestException('Vui long chon it nhat mot file CSV hoac Excel de import.');
    }

    const overwriteExisting = dto.overwriteExisting ?? true;
    const source = dto.source?.trim() || CSV_IMPORT_OPERATIONAL_SOURCE;
    const successes: Array<Record<string, unknown>> = [];
    const errors: Array<Record<string, unknown>> = [];
    const fileResults: FileImportResult[] = [];
    let totalRows = 0;
    let failedRowsTotal = 0;

    for (const file of files) {
      const fileName = String(file?.originalname || file?.filename || 'import-file');

      if (Number(file?.size || 0) > MAX_IMPORT_FILE_SIZE) {
        fileResults.push({
          fileName,
          totalRows: 0,
          importedRows: 0,
          failedRows: 0,
          skipped: true,
          message: 'File import qua lon. Vui long dung file nho hon 3 MB.',
        });
        errors.push({
          fileName,
          message: 'File import qua lon. Vui long dung file nho hon 3 MB.',
        });
        continue;
      }

      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        fileResults.push({
          fileName,
          totalRows: 0,
          importedRows: 0,
          failedRows: 0,
          skipped: true,
          message: 'Khong doc duoc sheet du lieu tu file vua tai len.',
        });
        errors.push({
          fileName,
          message: 'Khong doc duoc sheet du lieu tu file vua tai len.',
        });
        continue;
      }

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        raw: false,
      });

      if (!rows.length) {
        fileResults.push({
          fileName,
          sheetName,
          totalRows: 0,
          importedRows: 0,
          failedRows: 0,
          skipped: true,
          message: 'File import khong co dong du lieu nao.',
        });
        errors.push({
          fileName,
          message: 'File import khong co dong du lieu nao.',
        });
        continue;
      }

      const normalizedHeaders = new Set(
        Object.keys(rows[0] || {}).map((key) => this.normalizeColumnKey(key)),
      );
      const missingColumns = this.findMissingImportColumns(normalizedHeaders);

      if (missingColumns.length) {
        const message = `File import thieu cot bat buoc: ${missingColumns.join(', ')}.`;
        fileResults.push({
          fileName,
          sheetName,
          totalRows: rows.length,
          importedRows: 0,
          failedRows: rows.length,
          skipped: true,
          message,
        });
        errors.push({
          fileName,
          message,
        });
        totalRows += rows.length;
        failedRowsTotal += rows.length;
        continue;
      }

      let importedRows = 0;
      let failedRows = 0;
      totalRows += rows.length;

      for (let index = 0; index < rows.length; index += 1) {
        const normalized = this.normalizeImportRow(rows[index]);
        const rowNumber = index + 2;

        try {
          this.assertImportRowReady(normalized);
          const system = await this.findSystemForImport(normalized);

          if (!overwriteExisting) {
            const exists = await this.prisma.monthlyEnergyRecord.findFirst({
              where: {
                solarSystemId: system.id,
                year: normalized.year!,
                month: normalized.month!,
                deletedAt: null,
              },
              select: { id: true },
            });

            if (exists) {
              failedRows += 1;
              failedRowsTotal += 1;
              errors.push({
                fileName,
                row: rowNumber,
                systemCode: system.systemCode,
                message: 'Ky du lieu da ton tai va dang o che do khong ghi de.',
              });
              continue;
            }
          }

          const rowSource = normalized.source || source;
          const importNoteParts = [
            normalized.note,
            normalized.periodLabel ? `Ky ${normalized.periodLabel}` : null,
            normalized.timeZone ? `Mui gio ${normalized.timeZone}` : null,
          ].filter(Boolean);

          const result = await this.upsertSystemRecord(
            system.id,
            {
              month: normalized.month!,
              year: normalized.year!,
              pvGenerationKwh: normalized.pvGenerationKwh!,
              loadConsumedKwh: normalized.loadConsumedKwh,
              savingsAmount: normalized.savingsAmount,
              unitPrice: normalized.unitPrice,
              vatRate: normalized.vatRate,
              discountAmount: normalized.discountAmount,
              systemStatus: normalized.systemStatus,
              note: importNoteParts.length ? importNoteParts.join(' | ') : undefined,
              source: rowSource,
              dataSourceNote: `Import tu ${fileName}${sheetName ? ` / ${sheetName}` : ''}`,
              meterReset: normalized.meterReset,
              meterReplaced: normalized.meterReplaced,
              contractRestart: normalized.contractRestart,
            },
            actorId,
            {
              source: rowSource,
              syncBilling: dto.syncBilling ?? true,
              auditAction: 'MONTHLY_OPERATIONAL_DATA_IMPORTED',
              rawPayload: {
                importFileName: fileName,
                importSheetName: sheetName,
                projectName: normalized.projectName || null,
                reportedPeriod: normalized.periodLabel || null,
                timeZone: normalized.timeZone || null,
                gridExportedKwh:
                  normalized.gridExportedKwh === undefined ? null : normalized.gridExportedKwh,
                purchasedEnergyKwh:
                  normalized.purchasedEnergyKwh === undefined
                    ? null
                    : normalized.purchasedEnergyKwh,
                selfUseRatioPct:
                  normalized.selfUseRatioPct === undefined ? null : normalized.selfUseRatioPct,
                previousReading:
                  normalized.meterReadingStart === undefined
                    ? null
                    : normalized.meterReadingStart,
                currentReading:
                  normalized.meterReadingEnd === undefined
                    ? null
                    : normalized.meterReadingEnd,
                meterReset: normalized.meterReset ?? null,
                meterReplaced: normalized.meterReplaced ?? null,
                contractRestart: normalized.contractRestart ?? null,
              },
            },
          );

          importedRows += 1;
          successes.push({
            fileName,
            row: rowNumber,
            systemId: system.id,
            systemCode: system.systemCode,
            systemName: system.name,
            recordId: (result.record as any).id,
          });
        } catch (error) {
          failedRows += 1;
          failedRowsTotal += 1;
          errors.push({
            fileName,
            row: rowNumber,
            systemCode:
              normalized.systemCode || normalized.systemId || normalized.projectName || '-',
            message: error instanceof Error ? error.message : 'Khong the import dong du lieu nay.',
          });
        }
      }

      fileResults.push({
        fileName,
        sheetName,
        totalRows: rows.length,
        importedRows,
        failedRows,
        skipped: false,
      });
    }

    await this.auditLogsService.log({
      userId: actorId,
      action: 'MONTHLY_OPERATIONAL_DATA_BULK_IMPORTED',
      entityType: 'MonthlyEnergyRecord',
      payload: {
        totalFiles: files.length,
        totalRows,
        importedRows: successes.length,
        failedRows: failedRowsTotal,
        source,
      },
    });

    return {
      sheetName: fileResults[0]?.sheetName || null,
      totalFiles: files.length,
      totalRows,
      importedRows: successes.length,
      failedRows: failedRowsTotal,
      files: fileResults,
      successes,
      errors,
    };
  }

  private async findSystemForImport(row: NormalizedImportRow) {
    if (!row.systemId && !row.systemCode && !row.projectName) {
      throw new BadRequestException(
        'Moi dong import phai co systemId, systemCode hoac Ten du an de doi soat.',
      );
    }

    const directMatch = row.systemId || row.systemCode
      ? await this.prisma.solarSystem.findFirst({
          where: {
            deletedAt: null,
            ...(row.systemId ? { id: row.systemId } : { systemCode: row.systemCode }),
          },
          include: {
            customer: true,
          },
        })
      : null;

    if (directMatch) {
      return directMatch;
    }

    if (!row.projectName) {
      throw new NotFoundException(
        `Khong tim thay he thong ${row.systemCode || row.systemId} de import du lieu.`,
      );
    }

    const systems = await this.prisma.solarSystem.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        customer: true,
      },
    });

    const matches = systems
      .map((system) => ({
        system,
        score: this.scoreSystemImportMatch(system, row.projectName!),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score);

    if (!matches.length) {
      throw new NotFoundException(
        `Khong tim thay he thong phu hop voi ten du an "${row.projectName}".`,
      );
    }

    if (matches.length > 1 && matches[0].score === matches[1].score && matches[0].score >= 90) {
      throw new BadRequestException(
        `Ten du an "${row.projectName}" dang trung nhieu he thong. Vui long them systemCode de xac dinh chinh xac.`,
      );
    }

    return matches[0].system;
  }

  private normalizeImportRow(row: Record<string, unknown>) {
    const normalizedMap = new Map<string, unknown>();

    for (const [key, value] of Object.entries(row)) {
      normalizedMap.set(this.normalizeColumnKey(key), value);
    }

    const periodValue = this.toOptionalString(
      this.pickColumn(normalizedMap, ['thoigiancapnhat', 'kydulieu', 'period', 'monthyear']),
    );
    const periodParts = this.extractPeriodParts(periodValue);

    return {
      systemId: this.toOptionalString(
        this.pickColumn(normalizedMap, ['systemid', 'siteid', 'idhethong']),
      ),
      systemCode: this.toOptionalString(
        this.pickColumn(normalizedMap, ['systemcode', 'mahethong', 'system']),
      ),
      projectName: this.toOptionalString(
        this.pickColumn(normalizedMap, ['tenduan', 'tencongtrinh', 'projectname', 'sitename']),
      ),
      periodLabel: periodValue,
      timeZone: this.toOptionalString(
        this.pickColumn(normalizedMap, ['muigio', 'timezone', 'timezones']),
      ),
      year:
        this.toOptionalNumber(this.pickColumn(normalizedMap, ['year', 'nam'])) ||
        periodParts?.year,
      month:
        this.toOptionalNumber(this.pickColumn(normalizedMap, ['month', 'thang'])) ||
        periodParts?.month,
      pvGenerationKwh: this.toOptionalNumber(
        this.pickColumn(normalizedMap, [
          'pvgenerationkwh',
          'pvgeneration',
          'sanluongpvkwh',
          'sanluongpv',
          'generationkwh',
          'luongdienphattrongthangkwh',
        ]),
      ),
      loadConsumedKwh: this.toOptionalNumber(
        this.pickColumn(normalizedMap, [
          'loadconsumedkwh',
          'dientieuthukwh',
          'consumptionkwh',
          'luongdientieuthutrongthangkwh',
        ]),
      ),
      meterReadingStart: this.toOptionalNumber(
        this.pickColumn(normalizedMap, [
          'chisocu',
          'oldreading',
          'previousreading',
          'startreading',
          'chisobatdau',
        ]),
      ),
      meterReadingEnd: this.toOptionalNumber(
        this.pickColumn(normalizedMap, [
          'chisomoi',
          'newreading',
          'currentreading',
          'endreading',
          'chisosau',
        ]),
      ),
      gridExportedKwh: this.toOptionalNumber(
        this.pickColumn(normalizedMap, [
          'congsuatcaplenluoitrongthangkwh',
          'gridexportedkwh',
          'gridpowermonthlykwh',
        ]),
      ),
      purchasedEnergyKwh: this.toOptionalNumber(
        this.pickColumn(normalizedMap, [
          'nangluongdamuatrongthangkwh',
          'purchasedenergykwh',
          'purchasevaluekwh',
        ]),
      ),
      selfUseRatioPct: this.toOptionalNumber(
        this.pickColumn(normalizedMap, ['tyletusudung', 'selfuseratio', 'selfusepct']),
      ),
      savingsAmount: this.toOptionalNumber(
        this.pickColumn(normalizedMap, [
          'savingsamount',
          'tientietkiem',
          'sotientietkiem',
          'loinhuandudoanvnd',
        ]),
      ),
      unitPrice: this.toOptionalNumber(
        this.pickColumn(normalizedMap, ['unitprice', 'dongia', 'giadien']),
      ),
      vatRate: this.toOptionalNumber(
        this.pickColumn(normalizedMap, ['vatrate', 'vat', 'thuevat']),
      ),
      discountAmount: this.toOptionalNumber(
        this.pickColumn(normalizedMap, ['discountamount', 'chietkhau']),
      ),
      systemStatus: this.toOptionalSystemStatus(
        this.pickColumn(normalizedMap, ['systemstatus', 'trangthaihethong']),
      ),
      note: this.toOptionalString(this.pickColumn(normalizedMap, ['note', 'ghichu'])),
      source: this.toOptionalString(this.pickColumn(normalizedMap, ['source', 'nguondulieu'])),
      meterReset: this.toOptionalBoolean(
        this.pickColumn(normalizedMap, ['meterreset', 'meter_reset', 'resetdongho', 'resetchisodien']),
      ),
      meterReplaced: this.toOptionalBoolean(
        this.pickColumn(normalizedMap, [
          'meterreplaced',
          'meter_replaced',
          'thaydongho',
          'thaymoi dongho',
        ]),
      ),
      contractRestart: this.toOptionalBoolean(
        this.pickColumn(normalizedMap, [
          'contractrestart',
          'contract_restart',
          'khoidonglaihopdong',
          'restarthopdong',
        ]),
      ),
    } satisfies NormalizedImportRow;
  }

  private findMissingImportColumns(headers: Set<string>) {
    const missingColumns: string[] = [];

    if (
      !this.hasAnyAlias(headers, [
        'systemid',
        'siteid',
        'idhethong',
        'systemcode',
        'mahethong',
        'system',
        'tenduan',
        'tencongtrinh',
        'projectname',
        'sitename',
      ])
    ) {
      missingColumns.push('systemCode / Tên dự án');
    }

    const hasExplicitYearMonth =
      this.hasAnyAlias(headers, ['year', 'nam']) &&
      this.hasAnyAlias(headers, ['month', 'thang']);
    const hasCombinedPeriod = this.hasAnyAlias(headers, [
      'thoigiancapnhat',
      'kydulieu',
      'period',
      'monthyear',
    ]);

    if (!hasExplicitYearMonth && !hasCombinedPeriod) {
      missingColumns.push('year + month / Thời gian cập nhật');
    }

    if (
      !this.hasAnyAlias(headers, [
        'pvgenerationkwh',
        'pvgeneration',
        'sanluongpvkwh',
        'sanluongpv',
        'generationkwh',
        'luongdienphattrongthangkwh',
      ])
    ) {
      missingColumns.push('pvGenerationKwh / Lượng điện phát -Trong tháng(kWh)');
    }

    return missingColumns;
  }

  private assertImportRowReady(row: NormalizedImportRow) {
    if (!row.year || !row.month) {
      throw new BadRequestException(
        'Khong doc duoc ky du lieu. Vui long kiem tra cot nam/thang hoac "Thoi gian cap nhat" dang YYYY/MM.',
      );
    }

    if (row.pvGenerationKwh === undefined || row.pvGenerationKwh === null) {
      throw new BadRequestException('Khong doc duoc san luong PV thang tu dong du lieu nay.');
    }
  }

  private serializeOverviewRow(system: any, staleDays: number) {
    const latestRecord = system.monthlyEnergyRecords?.[0] || null;
    const latestBilling = system.monthlyPvBillings?.[0] || null;
    const freshness = buildOperationalFreshness({
      year: latestRecord?.year,
      month: latestRecord?.month,
      syncTime: latestRecord?.syncTime,
      staleDays,
    });
    const latestSourceKind = classifyOperationalSource(latestRecord?.source);

    return {
      id: system.id,
      systemCode: system.systemCode,
      name: system.name,
      status: system.status,
      monitoringProvider: system.monitoringProvider,
      location: system.location,
      stationId: system.stationId,
      customer: system.customer
        ? {
            id: system.customer.id,
            companyName: system.customer.companyName,
            fullName: system.customer.user?.fullName || null,
            email: system.customer.user?.email || null,
          }
        : null,
      latestPeriod:
        latestRecord && latestRecord.year && latestRecord.month
          ? `${String(latestRecord.month).padStart(2, '0')}/${latestRecord.year}`
          : null,
      latestSource: latestRecord?.source || null,
      latestSourceLabel: buildOperationalSourceLabel(latestRecord?.source),
      latestSourceKind,
      latestUpdatedAt: latestRecord?.syncTime?.toISOString?.() || null,
      latestUpdatedBy: latestRecord?.updatedByUser
        ? {
            id: latestRecord.updatedByUser.id,
            fullName: latestRecord.updatedByUser.fullName,
            email: latestRecord.updatedByUser.email,
          }
        : null,
      latestPvGenerationKwh:
        latestRecord?.pvGenerationKwh !== null && latestRecord?.pvGenerationKwh !== undefined
          ? Number(latestRecord.pvGenerationKwh)
          : null,
      latestLoadConsumedKwh:
        latestRecord?.loadConsumedKwh !== null && latestRecord?.loadConsumedKwh !== undefined
          ? Number(latestRecord.loadConsumedKwh)
          : null,
      latestMeterReadingEnd:
        latestRecord?.meterReadingEnd !== null && latestRecord?.meterReadingEnd !== undefined
          ? Number(latestRecord.meterReadingEnd)
          : null,
      latestSavingsAmount:
        latestRecord?.savingsAmount !== null && latestRecord?.savingsAmount !== undefined
          ? Number(latestRecord.savingsAmount)
          : null,
      latestBillingAmount:
        latestBilling?.totalAmount !== null && latestBilling?.totalAmount !== undefined
          ? Number(latestBilling.totalAmount)
          : null,
      latestBillingStatus: latestBilling?.invoice?.status || null,
      dataFreshness: freshness,
    };
  }

  private serializeMonthlyRecord(record: any, billingRecord: any) {
    const freshness = buildOperationalFreshness({
      year: record.year,
      month: record.month,
      syncTime: record.syncTime,
    });

    return {
      id: record.id,
      solarSystemId: record.solarSystemId,
      customerId: record.customerId,
      stationId: record.stationId,
      year: record.year,
      month: record.month,
      pvGenerationKwh: Number(record.pvGenerationKwh || 0),
      loadConsumedKwh:
        record.loadConsumedKwh !== null && record.loadConsumedKwh !== undefined
          ? Number(record.loadConsumedKwh)
          : null,
      meterReadingStart:
        record.meterReadingStart !== null && record.meterReadingStart !== undefined
          ? Number(record.meterReadingStart)
          : null,
      meterReadingEnd:
        record.meterReadingEnd !== null && record.meterReadingEnd !== undefined
          ? Number(record.meterReadingEnd)
          : null,
      savingsAmount:
        record.savingsAmount !== null && record.savingsAmount !== undefined
          ? Number(record.savingsAmount)
          : null,
      unitPrice: Number(record.unitPrice || 0),
      subtotalAmount: Number(record.subtotalAmount || 0),
      vatRate: Number(record.vatRate || 0),
      taxAmount: Number(record.taxAmount || 0),
      discountAmount: Number(record.discountAmount || 0),
      totalAmount: Number(record.totalAmount || 0),
      systemStatusSnapshot: record.systemStatusSnapshot || null,
      source: record.source,
      sourceLabel: buildOperationalSourceLabel(record.source),
      sourceKind: classifyOperationalSource(record.source),
      syncTime: record.syncTime.toISOString(),
      note: record.note,
      dataFreshness: freshness,
      updatedByUser: record.updatedByUser
        ? {
            id: record.updatedByUser.id,
            fullName: record.updatedByUser.fullName,
            email: record.updatedByUser.email,
          }
        : null,
      rawPayload:
        record.rawPayload &&
        typeof record.rawPayload === 'object' &&
        !Array.isArray(record.rawPayload)
          ? record.rawPayload
          : null,
      billing: this.serializeBillingPreview(billingRecord),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private serializeBillingPreview(billingRecord: any) {
    if (!billingRecord) {
      return null;
    }

    return {
      id: billingRecord.id,
      invoiceId: billingRecord.invoiceId,
      totalAmount: Number(billingRecord.totalAmount || 0),
      status: billingRecord.invoice?.status || 'ESTIMATED',
      syncTime:
        typeof billingRecord.syncTime === 'string'
          ? billingRecord.syncTime
          : billingRecord.syncTime?.toISOString?.() || null,
    };
  }

  private pickColumn(map: Map<string, unknown>, aliases: string[]) {
    for (const alias of aliases) {
      if (map.has(alias)) {
        return map.get(alias);
      }
    }

    return undefined;
  }

  private hasAnyAlias(headers: Set<string>, aliases: string[]) {
    return aliases.some((alias) => headers.has(alias));
  }

  private extractPeriodParts(value?: string) {
    const raw = String(value || '').trim();

    if (!raw) {
      return null;
    }

    const match = raw.match(/(\d{4})[\/\-](\d{1,2})/);

    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);

    if (!year || !month || month < 1 || month > 12) {
      return null;
    }

    return { year, month };
  }

  private normalizeLookupText(value: unknown) {
    return String(value ?? '')
      .replace(/[đĐ]/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private normalizeLooseLookupText(value: unknown) {
    return this.normalizeLookupText(value)
      .replace(/(duong|street|road|site|station|plant|project|congtrinh|hethong|system|so)/g, '')
      .replace(/^nvp/, 'vp');
  }

  private scoreSystemImportMatch(system: any, projectName: string) {
    const strictInput = this.normalizeLookupText(projectName);
    const looseInput = this.normalizeLooseLookupText(projectName);
    const candidates = [
      system.systemCode,
      system.name,
      system.stationName,
      system.monitoringPlantId,
      system.location,
      system.locationAddress,
    ]
      .filter(Boolean)
      .map((value) => ({
        strict: this.normalizeLookupText(value),
        loose: this.normalizeLooseLookupText(value),
      }));

    let bestScore = 0;

    for (const candidate of candidates) {
      if (!candidate.strict) {
        continue;
      }

      if (candidate.strict === strictInput) {
        bestScore = Math.max(bestScore, 100);
      } else if (candidate.loose && candidate.loose === looseInput) {
        bestScore = Math.max(bestScore, 95);
      } else if (
        candidate.strict.includes(strictInput) ||
        strictInput.includes(candidate.strict)
      ) {
        bestScore = Math.max(bestScore, 80);
      } else if (
        candidate.loose &&
        looseInput &&
        (candidate.loose.includes(looseInput) || looseInput.includes(candidate.loose))
      ) {
        bestScore = Math.max(bestScore, 70);
      }
    }

    return bestScore;
  }

  private normalizeColumnKey(value: string) {
    return value
      .replace(/[đĐ]/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  }

  private toOptionalString(value: unknown) {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : undefined;
  }

  private toOptionalNumber(value: unknown) {
    if (value === null || value === undefined || String(value).trim() === '') {
      return undefined;
    }

    const raw = String(value).trim();
    const normalized =
      raw.includes('.') && raw.includes(',')
        ? raw.replace(/\./g, '').replace(/,/g, '.')
        : raw.includes(',')
          ? /^\d{1,3}(,\d{3})+$/.test(raw)
            ? raw.replace(/,/g, '')
            : raw.replace(/,/g, '.')
          : raw;
    const numeric = toNumber(normalized);
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  private toOptionalBoolean(value: unknown) {
    if (value === null || value === undefined || String(value).trim() === '') {
      return undefined;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'co', 'có', 'x', 'checked'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'n', 'khong', 'không'].includes(normalized)) {
      return false;
    }

    return undefined;
  }

  private buildContinuityFlagsPayload(dto: {
    meterReset?: boolean;
    meterReplaced?: boolean;
    contractRestart?: boolean;
  }) {
    const payload: Record<string, boolean> = {};

    if (dto.meterReset !== undefined) {
      payload.meterReset = dto.meterReset;
      payload.meter_reset = dto.meterReset;
    }

    if (dto.meterReplaced !== undefined) {
      payload.meterReplaced = dto.meterReplaced;
      payload.meter_replaced = dto.meterReplaced;
    }

    if (dto.contractRestart !== undefined) {
      payload.contractRestart = dto.contractRestart;
      payload.contract_restart = dto.contractRestart;
    }

    return payload;
  }

  private toOptionalSystemStatus(value: unknown): SystemStatus | undefined {
    const normalized = String(value ?? '')
      .trim()
      .toUpperCase();

    if (!normalized) {
      return undefined;
    }

    const mapped: Record<string, SystemStatus> = {
      ACTIVE: SystemStatus.ACTIVE,
      DANGHOATDONG: SystemStatus.ACTIVE,
      MAINTENANCE: SystemStatus.MAINTENANCE,
      DANGBAOTRI: SystemStatus.MAINTENANCE,
      WARNING: SystemStatus.WARNING,
      CANHBAO: SystemStatus.WARNING,
      FAULT: SystemStatus.FAULT,
      LOI: SystemStatus.FAULT,
      OFFLINE: SystemStatus.OFFLINE,
      MATKETNOI: SystemStatus.OFFLINE,
      INACTIVE: SystemStatus.INACTIVE,
      PLANNING: SystemStatus.PLANNING,
      INSTALLING: SystemStatus.INSTALLING,
    };

    return mapped[normalized];
  }

  async recalculateAllMeterReadings() {
    const systems = await this.prisma.solarSystem.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    for (const system of systems) {
      await this.recalculateMeterReadings(system.id);
    }
  }

  private async recalculateMeterReadings(systemId: string) {
    const records = await this.prisma.monthlyEnergyRecord.findMany({
      where: {
        solarSystemId: systemId,
        deletedAt: null,
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }, { createdAt: 'asc' }],
    });

    if (!records.length) {
      return;
    }

    const continuityLookups = buildMeterContinuityLookups(
      records.map((record) => ({
        id: record.id,
        solarSystemId: record.solarSystemId,
        contractId: null,
        year: record.year,
        month: record.month,
        consumptionKwh: record.loadConsumedKwh,
        consumptionSource:
          record.loadConsumedKwh !== null && record.loadConsumedKwh !== undefined
            ? 'LOAD_CONSUMED_KWH'
            : null,
        meterReadingStart: record.meterReadingStart,
        meterReadingEnd: record.meterReadingEnd,
        rawPayload: record.rawPayload,
      })),
    );

    for (const record of records) {
      const continuity = continuityLookups.byRecordId.get(record.id);
      if (!continuity) {
        continue;
      }

      const meterReadingStart = continuity.previousReading;
      const meterReadingEnd = continuity.currentReading;
      const hasConsumptionEvidence =
        this.toOptionalNumber(record.loadConsumedKwh) !== undefined ||
        continuity.explicitCurrentReading !== null ||
        continuity.explicitPreviousReading !== null;
      const loadConsumed = hasConsumptionEvidence ? continuity.consumptionKwh : null;
      const needsUpdate =
        this.toOptionalNumber(record.meterReadingStart) !== meterReadingStart ||
        this.toOptionalNumber(record.meterReadingEnd) !== meterReadingEnd ||
        (loadConsumed !== null && this.toOptionalNumber(record.loadConsumedKwh) !== loadConsumed);

      if (!needsUpdate) {
        continue;
      }

      await this.prisma.monthlyEnergyRecord.update({
        where: {
          id: record.id,
        },
        data: {
          meterReadingStart,
          meterReadingEnd,
          ...(loadConsumed !== null ? { loadConsumedKwh: loadConsumed } : {}),
        },
      });
    }
  }

  private extractReadingFromPayload(payload: unknown, aliases: string[]) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const entries = Object.entries(payload as Record<string, unknown>);

    for (const [key, value] of entries) {
      if (!aliases.some((alias) => this.normalizeColumnKey(alias) === this.normalizeColumnKey(key))) {
        continue;
      }

      const numeric = this.toOptionalNumber(value);
      if (numeric !== undefined) {
        return numeric;
      }
    }

    return null;
  }
}
