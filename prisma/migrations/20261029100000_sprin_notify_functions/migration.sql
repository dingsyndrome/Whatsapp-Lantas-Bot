-- AlterTable BotConfig: preferensi notifikasi per fungsi kepolisian
ALTER TABLE "BotConfig" ADD COLUMN "sprinNotifyMode" TEXT NOT NULL DEFAULT 'review';
ALTER TABLE "BotConfig" ADD COLUMN "sprinNotifyDefaultFunctions" TEXT NOT NULL DEFAULT '["SATLANTAS"]';
ALTER TABLE "BotConfig" ADD COLUMN "sprinNotifyExcludePerwira" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BotConfig" ADD COLUMN "sprinNotifyTemplate" TEXT NOT NULL DEFAULT '';

-- CreateTable: daftar fungsi kepolisian yang bisa dipilih admin
CREATE TABLE "NotificationFunction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "excludePerwira" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "NotificationFunction_code_key" ON "NotificationFunction"("code");
CREATE INDEX "NotificationFunction_active_idx" ON "NotificationFunction"("active");

-- CreateTable: draf/riwayat notifikasi per Sprin
CREATE TABLE "SprinNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sprinId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "functionCodes" TEXT NOT NULL DEFAULT '["SATLANTAS"]',
    "excludePerwira" BOOLEAN NOT NULL DEFAULT true,
    "template" TEXT,
    "analysis" TEXT NOT NULL DEFAULT '{}',
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewReasons" TEXT NOT NULL DEFAULT '[]',
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "sentAt" DATETIME,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SprinNotification_sprinId_fkey" FOREIGN KEY ("sprinId") REFERENCES "Sprin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SprinNotification_sprinId_key" ON "SprinNotification"("sprinId");
CREATE INDEX "SprinNotification_status_idx" ON "SprinNotification"("status");

-- Seed fungsi awal: hanya Satlantas yang sudah memiliki database nomor HP.
INSERT INTO "NotificationFunction" ("id", "code", "name", "keywords", "excludePerwira", "active", "sortOrder", "createdAt", "updatedAt")
VALUES (
    'nf_satlantas',
    'SATLANTAS',
    'Satlantas',
    '["SATLANTAS","TURJAGWALI","REGIDENT","KAMSEL","GAKKUM","PATWAL"]',
    true,
    true,
    10,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
