import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Link2,
  Loader2,
  MapPin,
  RefreshCw,
  Route,
  Search,
  UploadCloud,
  UsersRound
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  PersonnelRosterPage,
  PosPagiAssignmentDTO,
  PosPagiImportResult,
  PosPagiListDTO
} from '@/shared/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useApi } from '@/src/hooks/use-api';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/format';

const EMPTY = '__kosong__';

function assignmentLabel(assignment: PosPagiAssignmentDTO): string {
  return `${assignment.rank ? `${assignment.rank} ` : ''}${assignment.name}`;
}

function MatchBadge({ assignment }: { assignment: PosPagiAssignmentDTO }) {
  if (assignment.matchStatus === 'UNMATCHED') {
    return <Badge variant="warning" className="text-[8px]">Belum cocok</Badge>;
  }
  if (assignment.matchStatus === 'DUPLICATE') {
    return <Badge variant="destructive" className="text-[8px]">Ganda</Badge>;
  }
  return (
    <Badge
      variant={assignment.matchMethod === 'name-abbrev' ? 'warning' : 'success'}
      className="text-[8px]"
    >
      {assignment.matchMethod === 'manual'
        ? 'Manual'
        : assignment.matchMethod === 'name-abbrev'
          ? 'Nama singkat'
          : 'Cocok'}
    </Badge>
  );
}

