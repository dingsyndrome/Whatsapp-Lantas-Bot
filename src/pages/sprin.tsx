import * as React from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  Download,
  ExternalLink,
  FileArchive,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Link2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
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
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { SprinNotifyPanel } from '@/components/sigap/sprin-notify-panel';
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

function SummaryCards({
  data,
  stats,
  activeTotal,
  reviewTotal,
  onReviewClick
}: {
  data: Paginated<SprinDTO>;
  stats: DashboardStats | null;
  activeTotal: number;
  reviewTotal: number;
  onReviewClick: () => void;
}) {
  const personnel = stats?.totalPersonnel ?? data.items.reduce((sum, item) => sum + item.personnelCount, 0);
  const links = data.items.reduce((sum, item) => sum + item.reportedLinks, 0);
  const cards = [
    {
      label: 'Total Sprin',
      value: formatNumber(stats?.totalSprin ?? data.total),
      icon: FileText,
      color: 'text-primary bg-primary/10 border-primary/20',
      onClick: undefined
    },
    { label: 'Sprin aktif', value: formatNumber(activeTotal), icon: ShieldCheck, color: 'text-info bg-info/10 border-info/20', onClick: undefined },
    { label: 'Personel', value: formatNumber(personnel), icon: UsersRound, color: 'text-violet-400 bg-violet-500/10 border-violet-500/20', onClick: undefined },
    { label: 'Link terkait', value: formatNumber(links), icon: Link2, color: 'text-success bg-success/10 border-success/20', onClick: undefined },
    {
      label: 'Notif perlu review',
      value: formatNumber(reviewTotal),
      icon: Bell,
      color: 'text-warning bg-warning/10 border-warning/20',
      onClick: onReviewClick
    }
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            role={card.onClick ? 'button' : undefined}
            tabIndex={card.onClick ? 0 : undefined}
            onClick={card.onClick}
            onKeyDown={(event) => {
              if (card.onClick && (event.key === 'Enter' || event.key === ' ')) card.onClick();
            }}
            className={cn(
              'flex items-center gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-soft',
              card.onClick && 'cursor-pointer transition-colors hover:border-warning/40'
            )}
          >
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

function PersonnelTable({
  personnel,
  sprinId,
  onUpdated
}: {
  personnel: PersonnelDTO[];
  sprinId: string;
  onUpdated: () => void;
}) {
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
              <TableHead className="w-40">No. HP</TableHead>
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
                <TableCell>
                  <PhoneCell person={person} sprinId={sprinId} onUpdated={onUpdated} />
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


/** Kolom nomor HP: bisa dikoreksi langsung bila PDF tidak memuat nomornya. */
function PhoneCell({
  person,
  sprinId,
  onUpdated
}: {
  person: PersonnelDTO;
  sprinId: string;
  onUpdated: () => void;
}) {
  const [value, setValue] = React.useState(person.phone ?? '');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setValue(person.phone ?? '');
  }, [person.phone]);

  const save = async () => {
    const next = value.trim();
    if (next === (person.phone ?? '')) return;
    setSaving(true);
    try {
      await api.patch(`/sprin/${sprinId}/personnel/${person.id}`, { phone: next || null });
      toast.success(`Nomor ${person.name} disimpan`);
      onUpdated();
    } catch (error) {
      toast.error('Gagal menyimpan nomor', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => void save()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') void save();
      }}
      placeholder="08xxxxxxxxxx"
      disabled={saving}
      className="h-7 font-mono text-[10px]"
    />
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
  const [importOpen, setImportOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const sprin = detailApi.data;

  const removeSprin = async () => {
    if (!sprin) return;
    setDeleting(true);
    try {
      await api.delete(`/sprin/${sprin.id}`);
      toast.success('Surat Perintah dihapus', { description: sprin.number });
      setDeleteOpen(false);
      onChanged();
      onClose();
    } catch (error) {
      toast.error('Gagal menghapus Sprin', { description: errorMessage(error) });
    } finally {
      setDeleting(false);
    }
  };

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
                <Button size="sm" variant="secondary" onClick={() => setTab('notifikasi')}>
                  <Bell className="h-3.5 w-3.5" />
                  Notifikasi
                  {sprin.notification?.requiresReview ? (
                    <Badge variant="warning" className="ml-1 text-[8px]">perlu review</Badge>
                  ) : null}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Hapus Sprin
                </Button>
              </div>
            </div>

            <div className="p-6">
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
                  <TabsTrigger value="personel">
                    Personel <Badge variant="muted" className="ml-1">{sprin.personnelCount}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="notifikasi">
                    Notifikasi
                    {sprin.notification?.requiresReview ? (
                      <Badge variant="warning" className="ml-1 text-[8px]">review</Badge>
                    ) : null}
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
                  <p className="text-[9px] leading-relaxed text-muted-foreground">
                    Catatan: “Tempat kegiatan” di atas adalah metadata dokumen. Rincian lokasi per anggota dan
                    arahan apel ada di tab <span className="font-semibold text-foreground">Notifikasi</span>.
                  </p>
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
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] text-muted-foreground">
                      {formatNumber(sprin.personnelCount)} personel terdaftar pada Sprin ini
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Impor Excel/CSV
                    </Button>
                  </div>
                  <PersonnelTable
                    personnel={sprin.personnel ?? []}
                    sprinId={sprin.id}
                    onUpdated={() => {
                      void detailApi.refresh();
                      onChanged();
                    }}
                  />
                </TabsContent>
                <TabsContent value="notifikasi" className="mt-4">
                  <SprinNotifyPanel
                    sprin={sprin}
                    onChanged={() => {
                      void detailApi.refresh();
                      onChanged();
                    }}
                  />
                </TabsContent>
              </Tabs>
              <ImportPersonnelDialog
                sprin={sprin}
                open={importOpen}
                onOpenChange={setImportOpen}
                onImported={() => {
                  void detailApi.refresh();
                  onChanged();
                }}
              />
              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Hapus Surat Perintah?</DialogTitle>
                    <DialogDescription>
                      <span className="font-mono">{sprin.number}</span> beserta seluruh personel dan dokumen
                      tersimpannya akan dihapus permanen. Foto Timemark dan link yang pernah tertaut tidak
                      dihapus, hanya kehilangan kaitan Sprin.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                      Batal
                    </Button>
                    <Button variant="destructive" onClick={() => void removeSprin()} disabled={deleting}>
                      {deleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Hapus permanen
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
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

function ManualSprinDialog({
  open,
  onOpenChange,
  onSaved
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (sprin: SprinDTO) => void;
}) {
  const empty = {
    number: '',
    about: '',
    activityDate: '',
    timeText: '',
    place: '',
    signatoryRank: '',
    signatory: '',
    untuk: '',
    turjawaliType: 'AUTO'
  };
  const [form, setForm] = React.useState(empty);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setForm(empty);
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key: keyof typeof empty) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const submit = async () => {
    if (!form.number.trim()) {
      toast.error('Nomor Surat Perintah wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const response = await api.post<{ sprin: SprinDTO; created: boolean }>('/sprin/manual', {
        number: form.number.trim(),
        about: form.about || null,
        activityDate: form.activityDate || null,
        timeText: form.timeText || null,
        place: form.place || null,
        signatoryRank: form.signatoryRank || null,
        signatory: form.signatory || null,
        untuk: form.untuk || null,
        ...(form.turjawaliType === 'AUTO' ? {} : { turjawaliType: form.turjawaliType })
      });
      toast.success(response.created ? 'Surat Perintah dibuat' : 'Header Sprin diperbarui', {
        description: `${response.sprin.number} · ${TURJAWALI_LABELS[response.sprin.turjawaliType]}`
      });
      onSaved(response.sprin);
      onOpenChange(false);
    } catch (error) {
      toast.error('Gagal menyimpan Sprin', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Buat Surat Perintah Manual</DialogTitle>
          <DialogDescription>
            Dipakai bila daftar personel hanya tersedia dalam Excel/CSV: buat header Sprin dulu, lalu impor
            personelnya dari tab Personel.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nomor Sprin *</Label>
            <Input
              value={form.number}
              onChange={(event) => set('number')(event.target.value)}
              placeholder="Sprin/1806/X/KEP./2026"
              className="mt-1 font-mono text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Perihal</Label>
            <Input
              value={form.about}
              onChange={(event) => set('about')(event.target.value)}
              placeholder="Pengaturan lalu lintas pagi di simpang TKK"
              className="mt-1 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tanggal pelaksanaan</Label>
            <Input
              type="date"
              value={form.activityDate}
              onChange={(event) => set('activityDate')(event.target.value)}
              className="mt-1 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Waktu</Label>
            <Input
              value={form.timeText}
              onChange={(event) => set('timeText')(event.target.value)}
              placeholder="08.00 WITA"
              className="mt-1 text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tempat</Label>
            <Input
              value={form.place}
              onChange={(event) => set('place')(event.target.value)}
              placeholder="Jl. Raya Maumere - Ende, Kec. Alok Timur, Kab. Sikka"
              className="mt-1 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Pangkat penandatangan</Label>
            <Input
              value={form.signatoryRank}
              onChange={(event) => set('signatoryRank')(event.target.value)}
              placeholder="AKBP"
              className="mt-1 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nama penandatangan</Label>
            <Input
              value={form.signatory}
              onChange={(event) => set('signatory')(event.target.value)}
              placeholder="ANDI PRATAMA, S.I.K."
              className="mt-1 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Kategori Turjawali</Label>
            <Select value={form.turjawaliType} onValueChange={set('turjawaliType')}>
              <SelectTrigger className="mt-1 h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AUTO">Deteksi otomatis</SelectItem>
                <SelectItem value="PENGATURAN">Pengaturan (Gatur)</SelectItem>
                <SelectItem value="PENJAGAAN">Penjagaan</SelectItem>
                <SelectItem value="PENGAWALAN">Pengawalan</SelectItem>
                <SelectItem value="PATROLI">Patroli</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Uraian tugas (“Untuk”)
            </Label>
            <Textarea
              value={form.untuk}
              onChange={(event) => set('untuk')(event.target.value)}
              placeholder="Melaksanakan pengaturan lalu lintas dan pengamanan kegiatan…"
              className="mt-1 min-h-[70px] text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Menyimpan…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> Simpan Sprin
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PersonnelImportResult {
  personnelCount: number;
  imported: number;
  rows: number;
  skipped: number;
  warnings: string[];
  sheetName: string;
  mappedColumns: string[];
  mode: 'replace' | 'append';
}

function ImportPersonnelDialog({
  sprin,
  open,
  onOpenChange,
  onImported
}: {
  sprin: SprinDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [mode, setMode] = React.useState<'replace' | 'append'>('replace');
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setMode('replace');
      setBusy(false);
    }
  }, [open]);

  const onFile = (next: File | undefined) => {
    if (!next) return;
    if (!next.name.toLowerCase().match(/\.(xlsx|xlsm|csv)$/)) {
      toast.error('Format berkas harus XLSX atau CSV.');
      return;
    }
    if (next.size > 25 * 1024 * 1024) {
      toast.error('Ukuran berkas melebihi 25 MB.');
      return;
    }
    setFile(next);
  };

  const submit = async () => {
    if (!file || !sprin) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mode', mode);
      const response = await api.upload<PersonnelImportResult>(
        `/sprin/${sprin.id}/personnel/import`,
        form
      );
      toast.success(`${formatNumber(response.imported)} personel diimpor`, {
        description: `${response.sheetName} · total ${formatNumber(response.personnelCount)} personel di ${sprin.number}`
      });
      if (response.warnings.length) {
        toast.warning('Perlu dicek', { description: response.warnings.join(' ') });
      }
      onImported();
      onOpenChange(false);
    } catch (error) {
      toast.error('Gagal mengimpor personel', { description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Impor Personel dari Excel/CSV</DialogTitle>
          <DialogDescription>
            {sprin?.number} · baris dibaca dari kolom NO, NAMA, PANGKAT/NRP, JABATAN, PENUGASAN, dan KET.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              onFile(event.dataTransfer.files[0]);
            }}
            className="flex min-h-[150px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center transition-colors hover:border-primary/40"
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-soft">
              {file ? <FileSpreadsheet className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
            </div>
            <p className="text-sm font-semibold">
              {file ? file.name : 'Tarik berkas XLSX/CSV ke sini atau klik'}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {file ? `${(file.size / 1024).toFixed(0)} KB · klik untuk mengganti` : 'Header kolom dideteksi otomatis'}
            </p>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-[240px]">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Mode impor</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as 'replace' | 'append')}>
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="replace">Ganti seluruh personel</SelectItem>
                  <SelectItem value="append">Tambah ke daftar yang ada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground sm:max-w-[260px]">
              Mode <span className="font-semibold text-foreground">ganti</span> menghapus personel lama pada Sprin
              ini. Mode <span className="font-semibold text-foreground">tambah</span> melewati nama yang sudah ada.{' '}
              <a href="/template-personel.csv" download className="text-primary underline-offset-2 hover:underline">
                Unduh template CSV
              </a>
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={!file || busy}>
            {busy ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Mengimpor…
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4" /> Impor personel
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SprinTab = 'active' | 'review' | 'completed' | 'archived';

export function SprinPage() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [tab, setTab] = React.useState<SprinTab>('active');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [manualOpen, setManualOpen] = React.useState(false);
  const debounced = useDebouncedValue(search);
  const version = useRealtimeVersion();

  const query = React.useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (debounced) params.set('search', debounced);
    if (tab === 'active') params.set('status', 'active');
    if (tab === 'completed') params.set('status', 'completed');
    if (tab === 'archived') params.set('status', 'archived');
    if (tab === 'review') params.set('notify', 'review');
    return params.toString();
  }, [page, debounced, tab]);

  const listApi = useApi<Paginated<SprinDTO>>(`/sprin?${query}`);
  const activeApi = useApi<Paginated<SprinDTO>>('/sprin?status=active&pageSize=1');
  const reviewApi = useApi<Paginated<SprinDTO>>('/sprin?notify=review&pageSize=1');
  const completedApi = useApi<Paginated<SprinDTO>>('/sprin?status=completed&pageSize=1');
  const archivedApi = useApi<Paginated<SprinDTO>>('/sprin?status=archived&pageSize=1');
  const statsApi = useApi<DashboardStats>('/stats');

  React.useEffect(() => {
    if (version === 0) return;
    void listApi.refresh();
    void activeApi.refresh();
    void reviewApi.refresh();
    void completedApi.refresh();
    void archivedApi.refresh();
    void statsApi.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  React.useEffect(() => {
    setPage(1);
  }, [debounced, tab]);

  const data = listApi.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="animate-slide-up space-y-6">
      <PageHeader
        eyebrow="Manajemen Dokumen"
        title="Data Surat Perintah"
        description="Sprin aktif, perlu review, selesai, dan arsip — lengkap dengan metadata kegiatan, personel, dan status pelaporan."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => downloadFile(exportUrl('sprin.csv'))}>
              <Download className="h-4 w-4" /> CSV Personel
            </Button>
            <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}>
              <FileSpreadsheet className="h-4 w-4" /> Buat Sprin
            </Button>
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <UploadCloud className="h-4 w-4" /> Unggah Sprin
            </Button>
          </>
        }
      />

      {data ? (
        <SummaryCards
          data={data}
          stats={statsApi.data}
          activeTotal={activeApi.data?.total ?? 0}
          reviewTotal={reviewApi.data?.total ?? 0}
          onReviewClick={() => setTab('review')}
        />
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-3 p-3.5 xl:flex-row xl:items-center xl:justify-between">
          <div className="overflow-x-auto pb-0.5">
            <Tabs value={tab} onValueChange={(value) => setTab(value as SprinTab)}>
              <TabsList className="h-9 w-max">
                <TabsTrigger value="active" className="text-[11px]">
                  Aktif
                  <Badge variant="muted" className="ml-1 text-[8px]">
                    {formatNumber(activeApi.data?.total ?? 0)}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="review" className="text-[11px]">
                  Perlu Review
                  <Badge
                    variant={(reviewApi.data?.total ?? 0) > 0 ? 'warning' : 'muted'}
                    className="ml-1 text-[8px]"
                  >
                    {formatNumber(reviewApi.data?.total ?? 0)}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="completed" className="text-[11px]">
                  Selesai
                  <Badge variant="muted" className="ml-1 text-[8px]">
                    {formatNumber(completedApi.data?.total ?? 0)}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="archived" className="text-[11px]">
                  Arsip
                  <Badge variant="muted" className="ml-1 text-[8px]">
                    {formatNumber(archivedApi.data?.total ?? 0)}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:w-[280px]">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  tab === 'review'
                    ? 'Cari Sprin yang perlu review…'
                    : 'Cari nomor, perihal, tempat…'
                }
                className="h-9 pl-9 text-xs"
              />
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">
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
          description="Unggah PDF/DOCX, buat header manual lalu impor personel dari Excel/CSV, atau kirim dokumen ke grup WhatsApp yang dipantau."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => setUploadOpen(true)}>
                <UploadCloud className="h-4 w-4" /> Unggah Sprin
              </Button>
              <Button variant="outline" onClick={() => setManualOpen(true)}>
                <FileSpreadsheet className="h-4 w-4" /> Buat Sprin manual
              </Button>
            </div>
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
                      {sprin.notification?.requiresReview ? (
                        <Badge variant="warning" className="text-[9px]">
                          Notif perlu review
                        </Badge>
                      ) : sprin.notification?.status === 'sent' ? (
                        <Badge variant="success" className="text-[9px]">
                          Notif terkirim
                        </Badge>
                      ) : null}
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
          void reviewApi.refresh();
          void completedApi.refresh();
          void archivedApi.refresh();
          void statsApi.refresh();
        }}
      />
      <UploadSprinDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => {
          void listApi.refresh();
          void activeApi.refresh();
          void reviewApi.refresh();
          void completedApi.refresh();
          void archivedApi.refresh();
          void statsApi.refresh();
        }}
      />
      <ManualSprinDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onSaved={(sprin) => {
          void listApi.refresh();
          void activeApi.refresh();
          void reviewApi.refresh();
          void completedApi.refresh();
          void archivedApi.refresh();
          void statsApi.refresh();
          setSelectedId(sprin.id);
        }}
      />
    </div>
  );
}
