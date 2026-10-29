import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { recordActivity } from '../lib/activity.js';
import { samePhone } from '../lib/phone.js';
import { whatsappManager } from './whatsapp-manager.js';
import {
  DEFAULT_SPRIN_NOTIFY_TEMPLATE,
  TURJAWALI_LABELS,
  type SprinNotifyPreviewDTO,
  type SprinNotifyRecipientDTO,
  type SprinNotifySendResultDTO,
  type SprinNotifySkippedDTO,
  type TurjawaliType
} from '../../shared/types.js';
import {
  analyzeSprinLocation,
  extractPersonnelTaskLocation,
  resolvePersonnelApelLocation
} from './sprin-location.js';
import {
  detectFunctionCodes,
  getNotificationFunctionRows,
  isPerwira,
  parseFunctionKeywords
} from './notification-function-service.js';
import { getBotConfig } from './settings.js';

export interface SprinNotifyOptions {
  functionCodes?: string[];
  excludePerwira?: boolean;
  template?: string;
  /** personnelId → pesan yang diedit admin (menggantikan hasil template). */
  overrides?: Record<string, string>;
  force?: boolean;
  dryRun?: boolean;
  limit?: number;
  confirmReview?: boolean;
  reviewNote?: string;
  actor?: string;
  /** false dipakai untuk pratinjau tanpa menyentuh draf tersimpan. */
  persist?: boolean;
}

function normalizeName(value: string): string {
  return value
    .toUpperCase()
    .replace(/\b(S\.?H\.?|S\.?I\.?K\.?|S\.?TR\.?K\.?|M\.?H\.?|M\.?M\.?|CPHR|S\.?E\.?|S\.?P\.?D\.?|S\.?S\.?O\.?S\.?)\b/g, ' ')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstTokens(name: string, count = 2): string {
  return normalizeName(name).split(' ').slice(0, count).join(' ');
}

function parseCodes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((value): value is string => typeof value === 'string').map((value) => value.trim().toUpperCase()).filter(Boolean))];
  } catch {
    return [];
  }
}

function parseOverrides(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => vars[key] ?? match);
}

function formatJadwal(activityDate: Date | null, timeText: string | null): string {
  const tanggal = activityDate
    ? format(activityDate, 'EEEE, dd MMMM yyyy', { locale: localeId })
    : null;
  if (tanggal && timeText) return `${tanggal}, pukul ${timeText}`;
  if (tanggal) return `${tanggal}, jam menyusul`;
  if (timeText) return `Tanggal menyusul, pukul ${timeText}`;
  return 'Tidak tercantum pada Sprin';
}

function defaultTemplate(botTemplate: string | null | undefined): string {
  return (botTemplate ?? '').trim() || DEFAULT_SPRIN_NOTIFY_TEMPLATE;
}

interface PreviewContext {
  sprin: NonNullable<Awaited<ReturnType<typeof loadSprin>>>;
  functions: Awaited<ReturnType<typeof getNotificationFunctionRows>>;
  roster: Awaited<ReturnType<typeof loadRoster>>;
  bot: Awaited<ReturnType<typeof getBotConfig>>;
}

async function loadSprin(sprinId: string) {
  return prisma.sprin.findUnique({
    where: { id: sprinId },
    include: {
      personnel: { orderBy: [{ page: 'asc' }, { no: 'asc' }] },
      notification: true
    }
  });
}

async function loadRoster() {
  return prisma.personnel.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      nrp: true,
      phone: true,
      jabatan: true,
      rank: true,
      category: true,
      unit: true
    }
  });
}

