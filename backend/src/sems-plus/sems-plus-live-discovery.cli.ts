import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promptHidden, promptText } from '../common/cli/interactive-prompt';
import {
  SemsPlusClientService,
  SemsPlusDiscoveryResult,
} from './sems-plus-client.service';
import {
  SemsPlusAuthenticationError,
  SemsPlusSessionManager,
} from './sems-plus-session.manager';

type ProbeStatusCounts = {
  online: number;
  offline: number;
  other: number;
};

export type SemsPlusLiveDiscoveryReport = {
  loginSucceeded: boolean;
  regionalApiHost: string;
  profileHttpStatus: number | null;
  profileProviderStatus: string | null;
  roleKey: string | null;
  userType: string | null;
  hasOrgId: boolean;
  permissionsCount: number;
  stationTypeCount: number;
  fullStationRowsReturned: number;
  uniqueStationIdsReturned: number;
  stationDetailSuccessCount: number;
  stationDetailFailureCount: number;
  finalMergedPlantCount: number;
  statusCounts: ProbeStatusCounts;
  expectedPlantMatched: boolean | null;
  plantsWithTodayGeneration: number;
  plantsWithTotalGeneration: number;
  outcome: string;
};

const ONLINE_STATUSES = new Set(['ACTIVE', 'NORMAL', 'ONLINE', 'RUNNING']);

function statusCounts(result: SemsPlusDiscoveryResult): ProbeStatusCounts {
  return result.plants.reduce<ProbeStatusCounts>(
    (counts, plant) => {
      const status = String(plant.status || '').trim().toUpperCase();
      if (ONLINE_STATUSES.has(status)) {
        counts.online += 1;
      } else if (status === 'OFFLINE') {
        counts.offline += 1;
      } else {
        counts.other += 1;
      }
      return counts;
    },
    { online: 0, offline: 0, other: 0 },
  );
}

export function buildSemsPlusLiveDiscoveryReport(
  result: SemsPlusDiscoveryResult,
  expectedPlantMarker: string,
): SemsPlusLiveDiscoveryReport {
  const marker = expectedPlantMarker.trim().toLocaleLowerCase();
  const expectedPlantMatched = marker
    ? result.plants.some((plant) =>
        String(plant.plantName || '').toLocaleLowerCase().includes(marker),
      )
    : null;

  return {
    loginSucceeded: true,
    regionalApiHost: new URL(result.baseApi).host,
    profileHttpStatus: result.diagnostics.profileHttpStatus,
    profileProviderStatus: result.diagnostics.profileProviderStatus,
    roleKey: result.diagnostics.roleKey,
    userType: result.diagnostics.userType,
    hasOrgId: result.diagnostics.hasOrgId,
    permissionsCount: result.diagnostics.permissionsCount,
    stationTypeCount: result.diagnostics.stationTypeCount,
    fullStationRowsReturned: result.diagnostics.fullStationRowsReturned,
    uniqueStationIdsReturned: result.diagnostics.uniqueStationIdsReturned,
    stationDetailSuccessCount: result.diagnostics.stationDetailSuccessCount,
    stationDetailFailureCount: result.diagnostics.stationDetailFailureCount,
    finalMergedPlantCount: result.diagnostics.finalMergedPlantCount,
    statusCounts: statusCounts(result),
    expectedPlantMatched,
    plantsWithTodayGeneration: result.plants.filter(
      (plant) => plant.todayGenerationKwh !== null,
    ).length,
    plantsWithTotalGeneration: result.plants.filter(
      (plant) => plant.totalGenerationKwh !== null,
    ).length,
    outcome:
      expectedPlantMatched === false
        ? 'NEEDS REVIEW: expected plant marker was not matched'
        : 'Outcome 1: PROVEN on this machine',
  };
}

