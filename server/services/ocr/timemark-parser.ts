import { cleanField, clamp, normalizeOcrText, stripLabel } from './text-utils.js';

export interface TimemarkExtraction {
  timeText: string | null;
  dateText: string | null;
  capturedAt: Date | null;
  dayName: string | null;
  address: string | null;
  village: string | null;
  district: string | null;
  regency: string | null;
  province: string | null;
  unitName: string | null;
  coordinateText: string | null;
  latitude: number | null;
  longitude: number | null;
  rawText: string;
  confidence: number;
  warnings: string[];
}

type MutableExtraction = Omit<TimemarkExtraction, 'rawText' | 'confidence' | 'warnings'>;

const DAY_ALIASES: Record<string, string> = {
  senin: 'Senin',
  selasa: 'Selasa',
  rabu: 'Rabu',
  kamis: 'Kamis',
  jumat: "Jumat",
  "jum'at": 'Jumat',
  sabtu: 'Sabtu',
  minggu: 'Minggu',
  ahad: 'Minggu'
};
const DAY_PATTERN =
  '(Senin|Selasa|Rabu|Kamis|Jumat|Jum\'at|Sabtu|Minggu|Ahad)';

const PROVINCES = [
  'Nusa Tenggara Timur',
  'Nusa Tenggara Barat',
  'DKI Jakarta',
  'Jawa Barat',
  'Jawa Tengah',
  'Jawa Timur',
  'Kalimantan Barat',
  'Kalimantan Tengah',
  'Kalimantan Selatan',
  'Kalimantan Timur',
  'Kalimantan Utara',
  'Sulawesi Utara',
  'Sulawesi Tengah',
  'Sulawesi Selatan',
  'Sulawesi Tenggara',
  'Sulawesi Barat',
  'Maluku Utara',
  'Maluku',
  'Papua Barat Daya',
  'Papua Barat',
  'Papua Tengah',
  'Papua Pegunungan',
  'Papua Selatan',
  'Papua',
  'Bali',
  'Banten',
  'Lampung',
  'Riau',
  'Kepulauan Riau',
  'Jambi',
  'Bengkulu',
  'Sumatera Utara',
  'Sumatera Barat',
  'Sumatera Selatan',
  'Bangka Belitung',
  'Kepulauan Bangka Belitung',
  'Aceh',
  'DI Yogyakarta',
  'Yogyakarta',
  'Gorontalo'
];

const UNIT_RE =
  /(?:Satlantas|Satlantas|Satreskrim|Satresnarkoba|Satintelkam|Satbinmas|Satsabhara|Samapta|Satpolairud|Satpam|Polresta|Polres|Polsek|Polda|Brimob|Batalyon|Kompi|Regu|Unit|Satuan|Dinas|Brigade|Reskrim|Intelkam|Lalu Lintas|Lantas|Shabara|Sabhara|Gegana|Tidur|Subdit|Ditlantas|Ditreskrimum|Polair|Koramil|Kodim)/i;

const ROAD_RE = /(?:^|\b)(?:Jl\.?|Jalan)\s+([^,\n]+)/i;

function normalizeDay(value: string | null | undefined): string | null {
  if (!value) return null;
  return DAY_ALIASES[value.toLowerCase()] ?? null;
}

