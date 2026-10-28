import type { Prisma } from '@prisma/client';
import { addDays, subDays } from 'date-fns';
import { prisma } from '../lib/prisma.js';
import { recordActivity } from '../lib/activity.js';
import { realtime } from '../lib/realtime.js';
import { serializeLink, type LinkWithSprin } from '../lib/serializers.js';
import type { LinkDTO } from '../../shared/types.js';
import { extractLinks, extractSprinNumber, stripLinks } from './links/extractor.js';
import { validateLink } from './links/validator.js';

export interface LinkIngestInput {
  text: string;
  senderName: string;
  senderNumber: string;
  groupName?: string | null;
  messageId?: string | null;
  receivedAt?: Date;
  source?: string;
}

async function resolveSprin(text: string, receivedAt: Date): Promise<string | null> {
  const explicit = extractSprinNumber(text);
  if (explicit) {
    const match = await prisma.sprin.findUnique({ where: { number: explicit } });
    if (match) return match.id;
  }
  const candidates = await prisma.sprin.findMany({
    where: {
      status: 'active',
      activityDate: { gte: subDays(receivedAt, 3), lte: addDays(receivedAt, 3) }
    },
    select: { id: true, activityDate: true }
  });
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) =>
      Math.abs((a.activityDate?.getTime() ?? 0) - receivedAt.getTime()) -
      Math.abs((b.activityDate?.getTime() ?? 0) - receivedAt.getTime())
  );
  return candidates[0]?.id ?? null;
}

async function validateInBackground(linkId: string, url: string): Promise<void> {
  try {
    const validation = await validateLink(url);
    await prisma.linkSubmission.update({
      where: { id: linkId },
      data: {
        status: validation.status,
        httpStatus: validation.httpStatus,
        verifiedAt: validation.verifiedAt
      }
    });
    realtime.publish('stats', { reason: 'link_validated', linkId });
  } catch {
    // Validation never blocks ingestion.
  }
}

export async function ingestLinks(input: LinkIngestInput): Promise<LinkDTO[]> {
  const extracted = extractLinks(input.text);
  if (extracted.length === 0) return [];
  const receivedAt = input.receivedAt ?? new Date();
  const sprinId = await resolveSprin(input.text, receivedAt);
  const title = stripLinks(input.text).replace(/\s+/g, ' ').trim().slice(0, 240) || null;
  const results: LinkDTO[] = [];

  for (const link of extracted) {
    if (input.messageId) {
      const duplicate = await prisma.linkSubmission.findFirst({
        where: { messageId: input.messageId, normalizedUrl: link.normalizedUrl },
        include: { sprin: { select: { number: true } } }
      });
      if (duplicate) {
        results.push(serializeLink(duplicate as LinkWithSprin));
        continue;
      }
    }

    const created = await prisma.linkSubmission.create({
      data: {
        messageId: input.messageId ?? null,
        senderName: input.senderName,
        senderNumber: input.senderNumber,
        groupName: input.groupName ?? null,
        url: link.url,
        normalizedUrl: link.normalizedUrl,
        platform: link.platform,
        category: link.category,
        title,
        receivedAt,
        status: 'unchecked',
        sprinId
      },
      include: { sprin: { select: { number: true } } }
    });
    results.push(serializeLink(created as LinkWithSprin));
    void validateInBackground(created.id, created.normalizedUrl);
  }

  if (results.length > 0) {
    await recordActivity({
      type: 'link',
      title: `${results.length} link anggota terekap`,
      description: `${input.senderName} · ${[...new Set(results.map((link) => link.platform))].join(', ')}`,
      actor: input.senderName,
      entityType: 'link',
      entityId: results[0]?.id,
      metadata: {
        platforms: [...new Set(results.map((link) => link.platform))],
        senderNumber: input.senderNumber,
        groupName: input.groupName ?? null,
        sprinNumber: results[0]?.sprinNumber ?? null
      }
    });
  }

  return results;
}

export async function revalidateLink(id: string): Promise<LinkDTO | null> {
  const link = await prisma.linkSubmission.findUnique({ where: { id } });
  if (!link) return null;
  const validation = await validateLink(link.normalizedUrl);
  const updated = await prisma.linkSubmission.update({
    where: { id },
    data: {
      status: validation.status,
      httpStatus: validation.httpStatus,
      verifiedAt: validation.verifiedAt
    },
    include: { sprin: { select: { number: true } } }
  });
  return serializeLink(updated as LinkWithSprin);
}

export async function listLinks(options: {
  search?: string;
  platform?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: LinkDTO[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, options.pageSize ?? 30));
  const where: Prisma.LinkSubmissionWhereInput = {};
  if (options.platform && options.platform !== 'all') where.platform = options.platform;
  if (options.status && options.status !== 'all') where.status = options.status;
  if (options.search) {
    where.OR = [
      { senderName: { contains: options.search } },
      { senderNumber: { contains: options.search } },
      { title: { contains: options.search } },
      { normalizedUrl: { contains: options.search } },
      { groupName: { contains: options.search } }
    ];
  }
  if (options.from || options.to) {
    where.receivedAt = {
      ...(options.from ? { gte: new Date(`${options.from}T00:00:00`) } : {}),
      ...(options.to ? { lte: new Date(`${options.to}T23:59:59`) } : {})
    };
  }
  const [total, rows] = await Promise.all([
    prisma.linkSubmission.count({ where }),
    prisma.linkSubmission.findMany({
      where,
      include: { sprin: { select: { number: true } } },
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);
  return {
    items: rows.map((row) => serializeLink(row as LinkWithSprin)),
    total,
    page,
    pageSize
  };
}

export async function deleteLink(id: string): Promise<boolean> {
  const exists = await prisma.linkSubmission.findUnique({ where: { id } });
  if (!exists) return false;
  await prisma.linkSubmission.delete({ where: { id } });
  return true;
}

export async function getLinkSummary(): Promise<{
  total: number;
  valid: number;
  restricted: number;
  invalid: number;
  unchecked: number;
  senders: number;
  platforms: Array<{ platform: string; count: number }>;
}> {
  const [total, statusGroups, senderGroups, platformGroups] = await Promise.all([
    prisma.linkSubmission.count(),
    prisma.linkSubmission.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.linkSubmission.groupBy({ by: ['senderNumber'] }),
    prisma.linkSubmission.groupBy({
      by: ['platform'],
      _count: { _all: true },
      orderBy: { _count: { platform: 'desc' } }
    })
  ]);
  const byStatus = new Map(statusGroups.map((row) => [row.status, row._count._all]));
  return {
    total,
    valid: byStatus.get('valid') ?? 0,
    restricted: byStatus.get('restricted') ?? 0,
    invalid: byStatus.get('invalid') ?? 0,
    unchecked: byStatus.get('unchecked') ?? 0,
    senders: senderGroups.length,
    platforms: platformGroups.map((row) => ({
      platform: row.platform,
      count: row._count._all
    }))
  };
}
