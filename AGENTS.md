# Aturan kerja di repo ini (WAJIB dibaca agent & kontributor)

Repo ini adalah **produksi** SIGAP — WhatsApp Command Center untuk rekapitulasi
kegiatan Polantas.

- Bot produksi berjalan di **VPS `43.134.7.167`** (Docker, port 3000).
- Nomor WhatsApp produksi: **`6282181281252`** (driver **Baileys**).

## 🚫 Jangan pernah menjalankan bot di mesin lokal

**DILARANG** menjalankan, tanpa izin eksplisit pemilik repo:

```bash
pnpm dev          # tsx watch + vite
pnpm start        # tsx server/index.ts
docker compose up # container lokal
```

Alasannya: WhatsApp mengizinkan beberapa perangkat tertaut pada nomor yang sama.
Kalau bot lokal ikut menyala, terjadi **dua instance aktif** yang berakibat:

1. Balasan otomatis terkirim **dua kali** ke grup.
2. Data terpecah ke dua database (`laptop/data/app.db` vs `VPS/data/app.db`).
3. Sesi bisa saling logout.

Kalau memang perlu menyalakan server lokal untuk debugging UI, syaratnya:

- `WA_DRIVER="mock"` **dan** driver di database (`botConfig.waDriver`) juga `mock`.
- Port selain `3000` (mis. `PORT=3101`).
- Folder `data/wa-session/baileys` **tidak ada** (jangan scan QR dari lokal).

## ✅ Yang boleh dilakukan agent

- Mengedit kode di `server/`, `src/`, `shared/`, `prisma/`, `scripts/`, `tests/`.
- Menjalankan tanpa menyalakan bot:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
  - `pnpm db:generate` / `pnpm db:deploy` (dengan database uji sendiri)
- Commit dan `git push origin main` untuk memicu deploy.

## 🔒 File & data yang tidak boleh diganggu

- `data/` — berisi `app.db` (SQLite) dan `data/wa-session/` (sesi WhatsApp).
- `storage/` — foto timemark, dokumen sprin.
- `.env` — kredensial; **tidak boleh** di-commit (sudah di `.gitignore`).

Jangan menjalankan `docker compose down -v`, `rm -rf data`, atau sejenisnya.

## 🚀 Alur deploy

```
git push origin main
   → GitHub Actions "CI"      (typecheck · test · build · smoke)
   → GitHub Actions "Deploy"  (hanya bila CI sukses)
   → SSH ke VPS: git reset --hard origin/main && docker compose up -d --build
   → health check http://43.134.7.167:3000/api/health
```

Deploy tidak menyentuh `data/` maupun `storage/`, jadi sesi WhatsApp tetap
tersimpan dan **tidak perlu scan QR ulang**.

Kalau CI gagal, deploy otomatis dibatalkan. Untuk deploy darurat yang tetap
ingin dijalankan, gunakan tab **Actions → Deploy → Run workflow**.

## 🧪 Menambah fitur

1. Edit kode + tambah/ubah test bila relevan.
2. `pnpm typecheck && pnpm test` sampai hijau.
3. Commit, lalu `git push origin main`.
4. Pantau tab **Actions**; deploy otomatis setelah CI hijau.
5. Verifikasi di `http://43.134.7.167:3000`.