function buildPreview(context: PreviewContext, options: SprinNotifyOptions): SprinNotifyPreviewDTO {
  const { sprin, functions, roster, bot } = context;
  const draft = sprin.notification;
  const requestedCodes = (
    options.functionCodes ??
    (draft ? parseCodes(draft.functionCodes) : [])
  )
    .map((code) => code.toUpperCase())
    .filter(Boolean);
  const fallbackCodes = parseCodes(bot.sprinNotifyDefaultFunctions);
  const functionCodes =
    requestedCodes.length > 0
      ? requestedCodes
      : fallbackCodes.length > 0
        ? fallbackCodes
        : functions.filter((row) => row.active).slice(0, 1).map((row) => row.code);
  const effectiveCodes = functionCodes.length > 0 ? functionCodes : ['SATLANTAS'];
  const excludePerwira = options.excludePerwira ?? draft?.excludePerwira ?? bot.sprinNotifyExcludePerwira;
  const selectedFunctions = functions.filter((row) => row.active && effectiveCodes.includes(row.code));
  const selectedNames = new Map(selectedFunctions.map((row) => [row.code, row.name]));
  if (selectedFunctions.length === 0) {
    // Tetap izinkan pratinjau agar admin melihat alasan kosongnya.
    for (const code of effectiveCodes) selectedNames.set(code, code);
  }

  const template = (
    options.template ??
    draft?.template ??
    bot.sprinNotifyTemplate ??
    ''
  ).trim() || defaultTemplate(bot.sprinNotifyTemplate);
  const overrides = options.overrides ?? parseOverrides(draft?.overrides);

  const byNrp = new Map(
    roster.filter((person) => person.nrp).map((person) => [person.nrp as string, person])
  );
  const byName = new Map(roster.map((person) => [normalizeName(person.name), person]));
  const byShort = new Map(roster.map((person) => [firstTokens(person.name), person]));

  const analysis = analyzeSprinLocation({ untuk: sprin.untuk, place: sprin.place });
  const recipients: SprinNotifyRecipientDTO[] = [];
  const skipped: SprinNotifySkippedDTO[] = [];
  let perwiraExcluded = 0;
  let noPhone = 0;
  let otherFunction = 0;
  let already = 0;

  for (const person of sprin.personnel) {
    const rosterMatch =
      (person.nrp ? byNrp.get(person.nrp) : undefined) ??
      byName.get(normalizeName(person.name)) ??
      byShort.get(firstTokens(person.name)) ??
      null;

    // Kolom Jabatan pada Sprin adalah sumber utama fungsi; roster hanya
    // dipakai bila jabatan Sprin tidak menyebut fungsi apa pun.
    let detected = detectFunctionCodes(person.jabatan, functions);
    if (detected.length === 0 && rosterMatch) {
      detected = detectFunctionCodes(
        [rosterMatch.jabatan, rosterMatch.unit].filter(Boolean).join(' '),
        functions
      );
    }
    const selectedCode = detected.find((code) => effectiveCodes.includes(code)) ?? null;

    if (!selectedCode) {
      const reason = detected.length === 0
        ? 'Fungsi tidak dikenali dari kolom jabatan'
        : `Fungsi terdeteksi: ${detected.join(', ')}`;
      otherFunction += 1;
      skipped.push({
        personnelId: person.id,
        no: person.no,
        name: person.name,
        status: detected.length === 0 ? 'skipped_unmatched' : 'skipped_other_function',
        reason
      });
      continue;
    }

    const functionRow = selectedFunctions.find((row) => row.code === selectedCode);
    const selectedExcludePerwira =
      options.excludePerwira ?? draft?.excludePerwira ?? functionRow?.excludePerwira ?? excludePerwira;
    if (selectedExcludePerwira && isPerwira({
      category: rosterMatch?.category,
      rank: rosterMatch?.rank,
      rankNrp: person.rankNrp
    })) {
      perwiraExcluded += 1;
      skipped.push({
        personnelId: person.id,
        no: person.no,
        name: person.name,
        status: 'skipped_excluded',
        reason: 'Perwira dikecualikan dari notifikasi'
      });
      continue;
    }

    const phone = person.phone ?? rosterMatch?.phone ?? null;
    if (!phone) {
      noPhone += 1;
      skipped.push({
        personnelId: person.id,
        no: person.no,
        name: person.name,
        status: 'skipped_no_phone',
        reason: 'Nomor HP tidak ada di database personel'
      });
      continue;
    }

    const previouslyNotified = Boolean(person.notifiedAt);
    if (previouslyNotified) already += 1;
    if (previouslyNotified && !options.force) {
      skipped.push({
        personnelId: person.id,
        no: person.no,
        name: person.name,
        status: 'skipped_already',
        reason: `Sudah dinotifikasi pada ${format(person.notifiedAt!, 'dd MMM yyyy HH:mm')}`
      });
      continue;
    }

    const task = extractPersonnelTaskLocation({
      jabatan: person.jabatan ?? rosterMatch?.jabatan,
      ket: person.ket
    });
    const apel = resolvePersonnelApelLocation({
      no: person.no,
      personnelText: [person.ket, person.jabatan, rosterMatch?.jabatan].filter(Boolean).join(' '),
      analysis
    });

    const issues: string[] = [];
    let taskValue = task.value;
    let taskSource = task.source;
    if (!taskValue && analysis.place && analysis.place.confidence !== 'low') {
      taskValue = analysis.place.value;
      taskSource = 'Tempat kegiatan (metadata)';
    }
    if (!taskValue) {
      taskValue = 'Tidak tercantum pada baris personel; mengacu lampiran Sprin.';
      taskSource = 'Tidak tercantum';
      issues.push('Lokasi tugas tidak tercantum pada baris personel');
    }
    if (task.confidence === 'low' && task.value) {
      issues.push('Lokasi tugas perlu diverifikasi');
    }
    if (apel.issue) issues.push(apel.issue);

    const notes = [
      task.value ? `Sumber lokasi tugas: ${task.source}.` : null,
      ...task.notes,
      ...apel.notes,
      ...(analysis.place?.confidence === 'low' ? [analysis.place.reason] : [])
    ].filter(Boolean) as string[];

    const rankNrp = person.rankNrp ? ` (${person.rankNrp})` : '';
    const vars: Record<string, string> = {
      botName: bot.botName,
      nama: person.name,
      pangkat_nrp: rankNrp,
      sprin: sprin.number,
      kategori: TURJAWALI_LABELS[(sprin.turjawaliType as TurjawaliType) ?? 'LAINNYA'] ?? 'Lainnya',
      tugas: person.penugasan ?? person.jabatan ?? 'Melaksanakan tugas sesuai Sprin',
      kegiatan: (sprin.about ?? 'Tidak tercantum pada Sprin').slice(0, 600),
      lokasi_tugas: taskValue,
      lokasi_apel: apel.value,
      jadwal: analysis.schedule?.text ?? formatJadwal(sprin.activityDate, sprin.timeText),
      catatan_lokasi: notes.length > 0 ? notes.map((note) => `• ${note}`).join('\n') : ''
    };

    const renderedMessage = renderTemplate(template, vars).replace(/\n{3,}/g, '\n\n').trim();
    const override = overrides[person.id]?.trim();
    recipients.push({
      personnelId: person.id,
      no: person.no,
      name: person.name,
      rankNrp: person.rankNrp,
      jabatan: person.jabatan,
      phone,
      functionCode: selectedCode,
      functionName: selectedNames.get(selectedCode) ?? selectedCode,
      message: override || renderedMessage,
      generatedMessage: renderedMessage,
      locationTask: taskValue,
      locationTaskSource: taskSource,
      locationApel: apel.value,
      locationNotes: notes,
      issues: [...new Set(issues)],
      previouslyNotified,
      isOverride: Boolean(override)
    });
  }

  const recipientIds = new Set(recipients.map((recipient) => recipient.personnelId));
  const effectiveOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([personnelId, message]) =>
      recipientIds.has(personnelId) && Boolean(message.trim())
    )
  );

  const reviewReasons = [
    ...(analysis.ambiguous ? analysis.reasons : []),
    ...(recipients.some((recipient) => recipient.issues.length > 0)
      ? [`${recipients.filter((recipient) => recipient.issues.length > 0).length} personel memiliki lokasi yang belum pasti.`]
      : []),
    ...(recipients.length === 0 ? ['Tidak ada personel yang memenuhi kriteria kirim.'] : []),
    ...(selectedFunctions.length === 0
      ? [`Fungsi ${effectiveCodes.join(', ')} tidak aktif/tidak ditemukan di daftar fungsi.`]
      : []),
    ...(selectedFunctions.length > 0 && recipients.length === 0 && noPhone > 0
      ? ['Personel pada fungsi ini belum memiliki nomor HP di database.']
      : [])
  ];

  return {
    sprinId: sprin.id,
    sprinNumber: sprin.number,
    functionCodes: effectiveCodes,
    excludePerwira,
    template,
    overrides: effectiveOverrides,
    recipients,
    skipped,
    totals: {
      personnel: sprin.personnel.length,
      selected: recipients.length,
      withPhone: recipients.length,
      perwiraExcluded,
      noPhone,
      otherFunction,
      already
    },
    analysis,
    requiresReview: reviewReasons.length > 0,
    reviewReasons: [...new Set(reviewReasons)],
    notificationStatus: draft?.status ?? 'none',
    draftUpdatedAt: draft?.updatedAt.toISOString() ?? null
  };
}

