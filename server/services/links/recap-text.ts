import { format, startOfDay } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import type { LinkDTO, LinkRecapCounts } from '../../../shared/types.js';
import { minutesOfDay } from '../../lib/time.js';

export const LINK_RECAP_STATUS_LABELS: Record<string, string> = {
  valid: 'Valid',
  restricted: 'Dibatasi',
  invalid: 'Tidak valid',
  unchecked: 'Belum dicek'
};

const MAX_SENDER_ROWS = 60;

/** Apakah jam sebuah tanggal berada di dalam rentang menit yang diminta. */
export function isWithinTimeWindow(
  date: Date,
  startMinutes: number | null | undefined,
  endMinutes: number | null | undefined
): boolean {
  const minutes = minutesOfDay(date);
  if (typeof startMinutes === 'number' && minutes < startMinutes) return false;
  if (typeof endMinutes === 'number' && minutes > endMinutes) return false;
  return true;
}

export function summarizeLinks(links: LinkDTO[]): LinkRecapCounts {
  const senders = new Set<string>();
  const platforms = new Set<string>();
  const statuses = new Map<string, number>();

  for (const link of links) {
    senders.add(link.senderNumber || link.senderName);
    platforms.add(link.platform);
    statuses.set(link.status, (statuses.get(link.status) ?? 0) + 1);
  }

  return {
    total: links.length,
    senders: senders.size,
    valid: statuses.get('valid') ?? 0,
    restricted: statuses.get('restricted') ?? 0,
    invalid: statuses.get('invalid') ?? 0,
    unchecked: statuses.get('unchecked') ?? 0,
    platforms: platforms.size
  };
}

export function buildLinkFilterNote(input: {
  platform?: string;
  status?: string;
  search?: string;
}): string | null {
  const parts: string[] = [];
  if (input.platform && input.platform !== 'all') parts.push(`Platform ${input.platform}`);
  if (input.status && input.status !== 'all') {
    parts.push(`Status ${LINK_RECAP_STATUS_LABELS[input.status] ?? input.status}`);
  }
  if (input.search?.trim()) parts.push(`Pencarian “${input.search.trim()}”`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatPeriod(
  from: string,
  to: string,
  startTime: string | null,
  endTime: string | null
): { dateLabel: string; timeLabel: string | null } {
  const fromDate = startOfDay(new Date(`${from}T00:00:00`));
  const toDate = startOfDay(new Date(`${to}T00:00:00`));
  const dateLabel =
    from === to
      ? format(fromDate, 'EEEE, dd MMMM yyyy', { locale: localeId })
      : `${format(fromDate, 'dd MMMM yyyy', { locale: localeId })} – ${format(toDate, 'dd MMMM yyyy', { locale: localeId })}`;

  let timeLabel: string | null = null;
  if (startTime && endTime) timeLabel = `${startTime}–${endTime}`;
  else if (startTime) timeLabel = `mulai ${startTime}`;
  else if (endTime) timeLabel = `sampai ${endTime}`;

  return { dateLabel, timeLabel };
}

export function buildLinkRecapText(input: {
  from: string;
  to: string;
  startTime: string | null;
  endTime: string | null;
  links: LinkDTO[];
  filterNote?: string | null;
  /** Label [pangkat] [nama] personel non-perwira yang belum mengirim link. */
  notSubmitted?: string[];
  /** Label pengirim yang tergolong perwira; tidak ditampilkan sebagai pengirim. */
  perwiraSenders?: string[];
  rosterTotal?: number;
}): string {
  const counts = summarizeLinks(input.links);
  const platformCounts = new Map<string, number>();
  for (const link of input.links) {
    platformCounts.set(link.platform, (platformCounts.get(link.platform) ?? 0) + 1);
  }
  const platformSummary = [...platformCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([platform, count]) => `${platform} ${count}`)
    .join(' · ');

  const { dateLabel, timeLabel } = formatPeriod(
    input.from,
    input.to,
    input.startTime,
    input.endTime
  );

  const lines: string[] = [
    '*SIGAP COMMAND CENTER*',
    '*REKAP LINK ANGGOTA*',
    `${dateLabel}${timeLabel ? ` · ${timeLabel}` : ''}`
  ];
  if (input.filterNote) lines.push(`_Filter: ${input.filterNote}_`);
  lines.push('');
  lines.push(`🔗 Total link     : *${counts.total}*`);
  lines.push(`👤 Pengirim unik  : *${counts.senders}*`);
  lines.push(`📱 Platform       : ${platformSummary || '-'}`);
  lines.push(
    `📊 Status         : ✅ ${counts.valid} valid · ⚠️ ${counts.restricted} dibatasi · ❌ ${counts.invalid} tidak valid · ⏳ ${counts.unchecked} belum dicek`
  );
  lines.push('');
  lines.push('*DAFTAR PENGIRIM*');

  // Satu baris per pengirim: nama diambil dari roster (label), jumlah link
  // dihitung — anggota yang mengirim berkali-kali tidak diulang barisnya.
  const perwiraSet = new Set(input.perwiraSenders ?? []);
  const perSender = new Map<string, { count: number; invalid: number }>();
  for (const link of input.links) {
    const person = link.senderLabel?.trim() || link.senderName;
    if (perwiraSet.has(person)) continue;
    const entry = perSender.get(person) ?? { count: 0, invalid: 0 };
    entry.count += 1;
    if (link.status === 'invalid') entry.invalid += 1;
    perSender.set(person, entry);
  }
  const senderRows = [...perSender.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])
  );

  if (senderRows.length === 0) {
    lines.push('_Tidak ada link anggota pada periode ini._');
  } else {
    senderRows.slice(0, MAX_SENDER_ROWS).forEach(([person, entry], index) => {
      const invalidNote = entry.invalid > 0 ? ` (${entry.invalid} tidak valid)` : '';
      lines.push(`${index + 1}. *${person}* : ${entry.count} link${invalidNote}`);
    });
    if (senderRows.length > MAX_SENDER_ROWS) {
      lines.push(`_… dan ${senderRows.length - MAX_SENDER_ROWS} pengirim lainnya._`);
    }
  }

  const invalidRows = senderRows.filter(([, entry]) => entry.invalid > 0);
  if (invalidRows.length > 0) {
    const invalidTotal = invalidRows.reduce((total, [, entry]) => total + entry.invalid, 0);
    lines.push('');
    lines.push(`❌ *${invalidTotal} LINK TIDAK VALID*`);
    invalidRows.slice(0, MAX_SENDER_ROWS).forEach(([person, entry], index) => {
      lines.push(`${index + 1}. ${person} : ${entry.invalid} link`);
    });
  }

  if (input.notSubmitted) {
    lines.push('');
    lines.push('*BELUM MENGIRIM LINK*');
    if (input.notSubmitted.length === 0) {
      lines.push('_Seluruh anggota roster sudah mengirim link._');
    } else {
      input.notSubmitted.forEach((label, index) => {
        lines.push(`${index + 1}. ${label}`);
      });
      lines.push(
        `_${input.notSubmitted.length}${typeof input.rosterTotal === 'number' ? ` dari ${input.rosterTotal}` : ''} anggota belum mengirim link · perwira dikecualikan._`
      );
    }
  }

  lines.push('');
  lines.push('_Rekap SIGAP · hanya laporan link anggota._');
  return lines.join('\n');
}
