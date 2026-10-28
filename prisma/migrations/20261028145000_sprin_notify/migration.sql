-- AlterTable
ALTER TABLE "BotConfig" ADD COLUMN "notifyOnSprinUpload" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SprinPersonnel" ADD COLUMN "notifiedAt" DATETIME;
