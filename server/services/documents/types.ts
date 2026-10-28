export interface ParsedPersonnel {
  no: number;
  name: string;
  rankNrp: string | null;
  rank: string | null;
  nrp: string | null;
  jabatan: string | null;
  penugasan: string | null;
  ket: string | null;
  page: number;
  rawText: string;
}

export interface ParsedSprinDocument {
  number: string | null;
  about: string | null;
  dasar: string | null;
  untuk: string | null;
  activityDate: Date | null;
  dateText: string | null;
  timeText: string | null;
  place: string | null;
  latitude: number | null;
  longitude: number | null;
  signatory: string | null;
  signatoryRank: string | null;
  personnel: ParsedPersonnel[];
  rawText: string;
  pageCount: number;
  warnings: string[];
  aiUsed: boolean;
}

export const PAGE_BREAK = '\n[[SIGAP_PAGE_BREAK]]\n';
