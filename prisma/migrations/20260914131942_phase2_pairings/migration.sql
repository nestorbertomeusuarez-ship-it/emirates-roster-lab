-- CreateTable
CREATE TABLE "FlightInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flightId" TEXT NOT NULL,
    "serviceDate" DATETIME NOT NULL,
    "depUTC" DATETIME NOT NULL,
    "arrUTC" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlightInstance_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pairing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fleetType" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "tripDays" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PairingLeg" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pairingId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "flightInstanceId" TEXT NOT NULL,
    "layoverMinutesBefore" INTEGER,
    CONSTRAINT "PairingLeg_pairingId_fkey" FOREIGN KEY ("pairingId") REFERENCES "Pairing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PairingLeg_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "FlightInstance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RosterMonth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RosterEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rosterMonthId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "dutyType" TEXT NOT NULL,
    "pairingId" TEXT,
    "spansDays" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RosterEntry_rosterMonthId_fkey" FOREIGN KEY ("rosterMonthId") REFERENCES "RosterMonth" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterEntry_pairingId_fkey" FOREIGN KEY ("pairingId") REFERENCES "Pairing" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FlightInstance_serviceDate_idx" ON "FlightInstance"("serviceDate");

-- CreateIndex
CREATE INDEX "FlightInstance_depUTC_idx" ON "FlightInstance"("depUTC");

-- CreateIndex
CREATE UNIQUE INDEX "FlightInstance_flightId_serviceDate_key" ON "FlightInstance"("flightId", "serviceDate");

-- CreateIndex
CREATE INDEX "Pairing_startDate_idx" ON "Pairing"("startDate");

-- CreateIndex
CREATE INDEX "PairingLeg_flightInstanceId_idx" ON "PairingLeg"("flightInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "PairingLeg_pairingId_sequence_key" ON "PairingLeg"("pairingId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "RosterMonth_year_month_key" ON "RosterMonth"("year", "month");

-- CreateIndex
CREATE INDEX "RosterEntry_pairingId_idx" ON "RosterEntry"("pairingId");

-- CreateIndex
CREATE UNIQUE INDEX "RosterEntry_rosterMonthId_date_key" ON "RosterEntry"("rosterMonthId", "date");
