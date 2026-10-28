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

export const TURJAWALI_TYPES = [
  'PENGATURAN',
  'PENJAGAAN',
  'PENGAWALAN',
  'PATROLI',
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
  LAINNYA: 'Lainnya'
};

export const TURJAWALI_SHORT_LABELS: Record<TurjawaliType, string> = {
  PENGATURAN: 'Gatur',
  PENJAGAAN: 'Jaga',
  PENGAWALAN: 'Wal',
  PATROLI: 'Patroli',
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
}

export interface TimemarkDTO {
  id: string;
  source: string;
  senderName: string;
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
  personnel?: PersonnelDTO[];
}

export interface LinkDTO {
  id: string;
  messageId: string | null;
  senderName: string;
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
  waDriver: 'mock' | 'webjs';
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
