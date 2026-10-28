import * as React from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Download,
  ExternalLink,
  FileArchive,
  FileSearch,
  FileText,
  Link2,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  UploadCloud,
  UsersRound
} from 'lucide-react';
import { toast } from 'sonner';
import type { DashboardStats, Paginated, PersonnelDTO, SprinDTO } from '@/shared/types';
import { TURJAWALI_LABELS } from '@/shared/types';
import { PageHeader, EmptyState } from '@/components/sigap/page-header';
import { StatusBadge } from '@/components/sigap/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi, useDebouncedValue } from '@/src/hooks/use-api';
import { useRealtimeVersion } from '@/src/lib/realtime';
import { api, downloadFile, errorMessage, exportUrl } from '@/lib/api';
import { cn, initials } from '@/lib/utils';
import { formatDate, formatDateTime, formatNumber, truncate } from '@/lib/format';

const PENUGASAN_VARIANT: Record<string, 'default' | 'info' | 'success' | 'warning' | 'violet' | 'muted'> = {
  KOORDINATOR: 'default',
  PENDAMPING: 'info',
  PESERTA: 'muted',
  UNDANGAN: 'violet',
  DRIVER: 'warning',
  WASKAT: 'success'
};

function SummaryCards({ data, stats, activeTotal }: { data: Paginated<SprinDTO>; stats: DashboardStats | null; activeTotal: number }) {
  const personnel = stats?.totalPersonnel ?? data.items.reduce((sum, item) => sum + item.personnelCount, 0);
  const links = data.items.reduce((sum, item) => sum + item.reportedLinks, 0);
  const cards = [
    { label: 'Total Sprin', value: formatNumber(data.total), icon: FileText, color: 'text-primary bg-primary/10 border-primary/20' },
    { label: 'Sprin aktif', value: formatNumber(activeTotal), icon: ShieldCheck, color: 'text-info bg-info/10 border-info/20' },
    { label: 'Personel', value: formatNumber(personnel), icon: UsersRound, color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
    { label: 'Link terkait', value: formatNumber(links), icon: Link2, color: 'text-success bg-success/10 border-success/20' }
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
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PersonnelTable({ personnel }: { personnel: PersonnelDTO[] }) {
  const [search, setSearch] = React.useState('');
  const [assignment, setAssignment] = React.useState('all');
  const filtered = React.useMemo(() => {
    const query = search.toLowerCase();
    return personnel.filter((person) => {
      const matchesQuery =
        !query ||
        person.name.toLowerCase().includes(query) ||
        (person.rankNrp ?? '').toLowerCase().includes(query) ||
        (person.jabatan ?? '').toLowerCase().includes(query);
      const matchesAssignment = assignment === 'all' || person.penugasan === assignment;
      return matchesQuery && matchesAssignment;
    });
  }, [personnel, search, assignment]);

  const assignments = [...new Set(personnel.map((person) => person.penugasan).filter(Boolean))] as string[];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama, pangkat, jabatan…"
            className="h-9 pl-9 text-xs"
          />
        </div>
        <Select value={assignment} onValueChange={setAssignment}>
          <SelectTrigger className="h-9 text-xs sm:w-[170px]">
            <SelectValue placeholder="Penugasan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua penugasan</SelectItem>
            {assignments.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="max-h-[430px] overflow-auto rounded-lg border border-border/60">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="w-10">No</TableHead>
              <TableHead>Nama / Pangkat</TableHead>
              <TableHead className="hidden sm:table-cell">Jabatan</TableHead>
              <TableHead>Penugasan</TableHead>
              <TableHead className="hidden md:table-cell">KET</TableHead>
              <TableHead className="w-12 text-center">Hal.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((person) => (
              <TableRow key={person.id}>
                <TableCell className="font-mono text-[10px] text-muted-foreground">{person.no}</TableCell>
                <TableCell>
                  <p className="text-[11px] font-semibold">{person.name}</p>
                  <p className="font-mono text-[9px] text-muted-foreground">{person.rankNrp ?? '-'}</p>
                </TableCell>
                <TableCell className="hidden max-w-[170px] sm:table-cell">
                  <p className="truncate text-[10px] text-muted-foreground">{person.jabatan ?? '-'}</p>
                </TableCell>
                <TableCell>
                  {person.penugasan ? (
                    <Badge variant={PENUGASAN_VARIANT[person.penugasan] ?? 'outline'} className="text-[9px]">
                      {person.penugasan}
                    </Badge>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="hidden max-w-[110px] md:table-cell">
                  <p className="truncate text-[9px] text-muted-foreground">{person.ket ?? '-'}</p>
                </TableCell>
                <TableCell className="text-center font-mono text-[9px] text-muted-foreground">
                  {person.page}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Tidak ada personel yang cocok.</div>
        ) : null}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Menampilkan {filtered.length} dari {personnel.length} personel lintas halaman.
      </p>
    </div>
  );
}

function SprinDetailDialog({
  sprinId,
  onClose,
  onChanged
}: {
  sprinId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const detailApi = useApi<SprinDTO>(sprinId ? `/sprin/${sprinId}` : null);
  const [tab, setTab] = React.useState('ringkasan');
  const [updating, setUpdating] = React.useState(false);
  const sprin = detailApi.data;

  React.useEffect(() => {
    if (!sprinId) return;
    setTab('ringkasan');
    void detailApi.refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprinId]);

  const setStatus = async (status: string) => {
    if (!sprin) return;
    setUpdating(true);
    try {
      await api.patch(`/sprin/${sprin.id}/status`, { status });
      toast.success('Status Sprin diperbarui');
      await detailApi.refresh();
      onChanged();
    } catch (error) {
      toast.error('Gagal memperbarui status', { description: errorMessage(error) });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Dialog open={Boolean(sprinId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl p-0">
        {detailApi.loading && !sprin ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : detailApi.error ? (
          <div className="p-8 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-warning" />
            <p className="mt-2 text-sm font-semibold">Gagal memuat detail</p>
            <p className="text-xs text-muted-foreground">{detailApi.error}</p>
            <Button className="mt-4" size="sm" onClick={() => void detailApi.refresh(true)}>
              Coba lagi
            </Button>
          </div>
        ) : sprin ? (
          <div>
            <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/[0.09] via-card to-card p-6">
              <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-primary/[0.06] blur-3xl" />
              <DialogHeader className="relative pr-10">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[9px]">
                    SURAT PERINTAH
                  </Badge>
                  <StatusBadge status={sprin.status} />
                  <Badge variant="info" className="text-[9px]">
                    {TURJAWALI_LABELS[sprin.turjawaliType]}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {sprin.personnelCount} personel · {sprin.reportedLinks} link
                  </span>
                </div>
                <DialogTitle className="text-xl">{sprin.number}</DialogTitle>
                <DialogDescription className="mt-1 max-w-3xl leading-relaxed">
                  {sprin.about ?? 'Tanpa perihal'}
                </DialogDescription>
              </DialogHeader>
              <div className="relative mt-4 flex flex-wrap gap-2">
                {sprin.fileUrl ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={sprin.fileUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" /> Buka dokumen
                    </a>
                  </Button>
                ) : null}
                {sprin.fileUrl ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadFile(sprin.fileUrl!, sprin.fileName ?? undefined)}
                  >
                    <Download className="h-3.5 w-3.5" /> Unduh
                  </Button>
                ) : null}
                {sprin.status === 'active' ? (
                  <Button size="sm" variant="secondary" disabled={updating} onClick={() => void setStatus('completed')}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Tandai selesai
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" disabled={updating} onClick={() => void setStatus('active')}>
                    <RefreshCw className="h-3.5 w-3.5" /> Aktifkan kembali
                  </Button>
                )}
              </div>
            </div>

            <div className="p-6">
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
                  <TabsTrigger value="personel">
                    Personel <Badge variant="muted" className="ml-1">{sprin.personnelCount}</Badge>
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="ringkasan" className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ['Tanggal pelaksanaan', sprin.activityDate ? formatDate(sprin.activityDate, 'EEEE, dd MMMM yyyy') : '-'],
                      ['Waktu', sprin.timeText ?? '-'],
                      ['Tempat kegiatan', sprin.place ?? '-'],
                      ['Penandatangan', [sprin.signatoryRank, sprin.signatory].filter(Boolean).join(' ') || '-'],
                      ['Sumber dokumen', sprin.source === 'whatsapp' ? 'WhatsApp' : sprin.source === 'seed' ? 'Demo seed' : 'Upload dashboard'],
                      ['Terakhir diproses', formatDateTime(sprin.createdAt)]
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                        <p className="mt-1 text-[11px] font-medium leading-relaxed">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Uraian tugas (“Untuk”)
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/90">
                      {sprin.untuk ?? 'Tidak terdeteksi.'}
                    </p>
                  </div>
                  {sprin.dasar ? (
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Dasar</p>
                      <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/90">{sprin.dasar}</p>
                    </div>
                  ) : null}
                </TabsContent>
                <TabsContent value="personel" className="mt-4">
                  <PersonnelTable personnel={sprin.personnel ?? []} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function UploadSprinDialog({
  open,
  onOpenChange,
  onUploaded
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setUploading(false);
      setDragOver(false);
    }
  }, [open]);

  const onFile = (next: File | undefined) => {
    if (!next) return;
    if (!next.name.toLowerCase().match(/\.(pdf|docx)$/)) {
      toast.error('Format dokumen harus PDF atau DOCX.');
      return;
    }
    if (next.size > 25 * 1024 * 1024) {
      toast.error('Ukuran dokumen melebihi 25 MB.');
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
      form.append('senderName', 'Dashboard');
      const response = await api.upload<{
        sprin: SprinDTO;
        created: boolean;
        warnings: string[];
        pageCount: number;
        aiUsed: boolean;
      }>('/sprin/upload', form);
      toast.success(response.created ? 'Surat Perintah berhasil diproses' : 'Data Sprin diperbarui', {
        description: `${response.sprin.number} · ${response.sprin.personnelCount} personel dari ${response.pageCount} halaman.`
      });
      if (response.warnings.length) {
        toast.warning('Sebagian metadata perlu dicek', { description: response.warnings.join(' ') });
      }
      onUploaded();
      onOpenChange(false);
    } catch (error) {
      toast.error('Gagal memproses dokumen', { description: errorMessage(error) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Unggah Surat Perintah</DialogTitle>
          <DialogDescription>
            Parser mengekstrak metadata Sprin dan seluruh tabel personel lintas halaman secara otomatis.
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
              'flex min-h-[210px] w-full flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center transition-colors',
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
            )}
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-soft">
              {file ? <FileArchive className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
            </div>
            <p className="text-sm font-semibold">
              {file ? file.name : 'Tarik PDF/DOCX ke sini atau klik'}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {file ? `${(file.size / 1024).toFixed(0)} KB · klik untuk mengganti` : 'Mendukung deteksi tabel lintas halaman'}
            </p>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-[10px] leading-relaxed text-muted-foreground">
            Pastikan dokumen memuat baris <span className="font-mono text-foreground">Nomor: Sprin/...</span> dan tabel
            dengan kolom NO, NAMA, PANGKAT/NRP, JABATAN, PENUGASAN, KET.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={!file || uploading}>
            {uploading ? (
              <>
                <FileSearch className="h-4 w-4 animate-pulse" /> Membaca dokumen…
              </>
            ) : (
              <>
                <FileSearch className="h-4 w-4" /> Proses & simpan
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SprinPage() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const debounced = useDebouncedValue(search);
  const version = useRealtimeVersion();

  const query = React.useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (debounced) params.set('search', debounced);
    if (status !== 'all') params.set('status', status);
    return params.toString();
  }, [page, debounced, status]);

  const listApi = useApi<Paginated<SprinDTO>>(`/sprin?${query}`);
  const activeApi = useApi<Paginated<SprinDTO>>('/sprin?status=active&pageSize=1');
  const statsApi = useApi<DashboardStats>('/stats');

  React.useEffect(() => {
    if (version === 0) return;
    void listApi.refresh();
    void activeApi.refresh();
    void statsApi.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  React.useEffect(() => {
    setPage(1);
  }, [debounced, status]);

  const data = listApi.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="animate-slide-up space-y-6">
      <PageHeader
        eyebrow="Manajemen Dokumen"
        title="Data Surat Perintah"
        description="Daftar Sprin, metadata kegiatan, tabel personel lintas halaman, dan status pelaporan."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => downloadFile(exportUrl('sprin.csv'))}>
              <Download className="h-4 w-4" /> CSV Personel
            </Button>
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <UploadCloud className="h-4 w-4" /> Unggah Sprin
            </Button>
          </>
        }
      />

      {data ? (
        <SummaryCards data={data} stats={statsApi.data} activeTotal={activeApi.data?.total ?? 0} />
      ) : null}

      <Card>
        <CardContent className="p-3.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari nomor, perihal, tempat…"
                  className="h-9 pl-9 text-xs"
                />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 w-full text-xs sm:w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua status</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="completed">Selesai</SelectItem>
                  <SelectItem value="archived">Diarsipkan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {formatNumber(data?.total ?? 0)} dokumen ditemukan
            </span>
          </div>
        </CardContent>
      </Card>

      {listApi.loading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[94px] w-full" />
          ))}
        </div>
      ) : listApi.error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Gagal memuat Sprin"
          description={listApi.error}
          action={
            <Button onClick={() => void listApi.refresh(true)}>
              <RefreshCw className="h-4 w-4" /> Coba lagi
            </Button>
          }
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Belum ada Surat Perintah"
          description="Unggah PDF/DOCX atau kirim dokumen ke grup WhatsApp yang dipantau."
          action={
            <Button onClick={() => setUploadOpen(true)}>
              <UploadCloud className="h-4 w-4" /> Unggah Sprin
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {data.items.map((sprin) => (
            <button
              key={sprin.id}
              type="button"
              onClick={() => setSelectedId(sprin.id)}
              className="group w-full rounded-xl border border-border/80 bg-card p-4 text-left shadow-soft transition-all duration-200 hover:border-primary/30 hover:shadow-md sm:p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary sm:flex">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-[12px] font-bold text-foreground">{sprin.number}</p>
                      <StatusBadge status={sprin.status} />
                      <Badge variant="outline" className="text-[9px]">
                        {TURJAWALI_LABELS[sprin.turjawaliType]}
                      </Badge>
                      <Badge variant="outline" className="text-[9px]">
                        {sprin.source === 'whatsapp' ? 'WhatsApp' : sprin.source === 'seed' ? 'Demo' : 'Dashboard'}
                      </Badge>
                    </div>
                    <p className="mt-1.5 line-clamp-1 text-[12px] text-muted-foreground">
                      {sprin.about ?? 'Tanpa perihal'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {sprin.activityDate ? formatDate(sprin.activityDate) : 'Tanggal fleksibel'}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {truncate(sprin.place, 40)}
                      </span>
                      <span className="flex items-center gap-1">
                        <UsersRound className="h-3 w-3" />
                        {sprin.personnelCount} personel
                      </span>
                      <span className="flex items-center gap-1">
                        <Link2 className="h-3 w-3" />
                        {sprin.reportedLinks} link
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border/50 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                  <div className="text-left lg:text-right">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Penandatangan</p>
                    <p className="text-[10px] font-semibold">
                      {[sprin.signatoryRank, sprin.signatory].filter(Boolean).join(' ') || '-'}
                    </p>
                    <p className="mt-0.5 font-mono text-[8px] text-muted-foreground">
                      {sprin.timeText ? `Pukul ${sprin.timeText}` : ''}
                    </p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/30 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {data && data.total > 20 ? (
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

      <SprinDetailDialog
        sprinId={selectedId}
        onClose={() => setSelectedId(null)}
        onChanged={() => {
          void listApi.refresh();
          void activeApi.refresh();
          void statsApi.refresh();
        }}
      />
      <UploadSprinDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => {
          void listApi.refresh();
          void activeApi.refresh();
          void statsApi.refresh();
        }}
      />
    </div>
  );
}
