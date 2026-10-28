import type { ActivityDTO } from '../../shared/types.js';
import { prisma } from './prisma.js';
import { realtime } from './realtime.js';

interface ActivityInput {
  type: string;
  title: string;
  description?: string;
  actor?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export function serializeActivity(activity: {
  id: string;
  type: string;
  title: string;
  description: string | null;
  actor: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: string;
  createdAt: Date;
}): ActivityDTO {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(activity.metadata) as Record<string, unknown>;
  } catch {
    metadata = {};
  }
  return {
    ...activity,
    metadata,
    createdAt: activity.createdAt.toISOString()
  };
}

export async function recordActivity(input: ActivityInput): Promise<ActivityDTO> {
  const activity = await prisma.activity.create({
    data: {
      type: input.type,
      title: input.title,
      description: input.description,
      actor: input.actor,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: JSON.stringify(input.metadata ?? {})
    }
  });
  const dto = serializeActivity(activity);
  realtime.publish('activity', dto);
  realtime.publish('stats', { reason: input.type });
  return dto;
}
