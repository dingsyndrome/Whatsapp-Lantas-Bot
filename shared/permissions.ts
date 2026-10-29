export const PERMISSIONS = {
  'timemark.correct': 'Koreksi jam/tanggal Timemark',
  'timemark.category': 'Koreksi kategori Turjawali',
  'sprin.manage': 'Unggah / hapus Surat Perintah',
  'sprin.notify': 'Kirim notifikasi Sprin ke personel',
  'links.send': 'Kirim rekap link ke grup WhatsApp',
  'reports.send': 'Kirim rekap harian ke grup WhatsApp',
  'personnel.manage': 'Kelola data personel & sandi',
  'settings.read': 'Melihat pengaturan bot'
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export type AppRole = 'ADMIN' | 'MANAGER';

export const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: 'Admin (akses penuh)',
  MANAGER: 'Manajer (akses terbatas)'
};

export function parsePermissions(raw: string | null | undefined): Permission[] {
  if (!raw) return [];
  const known = new Set<string>(PERMISSION_KEYS);
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is Permission => known.has(value));
}

export function serializePermissions(values: readonly string[]): string {
  const known = new Set<string>(PERMISSION_KEYS);
  return [...new Set(values.filter((value) => known.has(value)))].join(',');
}

export function hasPermission(
  user: { role: string; permissions: string | readonly string[] } | null | undefined,
  permission: Permission
): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const list: readonly string[] =
    typeof user.permissions === 'string'
      ? parsePermissions(user.permissions)
      : user.permissions;
  return list.includes(permission);
}
