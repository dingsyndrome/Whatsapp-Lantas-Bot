import type { ActivityDTO } from '../../shared/types.js';
import { prisma } from '../lib/prisma.js';
import { serializeActivity } from '../lib/activity.js';

export async function listActivities(limit = 20): Promise<ActivityDTO[]> {
  const rows = await prisma.activity.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(100, Math.max(1, limit))
  });
  return rows.map(serializeActivity);
}
