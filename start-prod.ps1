# Jalankan SIGAP dalam mode produksi (satu port: UI + API).
#
# Pemakaian:
#   .\start-prod.ps1              # port 3000
#   .\start-prod.ps1 -Port 8080   # port lain
#   .\start-prod.ps1 -Rebuild     # build ulang dulu (setelah ada perubahan kode)
#
# Catatan: tutup jendela ini = server berhenti. Untuk hidup otomatis,
# lihat bagian "Daftar sebagai tugas Windows" di README.

param(
  [int]$Port = 3000,
  [switch]$Rebuild
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$node = if (Test-Path 'C:\Program Files\nodejs\node.exe') {
  'C:\Program Files\nodejs\node.exe'
} else {
  (Get-Command node).Source
}

if ($Rebuild -or -not (Test-Path 'dist/index.html')) {
  Write-Host '› Build dashboard (vite + tsc)…' -ForegroundColor Cyan
  & $node 'node_modules\vite\bin\vite.js' build
}

$env:NODE_ENV = 'production'
$env:PORT = "$Port"

$ips = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress

Write-Host ''
Write-Host "  SIGAP berjalan pada port $Port" -ForegroundColor Green
Write-Host "  Lokal   : http://localhost:$Port"
foreach ($ip in $ips) {
  Write-Host "  Jaringan: http://${ip}:$Port"
}
Write-Host '  Hentikan: Ctrl+C'
Write-Host ''

& $node 'node_modules\tsx\dist\cli.mjs' 'server/index.ts'
