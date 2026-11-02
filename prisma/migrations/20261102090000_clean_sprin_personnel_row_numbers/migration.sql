-- Sebagian lampiran memakai dua kolom nomor ("1. 1. NAMA"). Parser lama
-- menyimpan angka kedua sebagai bagian nama sehingga notifikasi tidak bisa
-- mencocokkannya ke roster. Bersihkan data lama; parser baru sudah membuang
-- prefiks ini saat dokumen diimpor.
UPDATE "SprinPersonnel"
SET "name" = LTRIM(SUBSTR("name", INSTR("name", '.') + 1))
WHERE "name" GLOB '[0-9]*' AND INSTR("name", '.') > 0;

UPDATE "SprinPersonnel"
SET "name" = LTRIM(SUBSTR("name", INSTR("name", '.') + 1))
WHERE "name" GLOB '[0-9]*' AND INSTR("name", '.') > 0;
