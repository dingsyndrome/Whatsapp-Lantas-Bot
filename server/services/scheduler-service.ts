import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { recordActivity } from '../lib/activity.js';
import { getBotConfig } from './settings.js';
import { buildWaText, getDailyBundle } from './export-service.js';
import { whatsappManager } from './whatsapp-manager.js';

let activeTask: ScheduledTask | null = null;

function validTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat('id-ID', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return 'Asia/Jakarta';
  }
}

export async function rescheduleDailyRecap(): Promise<{ scheduled: boolean; expression: string | null }> {
  if (activeTask) {
    activeTask.stop();
    activeTask.destroy();
    activeTask = null;
  }
  const bot = await getBotConfig();
  if (!bot.scheduleEnabled) {
    logger.info('Daily recap scheduler disabled');
    return { scheduled: false, expression: null };
  }

  const match = bot.scheduleTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    logger.warn({ time: bot.scheduleTime }, 'Invalid schedule time');
    return { scheduled: false, expression: null };
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return { scheduled: false, expression: null };

  const expression = `${minute} ${hour} * * *`;
  const timezone = validTimezone(bot.scheduleTimezone);
  activeTask = cron.schedule(
    expression,
    () => {
      void sendDailyRecap('scheduled').catch((error) => {
        logger.error({ err: error }, 'Scheduled daily recap failed');
      });
    },
    { timezone, name: 'sigap-daily-recap' }
  );
  activeTask.start();
  logger.info({ expression, timezone, group: bot.scheduleGroupName || bot.scheduleGroupJid }, 'Daily recap scheduled');
  return { scheduled: true, expression };
}

export async function sendDailyRecap(
  trigger: 'scheduled' | 'manual',
  targetOverride?: string,
  date?: string
): Promise<{
  sent: boolean;
  target: string | null;
  text: string;
  counts: Record<string, number>;
}> {
  const bot = await getBotConfig();
  const bundle = await getDailyBundle(date);
  const text = buildWaText(bundle);
  let target = targetOverride || bot.scheduleGroupJid || null;
  if (!target) {
    const monitored = await prisma.monitoredGroup.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' }
    });
    target = monitored?.jid ?? null;
  }
  if (!target) {
    await recordActivity({
      type: 'report',
      title: 'Rekap harian tidak terkirim',
      description: 'Belum ada grup tujuan rekap otomatis yang dikonfigurasi.',
      actor: trigger === 'manual' ? 'Dashboard' : 'Scheduler'
    });
    return { sent: false, target: null, text, counts: bundle.counts };
  }

  const sent = await whatsappManager.sendMessage(target, text);
  await recordActivity({
    type: sent ? 'report' : 'report_failed',
    title: sent ? `Rekap harian ${trigger === 'manual' ? 'dikirim manual' : 'terkirim otomatis'}` : 'Rekap harian gagal dikirim',
    description: `Tujuan ${target} · ${bundle.counts.timemark} foto · ${bundle.counts.links} link`,
    actor: trigger === 'manual' ? 'Dashboard' : 'Scheduler',
    metadata: { counts: bundle.counts, target }
  });
  return { sent, target, text, counts: bundle.counts };
}

export function stopScheduler(): void {
  if (activeTask) {
    activeTask.stop();
    activeTask.destroy();
    activeTask = null;
  }
}
