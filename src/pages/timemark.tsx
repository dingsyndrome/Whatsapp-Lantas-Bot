import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  Camera,
  Car,
  CheckCircle2,
  Clock3,
  Crosshair,
  Download,
  ExternalLink,
  FileImage,
  LayoutGrid,
  List,
  MapPin,
  CreditCard,
  Gavel,
  Radar,
  RefreshCw,
  Route,
  ScanText,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrafficCone,
  UploadCloud,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  DashboardStats,
  Paginated,
  TimemarkDTO,
  TurjawaliMatchStatus,
  TurjawaliType
} from '@/shared/types';
import {
  MATCH_STATUS_LABELS,
  TURJAWALI_LABELS,
  TURJAWALI_MATCH_STATUSES,
  TURJAWALI_SHORT_LABELS,
  TURJAWALI_TYPES
} from '@/shared/types';
import { PageHeader, EmptyState } from '@/components/sigap/page-header';
import { StatusBadge } from '@/components/sigap/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApi, useDebouncedValue } from '@/src/hooks/use-api';
import { useRealtimeVersion } from '@/src/lib/realtime';
import { api, downloadFile, errorMessage, exportUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime, formatNumber, truncate } from '@/lib/format';

const PAGE_SIZE = 12;

/** Tanggal lokal (bukan UTC) untuk input type="date". */
function toLocalDateInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return [date.getFullYear(), month, day].join('-');
}

const ACTIVE_TURJAWALI: Exclude<TurjawaliType, 'LAINNYA'>[] = [
  'PENGATURAN',
  'PENJAGAAN',
  'PENGAWALAN',
  'PATROLI',
  'PENEGAKKAN',
  'REGIDENT'
];

const TURJAWALI_TAB_LABELS: Record<TurjawaliType, string> = {
  PENGATURAN: 'Pengaturan',
  PENJAGAAN: 'Penjagaan',
  PENGAWALAN: 'Pengawalan',
  PATROLI: 'Patroli',
  PENEGAKKAN: 'Gakkum',
  REGIDENT: 'Regident',
  LAINNYA: 'Lainnya'
};

const TURJAWALI_ICONS: Record<TurjawaliType, React.ElementType> = {
  PENGATURAN: TrafficCone,
  PENJAGAAN: Shield,
  PENGAWALAN: Car,
  PATROLI: Radar,
  PENEGAKKAN: Gavel,
  REGIDENT: CreditCard,
  LAINNYA: Crosshair
};

const TURJAWALI_STYLES: Record<TurjawaliType, { badge: string; icon: string }> = {
  PENGATURAN: {
    badge: 'border-primary/25 bg-primary/10 text-primary',
    icon: 'bg-primary/10 text-primary border-primary/20'
  },
  PENJAGAAN: {
    badge: 'border-info/25 bg-info/10 text-info',
    icon: 'bg-info/10 text-info border-info/20'
  },
  PENGAWALAN: {
    badge: 'border-violet-500/25 bg-violet-500/10 text-violet-400',
    icon: 'bg-violet-500/10 text-violet-400 border-violet-500/20'
  },
  PENEGAKKAN: {
    badge: 'border-warning/25 bg-warning/10 text-warning',
    icon: 'bg-warning/10 text-warning border-warning/20'
  },
  REGIDENT: {
    badge: 'border-sky-500/25 bg-sky-500/10 text-sky-400',
    icon: 'bg-sky-500/10 text-sky-400 border-sky-500/20'
  },
  PATROLI: {
    badge: 'border-success/25 bg-success/10 text-success',
    icon: 'bg-success/10 text-success border-success/20'
  },
  LAINNYA: {
    badge: 'border-border bg-muted text-muted-foreground',
    icon: 'bg-muted text-muted-foreground border-border'
  }
};

