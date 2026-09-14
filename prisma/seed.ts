import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { buildResultFromRecords } from '../src/ingest/sources/manualJson';
import { persistIngestResult } from '../src/ingest/writeToDb';
import type { RawFlightRecord } from '../src/ingest/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main(): Promise<void> {
  const seedPath = join(__dirname, 'seed-data', 'dxb-seed-schedule.json');
  const rawJson = readFileSync(seedPath, 'utf-8');
  const records = JSON.parse(rawJson) as RawFlightRecord[];

  // Reuse the exact same validation/normalization pipeline as the manual
  // JSON ingest source, tagged as SEED instead of MANUAL_JSON.
  const ingestResult = buildResultFromRecords(records, 'SEED');

  if (ingestResult.issues.some((i) => i.level === 'error')) {
    console.error('Seed data has validation errors:');
    for (const issue of ingestResult.issues.filter((i) => i.level === 'error')) {
      console.error(`  [error] ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const persisted = await persistIngestResult(ingestResult, prisma);

    console.log('Seed complete.');
    console.log(`  Airports created: ${persisted.airportsCreated}`);
    console.log(`  Flights created:  ${persisted.flightsCreated}`);
    console.log(`  Flights updated:  ${persisted.flightsUpdated}`);
    console.log(
      `  Coverage: ${ingestResult.coverage.recordCount} records, ` +
        `${ingestResult.coverage.routesCovered.length} routes, ` +
        `${ingestResult.coverage.confirmedTypeCount} CONFIRMED, ` +
        `${ingestResult.coverage.advertisedOnlyCount} ADVERTISED-only`
    );

    const warnings = persisted.issues.filter((i) => i.level === 'warning');
    if (warnings.length > 0) {
      console.log(`  Warnings (${warnings.length}):`);
      for (const w of warnings) {
        console.log(`    [warning] ${w.message}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
