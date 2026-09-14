import { PrismaClient } from '@prisma/client';
import { manualCsvSource } from '../src/ingest/sources/manualCsv';
import { manualJsonSource } from '../src/ingest/sources/manualJson';
import { aerodataboxSource } from '../src/ingest/sources/aerodatabox';
import { persistIngestResult } from '../src/ingest/writeToDb';
import type { ScheduleSource, ScheduleSourceParams } from '../src/ingest/types';

interface CliArgs {
  source: 'manual-csv' | 'manual-json' | 'aerodatabox';
  file?: string;
  routes?: Array<{ dep: string; arr: string }>;
  from?: string;
  to?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
      args[key] = value;
      if (value !== 'true') i += 1;
    }
  }

  const source = args.source as CliArgs['source'];
  if (source !== 'manual-csv' && source !== 'manual-json' && source !== 'aerodatabox') {
    throw new Error(
      `--source is required and must be one of: manual-csv, manual-json, aerodatabox (got: ${args.source ?? 'undefined'})`
    );
  }

  const routes = args.routes
    ? args.routes.split(',').map((pair) => {
        const [dep, arr] = pair.split('-');
        return { dep: dep.toUpperCase(), arr: arr.toUpperCase() };
      })
    : undefined;

  return {
    source,
    file: args.file,
    routes,
    from: args.from,
    to: args.to,
  };
}

function getSource(id: CliArgs['source']): ScheduleSource {
  switch (id) {
    case 'manual-csv':
      return manualCsvSource;
    case 'manual-json':
      return manualJsonSource;
    case 'aerodatabox':
      return aerodataboxSource;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const source = getSource(args.source);

  const available = await source.isAvailable();
  if (!available) {
    console.error(`Source "${source.id}" is not available (missing config/credentials).`);
    process.exitCode = 1;
    return;
  }

  const params: ScheduleSourceParams = {
    filePath: args.file,
    fromDate: args.from,
    toDate: args.to,
    routes: args.routes,
  };

  console.log(`Fetching from source: ${source.label} (${source.id})`);
  const result = await source.fetch(params);

  console.log(`Fetched ${result.flights.length} flight record(s), ${result.airports.length} airport(s).`);
  console.log(
    `Coverage: ${result.coverage.recordCount} records across ${result.coverage.routesCovered.length} route(s)` +
      (result.coverage.dateRangeFrom
        ? `, ${result.coverage.dateRangeFrom} to ${result.coverage.dateRangeTo}`
        : '') +
      `, ${result.coverage.confirmedTypeCount} CONFIRMED / ${result.coverage.advertisedOnlyCount} ADVERTISED-only.`
  );

  const prisma = new PrismaClient();
  let persisted;
  try {
    persisted = await persistIngestResult(result, prisma);
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `Persisted: ${persisted.airportsCreated} airport(s) created, ` +
      `${persisted.flightsCreated} flight(s) created, ${persisted.flightsUpdated} flight(s) updated.`
  );

  const allIssues = persisted.issues;
  if (allIssues.length > 0) {
    console.log(`Issues (${allIssues.length}):`);
    for (const issue of allIssues) {
      console.log(`  [${issue.level}] ${issue.message}`);
    }
  }

  const hasErrors = allIssues.some((issue) => issue.level === 'error');
  if (hasErrors) {
    console.error('Ingest completed with errors — exiting non-zero.');
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('Ingest CLI failed:', error);
  process.exitCode = 1;
});