function TurjawaliBadge({
  type,
  short = false
}: {
  type: TurjawaliType;
  short?: boolean;
}) {
  const style = TURJAWALI_STYLES[type];
  const Icon = type === 'LAINNYA' ? Crosshair : TURJAWALI_ICONS[type];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold',
        style.badge
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {short ? TURJAWALI_SHORT_LABELS[type] : TURJAWALI_LABELS[type]}
    </span>
  );
}

function MatchBadge({ status, score }: { status: TurjawaliMatchStatus; score: number }) {
  const variant =
    status === 'MATCHED' ? 'success' : status === 'PARTIAL_MATCH' ? 'warning' : 'muted';
  return (
    <Badge variant={variant} className="gap-1 text-[9px]">
      {MATCH_STATUS_LABELS[status]}
      <span className="font-mono opacity-75">{score}%</span>
    </Badge>
  );
}

function SupervisionBadge({ photo }: { photo: TimemarkDTO }) {
  if (!photo.isSupervision) return null;
  const who = [photo.supervisorRank, photo.supervisorName].filter(Boolean).join(' ');
  return (
    <Badge variant="violet" className="gap-1 text-[9px]" title={who || undefined}>
      <ShieldCheck className="h-2.5 w-2.5" />
      Supervisi
      {photo.supervisorSandi ? <span className="font-mono">{photo.supervisorSandi}</span> : null}
    </Badge>
  );
}

