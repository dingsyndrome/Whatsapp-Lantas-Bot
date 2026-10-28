-- CreateTable
CREATE TABLE "Personnel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "no" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "rank" TEXT,
    "nrp" TEXT,
    "jabatan" TEXT,
    "phone" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'SATLANTAS',
    "category" TEXT NOT NULL DEFAULT 'ANGGOTA',
    "sandi" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'import',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Personnel_name_idx" ON "Personnel"("name");

-- CreateIndex
CREATE INDEX "Personnel_nrp_idx" ON "Personnel"("nrp");

-- CreateIndex
CREATE INDEX "Personnel_phone_idx" ON "Personnel"("phone");

-- CreateIndex
CREATE INDEX "Personnel_category_idx" ON "Personnel"("category");

-- CreateIndex
CREATE INDEX "Personnel_active_idx" ON "Personnel"("active");

-- AlterTable
ALTER TABLE "BotConfig" ADD COLUMN "officerSandiMap" TEXT NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "TimemarkPhoto" ADD COLUMN "isSupervision" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TimemarkPhoto" ADD COLUMN "supervisorSandi" TEXT;
ALTER TABLE "TimemarkPhoto" ADD COLUMN "supervisorName" TEXT;
ALTER TABLE "TimemarkPhoto" ADD COLUMN "supervisorRank" TEXT;
ALTER TABLE "TimemarkPhoto" ADD COLUMN "supervisorPersonnelId" TEXT;

-- CreateIndex
CREATE INDEX "TimemarkPhoto_isSupervision_idx" ON "TimemarkPhoto"("isSupervision");