async function persistDraft(
  preview: SprinNotifyPreviewDTO,
  options: SprinNotifyOptions,
  status: string
): Promise<void> {
  const analysisSummary = {
    directives: preview.analysis.directives,
    preTaskApel: preview.analysis.preTaskApel,
    place: preview.analysis.place,
    schedule: preview.analysis.schedule,
    ambiguous: preview.analysis.ambiguous,
    reasons: preview.analysis.reasons
  };
  await prisma.sprinNotification.upsert({
    where: { sprinId: preview.sprinId },
    create: {
      sprinId: preview.sprinId,
      status,
      functionCodes: JSON.stringify(preview.functionCodes),
      excludePerwira: preview.excludePerwira,
      template: preview.template,
      overrides: JSON.stringify(preview.overrides),
      analysis: JSON.stringify(analysisSummary),
      requiresReview: preview.requiresReview,
      reviewReasons: JSON.stringify(preview.reviewReasons),
      reviewNote: options.reviewNote ?? null,
      reviewedBy: options.actor ?? null,
      reviewedAt: status === 'approved' || status === 'sent' ? new Date() : null
    },
    update: {
      status,
      functionCodes: JSON.stringify(preview.functionCodes),
      excludePerwira: preview.excludePerwira,
      template: preview.template,
      overrides: JSON.stringify(preview.overrides),
      analysis: JSON.stringify(analysisSummary),
      requiresReview: preview.requiresReview,
      reviewReasons: JSON.stringify(preview.reviewReasons),
      reviewNote: options.reviewNote ?? undefined,
      reviewedBy: options.actor ?? undefined,
      reviewedAt: status === 'approved' || status === 'sent' ? new Date() : undefined
    }
  });
}