function TimemarkSummary({
  data,
  reviewCount,
  stats
}: {
  data: Paginated<TimemarkDTO>;
  reviewCount: number;
  stats: DashboardStats | null;
}) {
  const verified = Math.max(0, data.total - reviewCount);
  const matched = stats?.turjawali.matchedPhotos ?? 0;
  const partial = stats?.turjawali.partialPhotos ?? 0;
  const cards = [
    {
      label: 'Total foto',
      value: formatNumber(data.total),
      icon: Camera,
      color: 'text-primary bg-primary/10 border-primary/20'
    },
    {
      label: 'Matched Turjawali',
      value: formatNumber(matched),
      hint: `${partial} partial`,
      icon: CheckCircle2,
      color: 'text-success bg-success/10 border-success/20'
    },
    {
      label: 'Perlu review',
      value: formatNumber(reviewCount),
      icon: AlertTriangle,
      color: 'text-warning bg-warning/10 border-warning/20'
    },
    {
      label: 'Rata-rata OCR',
      value: `${stats?.avgConfidence ?? 0}%`,
      hint: `${verified} terverifikasi`,
      icon: ScanText,
      color: 'text-info bg-info/10 border-info/20'
    }
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-soft">
            <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg border', card.color)}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{card.label}</p>
              <p className="text-lg font-bold leading-tight">{card.value}</p>
              {card.hint ? <p className="mt-0.5 text-[9px] text-muted-foreground">{card.hint}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PhotoCard({ photo, onClick }: { photo: TimemarkDTO; onClick: () => void }) {
  const [imageError, setImageError] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group overflow-hidden rounded-xl border border-border/80 bg-card text-left shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {imageError ? (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <FileImage className="h-8 w-8" />
          </div>
        ) : (
          <img
            src={photo.thumbnailUrl}
            alt={`Timemark ${photo.unitName ?? photo.senderName}`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        )}
        <div className="absolute inset-0 image-shade" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span className="rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 font-mono text-sm font-bold text-white backdrop-blur-sm">
            {photo.timeText ?? '--:--'}
          </span>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={photo.status} className="border-0 bg-slate-950/60 backdrop-blur-sm" />
            <span className="rounded-md border border-white/10 bg-slate-950/60 px-1.5 py-0.5 text-[9px] font-bold text-primary backdrop-blur-sm">
              {TURJAWALI_SHORT_LABELS[photo.turjawaliType]}
            </span>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-medium text-slate-300">
            <Clock3 className="h-3 w-3 text-primary" />
            {photo.dateText ?? formatDate(photo.capturedAt)}
          </p>
          <p className="mt-1 line-clamp-1 text-[13px] font-bold text-white">
            {photo.unitName ?? 'Satuan tidak terbaca'}
          </p>
        </div>
      </div>
      <div className="space-y-2.5 p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <TurjawaliBadge type={photo.turjawaliType} />
          <MatchBadge status={photo.matchStatus} score={photo.matchScore} />
          <SupervisionBadge photo={photo} />
          {photo.matchedPersonnelName ? (
            <span className="truncate text-[8px] text-muted-foreground">
              {photo.matchedPersonnelName}
            </span>
          ) : null}
        </div>
        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" />
          <span className="line-clamp-2">{photo.address ?? 'Alamat tidak terbaca'}</span>
        </p>
        <div className="flex items-center justify-between border-t border-border/50 pt-2.5">
          <span className="truncate text-[10px] text-muted-foreground">{photo.senderName}</span>
          <span className="flex items-center gap-1.5">
            {photo.aiUsed ? (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[8px] font-semibold text-primary"
                title="Sebagian data diverifikasi ulang dengan AI"
              >
                <Sparkles className="h-2.5 w-2.5" /> AI
              </span>
            ) : null}
            <span
              className={cn(
                'text-[10px] font-bold',
                photo.confidence >= 80
                  ? 'text-success'
                  : photo.confidence >= 50
                    ? 'text-warning'
                    : 'text-destructive'
              )}
            >
              {photo.confidence}%
            </span>
          </span>
        </div>
      </div>
    </button>
  );
}

function DetailDialog({
  photo,
  open,
  onOpenChange,
  onUpdated
}: {
  photo: TimemarkDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (photo: TimemarkDTO) => void;
}) {
  const [overrideType, setOverrideType] = React.useState<TurjawaliType>('LAINNYA');
  const [savingOverride, setSavingOverride] = React.useState(false);
  const [editTime, setEditTime] = React.useState('');
  const [editDate, setEditDate] = React.useState('');
  const [editUnit, setEditUnit] = React.useState('');
  const [editAddress, setEditAddress] = React.useState('');
  const [savingData, setSavingData] = React.useState(false);

  React.useEffect(() => {
    if (!photo) return;
    setOverrideType(photo.turjawaliType);
    setEditTime(photo.timeText ?? '');
    setEditDate(toLocalDateInput(photo.capturedAt));
    setEditUnit(photo.unitName ?? '');
    setEditAddress(photo.address ?? '');
  }, [photo]);

  const saveManualData = async () => {
    if (!photo) return;
    if (editTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(editTime)) {
      toast.error('Format jam harus HH:MM', { description: 'Contoh: 07:00' });
      return;
    }
    setSavingData(true);
    try {
      const updated = await api.patch<TimemarkDTO>(`/timemark/${photo.id}`, {
        timeText: editTime || null,
        capturedAt: editDate ? new Date(`${editDate}T12:00:00`).toISOString() : null,
        unitName: editUnit || null,
        address: editAddress || null
      });
      toast.success('Data Timemark disimpan', {
        description: `${updated.timeText ?? '-'} · ${updated.dateText ?? '-'} · status ${updated.status}`
      });
      onUpdated(updated);
    } catch (error) {
      toast.error('Gagal menyimpan koreksi', { description: errorMessage(error) });
    } finally {
      setSavingData(false);
    }
  };

  if (!photo) return null;
  const mapsUrl =
    photo.latitude !== null && photo.longitude !== null
      ? `https://www.google.com/maps?q=${photo.latitude},${photo.longitude}`
      : null;
  const fields = [
    ['Jam pelaksanaan', photo.timeText],
    ['Hari / tanggal', photo.dateText],
    ['Nama satuan', photo.unitName],
    ['Alamat', photo.address],
    ['Desa / kelurahan', photo.village],
    ['Kecamatan', photo.district],
    ['Kabupaten / kota', photo.regency],
    ['Provinsi', photo.province],
    ['Titik koordinat', photo.coordinateText],
    ['Caption WhatsApp', photo.senderCaption]
  ];

  const saveOverride = async () => {
    setSavingOverride(true);
    try {
      const updated = await api.patch<TimemarkDTO>(`/timemark/${photo.id}/turjawali`, {
        turjawaliType: overrideType
      });
      toast.success('Kategori Turjawali dikoreksi', {
        description: `${TURJAWALI_LABELS[updated.turjawaliType]} · match ${updated.matchScore}%`
      });
      onUpdated(updated);
    } catch (error) {
      toast.error('Gagal menyimpan koreksi', { description: errorMessage(error) });
    } finally {
      setSavingOverride(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0">
        <div className="grid lg:grid-cols-[1.05fr_1fr]">
          <div className="relative min-h-[300px] overflow-hidden rounded-t-2xl bg-black lg:rounded-l-2xl lg:rounded-tr-none">
            <img
              src={photo.imageUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl"
            />
            <img
              src={photo.imageUrl}
              alt="Foto Timemark"
              className="relative z-10 h-full max-h-[620px] w-full object-contain"
            />
            <div className="absolute left-4 top-4 z-20 flex flex-wrap items-center gap-2">
              <Badge className="border-0 bg-black/60 text-white backdrop-blur-sm">Timemark</Badge>
              <TurjawaliBadge type={photo.turjawaliType} />
              <MatchBadge status={photo.matchStatus} score={photo.matchScore} />
              <SupervisionBadge photo={photo} />
              <StatusBadge status={photo.status} className="border-0 bg-black/60 backdrop-blur-sm" />
            </div>
            {mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="absolute bottom-4 left-4 z-20 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground shadow-lg"
              >
                <MapPin className="h-3.5 w-3.5" /> Buka di Maps
              </a>
            ) : null}
          </div>
          <div className="max-h-[80vh] overflow-y-auto p-6">
            <DialogHeader className="pr-8">
              <DialogTitle className="flex flex-wrap items-center gap-2">
                Detail Foto Timemark
                <Badge variant="outline" className="font-mono text-[9px]">
                  OCR {photo.confidence}%
                </Badge>
                {photo.aiUsed ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-primary/40 bg-primary/10 text-[9px] text-primary"
                    title="Sebagian data diverifikasi ulang dengan AI vision"
                  >
                    <Sparkles className="h-2.5 w-2.5" /> AI
                  </Badge>
                ) : null}
              </DialogTitle>
              <DialogDescription>
                Dikirim oleh {photo.senderName} · {formatDateTime(photo.createdAt)}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Hasil Smart Matching
                </p>
                <span className="font-mono text-xs font-bold text-primary">{photo.matchScore}%</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <TurjawaliBadge type={photo.turjawaliType} />
                <MatchBadge status={photo.matchStatus} score={photo.matchScore} />
                {photo.sprinNumber ? (
                  <span className="font-mono text-[9px] text-muted-foreground">{photo.sprinNumber}</span>
                ) : null}
              </div>
              {photo.matchedPersonnelName ? (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Personel cocok:{' '}
                  <span className="font-semibold text-foreground">{photo.matchedPersonnelName}</span>
                </p>
              ) : null}
              {photo.matchNotes ? (
                <p className="mt-2 line-clamp-4 text-[9px] leading-relaxed text-muted-foreground">
                  {photo.matchNotes}
                </p>
              ) : null}
              <div className="mt-3 flex flex-col gap-2 border-t border-border/50 pt-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="override-turjawali" className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    Koreksi kategori manual
                  </Label>
                  <Select value={overrideType} onValueChange={(value) => setOverrideType(value as TurjawaliType)}>
                    <SelectTrigger id="override-turjawali" className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TURJAWALI_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {TURJAWALI_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={() => void saveOverride()} disabled={savingOverride || overrideType === photo.turjawaliType}>
                  {savingOverride ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Simpan & rematch
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border/70 bg-muted/15 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Koreksi data OCR (jam, tanggal, satuan, alamat)
                </Label>
                <Button size="sm" onClick={() => void saveManualData()} disabled={savingData}>
                  {savingData ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Simpan data
                </Button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="edit-time" className="text-[9px] text-muted-foreground">
                    Jam (HH:MM)
                  </Label>
                  <Input
                    id="edit-time"
                    value={editTime}
                    onChange={(event) => setEditTime(event.target.value)}
                    placeholder="07:00"
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-date" className="text-[9px] text-muted-foreground">
                    Tanggal pelaksanaan
                  </Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={editDate}
                    onChange={(event) => setEditDate(event.target.value)}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-unit" className="text-[9px] text-muted-foreground">
                    Nama satuan
                  </Label>
                  <Input
                    id="edit-unit"
                    value={editUnit}
                    onChange={(event) => setEditUnit(event.target.value)}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-address" className="text-[9px] text-muted-foreground">
                    Alamat
                  </Label>
                  <Input
                    id="edit-address"
                    value={editAddress}
                    onChange={(event) => setEditAddress(event.target.value)}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              </div>
              <p className="mt-1.5 text-[9px] text-muted-foreground">
                Setelah disimpan, foto dihitung ulang ke Sprin dan status berubah dari <b>Perlu review</b>{' '}
                menjadi <b>terverifikasi</b> bila jam & tanggal terisi.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {fields.map(([label, value]) => (
                <div
                  key={label}
                  className={cn(
                    'rounded-lg border border-border/60 bg-muted/20 p-2.5',
                    (label === 'Alamat' || label === 'Titik koordinat' || label === 'Caption WhatsApp') &&
                      'sm:col-span-2'
                  )}
                >
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-1 break-words text-[11px] font-medium leading-relaxed">{value || '-'}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold uppercase tracking-wider text-muted-foreground">Keyakinan OCR</span>
                <span className="font-bold">{photo.confidence}%</span>
              </div>
              <Progress value={photo.confidence} className="mt-2 h-1.5" />
              {photo.sprinNumber ? (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Terkait Sprin <span className="font-mono font-semibold text-foreground">{photo.sprinNumber}</span>
                </p>
              ) : null}
            </div>

            <details className="group mt-4 rounded-lg border border-border/60 bg-muted/20">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Teks mentah OCR
              </summary>
              <pre className="max-h-48 overflow-auto border-t border-border/60 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {photo.rawText || 'Tidak ada teks.'}
              </pre>
            </details>

            <DialogFooter className="mt-5 sm:justify-start">
              <Button variant="outline" size="sm" asChild>
                <a href={photo.imageUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Buka gambar asli
                </a>
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  onUploaded
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [sender, setSender] = React.useState('Dashboard');
  const [uploading, setUploading] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setSender('Dashboard');
      setUploading(false);
    }
  }, [open]);

  const onFile = (next: File | undefined) => {
    if (!next) return;
    if (!next.type.startsWith('image/')) {
      toast.error('File harus berupa gambar JPG, PNG, atau WEBP.');
      return;
    }
    if (next.size > 25 * 1024 * 1024) {
      toast.error('Ukuran gambar melebihi 25 MB.');
      return;
    }
    setFile(next);
  };

  const submit = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('senderName', sender || 'Dashboard');
      form.append('senderNumber', 'dashboard');
      form.append('groupName', 'Upload Dashboard');
      const response = await api.upload<{ item: TimemarkDTO; warnings: string[] }>('/timemark/analyze', form);
      toast.success('Foto berhasil diproses', {
        description: response.item.status === 'parsed'
          ? `${response.item.timeText} · ${response.item.unitName ?? 'satuan terdeteksi'}`
          : 'Foto masuk ke daftar review.'
      });
      onUploaded();
      onOpenChange(false);
    } catch (error) {
      toast.error('Gagal menganalisis foto', { description: errorMessage(error) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Unggah Foto Timemark</DialogTitle>
          <DialogDescription>
            OCR berjalan di server. Foto akan diverifikasi otomatis dan masuk ke galeri.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              onFile(event.dataTransfer.files[0]);
            }}
            className={cn(
              'relative flex min-h-[220px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/20 p-5 text-center transition-colors',
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
            )}
          >
            {preview ? (
              <>
                <img src={preview} alt="Pratinjau" className="absolute inset-0 h-full w-full object-cover opacity-45" />
                <div className="relative z-10 rounded-xl bg-slate-950/65 p-4 backdrop-blur-sm">
                  <p className="max-w-[260px] truncate text-xs font-semibold text-white">{file?.name}</p>
                  <p className="mt-1 text-[10px] text-slate-300">
                    {file ? `${(file.size / 1024).toFixed(0)} KB · klik untuk ganti` : ''}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-soft">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold">Tarik foto ke sini atau klik</p>
                <p className="mt-1 text-[11px] text-muted-foreground">JPG, PNG, WEBP · maksimal 25 MB</p>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <div className="space-y-1.5">
            <Label htmlFor="upload-sender">Nama pengirim</Label>
            <Input
              id="upload-sender"
              value={sender}
              onChange={(event) => setSender(event.target.value)}
              placeholder="Contoh: Bripka Marthen"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={!file || uploading}>
            {uploading ? (
              <>
                <ScanText className="h-4 w-4 animate-pulse" /> Menganalisis…
              </>
            ) : (
              <>
                <ScanText className="h-4 w-4" /> Proses OCR
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GallerySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="h-[330px] w-full" />
      ))}
    </div>
  );
}

export function TimemarkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialType = TURJAWALI_TYPES.includes(searchParams.get('type') as TurjawaliType)
    ? (searchParams.get('type') as TurjawaliType)
    : 'all';
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [turjawaliType, setTurjawaliType] = React.useState<TurjawaliType | 'all'>(initialType);
  const [matchStatus, setMatchStatus] = React.useState<TurjawaliMatchStatus | 'all'>('all');
  const [view, setView] = React.useState<'gallery' | 'table'>('gallery');
  const [selected, setSelected] = React.useState<TimemarkDTO | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const debouncedSearch = useDebouncedValue(search);
  const version = useRealtimeVersion();

  const changeTurjawaliType = (value: TurjawaliType | 'all') => {
    setTurjawaliType(value);
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete('type');
    else next.set('type', value);
    setSearchParams(next, { replace: true });
  };

  const query = React.useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE)
    });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (status !== 'all') params.set('status', status);
    if (turjawaliType !== 'all') params.set('turjawaliType', turjawaliType);
    if (matchStatus !== 'all') params.set('matchStatus', matchStatus);
    return params.toString();
  }, [page, debouncedSearch, status, turjawaliType, matchStatus]);

  const listApi = useApi<Paginated<TimemarkDTO>>(`/timemark?${query}`);
  const reviewApi = useApi<Paginated<TimemarkDTO>>('/timemark?status=review&pageSize=1');
  const statsApi = useApi<DashboardStats>('/stats');

  React.useEffect(() => {
    if (version === 0) return;
    void listApi.refresh();
    void reviewApi.refresh();
    void statsApi.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  React.useEffect(() => {
    const param = searchParams.get('type');
    const next = TURJAWALI_TYPES.includes(param as TurjawaliType)
      ? (param as TurjawaliType)
      : 'all';
    if (next !== turjawaliType) setTurjawaliType(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, turjawaliType, matchStatus]);

  const [approving, setApproving] = React.useState(false);
  const approveComplete = async () => {
    setApproving(true);
    try {
      const result = await api.post<{ approved: number; scanned: number }>('/timemark/approve-complete', {});
      toast.success(`${result.approved} foto disetujui otomatis`, {
        description: `Dari ${result.scanned} foto berstatus review yang datanya sudah lengkap.`
      });
      void listApi.refresh();
      void reviewApi.refresh();
      void statsApi.refresh();
    } catch (error) {
      toast.error('Gagal menyetujui massal', { description: errorMessage(error) });
    } finally {
      setApproving(false);
    }
  };

  const data = listApi.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="animate-slide-up space-y-6">
      <PageHeader
        eyebrow="Verifikasi Lapangan"
        title="Rekap Foto Timemark"
        description="Galeri hasil ekstraksi watermark: jam, tanggal, alamat, satuan, dan titik koordinat GPS."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void approveComplete()}
              disabled={approving}
            >
              {approving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Setujui yang lengkap</Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!window.confirm('Arsipkan semua foto berstatus review yang lebih tua dari 7 hari? Data tidak dihapus dan bisa dipulihkan.')) return;
                void (async () => {
                  try {
                    const result = await api.post<{ archived: number }>('/timemark/archive-review', { days: 7 });
                    toast.success(`${result.archived} foto diarsipkan`);
                    void listApi.refresh();
                    void reviewApi.refresh();
                  } catch (error) {
                    toast.error('Gagal mengarsipkan', { description: errorMessage(error) });
                  }
                })();
              }}
            >
              <Archive className="h-4 w-4" /> Arsipkan review lama
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadFile(exportUrl('timemark.csv'))}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <UploadCloud className="h-4 w-4" /> Unggah Foto
            </Button>
          </>
        }
      />

      {data ? (
        <TimemarkSummary data={data} reviewCount={reviewApi.data?.total ?? 0} stats={statsApi.data} />
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-3.5">
          <Tabs
            value={turjawaliType}
            onValueChange={(value) => changeTurjawaliType(value as TurjawaliType | 'all')}
          >
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-muted/40 p-1">
              <TabsTrigger value="all" className="text-[10px]">
                <LayoutGrid className="h-3.5 w-3.5" /> Semua
                <span className="ml-1 font-mono text-[8px] opacity-60">{data?.total ?? 0}</span>
              </TabsTrigger>
              {ACTIVE_TURJAWALI.map((type) => {
                const Icon = TURJAWALI_ICONS[type];
                const category = statsApi.data?.turjawali.categories.find((row) => row.type === type);
                return (
                  <TabsTrigger key={type} value={type} className="text-[10px]">
                    <Icon className="h-3.5 w-3.5" />
                    {TURJAWALI_TAB_LABELS[type]}
                    <span className="ml-1 font-mono text-[8px] opacity-60">
                      {category?.photoCount ?? 0}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari satuan, alamat, pengirim…"
                  className="h-9 pl-9 text-xs"
                />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 w-full text-xs sm:w-[140px]">
                  <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Status OCR" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua OCR</SelectItem>
                  <SelectItem value="parsed">Terverifikasi</SelectItem>
                  <SelectItem value="review">Perlu review</SelectItem>
                  <SelectItem value="archived">Arsip</SelectItem>
                  <SelectItem value="failed">Gagal OCR</SelectItem>
                </SelectContent>
              </Select>
              <Select value={matchStatus} onValueChange={(value) => setMatchStatus(value as TurjawaliMatchStatus | 'all')}>
                <SelectTrigger className="h-9 w-full text-xs sm:w-[140px]">
                  <SelectValue placeholder="Status match" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua match</SelectItem>
                  {TURJAWALI_MATCH_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {MATCH_STATUS_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">
                {formatNumber(data?.total ?? 0)} foto ditemukan
              </span>
              <Tabs value={view} onValueChange={(value) => setView(value as 'gallery' | 'table')}>
                <TabsList className="h-9">
                  <TabsTrigger value="gallery" className="px-2.5 text-[11px]">
                    <LayoutGrid className="h-3.5 w-3.5" /> Galeri
                  </TabsTrigger>
                  <TabsTrigger value="table" className="px-2.5 text-[11px]">
                    <List className="h-3.5 w-3.5" /> Tabel
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardContent>
      </Card>

      {listApi.loading && !data ? (
        <GallerySkeleton />
      ) : listApi.error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Gagal memuat foto"
          description={listApi.error}
          action={
            <Button onClick={() => void listApi.refresh(true)}>
              <RefreshCw className="h-4 w-4" /> Coba lagi
            </Button>
          }
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="Belum ada foto Timemark"
          description="Foto yang masuk dari WhatsApp atau diunggah ke dashboard akan muncul di sini."
          action={
            <Button onClick={() => setUploadOpen(true)}>
              <UploadCloud className="h-4 w-4" /> Unggah foto pertama
            </Button>
          }
        />
      ) : view === 'gallery' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {data.items.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              onClick={() => {
                setSelected(photo);
                setDetailOpen(true);
              }}
            />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[72px]">Foto</TableHead>
                <TableHead>Waktu</TableHead>
                <TableHead>Satuan</TableHead>
                <TableHead className="hidden md:table-cell">Turjawali</TableHead>
                <TableHead>Match</TableHead>
                <TableHead className="hidden xl:table-cell">Alamat</TableHead>
                <TableHead className="hidden lg:table-cell">Koordinat</TableHead>
                <TableHead>Pengirim</TableHead>
                <TableHead>OCR</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((photo) => (
                <TableRow
                  key={photo.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelected(photo);
                    setDetailOpen(true);
                  }}
                >
                  <TableCell>
                    <img
                      src={photo.thumbnailUrl}
                      alt=""
                      className="h-10 w-14 rounded-md border border-border object-cover"
                      loading="lazy"
                    />
                  </TableCell>
                  <TableCell>
                    <p className="font-mono text-xs font-semibold">{photo.timeText ?? '--:--'}</p>
                    <p className="text-[10px] text-muted-foreground">{photo.dateText ?? '-'}</p>
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    <p className="truncate text-xs font-medium">{photo.unitName ?? '-'}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap items-center gap-1">
                      <TurjawaliBadge type={photo.turjawaliType} />
                      <SupervisionBadge photo={photo} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <MatchBadge status={photo.matchStatus} score={photo.matchScore} />
                  </TableCell>
                  <TableCell className="hidden max-w-[240px] xl:table-cell">
                    <p className="truncate text-[11px] text-muted-foreground">{photo.address ?? '-'}</p>
                  </TableCell>
                  <TableCell className="hidden max-w-[180px] lg:table-cell">
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {photo.coordinateText ?? '-'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="text-[11px]">{photo.senderName}</p>
                    <p className="font-mono text-[9px] text-muted-foreground">{photo.senderNumber}</p>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {photo.aiUsed ? (
                        <span
                          className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[8px] font-semibold text-primary"
                          title="Sebagian data diverifikasi ulang dengan AI"
                        >
                          <Sparkles className="h-2.5 w-2.5" /> AI
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          'text-[11px] font-bold',
                          photo.confidence >= 80
                            ? 'text-success'
                            : photo.confidence >= 50
                              ? 'text-warning'
                              : 'text-destructive'
                        )}
                      >
                        {photo.confidence}%
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={photo.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {data && data.total > PAGE_SIZE ? (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Halaman {data.page} dari {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      ) : null}

      <DetailDialog
        photo={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={(updated) => {
          setSelected(updated);
          void listApi.refresh();
          void reviewApi.refresh();
          void statsApi.refresh();
        }}
      />
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => {
          void listApi.refresh();
          void reviewApi.refresh();
          void statsApi.refresh();
        }}
      />
    </div>
  );
}
