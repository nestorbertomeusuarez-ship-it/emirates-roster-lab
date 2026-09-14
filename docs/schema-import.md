# Manual schedule import format

Phase 1 supports two equivalent manual import formats for flight schedules:
CSV (for spreadsheet-friendly editing) and JSON (for programmatic/seed use).
Both are validated row-by-row: an invalid row produces an `error` issue and
is skipped, it never aborts the whole import.

## CSV format

Used by `manualCsvSource` (`npm run ingest:csv -- --file <path>`). Columns,
in order, with a header row required:

| Column            | Type                       | Example         | Required? |
|-------------------|----------------------------|------------------|-----------|
| `number`          | string                     | `EK001`          | yes |
| `dep_iata`        | 3 uppercase letters (IATA) | `DXB`            | yes |
| `arr_iata`        | 3 uppercase letters (IATA) | `LHR`            | yes |
| `std_utc`         | `HH:MM` (24h, UTC)         | `07:50`          | yes |
| `sta_utc`         | `HH:MM` (24h, UTC)         | `15:25`          | yes |
| `advertised_type` | string                     | `A380`           | yes |
| `observed_type`   | string                     | `A380`           | no (blank if unknown) |
| `confidence`      | `CONFIRMED`\|`ADVERTISED`\|`UNKNOWN` | `CONFIRMED` | no (see default rules below) |
| `days_of_week`    | 7 chars of `0`/`1`, Mon..Sun | `1111111`      | yes |
| `effective_from`  | `YYYY-MM-DD`               | `2026-03-01`     | yes |
| `effective_to`    | `YYYY-MM-DD`               | `2026-03-31`     | yes |
| `notes`           | string (stored as `sourceRef`) | `confirmed rotation` | no |

Notes:
- `arrivalDayOffset` is **not** a column — it's inferred automatically: if
  `sta_utc` (as a clock time) is earlier than `std_utc`, the flight is
  assumed to arrive the next UTC day (`arrivalDayOffset = 1`). This is safe
  because no single leg in this app spans more than one day.
- **Confidence default rules** (see `resolveConfidence` in
  `src/ingest/sources/manualShared.ts`):
  - no `observed_type` given → `ADVERTISED`
  - `observed_type` given and `confidence` left blank → `CONFIRMED`
  - `confidence` given explicitly → always wins over the above
- An `advertised_type`/`observed_type` not in `KNOWN_AIRCRAFT_TYPES`
  (`src/ingest/data/aircraftTypes.ts`) produces a `warning` issue, not an
  error — the row is still imported.

### Worked example (CSV)

```csv
number,dep_iata,arr_iata,std_utc,sta_utc,advertised_type,observed_type,confidence,days_of_week,effective_from,effective_to,notes
EK001,DXB,LHR,07:50,15:25,A380,A380,CONFIRMED,1111111,2026-03-01,2026-03-31,confirmed rotation
```

See `data/examples/sample-schedule.csv` for a runnable sample.

## JSON format

Used by `manualJsonSource` (`npm run ... -- --source manual-json --file
<path>`, or in-memory via `manualJsonSource.fetch({}, records)` — used
directly by `prisma/seed.ts`). Input is a JSON array of objects shaped like
the `RawFlightRecord` TypeScript interface (`src/ingest/types.ts`), camelCase:

```json
[
  {
    "number": "EK001",
    "depIata": "DXB",
    "arrIata": "LHR",
    "stdUTCMin": 470,
    "staUTCMin": 925,
    "arrivalDayOffset": 0,
    "advertisedType": "A380",
    "observedType": "A380",
    "confidence": "CONFIRMED",
    "daysOfWeek": "1111111",
    "effectiveFrom": "2026-03-01",
    "effectiveTo": "2026-03-31",
    "sourceRef": "confirmed rotation"
  }
]
```

Field reference:

| Field              | Type   | Notes |
|--------------------|--------|-------|
| `number`           | string | required |
| `depIata`/`arrIata`| string | required, 3-letter IATA |
| `stdUTCMin`/`staUTCMin` | number | required, minutes since UTC midnight (0-1439) |
| `arrivalDayOffset` | number | required, `0` same UTC day, `1` next UTC day, etc. — **not inferred** in the JSON path, unlike CSV; the caller must compute it |
| `advertisedType`   | string | required |
| `observedType`     | string | optional |
| `confidence`       | `CONFIRMED`\|`ADVERTISED`\|`UNKNOWN` | optional, same default rules as CSV |
| `daysOfWeek`       | string | required, 7 chars of `0`/`1` |
| `effectiveFrom`/`effectiveTo` | string | required, `YYYY-MM-DD` |
| `sourceRef`        | string | optional |

The seed schedule (`prisma/seed-data/dxb-seed-schedule.json`) is a real
example of this format.
