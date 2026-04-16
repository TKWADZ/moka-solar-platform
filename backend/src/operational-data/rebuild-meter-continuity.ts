import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  MeterContinuityRecord,
  buildMeterContinuityLookups,
} from '../common/helpers/operational-period.helper';

type CliOptions = {
  systemId?: string;
  customerId?: string;
  customerName?: string;
  dryRun: boolean;
};

function loadEnvFiles() {
  const candidates = [
    join(process.cwd(), '.env'),
    join(process.cwd(), '.env.local'),
    join(process.cwd(), '..', '.env'),
    join(process.cwd(), '..', '.env.local'),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }

    const raw = readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || process.env[key]) {
        continue;
      }

      let value = trimmed.slice(separatorIndex + 1).trim();
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

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith('--system-id=')) {
      options.systemId = arg.slice('--system-id='.length).trim();
      continue;
    }

    if (arg.startsWith('--customer-id=')) {
      options.customerId = arg.slice('--customer-id='.length).trim();
      continue;
    }

    if (arg.startsWith('--customer-name=')) {
      options.customerName = arg.slice('--customer-name='.length).trim();
    }
  }

  return options;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesCustomerName(
  system: {
    customer?: {
      companyName?: string | null;
      user?: {
        fullName?: string | null;
      } | null;
    } | null;
  },
  customerName: string,
) {
  const keyword = customerName.trim().toLowerCase();
  if (!keyword) {
    return true;
  }

  const candidates = [
    system.customer?.companyName,
    system.customer?.user?.fullName,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  return candidates.some((value) => value.toLowerCase().includes(keyword));
}

function toPlainRecord(record: any): MeterContinuityRecord {
  return {
    id: record.id,
    solarSystemId: record.solarSystemId,
    year: record.year,
    month: record.month,
    loadConsumedKwh: record.loadConsumedKwh,
    pvGenerationKwh: record.pvGenerationKwh,
    meterReadingStart: record.meterReadingStart,
    meterReadingEnd: record.meterReadingEnd,
    rawPayload: record.rawPayload,
  };
}

async function main() {
  loadEnvFiles();
  const prisma = new PrismaClient();
  const options = parseArgs(process.argv.slice(2));

  try {
    const systems = await prisma.solarSystem.findMany({
      where: {
        deletedAt: null,
        ...(options.systemId
          ? {
              id: options.systemId,
            }
          : {}),
        ...(options.customerId
          ? {
              customerId: options.customerId,
            }
          : {}),
      },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
        monthlyEnergyRecords: {
          where: {
            deletedAt: null,
          },
          orderBy: [{ year: 'asc' }, { month: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    const matchedSystems = options.customerName
      ? systems.filter((system) => matchesCustomerName(system, options.customerName as string))
      : systems;

    if (!matchedSystems.length) {
      console.log('No systems matched the rebuild filter.');
      return;
    }

    let updatedCount = 0;
    let changedRecordCount = 0;

    for (const system of matchedSystems) {
      const lookups = buildMeterContinuityLookups(
        system.monthlyEnergyRecords.map((record) => toPlainRecord(record)),
      );
      const customerName =
        system.customer?.companyName ||
        system.customer?.user?.fullName ||
        system.customerId ||
        'Unknown customer';

      console.log(`\nSystem: ${system.name} (${system.id})`);
      console.log(`Customer: ${customerName}`);

      for (const record of system.monthlyEnergyRecords) {
        const continuity = lookups.byRecordId.get(record.id);
        if (!continuity) {
          continue;
        }

        const nextPayload = {
          ...(typeof record.rawPayload === 'object' && record.rawPayload !== null
            ? (record.rawPayload as Record<string, unknown>)
            : {}),
          previousReading: continuity.previousReading,
          currentReading: continuity.currentReading,
          continuityStatus: continuity.continuityStatus,
          continuityWarning: continuity.continuityWarning,
          continuityBackfilledAt: new Date().toISOString(),
        };

        const startChanged =
          toNullableNumber(record.meterReadingStart) !== continuity.previousReading;
        const endChanged =
          toNullableNumber(record.meterReadingEnd) !== continuity.currentReading;

        if (!startChanged && !endChanged) {
          continue;
        }

        changedRecordCount += 1;

        console.log(
          `  ${String(record.month).padStart(2, '0')}/${record.year}: ${record.meterReadingStart ?? 'null'} -> ${continuity.previousReading}, ${record.meterReadingEnd ?? 'null'} -> ${continuity.currentReading}${continuity.continuityWarning ? ` [${continuity.continuityWarning}]` : ''}`,
        );

        if (!options.dryRun) {
          await prisma.monthlyEnergyRecord.update({
            where: {
              id: record.id,
            },
            data: {
              meterReadingStart: continuity.previousReading,
              meterReadingEnd: continuity.currentReading,
              rawPayload: nextPayload,
            },
          });
          updatedCount += 1;
        }
      }
    }

    console.log(
      `\nContinuity rebuild complete. Systems scanned: ${matchedSystems.length}. Records changed: ${changedRecordCount}. Updates applied: ${options.dryRun ? 0 : updatedCount}.`,
    );

    if (options.dryRun) {
      console.log('Dry run mode was enabled, so no database rows were modified.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Failed to rebuild meter continuity.', error);
  process.exit(1);
});
