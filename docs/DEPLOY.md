# Panduan Deploy SIGAP

Dokumen ini merangkum cara menjalankan SIGAP di komputer kantor dan
membukanya dari perangkat lain (LAN maupun internet).

## 1. Menjalankan di server

```powershell
cd sigap
pnpm install            # sekali saja
pnpm build              # setiap ada perubahan kode
.\start-prod.ps1        # produksi: UI + API pada satu port
```

Skrip menampilkan alamat yang bisa dipakai:

```
Lokal    : http://localhost:3000
Jaringan : http://<ip-laptop>:3000
```

Cek cepat: `http://localhost:3000/api/health` → `{ "status": "ok" }`.

## 2. Akses dari perangkat lain (jaringan kantor)

1. Cari IP laptop: `ipconfig` → bagian Wi-Fi → IPv4 (mis. `192.168.110.149`).
2. Buka `http://<ip>:3000` dari HP/komputer lain di Wi-Fi yang sama.

Bila tidak bisa padahal server hidup:

- Jaringan kantor mungkin memakai **AP/client isolation** (perangkat tidak boleh
  saling bicara) → gunakan cara pada bagian 3, atau minta admin jaringan.
- Windows Firewall: aturan bawaan `Node.js JavaScript Runtime` sudah
  mengizinkan `C:\Program Files\nodejs\node.exe` pada profil Public. Pastikan
  server dijalankan dengan executable tersebut.

## 3. Akses dari luar kantor (data seluler / internet)

Tidak perlu membuka port router. Gunakan Cloudflare Tunnel (koneksi keluar):

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3000
```

Akan muncul URL publik `https://<acak>.trycloudflare.com`.

Catatan:

- URL quick tunnel **berubah** setiap cloudflared dijalankan ulang.
- Untuk alamat tetap, buat **named tunnel** dengan domain sendiri di akun
  Cloudflare, lalu jalankan sebagai service.
- URL publik wajib dilindungi login (lihat bagian 4).

## 4. Login (Basic Auth)

Tambahkan di `.env`, lalu restart server:

```
APP_USER="admin"
APP_PASS="sandi-kuat-anda"
```

Middleware aktif hanya jika **kedua** nilai diisi, dan melindungi seluruh rute
termasuk `/api/health`. Tanpa itu, siapa pun yang tahu URL bisa membaca data
personel dan mengirim pesan WhatsApp dari nomor bot.

## 5. WhatsApp

- Driver yang dipakai: **Baileys** (`WA_DRIVER=baileys`), tanpa Chromium.
- Login lewat **Settings → Koneksi**: scan QR atau pakai kode pairing nomor HP.
- Sesi tersimpan di `data/wa-session/baileys` — jangan dihapus agar tidak scan ulang.
- Bila koneksi terputus, server menyambung ulang otomatis (±2,5 detik).

## 6. Backup & pemeliharaan

| Yang dibackup | Isi |
|---|---|
| `data/app.db` | Seluruh data: Sprin, personel, foto, link, pengaturan |
| `data/wa-session/` | Sesi WhatsApp |
| `storage/` | Berkas foto Timemark dan dokumen Sprin |

Rutin yang disarankan:

```powershell
# contoh backup harian
Copy-Item data\app.db "backup\app-$(Get-Date -f yyyyMMdd).db"
```

Perintah operasional lain:

```powershell
pnpm test          # 49 tes
pnpm typecheck     # cek tipe
pnpm db:studio     # inspeksi database
pnpm db:seed       # isi ulang data demo
```

## 7. Yang tidak boleh masuk Git

`.env` (kredensial), `data/` (database & sesi), `storage/` (media),
`node_modules/`, `.venv-ocr/`, `test-output/`. Semua sudah ada di `.gitignore`.
