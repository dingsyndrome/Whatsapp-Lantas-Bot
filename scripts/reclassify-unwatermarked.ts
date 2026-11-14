/**
 * Rapikan foto lama yang bukan foto Timemark.
 *
 * Foto Timemark selalu memuat tanggal, nama satuan, dan alamat. Tangkapan layar
 * (survei KiPERMAS, laporan K3I, dsb.) hanya memuat jam dari antarmuka HP dan
 * bisa terlanjur dikategorikan kegiatan (mis. PATROLI karena jam 21:xx).
 *
 * Kriteria:
 *  1. tidak punya tanggal, satuan, dan alamat,
 *  2. bukan arsip,
 *  3. caption kosong atau memuat penanda tangkapan layar/survei.
 *
 * Jalankan: npx tsx scripts/reclassify-unwatermarked.ts [--apply]
 */
import { prisma } from '../server/lib/prisma.js';

const SCREENSHOT_MARKERS =
  /kipermas|kuesioner|kritik dan persepsi|terima kasih atas partisipasi|survei|survey|screenshot|tangkapan/i;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const candidates = await prisma.timemarkPhoto.findMany({
    where: {
      capturedAt: null,
      unitName: null,
      address: null,
      status: { not: 'archived' },
      turjawaliType: { not: 'LAINNYA' }
    },
    select: { id: true, turjawaliType: true, senderName: true, caption: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  });

  const selected = candidates.filter((row) => {
    const caption = (row.caption ?? '').trim();
    if (!caption) return true;
    return SCREENSHOT_MARKERS.test(caption);
  });

  console.log(`Kandidat (tanpa tanggal/satuan/alamat): ${candidates.length}`);
  console.log(`Akan dipindahkan ke LAINNYA: ${selected.length} (apply: ${apply})`);

  const byType = new Map<string, number>();
  for (const row of selected) byType.set(row.turjawaliType, (byType.get(row.turjawaliType) ?? 0) + 1);
  for (const [type, count] of byType) console.log(`  ${type}: ${count}`);

  for (const row of selected.slice(0, 20)) {
    console.log(
      `  ${row.createdAt.toISOString().slice(0, 16)} | ${row.turjawaliType} | ${row.senderName} | ${(row.caption ?? '(tanpa caption)').slice(0, 30)}`
    );
  }

  if (!apply || selected.length === 0) return;

  const result = await prisma.timemarkPhoto.updateMany({
    where: { id: { in: selected.map((row) => row.id) } },
    data: {
      turjawaliType: 'LAINNYA',
      matchStatus: 'UNMATCHED',
      matchScore: 0,
      matchedPersonnelId: null,
      matchNotes: 'Tangkapan layar tanpa watermark Timemark; dikategorikan Lainnya.'
    }
  });
  console.log(`Selesai: ${result.count} foto dipindahkan ke LAINNYA`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
