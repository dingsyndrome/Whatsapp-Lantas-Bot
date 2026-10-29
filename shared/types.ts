export const DEFAULT_TIMEMARK_PROMPT = `Anda adalah mesin ekstraksi data foto Timemark lapangan Polri.
Baca watermark pada foto dan kembalikan HANYA JSON valid dengan skema:
{
  "time": "HH:mm",
  "date": "Hari, DD/MM/YYYY",
  "address": "alamat lengkap",
  "village": "Desa/Kelurahan",
  "district": "Kecamatan",
  "regency": "Kabupaten/Kota",
  "province": "Provinsi",
  "unit": "nama satuan",
  "coordinateText": "format asli koordinat",
  "latitude": -8.619101,
  "longitude": 122.217334,
  "confidence": 0
}
Gunakan null bila field tidak ada. Latitude selatan bernilai negatif, longitude timur positif.
Jangan mengarang data. Pertahankan ejaan nama jalan, desa, dan satuan dari foto.`;

export const DEFAULT_DOCUMENT_PROMPT = `Anda adalah parser dokumen Surat Perintah (Sprin) Polri.
Dari teks dokumen, ekstrak metadata dan SELURUH tabel personel lintas halaman.
Kembalikan HANYA JSON valid dengan skema:
{
  "number": "Sprin/1806/X/KEP./2026",
  "about": "perihal/uraian tugas",
  "dasar": "dasar surat",
  "untuk": "isi bagian Untuk",
  "activityDate": "YYYY-MM-DD",
  "time": "HH:mm",
  "place": "tempat kegiatan",
  "signatory": "nama pejabat",
  "signatoryRank": "pangkat pejabat",
  "personnel": [
    {"no":1,"name":"...","rankNrp":"...","jabatan":"...","penugasan":"...","ket":"...","page":1}
  ]
}
Jangan melewatkan satu baris personel pun. Pertahankan penugasan seperti Koordinator, Pendamping, Peserta, Undangan, Driver, Waskat.`;

export const DEFAULT_AUTO_REPLY = `Terima kasih {name} 🙏
Laporan Anda sudah diterima SIGAP dan sedang diverifikasi otomatis.

{summary}`;

export const DEFAULT_SPRIN_NOTIFY_TEMPLATE = `*{botName}*
Halo {nama}{pangkat_nrp},

Anda tercatat dalam *{sprin}* ({kategori}).

*Tugas:* {tugas}
*Kegiatan:* {kegiatan}

*Lokasi tugas:* {lokasi_tugas}
*Lokasi apel:* {lokasi_apel}
*Jadwal:* {jadwal}

{catatan_lokasi}
Mohon melaksanakan tugas, lalu kirim *foto Timemark* dan *link laporan* ke grup ini.

_Pesan otomatis SIGAP._`;

export const SPRIN_NOTIFY_PLACEHOLDERS = [
  '{botName}',
  '{nama}',
  '{pangkat_nrp}',
  '{sprin}',
  '{kategori}',
  '{tugas}',
  '{kegiatan}',
  '{lokasi_tugas}',
  '{lokasi_apel}',
  '{jadwal}',
  '{catatan_lokasi}'
] as const;

export interface NotificationFunctionDTO {
  id: string;
  code: string;
  name: string;
  keywords: string[];
  excludePerwira: boolean;
  active: boolean;
  sortOrder: number;
  /** Ada nomor HP pada roster untuk fungsi ini. */
  phoneReady: boolean;
  /** Jumlah personel aktif yang punya nomor HP pada fungsi ini. */
  availableCount: number;
}

export interface SprinLocationRange {
  from: number;
  to: number;
}

