/**
 * Batas personel yang boleh dipakai untuk rekap/laporan Satlantas.
 * Polsek sering punya nama yang mirip dengan personel Satlantas; jabatan
 * "BA POLSEK ..." tidak boleh memenangkan pencocokan hanya karena namanya
 * lebih mirip.
 */
export function isSatlantasPersonnel(person: {
  name?: string | null;
  jabatan?: string | null;
  unit?: string | null;
}): boolean {
  const jabatan = (person.jabatan ?? '').toUpperCase();
  const unit = (person.unit ?? '').toUpperCase();

  // Personel yang jabatannya di Polsek bukan bagian rekap Satlantas, meskipun
  // kolom unit-nya kosong/default SATLANTAS.
  if (jabatan.includes('POLSEK')) return false;
  if (jabatan.includes('SATLANTAS') || jabatan.includes('POLANTAS')) return true;
  if (jabatan.includes('LANTAS')) return true;
  return unit.includes('SATLANTAS') || unit.includes('POLANTAS');
}
