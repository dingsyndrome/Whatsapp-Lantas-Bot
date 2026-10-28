-- CreateTable
CREATE TABLE "BotConfig" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MonitoredGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WhatsAppSession" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'runtime',
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "driver" TEXT NOT NULL DEFAULT 'mock',
    "phone" TEXT,
    "pushName" TEXT,
    "lastConnectedAt" DATETIME,
    "lastError" TEXT,
    "qrGeneratedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TimemarkPhoto" (
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
    "sprinId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimemarkPhoto_sprinId_fkey" FOREIGN KEY ("sprinId") REFERENCES "Sprin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sprin" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SprinPersonnel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sprinId" TEXT NOT NULL,
    "no" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rankNrp" TEXT,
    "rank" TEXT,
    "nrp" TEXT,
    "jabatan" TEXT,
    "penugasan" TEXT,
    "ket" TEXT,
    "page" INTEGER NOT NULL DEFAULT 1,
    "rawText" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SprinPersonnel_sprinId_fkey" FOREIGN KEY ("sprinId") REFERENCES "Sprin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LinkSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderNumber" TEXT NOT NULL,
    "groupName" TEXT,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Lainnya',
    "title" TEXT,
    "receivedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unchecked',
    "httpStatus" INTEGER,
    "verifiedAt" DATETIME,
    "sprinId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LinkSubmission_sprinId_fkey" FOREIGN KEY ("sprinId") REFERENCES "Sprin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "actor" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredGroup_jid_key" ON "MonitoredGroup"("jid");

-- CreateIndex
CREATE UNIQUE INDEX "TimemarkPhoto_messageId_key" ON "TimemarkPhoto"("messageId");

-- CreateIndex
CREATE INDEX "TimemarkPhoto_createdAt_idx" ON "TimemarkPhoto"("createdAt");

-- CreateIndex
CREATE INDEX "TimemarkPhoto_capturedAt_idx" ON "TimemarkPhoto"("capturedAt");

-- CreateIndex
CREATE INDEX "TimemarkPhoto_senderNumber_idx" ON "TimemarkPhoto"("senderNumber");

-- CreateIndex
CREATE INDEX "TimemarkPhoto_sprinId_idx" ON "TimemarkPhoto"("sprinId");

-- CreateIndex
CREATE UNIQUE INDEX "Sprin_number_key" ON "Sprin"("number");

-- CreateIndex
CREATE INDEX "Sprin_activityDate_idx" ON "Sprin"("activityDate");

-- CreateIndex
CREATE INDEX "Sprin_status_idx" ON "Sprin"("status");

-- CreateIndex
CREATE INDEX "SprinPersonnel_sprinId_no_idx" ON "SprinPersonnel"("sprinId", "no");

-- CreateIndex
CREATE INDEX "SprinPersonnel_penugasan_idx" ON "SprinPersonnel"("penugasan");

-- CreateIndex
CREATE INDEX "LinkSubmission_receivedAt_idx" ON "LinkSubmission"("receivedAt");

-- CreateIndex
CREATE INDEX "LinkSubmission_platform_idx" ON "LinkSubmission"("platform");

-- CreateIndex
CREATE INDEX "LinkSubmission_senderNumber_idx" ON "LinkSubmission"("senderNumber");

-- CreateIndex
CREATE INDEX "LinkSubmission_sprinId_idx" ON "LinkSubmission"("sprinId");

-- CreateIndex
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");

-- CreateIndex
CREATE INDEX "Activity_type_idx" ON "Activity"("type");
