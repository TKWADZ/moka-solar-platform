import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import {
  assertSemsPlusCaptureHasNoAuthArtifacts,
  mapSemsPlusVisibleReport,
  parseSemsPlusApprovedSystemLinks,
  SemsPlusVisiblePlantReport,
  toSemsPlusOperationalImportRow,
} from './sems-plus-visible-report.mapper';

type CaptureDocument = {
  capturedAt?: unknown;
  period?: unknown;
  timeZone?: unknown;
  plants?: unknown[];
};

function main() {
  const [, , inputArg, outputArg, systemLinksArg] = process.argv;
  if (!inputArg) {
    throw new Error(
      'Usage: npm run sems-plus:prepare-import -- <capture.json> [preview.xlsx] [system-links.json]',
    );
  }

  const inputPath = path.resolve(inputArg);
  const outputPath = path.resolve(
    outputArg || inputPath.replace(/\.json$/i, '') + '-moka-preview.xlsx',
  );
  const document = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as CaptureDocument;
  assertSemsPlusCaptureHasNoAuthArtifacts(document);
  const approvedLinks = systemLinksArg
    ? parseSemsPlusApprovedSystemLinks(
        JSON.parse(fs.readFileSync(path.resolve(systemLinksArg), 'utf8')),
      )
    : new Map();

  if (!Array.isArray(document.plants) || !document.plants.length) {
    throw new Error('SEMS+ capture must include a non-empty plants array.');
  }

  const previews = document.plants.map((plant) =>
    mapSemsPlusVisibleReport({
      ...(plant as SemsPlusVisiblePlantReport),
      capturedAt: (plant as SemsPlusVisiblePlantReport).capturedAt ?? document.capturedAt,
      period: (plant as SemsPlusVisiblePlantReport).period ?? document.period,
      timeZone: (plant as SemsPlusVisiblePlantReport).timeZone ?? document.timeZone,
    }),
  );
  const preparedRows = previews.map((preview) => {
    const approvedLink = preview.stationId
      ? approvedLinks.get(preview.stationId)
      : undefined;
    const importRow = toSemsPlusOperationalImportRow(preview, approvedLink);
    const warnings = [...preview.warnings];
    if (!preview.stationId) {
      warnings.push('MISSING_STATION_ID');
    } else if (!approvedLink) {
      warnings.push('SYSTEM_LINK_REQUIRED');
    }

    return { preview, approvedLink, importRow, warnings };
  });
  const importRows = preparedRows
    .map(({ importRow }) => importRow)
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const reviewRows = preparedRows
    .filter(({ importRow }) => !importRow)
    .map(({ preview, approvedLink, warnings }) => ({
      plantName: preview.plantName,
      stationId: preview.stationId || '',
      systemCode: approvedLink?.systemCode || '',
      period: preview.periodLabel,
      providerStatus: preview.providerStatus || '',
      pvGenerationKwh: preview.pvGenerationKwh ?? '',
      warnings: warnings.join(', '),
    }));
  const dailyRows = previews.flatMap((preview) =>
    preview.dailyGenerationKwh.map((point) => ({
      plantName: preview.plantName,
      stationId: preview.stationId || '',
      date: point.date,
      pvGenerationKwh: point.value ?? '',
      importEligible: preview.importEligible ? 'YES' : 'NO',
    })),
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(importRows),
    'Import ready',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(reviewRows),
    'Needs review',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(dailyRows),
    'Daily debug',
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  XLSX.writeFile(workbook, outputPath);

  console.log(
    JSON.stringify(
      {
        outputPath,
        totalPlants: previews.length,
        importReady: importRows.length,
        needsReview: reviewRows.length,
        approvedSystemLinks: approvedLinks.size,
        databaseWrites: false,
      },
      null,
      2,
    ),
  );
}

main();
