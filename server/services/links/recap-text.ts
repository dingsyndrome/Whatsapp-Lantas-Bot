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

const MAX_DETAIL_LINKS = 200;

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
  lines.push('*DAFTAR LINK*');

  if (input.links.length === 0) {
    lines.push('_Tidak ada link anggota pada periode ini._');
  } else {
    input.links.slice(0, MAX_DETAIL_LINKS).forEach((link, index) => {
      const time = format(new Date(link.receivedAt), 'HH:mm');
      const status = LINK_RECAP_STATUS_LABELS[link.status] ?? link.status;
      const person = link.senderLabel?.trim() || link.senderName;
      lines.push(
        `${index + 1}. *${time}* · *${person}* · ${link.platform} · ${status}`
      );
    });
    if (input.links.length > MAX_DETAIL_LINKS) {
      lines.push(
        `_… dan ${input.links.length - MAX_DETAIL_LINKS} link lainnya. Persempit periode atau filter untuk melihat sisanya._`
      );
    }
  }

  const invalid = input.links.filter((link) => link.status === 'invalid');
  if (invalid.length > 0) {
    lines.push('');
    lines.push(`❌ *${invalid.length} LINK TIDAK VALID*`);
    invalid.slice(0, 50).forEach((link, index) => {
      const time = format(new Date(link.receivedAt), 'HH:mm');
      const person = link.senderLabel?.trim() || link.senderName;
      lines.push(`${index + 1}. ${person} · ${time} · ${link.platform}`);
    });
    if (invalid.length > 50) {
      lines.push(`_… dan ${invalid.length - 50} link tidak valid lainnya._`);
    }
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