export function PosPagiPanel() {
  const listApi = useApi<PosPagiListDTO>('/pos-pagi');
  const personnelApi = useApi<PersonnelRosterPage>('/personnel?pageSize=200');
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [correctionSearch, setCorrectionSearch] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const posts = listApi.data?.posts ?? [];
  const padal = listApi.data?.padalAssignments ?? [];
  const allAssignments = [...posts.flatMap((post) => post.assignments), ...padal];
  const unmatched = allAssignments.filter((assignment) => assignment.matchStatus === 'UNMATCHED');
  const totals = listApi.data?.totals;
  const correctionQuery = correctionSearch.trim().toLowerCase();
  const correctionResults = correctionQuery
    ? allAssignments.filter((assignment) =>
        `${assignment.name} ${assignment.personnelName ?? ''}`.toLowerCase().includes(correctionQuery)
      )
    : [];

  const personnelOptions = (personnelApi.data?.items ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const upload = async () => {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error('Format berkas harus XLSX.');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api.upload<PosPagiImportResult>('/pos-pagi/import', form);
      setWarnings(result.warnings);
      toast.success(`${formatNumber(result.totals.posts)} pos dan ${formatNumber(result.totals.assigned)} anggota diimpor`, {
        description: `${result.totals.matched} cocok · ${result.totals.unmatched} belum cocok · ${result.totals.padal} PADAL`
      });
      if (result.warnings.length > 0) {
        toast.warning('Perlu dicek', { description: result.warnings[0] });
      }
      setFile(null);
      await listApi.refresh(true);
    } catch (error) {
      toast.error('Gagal mengimpor POS PAGI', { description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const saveAssignment = async (assignment: PosPagiAssignmentDTO) => {
    const value = draft[assignment.id];
    if (!value) return;
    setSavingId(assignment.id);
    try {
      const updated = await api.patch<PosPagiListDTO>(
        `/pos-pagi/assignments/${assignment.id}`,
        { personnelId: value === EMPTY ? null : value }
      );
      listApi.setData(updated);
      setDraft((current) => {
        const next = { ...current };
        delete next[assignment.id];
        return next;
      });
      toast.success('Penugasan diperbarui');
    } catch (error) {
      toast.error('Gagal menghubungkan personel', { description: errorMessage(error) });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-5">
        {[
          { label: 'Titik pos', value: totals?.posts ?? 0, icon: MapPin, tone: 'text-primary' },
          { label: 'Anggota', value: totals?.assigned ?? 0, icon: UsersRound, tone: 'text-info' },
          { label: 'Cocok roster', value: totals?.matched ?? 0, icon: CheckCircle2, tone: 'text-success' },
          { label: 'Belum cocok', value: totals?.unmatched ?? 0, icon: AlertTriangle, tone: 'text-warning' },
          { label: 'PADAL', value: totals?.padal ?? 0, icon: Route, tone: 'text-muted-foreground' }
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/30', item.tone)}>
                <item.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                <p className="font-mono text-lg font-semibold">{formatNumber(item.value)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <FileSpreadsheet className="h-4 w-4 text-primary" /> Impor POS PAGI
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Unggah XLSX berisi NO, NAMA, PANGKAT, JABATAN, dan kolom pos berisi
                <span className="font-mono"> NAMA POS -lat, lng</span>. Data pos lama akan diganti.
              </p>
            </div>
            <Badge variant="outline" className="text-[8px]">XLSX</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                setFile(event.dataTransfer.files?.[0] ?? null);
              }}
              className="flex flex-1 items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-left transition-colors hover:border-primary/40"
            >
              <UploadCloud className="h-4 w-4 text-primary" />
              <span className="text-[11px]">
                {file ? file.name : 'Tarik berkas POS PAGI XLSX ke sini atau klik untuk memilih'}
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <Button onClick={() => void upload()} disabled={!file || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Impor & ganti
            </Button>
            <Button variant="outline" onClick={() => void listApi.refresh(true)} disabled={listApi.loading}>
              <RefreshCw className={cn('h-4 w-4', listApi.loading && 'animate-spin')} />
            </Button>
          </div>
          <div className="rounded-lg border border-warning/25 bg-warning/5 p-3 text-[10px] leading-relaxed text-muted-foreground">
            Impor akan <b>mengganti seluruh data pos pagi</b>. Nama yang belum cocok tetap disimpan dan bisa
            dihubungkan manual di bawah. Radius default 100 m; laporan di luar radius ditandai
            <b> tidak sesuai titik</b>.
          </div>
          {warnings.length > 0 ? (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-[10px] text-warning">
              <p className="font-semibold">Catatan impor</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {warnings.slice(0, 8).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {unmatched.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-warning">
              <AlertTriangle className="h-4 w-4" /> Belum terhubung ke roster ({unmatched.length})
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Pilih personel yang benar. Jangan biarkan kosong saat membuat rekap Pos Pagi.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {unmatched.map((assignment) => {
              const post = posts.find((item) => item.id === assignment.posId);
              return (
                <div
                  key={assignment.id}
                  className="grid gap-2 rounded-lg border border-border/60 bg-muted/10 p-2 sm:grid-cols-[1fr_280px_auto] sm:items-center"
                >
                  <div>
                    <p className="text-[11px] font-medium">{assignmentLabel(assignment)}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {post?.name ?? 'PADAL'} · {assignment.jabatan ?? assignment.role}
                    </p>
                  </div>
                  <Select
                    value={draft[assignment.id] ?? ''}
                    onValueChange={(value) =>
                      setDraft((current) => ({ ...current, [assignment.id]: value }))
                    }
                  >
                    <SelectTrigger className="h-8 text-[10px]">
                      <SelectValue placeholder="Pilih personel roster" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY}>Kosongkan / belum cocok</SelectItem>
                      {personnelOptions.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.rank ? `${person.rank} ` : ''}
                          {person.name}
                          {person.jabatan ? ` · ${person.jabatan}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={() => void saveAssignment(assignment)}
                    disabled={!draft[assignment.id] || savingId === assignment.id}
                  >
                    {savingId === assignment.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" />
                    )}
                    Hubungkan
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Search className="h-4 w-4 text-primary" /> Koreksi penugasan
          </h3>
          <p className="text-[10px] text-muted-foreground">
            Cari nama di pos (atau nama roster yang salah) lalu pilih personel yang benar. Berguna untuk
            memperbaiki kecocokan nama singkat yang keliru.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            value={correctionSearch}
            onChange={(event) => setCorrectionSearch(event.target.value)}
            placeholder="Cari nama, mis. DONNI atau NUR CHOLIK…"
            className="h-8 text-[11px]"
          />
          {correctionQuery && correctionResults.length === 0 ? (
            <p className="py-3 text-center text-[10px] text-muted-foreground">Nama tidak ditemukan.</p>
          ) : null}
          {correctionResults.slice(0, 20).map((assignment) => {
            const post = posts.find((item) => item.id === assignment.posId);
            return (
              <div
                key={assignment.id}
                className="grid gap-2 rounded-lg border border-border/60 bg-muted/10 p-2 sm:grid-cols-[1fr_280px_auto] sm:items-center"
              >
                <div>
                  <p className="text-[11px] font-medium">{assignmentLabel(assignment)}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {post?.name ?? 'PADAL'} · terhubung: {assignment.personnelName ?? 'belum cocok'}
                  </p>
                </div>
                <Select
                  value={draft[assignment.id] ?? assignment.personnelId ?? ''}
                  onValueChange={(value) =>
                    setDraft((current) => ({ ...current, [assignment.id]: value }))
                  }
                >
                  <SelectTrigger className="h-8 text-[10px]">
                    <SelectValue placeholder="Pilih personel roster" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY}>Kosongkan / belum cocok</SelectItem>
                    {personnelOptions.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.rank ? `${person.rank} ` : ''}
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => void saveAssignment(assignment)}
                  disabled={!draft[assignment.id] || savingId === assignment.id}
                >
                  {savingId === assignment.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" />
                  )}
                  Simpan
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-primary" /> Titik pos dan anggota
          </h3>
          <p className="text-[10px] text-muted-foreground">
            {formatNumber(posts.length)} titik · {formatNumber(totals?.assigned ?? 0)} penugasan
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {posts.map((post) => (
            <div key={post.id} className="rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[12px] font-semibold">{post.name}</p>
                  <p className="font-mono text-[9px] text-muted-foreground">
                    {post.latitude ?? '-'}, {post.longitude ?? '-'} · radius {post.radiusMeters} m
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[8px]">{post.assignments.length} anggota</Badge>
                  {post.assignments.some((assignment) => assignment.matchStatus === 'UNMATCHED') ? (
                    <Badge variant="warning" className="text-[8px]">
                      {post.assignments.filter((assignment) => assignment.matchStatus === 'UNMATCHED').length} belum cocok
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {post.assignments.map((assignment) => (
                  <span
                    key={assignment.id}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[9px]"
                  >
                    {assignmentLabel(assignment)}
                    <MatchBadge assignment={assignment} />
                  </span>
                ))}
              </div>
            </div>
          ))}
          {posts.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-muted-foreground">
              Belum ada data pos pagi. Impor berkas terlebih dahulu.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {padal.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold">PADAL / Perwira</h3>
            <p className="text-[10px] text-muted-foreground">
              Perwira tidak diwajibkan melapor sebagai anggota pos, tetapi tetap dicatat.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {padal.map((assignment) => (
              <span
                key={assignment.id}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[9px]"
              >
                {assignmentLabel(assignment)}
                <MatchBadge assignment={assignment} />
              </span>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
