import {
  BillingWorkflowStatus,
  InvoiceStatus,
  PrismaClient,
} from '@prisma/client';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from 'fs';
import { join, resolve } from 'path';
import { AUTHORITATIVE_MANUAL_SOURCES } from '../common/config/provider-history-billing';
import {
  INVALID_SOLARMAN_SOURCES,
  INVALID_BARE_MONTH_DATE_YEARS,
  PROVIDER_MONTH_REPAIR_CONFIRMATION,
  ProviderMonthRepairPlanItem,
  buildProviderMonthRepairPlan,
  getSystemHistoryStartYear,
  maskStationId,
  summarizeProviderMonthRepairPlan,
} from './provider-month-repair';

export type ProviderMonthRepairCliOptions = {
  dryRun: boolean;
  systemId?: string;
  stationId?: string;
  backupReference?: string;
  actorUserId?: string;
  confirmation?: string;
};

function loadEnvFiles() {
  for (const filePath of [
    join(process.cwd(), '.env'),
    join(process.cwd(), '.env.local'),
    join(process.cwd(), '..', '.env'),
    join(process.cwd(), '..', '.env.local'),
  ]) {
    if (!existsSync(filePath)) {
      continue;
    }
    for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const separator = trimmed.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      if (!key || process.env[key]) {
        continue;
      }
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

export function parseArgs(argv: string[]): ProviderMonthRepairCliOptions {
  const options: ProviderMonthRepairCliOptions = { dryRun: true };
  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--apply') {
      options.dryRun = false;
    } else if (arg.startsWith('--system-id=')) {
      options.systemId = arg.slice('--system-id='.length).trim();
    } else if (arg.startsWith('--station-id=')) {
      options.stationId = arg.slice('--station-id='.length).trim();
    } else if (arg.startsWith('--backup-reference=')) {
      options.backupReference = arg.slice('--backup-reference='.length).trim();
    } else if (arg.startsWith('--actor-user-id=')) {
      options.actorUserId = arg.slice('--actor-user-id='.length).trim();
    } else if (arg.startsWith('--confirm=')) {
      options.confirmation = arg.slice('--confirm='.length).trim();
    }
  }
  return options;
}

export function validateApplyOptions(options: ProviderMonthRepairCliOptions) {
  if (!options.systemId || !options.stationId) {
    throw new Error('Apply mode requires both --system-id and --station-id scope.');
  }
  if (!options.backupReference) {
    throw new Error('Apply mode requires --backup-reference to an existing PostgreSQL backup.');
  }
  const backupPath = resolve(options.backupReference);
  if (!existsSync(backupPath) || !statSync(backupPath).isFile()) {
    throw new Error('The PostgreSQL backup reference does not exist or is not a file.');
  }
  const backupStats = statSync(backupPath);
  if (backupStats.size === 0) {
    throw new Error('The PostgreSQL backup reference is empty.');
  }
  const backupHeader = Buffer.alloc(Math.min(256, backupStats.size));
  const descriptor = openSync(backupPath, 'r');
  try {
    readSync(descriptor, backupHeader, 0, backupHeader.length, 0);
  } finally {
    closeSync(descriptor);
  }
  const isCustomArchive = backupHeader.subarray(0, 5).toString('ascii') === 'PGDMP';
  const isPlainSqlDump = backupHeader
    .toString('utf8')
    .includes('PostgreSQL database dump');
  if (!isCustomArchive && !isPlainSqlDump) {
    throw new Error('The backup reference is not a recognized PostgreSQL dump.');
  }
  if (!options.actorUserId) {
    throw new Error('Apply mode requires --actor-user-id for audit logs.');
  }
  if (options.confirmation !== PROVIDER_MONTH_REPAIR_CONFIRMATION) {
    throw new Error(
      `Apply mode requires --confirm=${PROVIDER_MONTH_REPAIR_CONFIRMATION}`,
    );
  }
}

