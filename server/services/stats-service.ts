import type { DashboardStats, WeeklyPoint } from '../../shared/types.js';
import { prisma } from '../lib/prisma.js';
import { dayRange, isoDay, lastNDays, startOfToday, yesterdayRange } from '../lib/dates.js';
import { serializeLink, serializeTimemark, type LinkWithSprin, type TimemarkWithSprin } from '../lib/serializers.js';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { getTurjawaliRecap } from './turjawali-recap-service.js';

export async function getDashboardStats(): Promise<DashboardStats> {
  const today = dayRange(new Date());
  const yesterday = yesterdayRange();
  const monthStart = new Date(today.start.getFullYear(), today.start.getMonth(), 1);

  const [
    timemarkToday,
    timemarkYesterday,
    activeSprin,
    activeSprinThisMonth,
    linksToday,
    linksYesterday,
    totalTimemark,
    totalSprin,
    totalLinks,
    personnelGroups,
    avgConfidence,
    platformGroups,
    latestTimemark,
    latestLinks,
    progressRows,
    turjawaliRecap
  ] = await Promise.all([
    prisma.timemarkPhoto.count({ where: { createdAt: { gte: today.start, lt: today.end } } }),
    prisma.timemarkPhoto.count({ where: { createdAt: { gte: yesterday.start, lt: yesterday.end } } }),
    prisma.sprin.count({ where: { status: 'active' } }),
    prisma.sprin.count({ where: { status: 'active', createdAt: { gte: monthStart } } }),
    prisma.linkSubmission.count({ where: { receivedAt: { gte: today.start, lt: today.end } } }),
    prisma.linkSubmission.count({ where: { receivedAt: { gte: yesterday.start, lt: yesterday.end } } }),
    prisma.timemarkPhoto.count(),
    prisma.sprin.count(),
    prisma.linkSubmission.count(),
    prisma.sprinPersonnel.groupBy({ by: ['name'], _count: { _all: true } }),
    prisma.timemarkPhoto.aggregate({ _avg: { confidence: true } }),
    prisma.linkSubmission.groupBy({
      by: ['platform'],
      _count: { _all: true },
      orderBy: { _count: { platform: 'desc' } }
    }),
    prisma.timemarkPhoto.findMany({
      include: {
        sprin: { select: { number: true } },
        matchedPersonnel: { select: { id: true, name: true, rankNrp: true, penugasan: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 4
    }),
    prisma.linkSubmission.findMany({
      include: { sprin: { select: { number: true } } },
      orderBy: { receivedAt: 'desc' },
      take: 5
    }),
    prisma.sprin.findMany({
      where: { status: 'active' },
      include: { _count: { select: { personnel: true, links: true, timemarks: true } } },
      orderBy: [{ activityDate: 'desc' }, { createdAt: 'desc' }],
      take: 4
    }),
    getTurjawaliRecap({ period: 'daily' })
  ]);

  const days = lastNDays(7);
  const weekly = (await Promise.all(
    days.map(async (day): Promise<WeeklyPoint> => {
      const range = dayRange(day);
      const [timemark, links, documents] = await Promise.all([
        prisma.timemarkPhoto.count({ where: { createdAt: { gte: range.start, lt: range.end } } }),
        prisma.linkSubmission.count({ where: { receivedAt: { gte: range.start, lt: range.end } } }),
        prisma.sprin.count({ where: { createdAt: { gte: range.start, lt: range.end } } })
      ]);
      return {
        date: isoDay(day),
        label: format(day, 'EEE', { locale: localeId }),
        timemark,
        links,
        documents
      };
    })
  )) as WeeklyPoint[];

  return {
    date: isoDay(startOfToday()),
    timemarkToday,
    timemarkYesterday,
    activeSprin,
    activeSprinThisMonth,
    linksToday,
    linksYesterday,
    personnelInvolved: personnelGroups.length,
    totalTimemark,
    totalSprin,
    totalLinks,
    totalPersonnel: personnelGroups.reduce((sum, row) => sum + row._count._all, 0),
    avgConfidence: Math.round(avgConfidence._avg.confidence ?? 0),
    linksByPlatform: platformGroups.map((row) => ({
      platform: row.platform,
      count: row._count._all
    })),
    weekly,
    sprinProgress: progressRows.map((row) => {
      const percent =
        row._count.personnel > 0
          ? Math.min(100, Math.round((row._count.links / row._count.personnel) * 100))
          : 0;
      return {
        id: row.id,
        number: row.number,
        about: row.about,
        activityDate: row.activityDate?.toISOString() ?? null,
        personnelCount: row._count.personnel,
        reportedLinks: row._count.links,
        percent
      };
    }),
    latestTimemark: latestTimemark.map((row) => serializeTimemark(row as TimemarkWithSprin)),
    latestLinks: latestLinks.map((row) => serializeLink(row as LinkWithSprin)),
    turjawali: turjawaliRecap
  };
}
