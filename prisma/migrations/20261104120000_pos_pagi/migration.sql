-- Titik pos pagi dan anggota yang mengawaki.
CREATE TABLE "PosPagi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 100,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'import',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "PosPagi_name_key" ON "PosPagi"("name");
CREATE INDEX "PosPagi_active_idx" ON "PosPagi"("active");
CREATE INDEX "PosPagi_order_idx" ON "PosPagi"("order");

CREATE TABLE "PosPagiAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "posId" TEXT,
    "personnelId" TEXT,
    "no" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rank" TEXT,
    "jabatan" TEXT,
    "role" TEXT NOT NULL DEFAULT 'ANGGOTA',
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchMethod" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PosPagiAssignment_posId_fkey" FOREIGN KEY ("posId") REFERENCES "PosPagi" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PosPagiAssignment_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "PosPagiAssignment_posId_active_idx" ON "PosPagiAssignment"("posId", "active");
CREATE INDEX "PosPagiAssignment_personnelId_idx" ON "PosPagiAssignment"("personnelId");