async function loadContext(sprinId: string): Promise<PreviewContext | null> {
  const [sprin, functions, roster, bot] = await Promise.all([
    loadSprin(sprinId),
    getNotificationFunctionRows(),
    loadRoster(),
    getBotConfig()
  ]);
  if (!sprin) return null;
  return { sprin, functions, roster, bot };
}

export async function previewSprinNotification(
  sprinId: string,
  options: SprinNotifyOptions = {}
): Promise<SprinNotifyPreviewDTO | null> {
  const context = await loadContext(sprinId);
  if (!context) return null;
  const preview = buildPreview(context, options);
  if (options.persist !== false) {
    const status = preview.requiresReview ? 'pending_review' : 'draft';
    await persistDraft(preview, options, status);
    preview.notificationStatus = status;
    preview.draftUpdatedAt = new Date().toISOString();
  }
  return preview;
}

export async function saveSprinNotificationDraft(
  sprinId: string,
  options: SprinNotifyOptions = {}
): Promise<SprinNotifyPreviewDTO | null> {
  return previewSprinNotification(sprinId, { ...options, persist: true });
}

export async function sendSprinNotification(
  sprinId: string,
  options: SprinNotifyOptions = {}
): Promise<SprinNotifySendResultDTO | null> {
  const context = await loadContext(sprinId);
  if (!context) return null;
  const preview = buildPreview(context, options);

  if (options.dryRun) {
    const status = preview.requiresReview ? 'pending_review' : 'draft';
    await persistDraft(preview, options, status);
    return { ...preview, notificationStatus: status, blocked: false, sent: 0, failed: 0, dryRun: true };
  }

  if (preview.requiresReview && !options.confirmReview) {
    await persistDraft(preview, options, 'pending_review');
    preview.notificationStatus = 'pending_review';
    await recordActivity({
      type: 'sprin_notify_review',
      title: 'Notifikasi Sprin menunggu verifikasi admin',
      description: `${preview.sprinNumber} · ${preview.reviewReasons.join(' ')}`,
      actor: options.actor ?? 'SIGAP',
      entityType: 'sprin',
      entityId: sprinId,
      metadata: { reasons: preview.reviewReasons, functions: preview.functionCodes }
    });
    return { ...preview, blocked: true, sent: 0, failed: 0, dryRun: false };
  }

  if (preview.recipients.length === 0) {
    await persistDraft(preview, options, 'pending_review');
    return { ...preview, notificationStatus: 'pending_review', blocked: true, sent: 0, failed: 0, dryRun: false };
  }

  let sent = 0;
  let failed = 0;
  const limit = options.limit ?? preview.recipients.length;
  const toSend = preview.recipients.slice(0, limit);

  for (const recipient of toSend) {
    const jid = `${recipient.phone}@c.us`;
    const ok = await whatsappManager.sendMessage(jid, recipient.message).catch(() => false);
    if (ok) {
      sent += 1;
      await prisma.sprinPersonnel.update({
        where: { id: recipient.personnelId },
        data: { notifiedAt: new Date() }
      });
      // Jeda antar pesan agar nomor bot tidak diblokir WhatsApp.
      if (!whatsappManager.getStatus().isMock) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }
    } else {
      failed += 1;
    }
  }

  const status = sent > 0 ? 'sent' : 'failed';
  await persistDraft(preview, options, status);
  await prisma.sprinNotification.update({
    where: { sprinId },
    data: { sentCount: sent, failedCount: failed, sentAt: new Date() }
  });

  await recordActivity({
    type: 'sprin_notify',
    title: 'Notifikasi Sprin diproses',
    description: `${preview.sprinNumber} · ${preview.functionCodes.join(', ')} · terkirim ${sent}, gagal ${failed}`,
    actor: options.actor ?? 'Dashboard',
    entityType: 'sprin',
    entityId: sprinId,
    metadata: {
      sent,
      failed,
      functions: preview.functionCodes,
      perwiraExcluded: preview.totals.perwiraExcluded,
      noPhone: preview.totals.noPhone,
      requiresReview: preview.requiresReview
    }
  });

  logger.info(
    { sprin: preview.sprinNumber, sent, failed, functions: preview.functionCodes },
    'Notifikasi Sprin selesai'
  );

  return {
    ...preview,
    notificationStatus: status,
    blocked: false,
    sent,
    failed,
    dryRun: false
  };
}