export interface SprinLocationDirectiveDTO {
  rangeText: string;
  ranges: SprinLocationRange[];
  location: string;
  time: string | null;
  exception: string | null;
  sourceText: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface SprinLocationAnalysisDTO {
  directives: SprinLocationDirectiveDTO[];
  preTaskApel: { location: string; time: string | null; sourceText: string } | null;
  place: { value: string; confidence: 'high' | 'medium' | 'low'; reason: string } | null;
  schedule: { text: string; sourceText: string } | null;
  ambiguous: boolean;
  reasons: string[];
}

export interface SprinNotifyRecipientDTO {
  personnelId: string;
  no: number;
  name: string;
  rankNrp: string | null;
  jabatan: string | null;
  phone: string;
  functionCode: string;
  functionName: string;
  /** Pesan final yang akan dikirim (sudah termasuk override admin). */
  message: string;
  /** Hasil template otomatis sebelum override, untuk tombol "Otomatis". */
  generatedMessage: string;
  locationTask: string;
  locationTaskSource: string;
  locationApel: string;
  locationNotes: string[];
  issues: string[];
  previouslyNotified: boolean;
  /** Pesan ini diedit admin, bukan hasil template otomatis. */
  isOverride: boolean;
}

export interface SprinNotifySkippedDTO {
  personnelId: string;
  no: number;
  name: string;
  status:
    | 'skipped_no_phone'
    | 'skipped_excluded'
    | 'skipped_other_function'
    | 'skipped_already'
    | 'skipped_unmatched';
  reason: string;
}

export interface SprinNotifyPreviewDTO {
  sprinId: string;
  sprinNumber: string;
  functionCodes: string[];
  excludePerwira: boolean;
  template: string;
  /** personnelId → pesan yang diedit admin. */
  overrides: Record<string, string>;
  recipients: SprinNotifyRecipientDTO[];
  skipped: SprinNotifySkippedDTO[];
  totals: {
    personnel: number;
    selected: number;
    withPhone: number;
    perwiraExcluded: number;
    noPhone: number;
    otherFunction: number;
    already: number;
  };
  analysis: SprinLocationAnalysisDTO;
  requiresReview: boolean;
  reviewReasons: string[];
  notificationStatus: string;
  draftUpdatedAt: string | null;
}

export interface SprinNotifySendResultDTO extends SprinNotifyPreviewDTO {
  blocked: boolean;
  sent: number;
  failed: number;
  dryRun: boolean;
}

export const TURJAWALI_TYPES = [
  'PENGATURAN',
  'PENJAGAAN',
  'PENGAWALAN',
  'PATROLI',
  'PENEGAKKAN',
  'LAINNYA'
] as const;

export type TurjawaliType = (typeof TURJAWALI_TYPES)[number];
export type TurjawaliActivityType = Exclude<TurjawaliType, 'LAINNYA'>;

export const TURJAWALI_MATCH_STATUSES = [
  'MATCHED',
  'PARTIAL_MATCH',
  'UNMATCHED'
] as const;
export type TurjawaliMatchStatus = (typeof TURJAWALI_MATCH_STATUSES)[number];

export const TURJAWALI_LABELS: Record<TurjawaliType, string> = {
  PENGATURAN: 'Pengaturan (Gatur)',
  PENJAGAAN: 'Penjagaan',
  PENGAWALAN: 'Pengawalan (Wal)',
  PATROLI: 'Patroli',
  PENEGAKKAN: 'Penegakan Hukum (Gakkum)',
  LAINNYA: 'Lainnya'
};

export const TURJAWALI_SHORT_LABELS: Record<TurjawaliType, string> = {
  PENGATURAN: 'Gatur',
  PENJAGAAN: 'Jaga',
  PENGAWALAN: 'Wal',
  PATROLI: 'Patroli',
  PENEGAKKAN: 'Gakkum',
  LAINNYA: 'Lainnya'
};

export const MATCH_STATUS_LABELS: Record<TurjawaliMatchStatus, string> = {
  MATCHED: 'Matched',
  PARTIAL_MATCH: 'Partial',
  UNMATCHED: 'Unmatched'
};

export type TurjawaliKeywordMap = Record<TurjawaliActivityType, string[]>;

export interface TurjawaliRuleSettings {
  keywords: TurjawaliKeywordMap;
  gaturMorningStart: string;
  gaturMorningEnd: string;
  gaturEveningStart: string;
  gaturEveningEnd: string;
  patrolNightStart: string;
  patrolNightEnd: string;
  matchTimeToleranceMinutes: number;
  matchLocationRadiusMeters: number;
}

export const DEFAULT_TURJAWALI_KEYWORDS: TurjawaliKeywordMap = {
  PENGATURAN: [
    'gatur',
    'pengaturan',
    'gatur pagi',
    'gatur sore',
    'rawan pagi',
    'rawan sore',
    'pos padat',
    'ambang gangguan',
    'simpang',
    'pertigaan',
    'perempatan',
    'tkk',
    'sekolah',
    'penyeberangan',
    'pengaturan lalu lintas'
  ],
  PENJAGAAN: [
    'penjagaan',
    'jaga pos',
    'pos lantas',
    'pos lalu lintas',
    'pos pam',
    'pos yan',
    'strong point',
    'mako',
    'objek vital',
    'piket',
    'pos pengamanan',
    'penjagaan mako'
  ],
  PENGAWALAN: [
    'pengawalan',
    'pengawal',
    'patwal',
    'vvip',
    'vip',
    'konvoi',
    'rombongan',
    'estafet',
    'wal',
    'pengawalan vvip'
  ],
  PATROLI: [
    'patroli',
    'hunting',
    'blue light patrol',
    'blp',
    'patroli dialogis',
    'rawan laka',
    'rawan macet',
    'balap liar',
    'patroli malam',
    'patroli pagi'
  ],
  PENEGAKKAN: [
    'penegakan hukum',
    'gakkum',
    'tilang',
    'penilangan',
    'razia',
    'operasi',
    'penindakan',
    'sidak',
    'etle',
    'penyidikan',
    'laka lantas'
  ]
};

export const DEFAULT_TURJAWALI_RULES: TurjawaliRuleSettings = {
  keywords: DEFAULT_TURJAWALI_KEYWORDS,
  gaturMorningStart: '06:00',
  gaturMorningEnd: '08:00',
  gaturEveningStart: '16:00',
  gaturEveningEnd: '17:30',
  patrolNightStart: '21:00',
  patrolNightEnd: '04:00',
  matchTimeToleranceMinutes: 60,
  matchLocationRadiusMeters: 500
};

export interface TurjawaliLocationSummary {
  address: string;
  count: number;
}

export interface TurjawaliRecapCategory {
  type: TurjawaliActivityType;
  label: string;
  photoCount: number;
  matchedCount: number;
  partialCount: number;
  unmatchedCount: number;
  personnelReported: number;
  personnelAssigned: number;
  locations: TurjawaliLocationSummary[];
}

export interface TurjawaliPersonnelStatus {
  id: string;
  name: string;
  rankNrp: string | null;
  jabatan: string | null;
  penugasan: string | null;
  sprinNumber: string;
  reported: boolean;
  photoCount: number;
  lastReportAt: string | null;
  turjawaliTypes: TurjawaliType[];
}

export interface TurjawaliRecap {
  period: 'daily' | 'weekly';
  date: string;
  from: string;
  to: string;
  label: string;
  totalPhotos: number;
  matchedPhotos: number;
  partialPhotos: number;
  unmatchedPhotos: number;
  otherPhotos: number;
  categories: TurjawaliRecapCategory[];
  personnel: {
    active: number;
    reported: number;
    pending: number;
    details: TurjawaliPersonnelStatus[];
  };
  supervisions: {
    total: number;
    uniqueOfficers: number;
    items: SupervisionSignal[];
  };
}

export interface TimemarkDTO {
  id: string;
  source: string;
  senderName: string;
  /** Label siap tampil: [pangkat] [nama] bila berhasil dicocokkan ke roster. */
  senderLabel?: string;
  senderRank?: string | null;
  senderNumber: string;
  groupName: string | null;
  imageUrl: string;
  imagePath: string;
  thumbnailUrl: string;
  mimeType: string;
  caption: string | null;
  senderCaption: string | null;
  capturedAt: string | null;
  timeText: string | null;
  dateText: string | null;
  address: string | null;
  village: string | null;
  district: string | null;
  regency: string | null;
  province: string | null;
  unitName: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinateText: string | null;
  rawText: string;
  confidence: number;
  aiUsed: boolean;
  status: string;
  turjawaliType: TurjawaliType;
  matchStatus: TurjawaliMatchStatus;
  matchScore: number;
  matchedPersonnelId: string | null;
  matchedPersonnelName: string | null;
  matchNotes: string;
  sprinId: string | null;
  sprinNumber: string | null;
  isSupervision: boolean;
  supervisorSandi: string | null;
  supervisorName: string | null;
  supervisorRank: string | null;
  createdAt: string;
}

export interface PersonnelDTO {
  id: string;
  no: number;
  name: string;
  rankNrp: string | null;
  rank: string | null;
  nrp: string | null;
  jabatan: string | null;
  penugasan: string | null;
  ket: string | null;
  phone: string | null;
  page: number;
}

export interface SprinDTO {
  id: string;
  number: string;
  about: string | null;
  dasar: string | null;
  untuk: string | null;
  activityDate: string | null;
  timeText: string | null;
  place: string | null;
  latitude: number | null;
  longitude: number | null;
  signatory: string | null;
  signatoryRank: string | null;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  source: string;
  status: string;
  turjawaliType: TurjawaliType;
  createdAt: string;
  personnelCount: number;
  reportedLinks: number;
  timemarkCount: number;
  notification: {
    status: string;
    requiresReview: boolean;
    functionCodes: string[];
    updatedAt: string;
    sentAt: string | null;
  } | null;
  personnel?: PersonnelDTO[];
}

export interface LinkDTO {
  id: string;
  messageId: string | null;
  senderName: string;
  /** Label siap tampil: [pangkat] [nama] bila berhasil dicocokkan ke roster. */
  senderLabel?: string;
  senderRank?: string | null;
  senderNumber: string;
  groupName: string | null;
  url: string;
  normalizedUrl: string;
  platform: string;
  category: string;
  title: string | null;
  receivedAt: string;
  status: string;
  httpStatus: number | null;
  verifiedAt: string | null;
  sprinId: string | null;
  sprinNumber: string | null;
  createdAt: string;
}

export interface ActivityDTO {
  id: string;
  type: string;
  title: string;
  description: string | null;
  actor: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PlatformCount {
  platform: string;
  count: number;
}

export interface WeeklyPoint {
  date: string;
  label: string;
  timemark: number;
  links: number;
  documents: number;
}

export interface SprinProgress {
  id: string;
  number: string;
  about: string | null;
  activityDate: string | null;
  personnelCount: number;
  reportedLinks: number;
  percent: number;
}

export interface DashboardStats {
  date: string;
  timemarkToday: number;
  timemarkYesterday: number;
  activeSprin: number;
  activeSprinThisMonth: number;
  linksToday: number;
  linksYesterday: number;
  personnelInvolved: number;
  totalTimemark: number;
  totalSprin: number;
  totalLinks: number;
  totalPersonnel: number;
  avgConfidence: number;
  linksByPlatform: PlatformCount[];
  weekly: WeeklyPoint[];
  sprinProgress: SprinProgress[];
  latestTimemark: TimemarkDTO[];
  latestLinks: LinkDTO[];
  turjawali: TurjawaliRecap;
}

export interface SettingsDTO {
  botName: string;
  waDriver: 'mock' | 'webjs' | 'baileys';
  autoReplyEnabled: boolean;
  autoReplyTemplate: string;
  timemarkPrompt: string;
  documentPrompt: string;
  aiEnabled: boolean;
  aiBaseUrl: string;
  aiApiKey: string;
  aiApiKeySet: boolean;
  aiModel: string;
  scheduleEnabled: boolean;
  scheduleTime: string;
  scheduleTimezone: string;
  scheduleGroupJid: string;
  scheduleGroupName: string;
  minOcrConfidence: number;
  turjawaliMatchingEnabled: boolean;
  turjawaliKeywords: TurjawaliKeywordMap;
  gaturMorningStart: string;
  gaturMorningEnd: string;
  gaturEveningStart: string;
  gaturEveningEnd: string;
  patrolNightStart: string;
  patrolNightEnd: string;
  matchTimeToleranceMinutes: number;
  matchLocationRadiusMeters: number;
  sprinNotifyMode: 'auto' | 'review';
  sprinNotifyDefaultFunctions: string[];
  sprinNotifyExcludePerwira: boolean;
  sprinNotifyTemplate: string;
  groups: MonitoredGroupDTO[];
}

export interface MonitoredGroupDTO {
  id: string;
  jid: string;
  name: string;
  active: boolean;
}

export type WhatsAppStatusValue =
  | 'disconnected'
  | 'connecting'
  | 'qr'
  | 'authenticated'
  | 'connected'
  | 'error'
  | 'mock';

export interface WhatsAppStatusDTO {
  status: WhatsAppStatusValue;
  driver: string;
  phone: string | null;
  pushName: string | null;
  lastConnectedAt: string | null;
  lastError: string | null;
  qrDataUrl: string | null;
  qrGeneratedAt: string | null;
  /** Kode pairing (login lewat nomor HP, tanpa QR) bila diminta. */
  pairingCode?: string | null;
  isMock: boolean;
}

export interface AvailableGroup {
  jid: string;
  name: string;
  participants: number;
}

export interface DailyReport {
  date: string;
  title: string;
  text: string;
  counts: {
    timemark: number;
    links: number;
    sprin: number;
    personnel: number;
  };
  timemarks: TimemarkDTO[];
  links: LinkDTO[];
  sprins: SprinDTO[];
  turjawali: TurjawaliRecap;
}

export interface LinkRecapCounts {
  total: number;
  senders: number;
  valid: number;
  restricted: number;
  invalid: number;
  unchecked: number;
  platforms: number;
}

export interface LinkRecapAccountability {
  /** Jumlah personel non-perwira pada roster Satlantas. */
  rosterTotal: number;
  /** Personel non-perwira yang sudah mengirim minimal satu link. */
  submitted: number;
  /** Personel non-perwira yang belum mengirim link pada periode ini. */
  notSubmitted: Array<{ id: string; label: string }>;
}

export interface LinkRecapResult {
  range: {
    from: string;
    to: string;
    startTime: string | null;
    endTime: string | null;
  };
  counts: LinkRecapCounts;
  platforms: PlatformCount[];
  accountability: LinkRecapAccountability;
  text: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type SimulateKind = 'image' | 'document' | 'links';

export interface SimulatePayload {
  kind: SimulateKind;
  senderName?: string;
  senderNumber?: string;
  groupName?: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

export type PersonnelCategory = 'PERWIRA' | 'PJU' | 'ANGGOTA';

export interface PersonnelRosterDTO {
  id: string;
  no: number;
  name: string;
  rank: string | null;
  nrp: string | null;
  jabatan: string | null;
  phone: string | null;
  unit: string;
  category: PersonnelCategory;
  sandi: string | null;
  active: boolean;
}

export interface PersonnelRosterPage extends Paginated<PersonnelRosterDTO> {
  stats: {
    total: number;
    perwira: number;
    anggota: number;
    withPhone: number;
    withoutPhone: number;
  };
}

export interface SandiSlot {
  code: string;
  label: string;
  personnelId: string | null;
  personnelName: string | null;
  source: 'manual' | 'default' | 'kosong';
}

export interface SandiMapDTO {
  slots: SandiSlot[];
  perwira: Array<{ id: string; name: string; rank: string | null; jabatan: string | null }>;
  updatedAt: string | null;
}

export interface SupervisionSignal {
  photoId: string;
  name: string | null;
  rank: string | null;
  sandi: string | null;
  senderName: string;
  senderNumber: string;
  capturedAt: string | null;
  createdAt: string;
  address: string | null;
  turjawaliType: string;
}

