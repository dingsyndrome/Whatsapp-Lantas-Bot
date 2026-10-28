import {
  DEFAULT_AUTO_REPLY,
  DEFAULT_DOCUMENT_PROMPT,
  DEFAULT_TIMEMARK_PROMPT,
  DEFAULT_TURJAWALI_KEYWORDS,
  type MonitoredGroupDTO,
  type SettingsDTO,
  type TurjawaliActivityType,
  type TurjawaliKeywordMap,
  type TurjawaliRuleSettings
} from '../../shared/types.js';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';

export interface SettingsUpdate {
  botName?: string;
  waDriver?: 'mock' | 'webjs' | 'baileys';
  autoReplyEnabled?: boolean;
  autoReplyTemplate?: string;
  timemarkPrompt?: string;
  documentPrompt?: string;
  aiEnabled?: boolean;
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
  scheduleEnabled?: boolean;
  scheduleTime?: string;
  scheduleTimezone?: string;
  scheduleGroupJid?: string;
  scheduleGroupName?: string;
  minOcrConfidence?: number;
  turjawaliMatchingEnabled?: boolean;
  turjawaliKeywords?: TurjawaliKeywordMap;
  gaturMorningStart?: string;
  gaturMorningEnd?: string;
  gaturEveningStart?: string;
  gaturEveningEnd?: string;
  patrolNightStart?: string;
  patrolNightEnd?: string;
  matchTimeToleranceMinutes?: number;
  matchLocationRadiusMeters?: number;
}

const TURJAWALI_CATEGORIES: TurjawaliActivityType[] = [
  'PENGATURAN',
  'PENJAGAAN',
  'PENGAWALAN',
  'PATROLI'
];

export function parseTurjawaliKeywords(raw: string | null | undefined): TurjawaliKeywordMap {
  const fallback: TurjawaliKeywordMap = {
    PENGATURAN: [...DEFAULT_TURJAWALI_KEYWORDS.PENGATURAN],
    PENJAGAAN: [...DEFAULT_TURJAWALI_KEYWORDS.PENJAGAAN],
    PENGAWALAN: [...DEFAULT_TURJAWALI_KEYWORDS.PENGAWALAN],
    PATROLI: [...DEFAULT_TURJAWALI_KEYWORDS.PATROLI],
    PENEGAKKAN: [...DEFAULT_TURJAWALI_KEYWORDS.PENEGAKKAN]
  };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<TurjawaliActivityType, unknown>>;
    for (const category of TURJAWALI_CATEGORIES) {
      const values = parsed[category];
      if (Array.isArray(values)) {
        const cleaned = values
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean);
        fallback[category] = [...new Set(cleaned)];
      }
    }
  } catch {
    // Invalid legacy value -> safe defaults.
  }
  return fallback;
}

export function getTurjawaliRules(bot: {
  turjawaliKeywords: string;
  gaturMorningStart: string;
  gaturMorningEnd: string;
  gaturEveningStart: string;
  gaturEveningEnd: string;
  patrolNightStart: string;
  patrolNightEnd: string;
  matchTimeToleranceMinutes: number;
  matchLocationRadiusMeters: number;
}): TurjawaliRuleSettings {
  return {
    keywords: parseTurjawaliKeywords(bot.turjawaliKeywords),
    gaturMorningStart: bot.gaturMorningStart,
    gaturMorningEnd: bot.gaturMorningEnd,
    gaturEveningStart: bot.gaturEveningStart,
    gaturEveningEnd: bot.gaturEveningEnd,
    patrolNightStart: bot.patrolNightStart,
    patrolNightEnd: bot.patrolNightEnd,
    matchTimeToleranceMinutes: bot.matchTimeToleranceMinutes,
    matchLocationRadiusMeters: bot.matchLocationRadiusMeters
  };
}

export async function getBotConfig() {
  const existing = await prisma.botConfig.findUnique({ where: { id: 'singleton' } });
  if (existing) return existing;
  return prisma.botConfig.create({
    data: {
      id: 'singleton',
      waDriver: config.waDriver === 'baileys' ? 'baileys' : config.waDriver === 'webjs' ? 'webjs' : 'mock',
      timemarkPrompt: DEFAULT_TIMEMARK_PROMPT,
      documentPrompt: DEFAULT_DOCUMENT_PROMPT,
      autoReplyTemplate: DEFAULT_AUTO_REPLY
    }
  });
}

export async function ensureWhatsAppSessionRow() {
  const existing = await prisma.whatsAppSession.findUnique({ where: { id: 'runtime' } });
  if (existing) return existing;
  return prisma.whatsAppSession.create({ data: { id: 'runtime', status: 'disconnected' } });
}

export function serializeGroup(group: {
  id: string;
  jid: string;
  name: string;
  active: boolean;
}): MonitoredGroupDTO {
  return { id: group.id, jid: group.jid, name: group.name, active: group.active };
}

