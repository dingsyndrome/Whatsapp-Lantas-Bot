import { prisma } from '../lib/prisma.js';
import { recordActivity } from '../lib/activity.js';
import { getBotConfig } from './settings.js';
import { getTurjawaliRecap } from './turjawali-recap-service.js';
import { whatsappManager } from './whatsapp-manager.js';
import type { TurjawaliRecap } from '../../shared/types.js';

export interface ReminderResult {
  sent: boolean;
  target: string | null;
  pendingCount: number;
  date: string;
  period: 'daily' | 'weekly';
  text: string;
  reason?: string;
}

export function buildPersonnelReminderText(recap: TurjawaliRecap): string {
  const pending = recap.personnel.details.filter((person) => !person.reported);
  const lines: string[] = [];
  lines.push('*SIGAP COMMAND CENTER*');
  lines.push('*PENGINGAT LAPORAN PERSONEL TURJAWALI*');
  lines.push(`Periode: *${recap.label}*`);
  lines.push('');
  lines.push(`👮 Personel aktif : *${recap.personnel.active}*`);
  lines.push(`✅ Sudah melapor  : *${recap.personnel.reported}*`);
  lines.push(`⏳ Belum melapor  : *${recap.personnel.pending}*`);
  lines.push('');
  if (pending.length === 0) {
    lines.push('_Seluruh personel sudah mengirim laporan. Terima kasih._');
  } else {
    lines.push('*DAFTAR BELUM MELAPOR*');
    pending.forEach((person, index) => {
      lines.push(
        `${index + 1}. *${person.name}* (${person.rankNrp ?? '-'}) — ${person.sprinNumber}`
      );
    });
    lines.push('');
    lines.push(
      '_Mohon segera mengirim foto Timemark dan link laporan ke grup ini. Terima kasih._'
    );
  }
  lines.push('');
  lines.push('_Pesan otomatis SIGAP · WhatsApp Bot Listener_');
  return lines.join('\n');
}

export async function sendPersonnelReminder(options: {
  groupJid?: string;
  period?: 'daily' | 'weekly';
  date?: string;
}): Promise<ReminderResult> {
  const period = options.period === 'weekly' ? 'weekly' : 'daily';
  const recap = await getTurjawaliRecap({ period, date: options.date });
  const text = buildPersonnelReminderText(recap);
  const pendingCount = recap.personnel.pending;

  if (pendingCount === 0) {
    return {
      sent: false,
      target: null,
      pendingCount,
      date: recap.date,
      period,
      text,
      reason: 'Seluruh personel sudah melapor untuk periode ini.'
    };
  }

  const bot = await getBotConfig();
  let target = options.groupJid?.trim() || bot.scheduleGroupJid || null;
  if (!target) {
    const group = await prisma.monitoredGroup.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' }
    });
    target = group?.jid ?? null;
  }
  if (!target) {
    return {
      sent: false,
      target: null,
      pendingCount,
      date: recap.date,
      period,
      text,
      reason: 'Belum ada grup rekap yang dikonfigurasi.'
    };
  }

  const sent = await whatsappManager.sendMessage(target, text);
  await recordActivity({
    type: sent ? 'personnel_reminder' : 'personnel_reminder_failed',
    title: sent ? 'Pengingat personel dikirim' : 'Pengingat personel gagal dikirim',
    description: `${pendingCount} personel belum melapor · ${recap.label}`,
    actor: 'Dashboard',
    entityType: 'turjawali',
    metadata: {
      target,
      pendingCount,
      reported: recap.personnel.reported,
      active: recap.personnel.active,
      period
    }
  });

  return {
    sent,
    target,
    pendingCount,
    date: recap.date,
    period,
    text,
    reason: sent ? undefined : 'Pengiriman WhatsApp gagal.'
  };
}