function parseTime(text: string): string | null {
  const lines = text.split('\n');
  const candidates: string[] = [];

  for (const line of lines.slice(0, 8)) {
    const labelled = line.match(
      /(?:pukul|jam|waktu)\s*[:.\-]?\s*([0-2]?[0-9]|2[0-3])\s*[:.;]\s*([0-5][0-9])/i
    );
    if (labelled) candidates.push(`${labelled[1].padStart(2, '0')}:${labelled[2]}`);
    const atStart = line.match(/^\s*([0-2]?[0-9])\s*[:.;]\s*([0-5][0-9])(?:\s*[:.;]\s*[0-5][0-9])?/);
    if (atStart) candidates.push(`${atStart[1].padStart(2, '0')}:${atStart[2]}`);
  }

  if (candidates.length === 0) {
    const matches = text.matchAll(/(?:^|\s)([0-2]?[0-9])\s*[:.;]\s*([0-5][0-9])(?:\s*[:.;]\s*[0-5][0-9])?(?=\s|$)/gm);
    for (const match of matches) {
      const candidate = `${match[1].padStart(2, '0')}:${match[2]}`;
      const [hours, minutes] = candidate.split(':').map(Number);
      if (hours <= 23 && minutes <= 59) candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    // OCR watermark sering kehilangan titik dua: "i) 08 47 enin".
    for (const match of text.matchAll(/(?:^|[^\d])([0-2][0-9])[ ]{1,3}([0-5][0-9])(?![\d])/g)) {
      const candidate = `${match[1]}:${match[2]}`;
      const [hours, minutes] = candidate.split(':').map(Number);
      if (hours <= 23 && minutes <= 59) candidates.push(candidate);
    }
  }

  return candidates[0] ?? null;
}

interface DateResult {
  dateText: string;
  dayName: string | null;
  date: Date;
}

function parseDate(text: string): DateResult | null {
  const flat = text.replace(/\n/g, ' ');
  const patterns: Array<{
    re: RegExp;
    dayFirst: boolean;
    dayGroup: number;
    monthGroup: number;
    yearGroup: number;
    nameGroup: number;
  }> = [
    {
      re: new RegExp(`${DAY_PATTERN}\\s*[,.]?\\s*(\\d{1,2})\\s*[/\\-.]\\s*(\\d{1,2})\\s*[/\\-.]\\s*(\\d{4})`, 'i'),
      dayFirst: true,
      dayGroup: 2,
      monthGroup: 3,
      yearGroup: 4,
      nameGroup: 1
    },
    {
      re: new RegExp(`(\\d{1,2})\\s*[/\\-.]\\s*(\\d{1,2})\\s*[/\\-.]\\s*(\\d{4})\\s*[,.]?\\s*${DAY_PATTERN}`, 'i'),
      dayFirst: true,
      dayGroup: 1,
      monthGroup: 2,
      yearGroup: 3,
      nameGroup: 4
    },
    {
      re: /(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})/,
      dayFirst: true,
      dayGroup: 1,
      monthGroup: 2,
      yearGroup: 3,
      nameGroup: -1
    }
  ];

  for (const pattern of patterns) {
    const match = flat.match(pattern.re);
    if (!match) continue;
    const day = Number(match[pattern.dayGroup]);
    let month = Number(match[pattern.monthGroup]);
    const year = Number(match[pattern.yearGroup]);
    if (month > 12 && day <= 12) {
      const swapped = day;
      month = day;
      // dd/mm/yyyy is canonical; swap only when the first value cannot be a day.
      if (swapped > 31) continue;
    }
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2100) continue;
    // Tengah hari lokal: menghindari tanggal bergeser ke hari sebelumnya saat
    // disimpan sebagai UTC (WIB = UTC+7).
    const date = new Date(year, month - 1, day, 12, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) continue;
    const dayName = pattern.nameGroup > 0 ? normalizeDay(match[pattern.nameGroup]) : null;
    return {
      dateText: `${dayName ? `${dayName}, ` : ''}${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
      dayName,
      date
    };
  }
  return null;
}

function dmsToDecimal(
  degrees: string,
  minutes: string | undefined,
  seconds: string | undefined,
  hemisphere: string
): number {
  const deg = Number(degrees);
  const min = Number(minutes ?? 0);
  const sec = Number((seconds ?? '0').replace(',', '.'));
  const magnitude = deg + min / 60 + sec / 3600;
  return /[SW]/i.test(hemisphere) ? -magnitude : magnitude;
}

export function parseCoordinate(text: string): {
  coordinateText: string | null;
  latitude: number | null;
  longitude: number | null;
} {  const flat = text.replace(/\n/g, ' ');

  const dms = flat.match(
    /(\d{1,3})\s*°\s*(?:(\d{1,2})\s*['′’])?\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*["″”])?\s*([NS])\s*[,;\s]*\s*(\d{1,3})\s*°\s*(?:(\d{1,2})\s*['′’])?\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*["″”])?\s*([EW])/i
  );
  if (dms) {
    const latitude = dmsToDecimal(dms[1], dms[2], dms[3], dms[4]);
    const longitude = dmsToDecimal(dms[5], dms[6], dms[7], dms[8]);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return {
        coordinateText: `${dms[1]}°${dms[2] ?? '00'}'${dms[3] ?? '00'}"${dms[4].toUpperCase()}, ${dms[5]}°${dms[6] ?? '00'}'${dms[7] ?? '00'}"${dms[8].toUpperCase()}`,
        latitude,
        longitude
      };
    }
  }

  const decimal = flat.match(
    /(\d{1,3}(?:[.,]\d{2,}))\s*°?\s*([NS])\s*[,;\s]+(\d{1,3}(?:[.,]\d{2,}))\s*°?\s*([EW])/i
  );
  if (decimal) {
    const latitude = Number(decimal[1].replace(',', '.')) * (/S/i.test(decimal[2]) ? -1 : 1);
    const longitude = Number(decimal[3].replace(',', '.')) * (/W/i.test(decimal[4]) ? -1 : 1);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return {
        coordinateText: `${decimal[1]}°${decimal[2].toUpperCase()}, ${decimal[3]}°${decimal[4].toUpperCase()}`,
        latitude,
        longitude
      };
    }
  }

  const signed = flat.match(
    /(?:koordinat\s*[:.]?\s*)?(-?\d{1,2}[.,]\d{3,})\s*[,;\s]+(-?\d{2,3}[.,]\d{3,})/i
  );
  if (signed) {
    const latitude = Number(signed[1].replace(',', '.'));
    const longitude = Number(signed[2].replace(',', '.'));
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return {
        coordinateText: `${signed[1]}, ${signed[2]}`,
        latitude,
        longitude
      };
    }
  }

  return { coordinateText: null, latitude: null, longitude: null };
}

