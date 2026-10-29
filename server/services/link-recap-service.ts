import type { Prisma } from '@prisma/client';
import { endOfDay, startOfDay } from 'date-fns';
import type { LinkRecapResult } from '../../shared/types.js';
import { recordActivity } from '../lib/activity.js';
import { prisma } from '../lib/prisma.js';
import { formatTimeOfDay } from '../lib/time.js';
import { serializeLink, type LinkWithSprin } from '../lib/serializers.js';
import {
  LINK_RECAP_STATUS_LABELS,
  buildLinkFilterNote,
  buildLinkRecapText,
  isWithinTimeWindow,
  summarizeLinks
} from './links/recap-text.js';
import { PersonnelDirectory } from './personnel-directory.js';
import { formatRankName } from '../../shared/personnel-name.js';
import { whatsappManager } from './whatsapp-manager.js';

export interface LinkRecapParams {
  from: string;
  to?: string;
  /** Awal rentang jam dalam menit sejak 00:00, mis. 08:20 → 500. */
  startMinutes?: number | null;
  /** Akhir rentang jam dalam menit sejak 00:00 (inklusif sampai detik terakhir menit itu). */
  endMinutes?: number | null;
  platform?: string;
  status?: string;
  search?: string;
}

export interface LinkRecapSendResult {
  sent: boolean;
  target: string | null;
  reason?: string;
  recap: LinkRecapResult;
}

function oneOf(value: string | undefined, allowed: string[]): string | undefined {
  if (!value || value === 'all') return undefined;
  return allowed.includes(value) ? value : undefined;
}

export async function buildLinkRecap(params: LinkRecapParams): Promise<LinkRecapResult> {
  const from = params.from;
  const to = params.to ?? from;
  const startMinutes =
    typeof params.startMinutes === 'number' ? params.startMinutes : null;
  const endMinutes = typeof params.endMinutes === 'number' ? params.endMinutes : null;
  const startTime = formatTimeOfDay(startMinutes);
  const endTime = formatTimeOfDay(endMinutes);

  const fromDate = startOfDay(new Date(`${from}T00:00:00`));
  const toDate = endOfDay(new Date(`${to}T00:00:00`));

  const queryStart = new Date(fromDate);
  if (startMinutes !== null) {
    queryStart.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  }
  const queryEnd = new Date(toDate);
  if (endMinutes !== null) {
    queryEnd.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 59, 999);
  }

  const where: Prisma.LinkSubmissionWhereInput = {
    receivedAt: { gte: queryStart, lte: queryEnd }
  };
  if (params.platform && params.platform !== 'all') where.platform = params.platform;
  const status = oneOf(params.status, Object.keys(LINK_RECAP_STATUS_LABELS));
  if (status) where.status = status;
  if (params.search?.trim()) {
    const search = params.search.trim();
    where.OR = [
      { senderName: { contains: search } },
      { senderNumber: { contains: search } },
      { title: { contains: search } },
      { normalizedUrl: { contains: search } },
      { groupName: { contains: search } }
    ];
  }

  const [rows, periodRows, roster] = await Promise.all([
    prisma.linkSubmission.findMany({
      where,
      include: { sprin: { select: { number: true } } },
      orderBy: { receivedAt: 'asc' }
    }),
    prisma.linkSubmission.findMany({
      where: { receivedAt: { gte: queryStart, lte: queryEnd } },
      select: { senderName: true, senderNumber: true, receivedAt: true },
      orderBy: { receivedAt: 'asc' }
    }),
    prisma.personnel.findMany({
      where: { active: true },
      select: { id: true, name: true, rank: true, phone: true, category: true },
      orderBy: [{ no: 'asc' }]
    })
  ]);
  const directory = new PersonnelDirectory(roster);
  const links = rows
    .map((row) => {
      const link = serializeLink(row as LinkWithSprin);
      const person = directory.resolve(link.senderName, link.senderNumber);
      return {
        ...link,
        senderRank: person?.rank ?? null,
        senderLabel: directory.label(link.senderName, link.senderNumber)
      };
    })
    .filter((link) => isWithinTimeWindow(new Date(link.receivedAt), startMinutes, endMinutes));

  const counts = summarizeLinks(links);
  const platformMap = new Map<string, number>();
  for (const link of links) {
    platformMap.set(link.platform, (platformMap.get(link.platform) ?? 0) + 1);
  }
  const platforms = [...platformMap.entries()]
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform));

  // Accountability memakai seluruh link pada rentang waktu, bukan hasil filter
  // platform/status/pencarian, agar personel yang sudah mengirim tidak salah
  // dimasukkan ke daftar "belum mengirim".
  const submittedIds = new Set<string>();
  for (const row of periodRows) {
    if (!isWithinTimeWindow(row.receivedAt, startMinutes, endMinutes)) continue;
    const person = directory.resolve(row.senderName, row.senderNumber);
    if (person) submittedIds.add(person.id);
  }
  const nonPerwira = roster.filter((person) => person.category !== 'PERWIRA');
  const notSubmitted = nonPerwira
    .filter((person) => !submittedIds.has(person.id))
    .map((person) => ({
      id: person.id,
      label: formatRankName(person.rank, person.name)
    }));
  const accountability = {
    rosterTotal: nonPerwira.length,
    submitted: nonPerwira.length - notSubmitted.length,
    notSubmitted
  };

  const perwiraSenders = roster
    .filter((person) => person.category === 'PERWIRA')
    .map((person) => formatRankName(person.rank, person.name));
  return {
    range: { from, to, startTime, endTime },
    counts,
    platforms,
    accountability,
    text: buildLinkRecapText({
      perwiraSenders,
      from,
      to,
      startTime,
      endTime,
      links,
      filterNote: buildLinkFilterNote(params),
      notSubmitted: notSubmitted.map((person) => person.label),
      rosterTotal: nonPerwira.length
    })
  };
}

export async function sendLinkRecapToGroup(
  params: LinkRecapParams,
  groupJid?: string
): Promise<LinkRecapSendResult> {
  const recap = await buildLinkRecap(params);
  const bot = await prisma.botConfig.findUnique({ where: { id: 'singleton' } });
  let target = groupJid?.trim() || bot?.scheduleGroupJid || null;
  if (!target) {
    const monitored = await prisma.monitoredGroup.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' }
    });
    target = monitored?.jid ?? null;
  }

  if (!target) {
    return {
      sent: false,
      target: null,
      reason:
        'Belum ada grup WhatsApp tujuan. Atur grup rekap di Settings atau daftarkan grup yang dipantau.',
      recap
    };
  }

  const sent = await whatsappManager.sendMessage(target, recap.text);
  await recordActivity({
    type: sent ? 'report' : 'report_failed',
    title: sent ? 'Rekap link anggota dikirim' : 'Rekap link anggota gagal dikirim',
    description: `${recap.range.from === recap.range.to ? recap.range.from : `${recap.range.from}–${recap.range.to}`}${
      recap.range.startTime || recap.range.endTime
        ? ` · ${recap.range.startTime ?? '00:00'}–${recap.range.endTime ?? '23:59'}`
        : ''
    } · ${recap.counts.total} link`,
    actor: 'Dashboard',
    entityType: 'link',
    metadata: {
      target,
      from: recap.range.from,
      to: recap.range.to,
      startTime: recap.range.startTime,
      endTime: recap.range.endTime,
      counts: recap.counts
    }
  });

  return {
    sent,
    target,
    reason: sent ? undefined : 'Bot WhatsApp belum terhubung atau pengiriman gagal.',
    recap
  };
}
