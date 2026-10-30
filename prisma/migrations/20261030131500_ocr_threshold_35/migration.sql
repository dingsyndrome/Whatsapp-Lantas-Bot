-- Turunkan ambang review OCR lama (default 50) ke 35.
-- Hanya menyentuh nilai default lama; ambang yang sudah diubah admin dibiarkan.
UPDATE "BotConfig" SET "minOcrConfidence" = 35 WHERE "minOcrConfidence" = 50;