export async function executeProviderMonthRepairPlan(
  prisma: Pick<PrismaClient, '$transaction'>,
  plan: ProviderMonthRepairPlanItem[],
  options: ProviderMonthRepairCliOptions,
) {
  if (options.dryRun) {
    return { appliedCount: 0 };
  }

  const actionable = plan.filter(
    (item) =>
      item.action === 'SOFT_DELETE_INVALID_PROVIDER_DATA' ||
      item.action === 'CANCEL_DRAFT_AND_SOFT_DELETE',
  );
  const quarantinedAt = new Date();

  await prisma.$transaction(async (tx) => {
    for (const item of actionable) {
      if (
        item.action === 'CANCEL_DRAFT_AND_SOFT_DELETE' &&
        item.billing?.invoice
      ) {
        await tx.invoice.update({
          where: { id: item.billing.invoice.id },
          data: { status: InvoiceStatus.CANCELLED },
        });
      }

      if (item.billing) {
        await tx.monthlyPvBilling.update({
          where: { id: item.billing.id },
          data: {
            invoiceId: null,
            invoiceStatus: BillingWorkflowStatus.CANCELLED,
            autoSendEligible: false,
            qualitySummary: 'Quarantined confirmed invalid provider period.',
            deletedAt: quarantinedAt,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: options.actorUserId as string,
            action: 'INVALID_PROVIDER_MONTH_BILLING_QUARANTINED',
            moduleKey: 'billing',
            entityType: 'MonthlyPvBilling',
            entityId: item.billing.id,
            beforeState: {
              source: item.billing.source,
              year: item.billing.year,
              month: item.billing.month,
              invoiceStatus: item.billing.invoice?.status || null,
            },
            afterState: {
              deletedAt: quarantinedAt.toISOString(),
              invoiceDetached: Boolean(item.billing.invoiceId),
            },
          },
        });
      }

      await tx.monthlyEnergyRecord.update({
        where: { id: item.energyRecord.id },
        data: { deletedAt: quarantinedAt },
      });
      await tx.auditLog.create({
        data: {
          userId: options.actorUserId as string,
          action: 'INVALID_PROVIDER_MONTH_ENERGY_QUARANTINED',
          moduleKey: 'operations',
          entityType: 'MonthlyEnergyRecord',
          entityId: item.energyRecord.id,
          beforeState: {
            source: item.energyRecord.source,
            year: item.energyRecord.year,
            month: item.energyRecord.month,
          },
          afterState: {
            deletedAt: quarantinedAt.toISOString(),
            parserSignature: 'BARE_MONTH_INTERPRETED_AS_DATE',
          },
        },
      });
    }
  });

  return { appliedCount: actionable.length };
}