/** Dipanggil otomatis setelah Sprin diunggah/di-ingest. */
export async function autoNotifySprin(sprinId: string): Promise<void> {
  const bot = await getBotConfig();
  if (bot.notifyOnSprinUpload === false) return;
  const status = whatsappManager.getStatus();
  if (status.status !== 'connected' && status.status !== 'mock') {
    logger.info({ status: status.status }, 'Notifikasi Sprin ditunda: WhatsApp belum terhubung');
    return;
  }
  try {
    const preview = await previewSprinNotification(sprinId, {
      functionCodes: parseCodes(bot.sprinNotifyDefaultFunctions),
      excludePerwira: bot.sprinNotifyExcludePerwira,
      actor: 'SIGAP'
    });
    if (!preview) return;
    if (bot.sprinNotifyMode === 'review' || preview.requiresReview) {
      await recordActivity({
        type: 'sprin_notify_review',
        title: 'Notifikasi Sprin menunggu verifikasi admin',
        description: `${preview.sprinNumber} · ${preview.reviewReasons[0] ?? 'mode tinjau admin aktif'}`,
        actor: 'SIGAP',
        entityType: 'sprin',
        entityId: sprinId,
        metadata: {
          mode: bot.sprinNotifyMode,
          reasons: preview.reviewReasons,
          recipients: preview.recipients.length
        }
      });
      logger.info(
        { sprin: preview.sprinNumber, reasons: preview.reviewReasons },
        'Notifikasi Sprin menunggu verifikasi admin'
      );
      return;
    }
    await sendSprinNotification(sprinId, {
      functionCodes: preview.functionCodes,
      excludePerwira: preview.excludePerwira,
      template: preview.template,
      actor: 'SIGAP'
    });
  } catch (error) {
    logger.warn({ err: error }, 'Gagal mengirim notifikasi Sprin otomatis');
  }
}

export { samePhone, parseFunctionKeywords };
