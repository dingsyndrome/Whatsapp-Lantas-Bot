import type {
  SprinLocationAnalysisDTO,
  SprinLocationDirectiveDTO,
  SprinLocationRange
} from '../../shared/types.js';

const GENERIC_PLACE = /terlampir|sesuai jadwal|lihat lampiran|masing-masing|sesuai sprin/i;
const ROW_BLEED = /\s+\d{1,3}\.\s+[A-Z][A-Z .,'\-]*/;
const NOISE_TAIL = /\s*(?:…|\.\.\.|�).*$/;

const LOCATION_MARKER =
  /\b(DEPAN|DI\s*DEPAN|SIMP(?:ANG)?\.?\s*\d|PAM\s+LOKASI|PAMTUP|PAM\s+TITIK\s+KUMPUL|PAM\s+DEPAN|WAL\s+DARI\s+TITIK\s+KUMPUL|PASAR|JALUR|HALAMAN|KANTOR|GEDUNG|POS\b|MAKO\b|BALDES|SDN?\b|SMPN?\b|SMAN?\b|SMKN?\b|TK\b|MI\b|MTSN?\b|UIN\b|SPBU|PUSKESMAS|TERMINAL|BANDARA|RSB\b|BRI\b|TT\b|GEREJA|TOKO|DPRD|PEMKAB|KEJAKSAAN|POLSEK\s+[A-Z])/;

const UNIT_AT_START = /^(POLSEK|POLRES|SATLANTAS|SATSAMAPTA|SATINTELKAM|SATRESKRIM|SATRESNARKOBA|SIHUMAS|SIPROPAM|BAGOPS|BAGSDM|BAGLOG|SIDOKES|SIUM)\b/;

const FUNCTION_PREFIX =
  /^(?:BA|BRIGPOL|BRIPDA|BRIPTU|BRIGADIR|BRIPKA|AIPDA|AIPTU|IPDA|IPTU|AKP|KOMPOL|AKBP|KANIT[A-Z]*|KASAT[A-Z]*|KAPOLSEK|WAKAPOLSEK|PS\.?\s*KANIT[A-Z]*|PANIT[A-Z]*|KAUR[A-Z]*|KABAG[A-Z]*|KASUBBAG[A-Z]*|KAPOLRES|WAKAPOLRES)\s+/;

export function normalizeLocationText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanFragment(value: string): string {
  return normalizeLocationText(value)
    .replace(ROW_BLEED, ' ')
    .replace(NOISE_TAIL, ' ')
    .replace(/\s+(PADAL|WAPADAL|WASKAT|P\.?\s*JAWAB|KOORDINATOR|PENDAMPING|PESERTA|UNDANGAN|DRIVER)$/i, '')
    .replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRanges(rangeText: string): SprinLocationRange[] {
  const ranges: SprinLocationRange[] = [];
  const pair = /(\d{1,4})\s*(?:s\.?\s*d\.?|sampai|hingga|-)\s*(\d{1,4})/gi;
  for (const match of rangeText.matchAll(pair)) {
    const from = Number(match[1]);
    const to = Number(match[2]);
    if (Number.isFinite(from) && Number.isFinite(to) && from <= to) ranges.push({ from, to });
  }
  if (ranges.length === 0) {
    const single = rangeText.match(/nomor\s+(\d{1,4})/i);
    if (single) {
      const value = Number(single[1]);
      if (Number.isFinite(value)) ranges.push({ from: value, to: value });
    }
  }
  return ranges;
}

function extractTime(value: string): string | null {
  const match = value.match(/\bpukul\s*([0-9]{1,2}[.,:][0-9]{2})\s*(WIB|WITA|WIT)?/i);
  if (!match) return null;
  return `${match[1].replace(':', '.')}${match[2] ? ` ${match[2].toUpperCase()}` : ''}`;
}

function extractExceptionLocation(exception: string | null): string | null {
  if (!exception) return null;
  const match = exception.match(/apel\s+di\s+(?:lokasi\s+)?(.+)$/i);
  return match ? cleanFragment(match[1]) : null;
}

/**
 * Membaca arahan lokasi apel per nomor personel dari bagian "Untuk".
 * Hanya mengutip apa yang tertulis; tidak menebak lokasi yang tidak ada.
 */
export function parseLocationDirectives(untuk: string | null | undefined): SprinLocationDirectiveDTO[] {
  const text = normalizeLocationText(untuk);
  if (!text) return [];
  const directives: SprinLocationDirectiveDTO[] = [];
  const pattern =
    /(?:^|;\s*)(?:[a-z]\.\s*)?(?:tersebut\s+)?nomor\s+(.+?)\s+melaksanakan\s+apel\s+di\s+(.+?)(?=;|$)/gi;

  for (const match of text.matchAll(pattern)) {
    const rangeText = normalizeLocationText(match[1]);
    const rest = normalizeLocationText(match[2]);
    const ranges = parseRanges(rangeText);
    if (ranges.length === 0) continue;

    const time = extractTime(rest);
    const exceptionMatch = rest.match(/\bkecuali\s+(.+)$/i);
    const exception = exceptionMatch ? cleanFragment(exceptionMatch[1]) : null;

    let location = rest;
    if (time) {
      const index = location.toLowerCase().indexOf(`pukul ${time.split(' ')[0]}`);
      if (index >= 0) location = location.slice(0, index);
    }
    if (exceptionMatch) {
      const index = location.toLowerCase().indexOf('kecuali');
      if (index >= 0) location = location.slice(0, index);
    }
    location = cleanFragment(location.replace(/^di\s+/i, ''));

    const confidence: SprinLocationDirectiveDTO['confidence'] =
      ranges.length > 0 && location.length >= 4 && time ? 'high' : location.length >= 4 ? 'medium' : 'low';

    directives.push({
      rangeText,
      ranges,
      location,
      time,
      exception,
      sourceText: normalizeLocationText(match[0]).replace(/^;\s*/, ''),
      confidence
    });
  }

  return directives;
}

export function parsePreTaskApel(
  untuk: string | null | undefined
): SprinLocationAnalysisDTO['preTaskApel'] {
  const text = normalizeLocationText(untuk);
  if (!text) return null;
  const match = text.match(
    /sebelum\s+melaksanakan\s+tugas\s+apel\s+di\s+(.+?)\s+pukul\s+([0-9]{1,2}[.,:][0-9]{2})\s*(WIB|WITA|WIT)?/i
  );
  if (!match) return null;
  return {
    location: cleanFragment(match[1]),
    time: `${match[2].replace(':', '.')}${match[3] ? ` ${match[3].toUpperCase()}` : ''}`,
    sourceText: normalizeLocationText(match[0])
  };
}

export function parseScheduleText(
  untuk: string | null | undefined
): SprinLocationAnalysisDTO['schedule'] {
  const text = normalizeLocationText(untuk);
  if (!text) return null;
  const match = text.match(
    /pelaksanaan\s+tugas\s+hari\s+(\w+)\s+tanggal\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s+pukul\s+([0-9]{1,2}[.,:][0-9]{2})\s*(WIB|WITA|WIT)?(?:\s*s\.?\s*d\.?\s*([^;,]+))?/i
  );
  if (!match) return null;
  const [, day, date, time, zone, until] = match;
  const end = until ? cleanFragment(until) : null;
  return {
    text: `${day}, ${date}, pukul ${time.replace(':', '.')}${zone ? ` ${zone.toUpperCase()}` : ''}${end ? ` s.d. ${end}` : ''}`,
    sourceText: normalizeLocationText(match[0])
  };
}

function classifyPlace(
  place: string | null | undefined,
  untuk: string | null | undefined,
  directives: SprinLocationDirectiveDTO[]
): SprinLocationAnalysisDTO['place'] {
  const value = cleanFragment(place ?? '');
  if (!value || GENERIC_PLACE.test(value)) return null;
  const upper = value.toUpperCase();
  const inException = directives.some((directive) =>
    (directive.exception ?? '').toUpperCase().includes(upper)
  );
  const inDirective = directives.some((directive) =>
    directive.location.toUpperCase().includes(upper)
  );
  if (inException) {
    return {
      value,
      confidence: 'low',
      reason: 'Tempat kegiatan pada metadata hanya disebut dalam pengecualian apel, bukan lokasi utama.'
    };
  }
  if (inDirective) {
    return {
      value,
      confidence: 'low',
      reason: 'Tempat kegiatan pada metadata sama dengan lokasi apel kelompok; perlu dipastikan.'
    };
  }
  const inUntuk = normalizeLocationText(untuk).toUpperCase().includes(upper);
  return {
    value,
    confidence: inUntuk ? 'medium' : 'medium',
    reason: inUntuk
      ? 'Tempat kegiatan disebut pada uraian Sprin.'
      : 'Tempat kegiatan diambil dari metadata Sprin.'
  };
}

export function analyzeSprinLocation(input: {
  untuk: string | null | undefined;
  place: string | null | undefined;
}): SprinLocationAnalysisDTO {
  const directives = parseLocationDirectives(input.untuk);
  const preTaskApel = parsePreTaskApel(input.untuk);
  const place = classifyPlace(input.place, input.untuk, directives);
  const schedule = parseScheduleText(input.untuk);
  const reasons: string[] = [];

  if (directives.length > 0 && preTaskApel) {
    reasons.push(
      'Teks memuat arahan apel umum ("sebelum melaksanakan tugas") dan arahan apel per kelompok; lokasi apel perlu dikonfirmasi admin.'
    );
  }
  if (directives.some((directive) => directive.exception)) {
    reasons.push('Ada pengecualian lokasi apel (mis. Pam Kejaksaan) yang harus dipastikan per personel.');
  }
  if (directives.some((directive) => directive.confidence !== 'high')) {
    reasons.push('Sebagian arahan lokasi apel tidak memuat jam atau lokasi secara lengkap.');
  }
  if (place?.confidence === 'low') {
    reasons.push(place.reason);
  }

  return {
    directives,
    preTaskApel,
    place,
    schedule,
    ambiguous: reasons.length > 0,
    reasons: [...new Set(reasons)]
  };
}

export interface PersonnelTaskLocation {
  value: string | null;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
}

/**
 * Mengambil lokasi tugas per orang dari KET, lalu dari teks Jabatan.
 * Parser PDF sering menaruh KET di ujung kolom Jabatan; nilai yang menempel
 * dengan baris berikutnya dipotong agar tidak menjadi lokasi palsu.
 */
export function extractPersonnelTaskLocation(input: {
  jabatan: string | null | undefined;
  ket: string | null | undefined;
}): PersonnelTaskLocation {
  const ket = cleanFragment(input.ket ?? '');
  if (ket && !GENERIC_PLACE.test(ket)) {
    return { value: ket, source: 'KET', confidence: 'high', notes: [] };
  }

  let jabatan = cleanFragment(input.jabatan ?? '');
  if (!jabatan) return { value: null, source: '-', confidence: 'low', notes: [] };
  jabatan = jabatan.replace(FUNCTION_PREFIX, '').trim();

  let marker = jabatan.match(LOCATION_MARKER);
  if (marker && marker.index === 0 && UNIT_AT_START.test(jabatan)) {
    const remainder = jabatan.slice(marker[0].length).trim();
    marker = remainder.match(LOCATION_MARKER);
    if (marker) {
      jabatan = remainder;
    }
  }

  if (!marker || marker.index === undefined) {
    return { value: null, source: 'Jabatan', confidence: 'low', notes: [] };
  }

  const value = cleanFragment(jabatan.slice(marker.index));
  if (!value || value.length < 3 || GENERIC_PLACE.test(value)) {
    return { value: null, source: 'Jabatan', confidence: 'low', notes: [] };
  }
  return {
    value,
    source: 'Jabatan (KET kosong)',
    confidence: 'medium',
    notes: ['Lokasi diambil dari teks kolom Jabatan karena kolom KET tidak memuat lokasi.']
  };
}

export interface PersonnelApelLocation {
  value: string;
  notes: string[];
  issue: string | null;
}

/**
 * Menentukan lokasi apel dari arahan nomor. Bila ada pengecualian, hanya
 * diterapkan jika teks personel menyebut penanda yang sama (mis. Kejaksaan);
 * selebihnya ditandai untuk verifikasi admin.
 */
export function resolvePersonnelApelLocation(input: {
  no: number;
  personnelText: string | null | undefined;
  analysis: SprinLocationAnalysisDTO;
}): PersonnelApelLocation {
  const text = normalizeLocationText(input.personnelText).toUpperCase();
  const matched = input.analysis.directives.filter((directive) =>
    directive.ranges.some((range) => input.no >= range.from && input.no <= range.to)
  );
  const lines: string[] = [];
  const notes: string[] = [];
  const issues: string[] = [];

  for (const directive of matched) {
    let location = directive.location;
    const time = directive.time ? ` pukul ${directive.time}` : '';
    if (directive.exception) {
      const exceptionLocation = extractExceptionLocation(directive.exception);
      const applies =
        /KEJAKSAAN/.test(text) ||
        (exceptionLocation ? text.includes(exceptionLocation.toUpperCase()) : false);
      if (applies && exceptionLocation) {
        location = exceptionLocation;
        notes.push(
          `Pengecualian diterapkan: teks menyebut "${exceptionLocation}" pada KET/Jabatan personel.`
        );
      } else {
        notes.push(
          `Ada pengecualian pada Sprin: "${directive.exception}". Personel ini tidak memuat penanda pengecualian, mohon verifikasi admin.`
        );
        issues.push('Pengecualian lokasi apel perlu diverifikasi');
      }
    }
    lines.push(`Apel kelompok (${directive.rangeText}): ${location}${time}`);
  }

  if (input.analysis.preTaskApel) {
    const pre = input.analysis.preTaskApel;
    lines.push(`Apel umum (teks "sebelum melaksanakan tugas"): ${pre.location}${pre.time ? ` pukul ${pre.time}` : ''}`);
    if (matched.length > 0) {
      notes.push(
        'Sprin memuat dua arahan apel (umum dan per kelompok); baris di atas dikutip apa adanya dari teks.'
      );
    } else if (input.analysis.directives.length > 0) {
      issues.push('Nomor personel tidak termasuk dalam arahan apel kelompok');
      notes.push('Nomor personel ini tidak masuk rentang arahan apel kelompok pada teks Sprin.');
    }
  }

  if (lines.length === 0) {
    return {
      value: 'Tidak tercantum pada arahan apel di Sprin; mengacu lampiran/perintah lisan.',
      notes,
      issue: 'Lokasi apel tidak tercantum untuk nomor personel ini'
    };
  }

  return { value: lines.join('\n'), notes, issue: issues[0] ?? null };
}

export { extractExceptionLocation };