async function main() {
  loadEnvFiles();
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    if (!options.dryRun) {
      validateApplyOptions(options);
      const actor = await prisma.user.findUnique({
        where: { id: options.actorUserId },
        include: { role: true },
      });
      if (!actor || actor.role.code !== 'SUPER_ADMIN') {
        throw new Error('Apply mode requires a valid Super Admin audit actor.');
      }
    }

    const energyRecords = await prisma.monthlyEnergyRecord.findMany({
      where: {
        deletedAt: null,
        year: { in: Array.from(INVALID_BARE_MONTH_DATE_YEARS) },
        source: { in: Array.from(INVALID_SOLARMAN_SOURCES) },
        ...(options.systemId ? { solarSystemId: options.systemId } : {}),
        ...(options.stationId ? { stationId: options.stationId } : {}),
      },
      include: {
        solarSystem: {
          select: {
            createdAt: true,
            installDate: true,
            startedAt: true,
          },
        },
      },
      orderBy: [
        { solarSystemId: 'asc' },
        { year: 'asc' },
        { month: 'asc' },
      ],
    });
    const systemIds = [...new Set(energyRecords.map((record) => record.solarSystemId))];
    const reportSystemIds = systemIds.length
      ? systemIds
      : options.systemId
        ? [options.systemId]
        : [];
    const rawBillings = systemIds.length
      ? await prisma.monthlyPvBilling.findMany({
          where: {
            deletedAt: null,
            year: { in: Array.from(INVALID_BARE_MONTH_DATE_YEARS) },
            solarSystemId: { in: systemIds },
          },
          include: {
            invoice: {
              select: {
                id: true,
                status: true,
                _count: {
                  select: {
                    items: true,
                    payments: true,
                    zaloMessageLogs: true,
                  },
                },
              },
            },
          },
        })
      : [];
    const billings = rawBillings.map((billing) => ({
      ...billing,
      invoice: billing.invoice
        ? {
            id: billing.invoice.id,
            status: billing.invoice.status,
            referenceCounts: billing.invoice._count,
          }
        : null,
    }));
    const [manualEnergyRecords, manualBillings] = reportSystemIds.length
      ? await Promise.all([
          prisma.monthlyEnergyRecord.findMany({
            where: {
              deletedAt: null,
              solarSystemId: { in: reportSystemIds },
              source: { in: Array.from(AUTHORITATIVE_MANUAL_SOURCES) },
            },
            select: {
              solarSystemId: true,
              stationId: true,
              year: true,
              month: true,
              source: true,
            },
            orderBy: [{ year: 'asc' }, { month: 'asc' }],
          }),
          prisma.monthlyPvBilling.findMany({
            where: {
              deletedAt: null,
              solarSystemId: { in: reportSystemIds },
              OR: [
                { source: { in: Array.from(AUTHORITATIVE_MANUAL_SOURCES) } },
                { manualOverrideKwh: { not: null } },
              ],
            },
            select: {
              solarSystemId: true,
              year: true,
              month: true,
              source: true,
              manualOverrideKwh: true,
            },
            orderBy: [{ year: 'asc' }, { month: 'asc' }],
          }),
        ])
      : [[], []];
    const plan = buildProviderMonthRepairPlan(energyRecords, billings, {
      systemId: options.systemId,
      stationId: options.stationId,
    });
    const summary = summarizeProviderMonthRepairPlan(plan);

    console.log(JSON.stringify({ mode: options.dryRun ? 'DRY_RUN' : 'APPLY', ...summary }, null, 2));
    console.log(
      JSON.stringify(
        {
          candidates: plan.map((item) => ({
            energyRecordId: item.energyRecord.id,
            solarSystemId: item.energyRecord.solarSystemId,
            stationId: maskStationId(item.energyRecord.stationId),
            period: `${String(item.energyRecord.month).padStart(2, '0')}/${item.energyRecord.year}`,
            source: item.energyRecord.source,
            systemHistoryStartYear: getSystemHistoryStartYear(item.energyRecord),
            createdAt: item.energyRecord.createdAt,
            syncTime: item.energyRecord.syncTime,
            linkedBilling: Boolean(item.billing),
            invoiceStatus: item.billing?.invoice?.status || null,
            relatedReferences: {
              monthlyPvBilling: item.billing ? 1 : 0,
              invoice: item.billing?.invoice ? 1 : 0,
              invoiceItems: item.billing?.invoice?.referenceCounts?.items || 0,
              payments: item.billing?.invoice?.referenceCounts?.payments || 0,
              zaloMessageLogs:
                item.billing?.invoice?.referenceCounts?.zaloMessageLogs || 0,
            },
            action: item.action,
          })),
          preservedManualEnergyPeriods: manualEnergyRecords.map((record) => ({
            solarSystemId: record.solarSystemId,
            stationId: maskStationId(record.stationId),
            period: `${String(record.month).padStart(2, '0')}/${record.year}`,
            source: record.source,
          })),
          preservedManualBillingPeriods: manualBillings.map((record) => ({
            solarSystemId: record.solarSystemId,
            period: `${String(record.month).padStart(2, '0')}/${record.year}`,
            source: record.source,
            hasManualOverride: record.manualOverrideKwh !== null,
          })),
        },
        null,
        2,
      ),
    );

    const execution = await executeProviderMonthRepairPlan(prisma, plan, options);
    if (options.dryRun) {
      console.log('Dry run complete. No database rows were modified.');
      return;
    }

    console.log(
      `Apply complete. Quarantined ${execution.appliedCount} confirmed invalid provider month record(s).`,
    );
    if (summary.actionCounts.NEEDS_MANUAL_FINANCIAL_REVIEW) {
      console.log('Financially locked records were not changed and still require manual review.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Provider month repair failed safely.',
    );
    process.exitCode = 1;
  });
}
