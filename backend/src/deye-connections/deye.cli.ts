import '../common/helpers/bootstrap-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DeyeConnectionsService } from './deye-connections.service';

type CliOptions = Record<string, string | boolean>;

function parseArgs(argv: string[]) {
  const [command = '', ...rest] = argv;
  const options: CliOptions = {};

  for (const token of rest) {
    if (!token.startsWith('--')) {
      continue;
    }

    const normalized = token.slice(2);
    const [key, rawValue] = normalized.split('=');
    options[key] = rawValue === undefined ? true : rawValue;
  }

  return { command, options };
}

function readString(options: CliOptions, key: string, fallbackEnv?: string) {
  const direct = options[key];
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }

  if (fallbackEnv) {
    const value = process.env[fallbackEnv];
    if (value?.trim()) {
      return value.trim();
    }
  }

  return '';
}

function readNumber(options: CliOptions, key: string, fallbackEnv?: string) {
  const value = readString(options, key, fallbackEnv);
  return value ? Number(value) : undefined;
}

function readBoolean(options: CliOptions, key: string, fallback = false) {
  const value = options[key];
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }

  return fallback;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const deyeConnectionsService = app.get(DeyeConnectionsService);
    const connectionId = readString(options, 'connection-id', 'DEYE_CONNECTION_ID');

    if (!connectionId) {
      throw new Error('Thieu --connection-id hoac bien moi truong DEYE_CONNECTION_ID.');
    }

    if (command === 'test-connection') {
      const result = await deyeConnectionsService.testConnection(connectionId);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (command === 'sync-stations') {
      const result = await deyeConnectionsService.syncStations(connectionId);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (command === 'sync-monthly-history') {
      const result = await deyeConnectionsService.syncMonthlyHistory(connectionId, {
        year: readNumber(options, 'year', 'DEYE_SYNC_YEAR'),
        startAt: readString(options, 'start-at', 'DEYE_SYNC_START_AT') || undefined,
        endAt: readString(options, 'end-at', 'DEYE_SYNC_END_AT') || undefined,
        includeStationSync: readBoolean(options, 'include-station-sync', false),
        stationIds: readString(options, 'station-ids', 'DEYE_SYNC_STATION_IDS')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (command === 'sync-all') {
      const result = await deyeConnectionsService.syncNow(connectionId, {
        year: readNumber(options, 'year', 'DEYE_SYNC_YEAR'),
        startAt: readString(options, 'start-at', 'DEYE_SYNC_START_AT') || undefined,
        endAt: readString(options, 'end-at', 'DEYE_SYNC_END_AT') || undefined,
        includeStationSync: readBoolean(options, 'include-station-sync', true),
        stationIds: readString(options, 'station-ids', 'DEYE_SYNC_STATION_IDS')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(
      [
        'Lenh Deye hop le:',
        '  test-connection --connection-id=<id>',
        '  sync-stations --connection-id=<id>',
        '  sync-monthly-history --connection-id=<id> --year=2026 --start-at=2026-01 --end-at=2026-12',
        '  sync-all --connection-id=<id> --year=2026',
      ].join('\n'),
    );
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
