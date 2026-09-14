-- CreateTable
CREATE TABLE "Airport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "iata" TEXT NOT NULL,
    "icao" TEXT,
    "name" TEXT,
    "lat" REAL NOT NULL,
    "lon" REAL NOT NULL,
    "tz" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Flight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "depAirportId" TEXT NOT NULL,
    "arrAirportId" TEXT NOT NULL,
    "stdUTCMin" INTEGER NOT NULL,
    "staUTCMin" INTEGER NOT NULL,
    "arrivalDayOffset" INTEGER NOT NULL DEFAULT 0,
    "blockTimeMin" INTEGER NOT NULL,
    "advertisedType" TEXT NOT NULL,
    "observedType" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'ADVERTISED',
    "daysOfWeek" TEXT NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Flight_depAirportId_fkey" FOREIGN KEY ("depAirportId") REFERENCES "Airport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Flight_arrAirportId_fkey" FOREIGN KEY ("arrAirportId") REFERENCES "Airport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Airport_iata_key" ON "Airport"("iata");

-- CreateIndex
CREATE UNIQUE INDEX "Airport_icao_key" ON "Airport"("icao");

-- CreateIndex
CREATE INDEX "Flight_number_idx" ON "Flight"("number");

-- CreateIndex
CREATE INDEX "Flight_depAirportId_arrAirportId_idx" ON "Flight"("depAirportId", "arrAirportId");

-- CreateIndex
CREATE INDEX "Flight_effectiveFrom_effectiveTo_idx" ON "Flight"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "Flight_confidence_idx" ON "Flight"("confidence");

-- CreateIndex
CREATE UNIQUE INDEX "Flight_number_depAirportId_arrAirportId_stdUTCMin_daysOfWeek_effectiveFrom_effectiveTo_source_key" ON "Flight"("number", "depAirportId", "arrAirportId", "stdUTCMin", "daysOfWeek", "effectiveFrom", "effectiveTo", "source");
