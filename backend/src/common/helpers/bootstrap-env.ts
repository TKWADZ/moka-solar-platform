import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

function stripQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function applyEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, 'utf8');
  const lines = contents.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = stripQuotes(rawValue);
  }
}

function isRunningInsideContainer() {
  return existsSync('/.dockerenv') || process.env.RUNNING_IN_CONTAINER === 'true';
}

function rewriteDockerServiceDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || isRunningInsideContainer()) {
    return;
  }

  if (!/@db(?=[:/])/.test(databaseUrl)) {
    return;
  }

  process.env.DATABASE_URL = databaseUrl.replace(/@db(?=[:/])/, '@localhost');
}

const candidateEnvFiles = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '.env'),
  resolve(process.cwd(), '..', '..', '.env'),
];

for (const filePath of candidateEnvFiles) {
  applyEnvFile(filePath);
}

rewriteDockerServiceDatabaseUrl();
