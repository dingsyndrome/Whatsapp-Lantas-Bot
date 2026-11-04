-- Penanda agar data POS PAGI awal hanya di-seed sekali; impor admin berikutnya
-- tidak ditimpa saat container restart.
ALTER TABLE "BotConfig" ADD COLUMN "posPagiSeedVersion" TEXT NOT NULL DEFAULT '';
