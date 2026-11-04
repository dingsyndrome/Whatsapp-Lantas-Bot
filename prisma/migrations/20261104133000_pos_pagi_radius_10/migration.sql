-- Toleransi titik pos pagi diperketat menjadi 10 meter (GPS Timemark).
-- Hanya mengubah nilai default lama 100 m; nilai yang sudah disesuaikan admin
-- tidak disentuh.
UPDATE "PosPagi" SET "radiusMeters" = 10 WHERE "radiusMeters" = 100;