export function formatSemsPlusLiveDiscoveryReport(report: SemsPlusLiveDiscoveryReport) {
  const yesNo = (value: boolean) => (value ? 'yes' : 'no');
  const optionalYesNo = (value: boolean | null) =>
    value === null ? 'not checked' : yesNo(value);
  const value = (input: string | number | null) => input ?? 'not available';

  return [
    `Login succeeded: ${yesNo(report.loginSucceeded)}`,
    `Regional API host: ${report.regionalApiHost}`,
    `Profile HTTP status: ${value(report.profileHttpStatus)}`,
    `Profile provider status: ${value(report.profileProviderStatus)}`,
    `Role: ${value(report.roleKey)}`,
    `User type: ${value(report.userType)}`,
    `Has orgId: ${yesNo(report.hasOrgId)}`,
    `Permissions count: ${report.permissionsCount}`,
    `Station-type count: ${report.stationTypeCount}`,
    `Full station rows: ${report.fullStationRowsReturned}`,
    `Unique station IDs: ${report.uniqueStationIdsReturned}`,
    `Station detail success: ${report.stationDetailSuccessCount}`,
    `Station detail failure: ${report.stationDetailFailureCount}`,
    `Merged plants: ${report.finalMergedPlantCount}`,
    `Online plants: ${report.statusCounts.online}`,
    `Offline plants: ${report.statusCounts.offline}`,
    `Other-status plants: ${report.statusCounts.other}`,
    `Expected plant matched: ${optionalYesNo(report.expectedPlantMatched)}`,
    `Plants with today generation: ${report.plantsWithTodayGeneration}`,
    `Plants with total generation: ${report.plantsWithTotalGeneration}`,
    `Outcome: ${report.outcome}`,
  ].join('\n');
}

function safeString(value: unknown, fallback: string) {
  const normalized = String(value ?? '').trim();
  return /^[A-Za-z0-9_./?={}-]{1,240}$/.test(normalized) ? normalized : fallback;
}

function safeFailureDiagnostics(error: unknown) {
  if (error instanceof SemsPlusAuthenticationError) {
    return {
      endpoint: safeString(error.diagnostics.endpoint, 'unknown'),
      httpStatus: Number(error.diagnostics.httpStatus) || null,
      providerCode: safeString(error.diagnostics.providerCode, 'not available'),
      sessionCreated: Boolean(error.diagnostics.sessionCreated),
    };
  }

  const response =
    error instanceof HttpException && typeof error.getResponse() === 'object'
      ? (error.getResponse() as Record<string, unknown>)
      : {};
  return {
    endpoint: safeString(response.endpoint, 'unknown'),
    httpStatus: Number(response.httpStatus ?? response.statusCode) || null,
    providerCode: safeString(response.providerCode ?? response.code, 'not available'),
    sessionCreated: Boolean(response.sessionCreated),
  };
}

async function main() {
  if (process.argv.slice(2).length) {
    throw new Error('This probe does not accept command-line arguments.');
  }

  let account = '';
  let password = '';
  let expectedPlantMarker = '';
  try {
    account = (await promptText('SEMS+ account/email')).trim();
    if (!account) {
      throw new Error('SEMS+ account/email is required.');
    }
    const region = (await promptText('SEMS+ region [hk]')).trim().toLowerCase() || 'hk';
    expectedPlantMarker = await promptText('Expected plant-name marker (optional)');
    password = await promptHidden('SEMS+ password');
    if (!password) {
      throw new Error('SEMS+ password is required.');
    }

    const configService = new ConfigService({
      SEMS_PLUS_REGION: region,
      SEMS_PLUS_PORTAL_URL: 'https://semsplus.goodwe.com',
      SEMS_PLUS_LANGUAGE: 'en',
      SEMS_PLUS_PAGE_SIZE: '200',
      SEMS_PLUS_TIMEOUT_MS: '20000',
    });
    const sessionManager = new SemsPlusSessionManager(configService);
    const client = new SemsPlusClientService(sessionManager, configService);
    const result = await client.discoverPlants({
      account,
      password,
      region,
      portalUrl: 'https://semsplus.goodwe.com',
    });
    const report = buildSemsPlusLiveDiscoveryReport(result, expectedPlantMarker);
    process.stdout.write(`${formatSemsPlusLiveDiscoveryReport(report)}\n`);
  } catch (error) {
    const diagnostics = safeFailureDiagnostics(error);
    process.stderr.write('SEMS+ live discovery probe failed.\n');
    process.stderr.write(`Endpoint: ${diagnostics.endpoint}\n`);
    process.stderr.write(`HTTP status: ${diagnostics.httpStatus ?? 'not available'}\n`);
    process.stderr.write(`Provider status: ${diagnostics.providerCode}\n`);
    process.stderr.write(`Session created: ${diagnostics.sessionCreated ? 'yes' : 'no'}\n`);
    process.exitCode = 1;
  } finally {
    account = '';
    password = '';
    expectedPlantMarker = '';
  }
}

if (require.main === module) {
  void main();
}