export async function getSettings(): Promise<SettingsDTO> {
  const [bot, groups] = await Promise.all([
    getBotConfig(),
    prisma.monitoredGroup.findMany({ orderBy: { createdAt: 'asc' } })
  ]);
  return {
    botName: bot.botName,
    waDriver: bot.waDriver === 'baileys' ? 'baileys' : bot.waDriver === 'webjs' ? 'webjs' : 'mock',
    autoReplyEnabled: bot.autoReplyEnabled,
    autoReplyTemplate: bot.autoReplyTemplate || DEFAULT_AUTO_REPLY,
    timemarkPrompt: bot.timemarkPrompt || DEFAULT_TIMEMARK_PROMPT,
    documentPrompt: bot.documentPrompt || DEFAULT_DOCUMENT_PROMPT,
    aiEnabled: bot.aiEnabled,
    aiBaseUrl: bot.aiBaseUrl,
    aiApiKey: '',
    aiApiKeySet: Boolean(bot.aiApiKey),
    aiModel: bot.aiModel,
    scheduleEnabled: bot.scheduleEnabled,
    scheduleTime: bot.scheduleTime,
    scheduleTimezone: bot.scheduleTimezone,
    scheduleGroupJid: bot.scheduleGroupJid,
    scheduleGroupName: bot.scheduleGroupName,
    minOcrConfidence: bot.minOcrConfidence,
    turjawaliMatchingEnabled: bot.turjawaliMatchingEnabled,
    turjawaliKeywords: parseTurjawaliKeywords(bot.turjawaliKeywords),
    gaturMorningStart: bot.gaturMorningStart,
    gaturMorningEnd: bot.gaturMorningEnd,
    gaturEveningStart: bot.gaturEveningStart,
    gaturEveningEnd: bot.gaturEveningEnd,
    patrolNightStart: bot.patrolNightStart,
    patrolNightEnd: bot.patrolNightEnd,
    matchTimeToleranceMinutes: bot.matchTimeToleranceMinutes,
    matchLocationRadiusMeters: bot.matchLocationRadiusMeters,
    groups: groups.map(serializeGroup)
  };
}

export async function updateSettings(input: SettingsUpdate): Promise<SettingsDTO> {
  const current = await getBotConfig();
  const apiKey =
    typeof input.aiApiKey === 'string' && input.aiApiKey.trim()
      ? input.aiApiKey.trim()
      : current.aiApiKey;

  await prisma.botConfig.update({
    where: { id: 'singleton' },
    data: {
      botName: input.botName ?? current.botName,
      waDriver: input.waDriver ?? current.waDriver,
      autoReplyEnabled: input.autoReplyEnabled ?? current.autoReplyEnabled,
      autoReplyTemplate: input.autoReplyTemplate ?? current.autoReplyTemplate,
      timemarkPrompt: input.timemarkPrompt ?? current.timemarkPrompt,
      documentPrompt: input.documentPrompt ?? current.documentPrompt,
      aiEnabled: input.aiEnabled ?? current.aiEnabled,
      aiBaseUrl: input.aiBaseUrl ?? current.aiBaseUrl,
      aiApiKey: apiKey,
      aiModel: input.aiModel ?? current.aiModel,
      scheduleEnabled: input.scheduleEnabled ?? current.scheduleEnabled,
      scheduleTime: input.scheduleTime ?? current.scheduleTime,
      scheduleTimezone: input.scheduleTimezone ?? current.scheduleTimezone,
      scheduleGroupJid: input.scheduleGroupJid ?? current.scheduleGroupJid,
      scheduleGroupName: input.scheduleGroupName ?? current.scheduleGroupName,
      minOcrConfidence: input.minOcrConfidence ?? current.minOcrConfidence,
      turjawaliMatchingEnabled:
        input.turjawaliMatchingEnabled ?? current.turjawaliMatchingEnabled,
      turjawaliKeywords: input.turjawaliKeywords
        ? JSON.stringify(input.turjawaliKeywords)
        : current.turjawaliKeywords,
      gaturMorningStart: input.gaturMorningStart ?? current.gaturMorningStart,
      gaturMorningEnd: input.gaturMorningEnd ?? current.gaturMorningEnd,
      gaturEveningStart: input.gaturEveningStart ?? current.gaturEveningStart,
      gaturEveningEnd: input.gaturEveningEnd ?? current.gaturEveningEnd,
      patrolNightStart: input.patrolNightStart ?? current.patrolNightStart,
      patrolNightEnd: input.patrolNightEnd ?? current.patrolNightEnd,
      matchTimeToleranceMinutes:
        input.matchTimeToleranceMinutes ?? current.matchTimeToleranceMinutes,
      matchLocationRadiusMeters:
        input.matchLocationRadiusMeters ?? current.matchLocationRadiusMeters
    }
  });
  return getSettings();
}

export async function isGroupMonitored(groupJid: string | null | undefined): Promise<boolean> {
  const groups = await prisma.monitoredGroup.findMany({ where: { active: true } });
  if (groups.length === 0) return true; // Belum dikonfigurasi = pantau semua grup.
  if (!groupJid) return false;
  return groups.some((group) => group.jid === groupJid);
}

export async function listMonitoredGroupsJids(): Promise<string[]> {
  const groups = await prisma.monitoredGroup.findMany({ where: { active: true } });
  return groups.map((group) => group.jid);
}
