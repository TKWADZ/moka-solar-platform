import { createInterface } from 'node:readline/promises';

type JsonRecord = Record<string, unknown>;

function readSecret(prompt: string) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('This decision test must run in an interactive terminal.');
  }

  return new Promise<string>((resolve, reject) => {
    let value = '';
    const stdin = process.stdin;

    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };

    const onData = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      for (const character of text) {
        if (character === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          reject(new Error('Decision test cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value.trim());
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };

    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function readText(prompt: string) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await terminal.question(prompt)).trim();
  } finally {
    terminal.close();
  }
}

async function readJson(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : {};
  } catch {
    return {};
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstString(source: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function extractStationRows(body: JsonRecord) {
  const data = body.data;
  if (Array.isArray(data)) {
    return data.map(asRecord);
  }

  const nested = asRecord(data);
  for (const candidate of [nested.data, nested.records, nested.content, body.records]) {
    if (Array.isArray(candidate)) {
      return candidate.map(asRecord);
    }
  }

  return [];
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const origin = (process.env.SOLARMAN_WEB_ORIGIN || 'https://home.solarmanpv.com').replace(
    /\/$/,
    '',
  );
  const system = (process.env.SOLARMAN_WEB_SYSTEM_CODE || 'SOLARMAN').trim();
  const area = (process.env.SOLARMAN_WEB_DEFAULT_AREA || 'AS').trim().toUpperCase();
  const locale = (process.env.SOLARMAN_WEB_LOCALE || 'en').trim();
  const clientVersion = (process.env.SOLARMAN_WEB_CLIENT_VERSION || 'web').trim();

  let refreshToken = await readSecret('Paste refresh token (hidden, never stored): ');
  if (!refreshToken) {
    throw new Error('Refresh token is required.');
  }
  const expectedPlantMarker = (await readText('Expected plant name marker (optional): ')).toLowerCase();

  let accessToken = '';
  try {
    const refreshResponse = await fetchWithTimeout(`${origin}/oauth2-s/oauth/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: 'test',
        system,
        area,
        origin_id: '',
      }).toString(),
    });
    const refreshBody = await readJson(refreshResponse);
    accessToken = firstString(refreshBody, ['access_token']);

    console.log(`Refresh HTTP: ${refreshResponse.status}`);
    console.log(`Access token received: ${accessToken ? 'yes' : 'no'}`);
    console.log(
      `Rotated refresh token received: ${firstString(refreshBody, ['refresh_token']) ? 'yes' : 'no'}`,
    );

    if (!refreshResponse.ok || !accessToken) {
      console.log('Outcome 1: NOT PROVEN (refresh was rejected or returned no access token).');
      process.exitCode = 2;
      return;
    }

    const stationUrl = new URL(`${origin}/maintain-s/operating/station/search`);
    stationUrl.searchParams.set('order.direction', 'DESC');
    stationUrl.searchParams.set('order.property', 'id');
    stationUrl.searchParams.set('page', '1');
    stationUrl.searchParams.set('size', '200');

    const stationResponse = await fetchWithTimeout(stationUrl.toString(), {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Origin: origin,
        Referer: `${origin}/`,
        'log-platform-code': `${system}_INTELLGENT`,
        'log-channel': 'Web',
        'log-client-version': clientVersion,
        'log-area': area,
        'log-lan': locale,
      },
      body: '{}',
    });
    const stationBody = await readJson(stationResponse);
    const stations = extractStationRows(stationBody);
    const expectedPlantFound = expectedPlantMarker
      ? stations.some((station) =>
          firstString(station, ['name', 'stationName']).toLowerCase().includes(expectedPlantMarker),
        )
      : stations.length > 0;

    console.log(`Station search HTTP: ${stationResponse.status}`);
    console.log(`Station rows returned: ${stations.length}`);
    console.log(`Expected plant matched: ${expectedPlantFound ? 'yes' : 'no'}`);

    if (stationResponse.ok && expectedPlantFound) {
      console.log('Outcome 1: PROVEN on this machine without browser cookies.');
      return;
    }

    console.log('Outcome 1: NOT PROVEN (the refreshed token did not pass station discovery).');
    process.exitCode = 3;
  } finally {
    refreshToken = '';
    accessToken = '';
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'SOLARMAN refresh decision test failed.');
  process.exitCode = 1;
});