function splitAddressPart(raw: string): string {
  return cleanField(
    raw
      .replace(/\s+(?:Kec\.?|Kecamatan|Kab\.?|Kabupaten|Kota|Prov\.?|Provinsi)\b.*$/i, '')
      .replace(/\s{2,}/g, ' ')
  ) ?? '';
}

function parseAddress(text: string): Pick<
  TimemarkExtraction,
  'address' | 'village' | 'district' | 'regency' | 'province'
> {
  const flat = text.replace(/\n/g, ', ');
  const provinceMatch = PROVINCES.find((province) =>
    new RegExp(`\\b${province.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(flat)
  );
  const labelledProvince = flat.match(/(?:Provinsi|Prov\.?)\s*[:.]?\s*([A-Za-zÀ-ÿ .]+?)(?=,|$|\n)/i);

  const villageMatch = flat.match(
    /(?:Desa|Kelurahan|Kel\.?|Ds\.?)\s*[:.]?\s*([A-Za-zÀ-ÿ0-9 .'\-]+?)(?=\s*(?:,|\bKec\.?\b|\bKecamatan\b|\bKab\.?\b|\bKabupaten\b|\bKota\b|\bProvinsi\b|$))/i
  );
  const districtMatch = flat.match(
    /(?:Kecamatan|Kec\.?)\s*[:.]?\s*([A-Za-zÀ-ÿ0-9 .'\-]+?)(?=\s*(?:,|\bKab\.?\b|\bKabupaten\b|\bKota\b|\bProvinsi\b|$))/i
  );
  const kabupatenMatch = flat.match(
    /(?:Kabupaten|Kab\.?)\s*[:.]?\s*([A-Za-zÀ-ÿ0-9 .'\-]+?)(?=\s*(?:,|\bProvinsi\b|\bProv\.?\b|$))/i
  );
  const kotaMatch = flat.match(
    /(?:^|[,;]\s*)Kota\s+([A-Za-zÀ-ÿ0-9 .'\-]+?)(?=\s*(?:,|\bProvinsi\b|\bProv\.?\b|$))/i
  );

  const lines = text.split('\n');
  const addressCandidates = lines.filter(
    (line) =>
      ROAD_RE.test(line) ||
      /\b(?:Desa|Kelurahan|Kel\.?|Kec\.?|Kecamatan|Kab\.?|Kabupaten|Provinsi)\b/i.test(line)
  );

  let addressLine = cleanField(
    stripLabel(addressCandidates.join(', '), ['alamat', 'lokasi'])
  );
  if (addressLine) {
    addressLine = addressLine
      .replace(/\s+(?:Koordinat|Titik|GPS)\s*[:.].*$/i, '')
      .replace(/\s+(?:Satlantas|Satreskrim|Polres|Polsek|Satuan|Unit)\b.*$/i, '')
      .replace(/,\s*,+\s*/g, ', ')
      .replace(/\s{2,}/g, ' ')
  }

  const village = villageMatch ? splitAddressPart(villageMatch[1]) : null;
  const district = districtMatch ? splitAddressPart(districtMatch[1]) : null;
  const regency = kabupatenMatch
    ? splitAddressPart(kabupatenMatch[1])
    : kotaMatch
      ? splitAddressPart(kotaMatch[1])
      : null;
  const province = provinceMatch
    ? provinceMatch
    : labelledProvince
      ? cleanField(labelledProvince[1])
      : null;

  const components = [village, district, regency, province].filter(
    (part): part is string => Boolean(part)
  );
  let address = addressLine || (components.length > 0 ? components.join(', ') : null);
  if (address) {
    for (const component of components) {
      if (!address.toLowerCase().includes(component.toLowerCase())) {
        address = `${address}, ${component}`;
      }
    }
  }

  return {
    address,
    village,
    district,
    regency,
    province
  };
}

function parseUnit(text: string): string | null {
  const lines = text.split('\n');
  const candidates = lines
    .filter((line) => UNIT_RE.test(line) && !ROAD_RE.test(line))
    .map((line) =>
      cleanField(line.replace(/^\s*(?:satuan|unit kerja|unit)\s*:\s*/i, ''))
    )
    .filter((line): line is string => Boolean(line));

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.length - a.length)[0]?.slice(0, 160) ?? null;
}

export function parseTimemarkText(
  rawText: string,
  engineConfidence = 0,
  options: { minConfidence?: number } = {}
): TimemarkExtraction {
  const text = normalizeOcrText(rawText);
  const warnings: string[] = [];

  const timeText = parseTime(text);
  const dateResult = parseDate(text);
  const coordinates = parseCoordinate(text);
  const address = parseAddress(text);
  const unitName = parseUnit(text);

  const capturedAt = dateResult ? new Date(dateResult.date) : null;
  if (capturedAt && timeText) {
    const [hours, minutes] = timeText.split(':').map(Number);
    capturedAt.setHours(hours, minutes, 0, 0);
  }

  if (!timeText) warnings.push('Jam pelaksanaan tidak terbaca.');
  if (!dateResult) warnings.push('Hari/tanggal tidak terbaca.');
  if (!address.address) warnings.push('Alamat tidak terbaca.');
  if (!unitName) warnings.push('Nama satuan tidak terbaca.');
  if (coordinates.latitude === null) warnings.push('Titik koordinat GPS tidak terbaca.');

  const qualityFields = [
    Boolean(timeText),
    Boolean(dateResult),
    Boolean(address.address),
    Boolean(unitName),
    coordinates.latitude !== null
  ];
  const completeness = qualityFields.filter(Boolean).length / qualityFields.length;
  const engine = clamp(Number.isFinite(engineConfidence) ? engineConfidence : 0, 0, 100);
  const confidence = Math.round(engine * 0.62 + completeness * 100 * 0.38);

  if (confidence < (options.minConfidence ?? 50)) {
    warnings.push(`Keyakinan ekstraksi ${confidence}% di bawah ambang ${options.minConfidence ?? 50}%.`);
  }

  const extraction: MutableExtraction = {
    timeText,
    dateText: dateResult?.dateText ?? null,
    capturedAt,
    dayName: dateResult?.dayName ?? null,
    address: address.address,
    village: address.village,
    district: address.district,
    regency: address.regency,
    province: address.province,
    unitName,
    coordinateText: coordinates.coordinateText,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude
  };

  return {
    ...extraction,
    rawText: text,
    confidence,
    warnings
  };
}

export function mergeTimemarkExtractions(
  primary: TimemarkExtraction,
  fallback: Partial<TimemarkExtraction> | null
): TimemarkExtraction {
  if (!fallback) return primary;
  const coordinateText = fallback.coordinateText ?? primary.coordinateText;
  let latitude = fallback.latitude ?? primary.latitude;
  let longitude = fallback.longitude ?? primary.longitude;
  if (latitude === null && coordinateText) {
    const parsed = parseCoordinate(coordinateText);
    latitude = parsed.latitude;
    longitude = parsed.longitude;
  }
  return {
    ...primary,
    timeText: fallback.timeText ?? primary.timeText,
    dateText: fallback.dateText ?? primary.dateText,
    capturedAt: fallback.capturedAt ?? primary.capturedAt,
    dayName: fallback.dayName ?? primary.dayName,
    address: fallback.address ?? primary.address,
    village: fallback.village ?? primary.village,
    district: fallback.district ?? primary.district,
    regency: fallback.regency ?? primary.regency,
    province: fallback.province ?? primary.province,
    unitName: fallback.unitName ?? primary.unitName,
    coordinateText,
    latitude,
    longitude,
    confidence: Math.max(primary.confidence, fallback.confidence ?? 0),
    warnings: primary.warnings
  };
}
