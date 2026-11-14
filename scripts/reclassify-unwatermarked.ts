/**
 * Rapikan foto lama yang tidak memiliki watermark Timemark.
 *
 * Foto tanpa jam & tanggal (tangkapan layar survei, bukti pengiriman laporan,
 * dsb.) sebelumnya bisa terlanjur masuk kategori kegiatan karena kata kunci di
 * caption. Skrip ini memindahkannya ke kategori LAINNYA dan menandai bahwa
 * klasifikasinya bukan kegiatan Turjawali.
 *
 * Jalankan: npx tsx scripts/reclassify-unwatermarked.ts [--dry-run]
 */
import { prisma } from '../server/lib/prisma.js';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const candidates = await prisma.timemarkPhoto.findMany({
    where: {
      timeText: null,
      capturedAt: null,
      turjawaliType: { not: 'LAINNYA' }
    },
    select: { id: true, turjawaliType: true, senderName: true }
  });

  console.log(`Kandidat: ${candidates.length} foto (dry-run: ${dryRun})`);
  const byType = new Map<string, number>();
  for (const row of candidates) {
    byType.set(row.turjawaliType, (byType.get(row.turjawaliType) ?? 0) + 1);
  }
  for (const [type, count] of byType) console.log(`  ${type}: ${count}`);

  if (dryRun || candidates.length === 0) return;

  const result = await prisma.timemarkPhoto.updateMany({
    where: { id: { in: candidates.map((row) => row.id) } },
    data: {
      turjawaliType: 'LAINNYA',
      matchStatus: 'UNMATCHED',
      matchScore: 0,
      matchedPersonnelId: null,
      matchNotes: 'Tanpa watermark Timemark (jam/tanggal tidak terbaca); dikategorikan Lainnya.'
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
