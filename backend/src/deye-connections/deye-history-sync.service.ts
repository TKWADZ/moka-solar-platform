import { BadGatewayException, Injectable } from '@nestjs/common';
import {
  buildMokaMonthlyBillingNote,
  MOKA_DEFAULT_DISCOUNT_AMOUNT,
  MOKA_DEFAULT_PPA_UNIT_PRICE,
  MOKA_DEFAULT_VAT_RATE,
} from '../common/config/moka-billing-policy';
import {
  calculateVatAmount,
  deriveVatRateFromAmounts,
  normalizePercentRate,
  roundMoney,
} from '../common/helpers/billing.helper';
import { getMonthDateRange } from '../common/helpers/domain.helper';
import { MonthlyPvBillingsService } from '../monthly-pv-billings/monthly-pv-billings.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeyeApiService } from './deye-api.service';
import { DeyeAuthService } from './deye-auth.service';
import { ParsedDeyeMonthlyRecord, parseDeyeMonthlyHistory } from './deye.parser';

type DeyeConnectionRecord = any;
type SolarSystemRecord = any;

@Injectable()
export class DeyeHistorySyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deyeApiService: DeyeApiService,
    private readonly deyeAuthService: DeyeAuthService,
    private readonly monthlyPvBillingsService: MonthlyPvBillingsService,
  ) {}

  async syncMonthlyHistory(
    connectionInput: string | DeyeConnectionRecord,
    options?: {
      year?: number;
      startAt?: string;
      endAt?: string;
      stationIds?: string[];
      actorId?: string;
    },
  ) {
    return this.deyeAuthService.withAuthorizedRequest(connectionInput, async (session) => {
      const range = this.resolveRange(options);
      const systems = await this.prisma.solarSystem.findMany({
        where: {
          deletedAt: null,
          deyeConnectionId: session.connection.id,
          sourceSystem: 'DEYE',
          ...(options?.stationIds?.length
            ? {
                stationId: {
                  in: options.stationIds,
                },
              }
            : {}),
        },
        include: {
          customer: true,
        },
        orderBy: [{ createdAt: 'desc' }],
      });

      const stationResults: Array<Record<string, unknown>> = [];
      let syncedMonths = 0;
      let syncedBillings = 0;

      for (const system of systems) {
        if (!system.stationId) {
          stationResults.push({
            systemId: system.id,
            systemName: system.name,
            stationId: null,
            syncedMonths: 0,
            syncedBillings: 0,
            reason: 'System chua co station_id de dong bo lich su Deye.',
          });
          continue;
        }

        const response = (await this.deyeApiService.post(
          session.connection.baseUrl,
          '/v1.0/station/history',
          {
            stationId: this.toStationIdentifier(system.stationId),
            granularity: 3,
            startAt: range.startAt,
            endAt: range.endAt,
          },
          {
            headers: {
              Authorization: session.authHeader,
            },
            description: `Deye monthly history ${system.stationId}`,
          },
        )) as Record<string, unknown>;

        this.ensureSuccess(
          response,
          `Lay lich su PV thang cho station ${system.stationId} that bai.`,
        );

        const monthlyHistory = parseDeyeMonthlyHistory(response, system.stationId, range.year);
        let stationSyncedMonths = 0;
        let stationSyncedBillings = 0;

        for (const record of monthlyHistory.records) {
          const result = await this.upsertMonthlyRecord(
            session.connection,
            system,
            record,
            options?.actorId,
          );
          stationSyncedMonths += 1;
          stationSyncedBillings += result.billingSynced ? 1 : 0;
        }

        syncedMonths += stationSyncedMonths;
        syncedBillings += stationSyncedBillings;

        if (stationSyncedMonths > 0) {
          const latestMonthlyRecord = monthlyHistory.records.at(-1) || null;
          const yearGenerationKwh = roundMoney(
            monthlyHistory.records.reduce(
              (total, record) => total + Number(record.generationValue || 0),
              0,
            ),
          );
          const existingSnapshot =
            system.latestMonitorSnapshot &&
            typeof system.latestMonitorSnapshot === 'object' &&
            !Array.isArray(system.latestMonitorSnapshot)
              ? (system.latestMonitorSnapshot as Record<string, unknown>)
              : {};
          const existingScopes =
            existingSnapshot.dataScopes &&
            typeof existingSnapshot.dataScopes === 'object' &&
            !Array.isArray(existingSnapshot.dataScopes)
              ? (existingSnapshot.dataScopes as Record<string, unknown>)
              : {};
          const syncedAt = new Date();

          await this.prisma.solarSystem.update({
            where: { id: system.id },
            data: {
              lastMonthlySyncAt: syncedAt,
              ...(stationSyncedBillings > 0
                ? {
                    lastBillingSyncAt: syncedAt,
                  }
                : {}),
              currentMonthGenerationKwh:
                latestMonthlyRecord?.generationValue ?? system.currentMonthGenerationKwh,
              currentYearGenerationKwh: yearGenerationKwh || system.currentYearGenerationKwh,
              latestMonitorSnapshot: {
                ...existingSnapshot,
                provider: 'DEYE',
                plantId: system.stationId,
                plantName: system.stationName || system.name,
                stationId: system.stationId,
                stationName: system.stationName || system.name,
                monthGenerationKwh:
                  latestMonthlyRecord?.generationValue ??
                  existingSnapshot.monthGenerationKwh ??
                  null,
                yearGenerationKwh: yearGenerationKwh || existingSnapshot.yearGenerationKwh || null,
                lastMonthlySyncAt: syncedAt.toISOString(),
                ...(stationSyncedBillings > 0
                  ? {
                      lastBillingSyncAt: syncedAt.toISOString(),
                    }
                  : {}),
                dataScopes: {
                  ...existingScopes,
                  station: Boolean(system.stationId),
                  monthly: true,
                },
              } as any,
            },
          });
        }

        stationResults.push({
          systemId: system.id,
          systemName: system.name,
          stationId: system.stationId,
          syncedMonths: stationSyncedMonths,
          syncedBillings: stationSyncedBillings,
        });
      }

      await this.prisma.deyeConnection.update({
        where: { id: session.connection.id },
        data: {
          lastSyncTime: new Date(),
          status: 'SYNCED',
          lastError: null,
        },
      });

      return {
        year: range.year,
        startAt: range.startAt,
        endAt: range.endAt,
        syncedMonths,
        syncedBillings,
        stations: stationResults,
      };
    });
  }

  private async upsertMonthlyRecord(
    connection: DeyeConnectionRecord,
    system: SolarSystemRecord,
    monthlyRecord: ParsedDeyeMonthlyRecord,
    actorId?: string,
  ) {
    const pricing = await this.resolvePricingDefaults(system, monthlyRecord);
    const subtotalAmount = roundMoney(monthlyRecord.generationValue * pricing.unitPrice);
    const taxAmount = calculateVatAmount(subtotalAmount, pricing.vatRate);
    const totalAmount = roundMoney(
      subtotalAmount + taxAmount - pricing.discountAmount,
    );

    const monthlyEnergyRecord = await this.prisma.monthlyEnergyRecord.upsert({
      where: {
        source_stationId_year_month: {
          source: 'DEYE_MONTHLY',
          stationId: monthlyRecord.stationId,
          year: monthlyRecord.year,
          month: monthlyRecord.month,
        },
      },
      update: {
        solarSystemId: system.id,
        customerId: system.customerId || null,
        deyeConnectionId: connection.id,
        stationId: monthlyRecord.stationId,
        pvGenerationKwh: monthlyRecord.generationValue,
        unitPrice: pricing.unitPrice,
        subtotalAmount,
        vatRate: pricing.vatRate,
        taxAmount,
        discountAmount: pricing.discountAmount,
        totalAmount,
        source: 'DEYE_MONTHLY',
        syncTime: new Date(),
        rawPayload: monthlyRecord.raw as any,
        note: pricing.note,
        deletedAt: null,
      },
      create: {
        solarSystemId: system.id,
        customerId: system.customerId || null,
        deyeConnectionId: connection.id,
        stationId: monthlyRecord.stationId,
        year: monthlyRecord.year,
        month: monthlyRecord.month,
        pvGenerationKwh: monthlyRecord.generationValue,
        unitPrice: pricing.unitPrice,
        subtotalAmount,
        vatRate: pricing.vatRate,
        taxAmount,
        discountAmount: pricing.discountAmount,
        totalAmount,
        source: 'DEYE_MONTHLY',
        syncTime: new Date(),
        rawPayload: monthlyRecord.raw as any,
        note: pricing.note,
      },
    });

    let billingSynced = false;
    if (system.customerId && pricing.unitPrice > 0) {
      try {
        await this.monthlyPvBillingsService.sync(
          system.id,
          {
            month: monthlyRecord.month,
            year: monthlyRecord.year,
            pvGenerationKwh: monthlyRecord.generationValue,
            unitPrice: pricing.unitPrice,
            vatRate: pricing.vatRate,
            discountAmount: pricing.discountAmount,
            source: 'DEYE_MONTHLY',
            note: pricing.note,
          },
          actorId,
        );
        billingSynced = true;
      } catch {
        billingSynced = false;
      }
    }

    return {
      monthlyEnergyRecord,
      billingSynced,
    };
  }

  private async resolvePricingDefaults(
    system: SolarSystemRecord,
    monthlyRecord: ParsedDeyeMonthlyRecord,
  ) {
    const existingMonthly = await this.prisma.monthlyEnergyRecord.findFirst({
      where: {
        solarSystemId: system.id,
        year: monthlyRecord.year,
        month: monthlyRecord.month,
        deletedAt: null,
      },
    });

    const contract = await this.resolveContract(system.id, monthlyRecord.month, monthlyRecord.year);
    const customerDefaults = system.customerId
      ? await this.prisma.customer.findFirst({
          where: {
            id: system.customerId,
            deletedAt: null,
          },
          select: {
            defaultUnitPrice: true,
            defaultVatRate: true,
            defaultTaxAmount: true,
            defaultDiscountAmount: true,
          },
        })
      : null;

    const unitPrice = roundMoney(
      this.optionalNumber(system.defaultUnitPrice) ||
        this.optionalNumber(customerDefaults?.defaultUnitPrice) ||
        this.optionalNumber(existingMonthly?.unitPrice) ||
        this.optionalNumber(contract?.pricePerKwh) ||
        this.optionalNumber(contract?.servicePackage?.pricePerKwh) ||
        MOKA_DEFAULT_PPA_UNIT_PRICE,
    );
    const vatRate = normalizePercentRate(
      this.optionalNumber(system.defaultVatRate) ??
        this.optionalNumber(customerDefaults?.defaultVatRate) ??
        this.optionalNumber(contract?.vatRate) ??
        this.optionalNumber(contract?.servicePackage?.vatRate) ??
        this.optionalNumber(existingMonthly?.vatRate) ??
        deriveVatRateFromAmounts(100, system.defaultTaxAmount, NaN) ??
        deriveVatRateFromAmounts(100, customerDefaults?.defaultTaxAmount, NaN) ??
        deriveVatRateFromAmounts(existingMonthly?.subtotalAmount, existingMonthly?.taxAmount, NaN) ??
        MOKA_DEFAULT_VAT_RATE,
      MOKA_DEFAULT_VAT_RATE,
    );
    const discountAmount = roundMoney(
      this.optionalNumber(system.defaultDiscountAmount) ||
        this.optionalNumber(customerDefaults?.defaultDiscountAmount) ||
        this.optionalNumber(existingMonthly?.discountAmount) ||
        MOKA_DEFAULT_DISCOUNT_AMOUNT,
    );

    return {
      unitPrice,
      vatRate,
      discountAmount,
      note:
        unitPrice > 0
          ? buildMokaMonthlyBillingNote(monthlyRecord.month, monthlyRecord.year)
          : 'Da luu san luong PV thang tu Deye. Hay cau hinh don gia de tao billing.',
    };
  }

  private resolveRange(options?: { year?: number; startAt?: string; endAt?: string }) {
    if (options?.startAt && options?.endAt) {
      return {
        year: Number(options.startAt.slice(0, 4)) || new Date().getFullYear(),
        startAt: options.startAt,
        endAt: options.endAt,
      };
    }

    const year = options?.year || new Date().getFullYear();
    return {
      year,
      startAt: `${year}-01`,
      endAt: `${year}-12`,
    };
  }

  private async resolveContract(systemId: string, month: number, year: number) {
    const { from, to } = getMonthDateRange(year, month);

    return this.prisma.contract.findFirst({
      where: {
        solarSystemId: systemId,
        status: 'ACTIVE',
        deletedAt: null,
        startDate: {
          lte: to,
        },
        OR: [
          { endDate: null },
          {
            endDate: {
              gte: from,
            },
          },
        ],
      },
      include: {
        servicePackage: true,
      },
      orderBy: [{ startDate: 'desc' }],
    });
  }

  private optionalNumber(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private toStationIdentifier(stationId: string) {
    const numeric = Number(stationId);
    return Number.isFinite(numeric) ? numeric : stationId;
  }

  private ensureSuccess(payload: Record<string, unknown>, fallback: string) {
    const success = payload.success === true || String(payload.code || '') === '1000000';
    if (!success) {
      throw new BadGatewayException({
        message: String(payload.msg || fallback),
        provider: 'DEYE',
        code: payload.code || null,
        requestId: payload.requestId || null,
      });
    }
  }
}
