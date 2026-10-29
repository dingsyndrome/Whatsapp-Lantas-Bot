-- AlterTable: pesan notifikasi yang diedit admin per anggota
ALTER TABLE "SprinNotification" ADD COLUMN "overrides" TEXT NOT NULL DEFAULT '{}';
