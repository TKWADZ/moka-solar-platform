import { SystemStatus } from '@prisma/client';

export function deriveSystemStatusFromMonitoring(params: {
  currentStatus?: SystemStatus | null;
  connectionStatus?: string | null;
  latestTelemetryAt?: Date | null;
}) {
  const currentStatus = params.currentStatus || null;
  if (currentStatus === 'MAINTENANCE') {
    return currentStatus;
  }

  const normalized = String(params.connectionStatus || '')
    .trim()
    .toUpperCase();
  const latestTelemetryAt = params.latestTelemetryAt || null;
  const telemetryAgeMinutes = latestTelemetryAt
    ? (Date.now() - latestTelemetryAt.getTime()) / 60000
    : null;

  if (
    normalized.includes('FAULT') ||
    normalized.includes('LOI') ||
    normalized.includes('ERROR')
  ) {
    return 'FAULT' satisfies SystemStatus;
  }

  if (normalized.includes('CANH_BAO') || normalized.includes('ALERT')) {
    return 'WARNING' satisfies SystemStatus;
  }

  if (
    normalized.includes('OFFLINE') ||
    normalized.includes('MAT_KET_NOI') ||
    normalized.includes('CHUA_CO_DU_LIEU')
  ) {
    return 'OFFLINE' satisfies SystemStatus;
  }

  if (telemetryAgeMinutes !== null && telemetryAgeMinutes > 90) {
    return 'OFFLINE' satisfies SystemStatus;
  }

  if (normalized.includes('TRUC_TUYEN') || normalized.includes('ONLINE')) {
    return 'ACTIVE' satisfies SystemStatus;
  }

  if (telemetryAgeMinutes !== null && telemetryAgeMinutes <= 90) {
    return 'ACTIVE' satisfies SystemStatus;
  }

  return currentStatus || ('ACTIVE' satisfies SystemStatus);
}

export function getSystemStatusLabel(status?: string | null) {
  switch (String(status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'Dang hoat dong';
    case 'MAINTENANCE':
      return 'Dang bao tri';
    case 'WARNING':
      return 'Canh bao';
    case 'FAULT':
      return 'Loi';
    case 'OFFLINE':
      return 'Mat ket noi';
    case 'PLANNING':
      return 'Dang lap ke hoach';
    case 'INSTALLING':
      return 'Dang thi cong';
    case 'INACTIVE':
      return 'Tam dung';
    default:
      return status || 'Chua xac dinh';
  }
}
