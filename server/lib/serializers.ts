import type { Prisma } from '@prisma/client';
import type {
  LinkDTO,
  PersonnelDTO,
  SprinDTO,
  TimemarkDTO,
  TurjawaliMatchStatus,
  TurjawaliType
} from '../../shared/types.js';
import { TURJAWALI_MATCH_STATUSES, TURJAWALI_TYPES } from '../../shared/types.js';
import { mediaUrl } from '../config.js';

export type TimemarkWithSprin = Prisma.TimemarkPhotoGetPayload<{
  include: {
    sprin: { select: { number: true } };
    matchedPersonnel: { select: { id: true; name: true; rankNrp: true; penugasan: true } };
  };
}>;

export type LinkWithSprin = Prisma.LinkSubmissionGetPayload<{
  include: { sprin: { select: { number: true } } };
}>;

export type SprinWithCounts = Prisma.SprinGetPayload<{
  include: {
    _count: { select: { personnel: true; links: true; timemarks: true } };
  };
}>;

export type SprinWithPersonnel = SprinWithCounts & {
  personnel: Prisma.SprinPersonnelGetPayload<Record<string, never>>[];
};

export function serializeTimemark(photo: TimemarkWithSprin): TimemarkDTO {
  const fallbackImage = mediaUrl(photo.imagePath) ?? '';
  const turjawaliType = TURJAWALI_TYPES.includes(photo.turjawaliType as TurjawaliType)
    ? (photo.turjawaliType as TurjawaliType)
    : 'LAINNYA';
  const matchStatus = TURJAWALI_MATCH_STATUSES.includes(
    photo.matchStatus as TurjawaliMatchStatus
  )
    ? (photo.matchStatus as TurjawaliMatchStatus)
    : 'UNMATCHED';
  return {
    id: photo.id,
    source: photo.source,
    senderName: photo.senderName,
    senderNumber: photo.senderNumber,
    groupName: photo.groupName,
    imageUrl: fallbackImage,
    imagePath: photo.imagePath,
    thumbnailUrl: mediaUrl(photo.thumbnailPath) ?? fallbackImage,
    mimeType: photo.mimeType,
    caption: photo.caption,
    senderCaption: photo.senderCaption,
    capturedAt: photo.capturedAt?.toISOString() ?? null,
    timeText: photo.timeText,
    dateText: photo.dateText,
    address: photo.address,
    village: photo.village,
    district: photo.district,
    regency: photo.regency,
    province: photo.province,
    unitName: photo.unitName,
    latitude: photo.latitude,
    longitude: photo.longitude,
    coordinateText: photo.coordinateText,
    rawText: photo.rawText,
    confidence: photo.confidence,
    aiUsed: photo.aiUsed,
    status: photo.status,
    turjawaliType,
    matchStatus,
    matchScore: photo.matchScore,
    matchedPersonnelId: photo.matchedPersonnelId,
    matchedPersonnelName: photo.matchedPersonnel?.name ?? null,
    matchNotes: photo.matchNotes,
    sprinId: photo.sprinId,
    sprinNumber: photo.sprin?.number ?? null,
    isSupervision: photo.isSupervision,
    supervisorSandi: photo.supervisorSandi,
    supervisorName: photo.supervisorName,
    supervisorRank: photo.supervisorRank,
    createdAt: photo.createdAt.toISOString()
  };
}

export function serializePersonnel(person: {
  id: string;
  no: number;
  name: string;
  rankNrp: string | null;
  rank: string | null;
  nrp: string | null;
  jabatan: string | null;
  penugasan: string | null;
  ket: string | null;
  phone?: string | null;
  page: number;
}): PersonnelDTO {
  return {
    id: person.id,
    no: person.no,
    name: person.name,
    rankNrp: person.rankNrp,
    rank: person.rank,
    nrp: person.nrp,
    jabatan: person.jabatan,
    penugasan: person.penugasan,
    ket: person.ket,
    phone: person.phone ?? null,
    page: person.page
  };
}

export function serializeSprin(sprin: SprinWithCounts | SprinWithPersonnel): SprinDTO {
  const personnel = 'personnel' in sprin ? sprin.personnel.map(serializePersonnel) : undefined;
  return {
    id: sprin.id,
    number: sprin.number,
    about: sprin.about,
    dasar: sprin.dasar,
    untuk: sprin.untuk,
    activityDate: sprin.activityDate?.toISOString() ?? null,
    timeText: sprin.timeText,
    place: sprin.place,
    latitude: sprin.latitude,
    longitude: sprin.longitude,
    signatory: sprin.signatory,
    signatoryRank: sprin.signatoryRank,
    fileUrl: mediaUrl(sprin.filePath),
    fileName: sprin.fileName,
    mimeType: sprin.mimeType,
    source: sprin.source,
    status: sprin.status,
    turjawaliType: TURJAWALI_TYPES.includes(sprin.turjawaliType as TurjawaliType)
      ? (sprin.turjawaliType as TurjawaliType)
      : 'LAINNYA',
    createdAt: sprin.createdAt.toISOString(),
    personnelCount: sprin._count.personnel,
    reportedLinks: sprin._count.links,
    timemarkCount: sprin._count.timemarks,
    personnel
  };
}

export function serializeLink(link: LinkWithSprin): LinkDTO {
  return {
    id: link.id,
    messageId: link.messageId,
    senderName: link.senderName,
    senderNumber: link.senderNumber,
    groupName: link.groupName,
    url: link.url,
    normalizedUrl: link.normalizedUrl,
    platform: link.platform,
    category: link.category,
    title: link.title,
    receivedAt: link.receivedAt.toISOString(),
    status: link.status,
    httpStatus: link.httpStatus,
    verifiedAt: link.verifiedAt?.toISOString() ?? null,
    sprinId: link.sprinId,
    sprinNumber: link.sprin?.number ?? null,
    createdAt: link.createdAt.toISOString()
  };
}
