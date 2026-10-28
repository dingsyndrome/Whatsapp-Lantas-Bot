-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BotConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "botName" TEXT NOT NULL DEFAULT 'SIGAP Command Center',
    "waDriver" TEXT NOT NULL DEFAULT 'mock',
    "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoReplyTemplate" TEXT NOT NULL DEFAULT 'Terima kasih {name} 🙏
Laporan Anda sudah diterima SIGAP dan sedang diverifikasi otomatis.

{summary}',
    "timemarkPrompt" TEXT NOT NULL DEFAULT '',
    "documentPrompt" TEXT NOT NULL DEFAULT '',
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiBaseUrl" TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
    "aiApiKey" TEXT NOT NULL DEFAULT '',
    "aiModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleTime" TEXT NOT NULL DEFAULT '17:00',
    "scheduleTimezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "scheduleGroupJid" TEXT NOT NULL DEFAULT '',
    "scheduleGroupName" TEXT NOT NULL DEFAULT '',
    "minOcrConfidence" INTEGER NOT NULL DEFAULT 50,
    "turjawaliMatchingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "turjawaliKeywords" TEXT NOT NULL DEFAULT '',
    "gaturMorningStart" TEXT NOT NULL DEFAULT '06:00',
    "gaturMorningEnd" TEXT NOT NULL DEFAULT '08:00',
    "gaturEveningStart" TEXT NOT NULL DEFAULT '16:00',
    "gaturEveningEnd" TEXT NOT NULL DEFAULT '17:30',
    "patrolNightStart" TEXT NOT NULL DEFAULT '21:00',
    "patrolNightEnd" TEXT NOT NULL DEFAULT '04:00',
    "matchTimeToleranceMinutes" INTEGER NOT NULL DEFAULT 60,
    "matchLocationRadiusMeters" INTEGER NOT NULL DEFAULT 500,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BotConfig" ("aiApiKey", "aiBaseUrl", "aiEnabled", "aiModel", "autoReplyEnabled", "autoReplyTemplate", "botName", "createdAt", "documentPrompt", "id", "minOcrConfidence", "scheduleEnabled", "scheduleGroupJid", "scheduleGroupName", "scheduleTime", "scheduleTimezone", "timemarkPrompt", "updatedAt", "waDriver") SELECT "aiApiKey", "aiBaseUrl", "aiEnabled", "aiModel", "autoReplyEnabled", "autoReplyTemplate", "botName", "createdAt", "documentPrompt", "id", "minOcrConfidence", "scheduleEnabled", "scheduleGroupJid", "scheduleGroupName", "scheduleTime", "scheduleTimezone", "timemarkPrompt", "updatedAt", "waDriver" FROM "BotConfig";
DROP TABLE "BotConfig";
ALTER TABLE "new_BotConfig" RENAME TO "BotConfig";
CREATE TABLE "new_TimemarkPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'whatsapp',
    "messageId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderNumber" TEXT NOT NULL,
    "groupName" TEXT,
    "imagePath" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "caption" TEXT,
    "capturedAt" DATETIME,
    "timeText" TEXT,
    "dateText" TEXT,
    "address" TEXT,
    "village" TEXT,
    "district" TEXT,
    "regency" TEXT,
    "province" TEXT,
    "unitName" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "coordinateText" TEXT,
    "rawText" TEXT NOT NULL DEFAULT '',
    "confidence" REAL NOT NULL DEFAULT 0,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'parsed',
    "turjawaliType" TEXT NOT NULL DEFAULT 'LAINNYA',
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchScore" INTEGER NOT NULL DEFAULT 0,
    "matchedPersonnelId" TEXT,
    "matchNotes" TEXT NOT NULL DEFAULT '',
    "senderCaption" TEXT,
    "sprinId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimemarkPhoto_matchedPersonnelId_fkey" FOREIGN KEY ("matchedPersonnelId") REFERENCES "SprinPersonnel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimemarkPhoto_sprinId_fkey" FOREIGN KEY ("sprinId") REFERENCES "Sprin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TimemarkPhoto" ("address", "aiUsed", "caption", "capturedAt", "confidence", "coordinateText", "createdAt", "dateText", "district", "groupName", "id", "imagePath", "latitude", "longitude", "messageId", "mimeType", "province", "rawText", "regency", "senderName", "senderNumber", "source", "sprinId", "status", "thumbnailPath", "timeText", "unitName", "village") SELECT "address", "aiUsed", "caption", "capturedAt", "confidence", "coordinateText", "createdAt", "dateText", "district", "groupName", "id", "imagePath", "latitude", "longitude", "messageId", "mimeType", "province", "rawText", "regency", "senderName", "senderNumber", "source", "sprinId", "status", "thumbnailPath", "timeText", "unitName", "village" FROM "TimemarkPhoto";
DROP TABLE "TimemarkPhoto";
ALTER TABLE "new_TimemarkPhoto" RENAME TO "TimemarkPhoto";
CREATE UNIQUE INDEX "TimemarkPhoto_messageId_key" ON "TimemarkPhoto"("messageId");
CREATE INDEX "TimemarkPhoto_createdAt_idx" ON "TimemarkPhoto"("createdAt");
CREATE INDEX "TimemarkPhoto_capturedAt_idx" ON "TimemarkPhoto"("capturedAt");
CREATE INDEX "TimemarkPhoto_senderNumber_idx" ON "TimemarkPhoto"("senderNumber");
CREATE INDEX "TimemarkPhoto_sprinId_idx" ON "TimemarkPhoto"("sprinId");
CREATE INDEX "TimemarkPhoto_turjawaliType_idx" ON "TimemarkPhoto"("turjawaliType");
CREATE INDEX "TimemarkPhoto_matchStatus_idx" ON "TimemarkPhoto"("matchStatus");
CREATE TABLE "new_Sprin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "about" TEXT,
    "dasar" TEXT,
    "untuk" TEXT,
    "activityDate" DATETIME,
    "timeText" TEXT,
    "place" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "signatory" TEXT,
    "signatoryRank" TEXT,
    "filePath" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "source" TEXT NOT NULL DEFAULT 'whatsapp',
    "rawText" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "turjawaliType" TEXT NOT NULL DEFAULT 'LAINNYA',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Sprin" ("about", "activityDate", "createdAt", "dasar", "fileName", "filePath", "id", "latitude", "longitude", "mimeType", "number", "place", "rawText", "signatory", "signatoryRank", "source", "status", "timeText", "untuk", "updatedAt") SELECT "about", "activityDate", "createdAt", "dasar", "fileName", "filePath", "id", "latitude", "longitude", "mimeType", "number", "place", "rawText", "signatory", "signatoryRank", "source", "status", "timeText", "untuk", "updatedAt" FROM "Sprin";
DROP TABLE "Sprin";
ALTER TABLE "new_Sprin" RENAME TO "Sprin";
CREATE UNIQUE INDEX "Sprin_number_key" ON "Sprin"("number");
CREATE INDEX "Sprin_activityDate_idx" ON "Sprin"("activityDate");
CREATE INDEX "Sprin_status_idx" ON "Sprin"("status");
CREATE INDEX "Sprin_turjawaliType_idx" ON "Sprin"("turjawaliType");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
