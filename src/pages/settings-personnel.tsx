import * as React from 'react';
import {
  BadgeCheck,
  FileSpreadsheet,
  Loader2,
  Phone,
  RadioTower,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  UsersRound
} from 'lucide-react';
import { toast } from 'sonner';
import type { PersonnelRosterPage, SandiMapDTO } from '@/shared/types';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApi, useDebouncedValue } from '@/src/hooks/use-api';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/format';

interface ImportResult {
  mode: 'replace' | 'append';
  imported: number;
  replaced: number;
  total: number;
  counts: { perwira: number; anggota: number };
  warnings: string[];
  sheetName: string;
  mappedColumns: string[];
  skipped: number;
}

const EMPTY_PICK = '__kosong__';

export function PersonnelPanel() {
  const [search, setSearch] = React.useState('');
  const debounced = useDebouncedValue(search);
  const [file, setFile] = React.useState<File | null>(null);
  const [mode, setMode] = React.useState<'replace' | 'append'>('replace');
  const [busy, setBusy] = React.useState(false);
  const [slotDraft, setSlotDraft] = React.useState<Record<string, string>>({});
  const [savingSandi, setSavingSandi] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const listApi = useApi<PersonnelRosterPage>(
    `/personnel?pageSize=200${debounced ? `&search=${encodeURIComponent(debounced)}` : ''}`
  );
  const sandiApi = useApi<SandiMapDTO>('/personnel/sandi');

  React.useEffect(() => {
    if (!sandiApi.data) return;
    const draft: Record<string, string> = {};
    for (const slot of sandiApi.data.slots) {
      draft[slot.code] = slot.personnelId ?? EMPTY_PICK;
    }
    setSlotDraft(draft);
  }, [sandiApi.data]);

  const stats = listApi.data?.stats;
  const personnel = listApi.data?.items ?? [];

  const submitUpload = async () => {
    if (!file) return;
    if (!file.name.toLowerCase().match(/\.(xlsx|xlsm|csv)$/)) {
      toast.error('Format berkas harus XLSX atau CSV.');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mode', mode);
      const result = await api.upload<ImportResult>('/personnel/import', form);
      toast.success(
        result.mode === 'replace'
          ? `${formatNumber(result.imported)} personel menggantikan ${formatNumber(result.replaced)} data lama`
          : `${formatNumber(result.imported)} baris diproses`,
        {
          description: `${result.sheetName} · ${result.counts.perwira} perwira · total ${formatNumber(result.total)} personel`
        }
      );
      if (result.warnings.length) {
        toast.warning('Perlu dicek', { description: result.warnings.join(' ') });
      }
      setFile(null);
      await listApi.refresh(true);
      await sandiApi.refresh(true);
    } catch (error) {
      toast.error('Gagal mengimpor personel', { description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const saveSandi = async () => {
    setSavingSandi(true);
    try {
      const map: Record<string, string | null> = {};
      for (const [code, value] of Object.entries(slotDraft)) {
        map[code] = value === EMPTY_PICK ? null : value;
      }
      const updated = await api.put<SandiMapDTO>('/personnel/sandi', { map });
      toast.success('Peta sandi disimpan', {
        description: `${updated.slots.filter((slot) => slot.personnelId).length} sandi terhubung ke personel`
      });
      await sandiApi.refresh(true);
    } catch (error) {
      toast.error('Gagal menyimpan sandi', { description: errorMessage(error) });
    } finally {
      setSavingSandi(false);
    }
  };

  const options = (sandiApi.data?.perwira ?? [])
    .map((person) => ({
      id: person.id,
      label: `${person.rank ? `${person.rank} ` : ''}${person.name}${person.jabatan ? ` · ${person.jabatan}` : ''}`
    }))
    .concat(
      (listApi.data?.items ?? [])
        .filter(
          (person) =>
            !(sandiApi.data?.perwira ?? []).some((perwira) => perwira.id === person.id)
        )
        .map((person) => ({
          id: person.id,
          label: `${person.rank ? `${person.rank} ` : ''}${person.name}${person.jabatan ? ` · ${person.jabatan}` : ''}`
        }))
    );

  const groups: Array<{ title: string; hint: string; codes: string[] }> = [
    {
      title: 'Sandi Perwira Satlantas',
      hint: 'Kode 12.1 – 12.6 dipakai saat supervisi/pengecekan.',
      codes: ['12.1', '12.2', '12.3', '12.4', '12.5', '12.6']
    },
    {
      title: 'Sandi Pejabat Utama (PJU) Polres',
      hint: 'Agung 1 = Kapolres · Agung 2 = Wakapolres · Agung 4 = Kabag Ops · Agung 12 = Kasat Lantas. Sandi Agung lain dibiarkan sesuai caption anggota — isi manual bila sudah pasti.',
      codes: Array.from({ length: 16 }, (_, index) => `AGUNG ${index + 1}`)
    }
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Total personel', value: stats?.total ?? 0, icon: UsersRound, tone: 'text-primary' },
          { label: 'Perwira', value: stats?.perwira ?? 0, icon: BadgeCheck, tone: 'text-info' },
          { label: 'Punya no. HP', value: stats?.withPhone ?? 0, icon: Phone, tone: 'text-success' },
          { label: 'Tanpa no. HP', value: stats?.withoutPhone ?? 0, icon: ShieldAlert, tone: 'text-warning' }
        ].map((item) => (
          <Card key={item.label} className="overflow-hidden">
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
              <h3 className="text-sm font-semibold">Basis Data Personel</h3>
              <p className="text-[10px] text-muted-foreground">
                Unggah XLSX/CSV berisi NO, NAMA, PANGKAT, NRP, JABATAN, dan NO HP. Unggah ulang untuk
                memperbarui data.
              </p>
            </div>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
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
                {file ? file.name : 'Tarik berkas XLSX/CSV ke sini atau klik untuk memilih'}
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xlsm,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <div className="w-full sm:w-[220px]">
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Mode</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as 'replace' | 'append')}>
                <SelectTrigger className="mt-1 h-9 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="replace">Ganti seluruh data</SelectItem>
                  <SelectItem value="append">Tambah / perbarui</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => void submitUpload()} disabled={!file || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Impor personel
            </Button>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/15 p-3 text-[10px] leading-relaxed text-muted-foreground">
            Mode <span className="font-semibold text-foreground">ganti</span> menghapus seluruh data lama lalu
            memakai isi berkas terbaru (paling aman saat ada mutasi personel). Mode{' '}
            <span className="font-semibold text-foreground">tambah</span> memperbarui baris dengan NRP/nama sama
            dan menambah yang baru.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Data Personel</h3>
              <p className="text-[10px] text-muted-foreground">
                {formatNumber(listApi.data?.total ?? 0)} baris tersimpan
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama, NRP, jabatan…"
                className="h-8 w-[220px] text-[11px]"
              />
              <Button variant="outline" size="sm" onClick={() => void listApi.refresh(true)} disabled={listApi.loading}>
                <RefreshCw className={cn('h-3.5 w-3.5', listApi.loading && 'animate-spin')} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[360px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-12 text-[9px]">NO</TableHead>
                  <TableHead className="text-[9px]">NAMA</TableHead>
                  <TableHead className="text-[9px]">PANGKAT/NRP</TableHead>
                  <TableHead className="text-[9px]">JABATAN</TableHead>
                  <TableHead className="text-[9px]">NO HP</TableHead>
                  <TableHead className="text-[9px]">STATUS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {personnel.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">{person.no}</TableCell>
                    <TableCell className="text-[11px] font-medium">{person.name}</TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">
                      {[person.rank, person.nrp].filter(Boolean).join(' / ') || '-'}
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{person.jabatan ?? '-'}</TableCell>
                    <TableCell className="font-mono text-[10px]">
                      {person.phone ?? <span className="text-warning">belum ada</span>}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={person.category === 'PERWIRA' ? 'info' : person.category === 'PJU' ? 'violet' : 'muted'}
                        className="text-[8px]"
                      >
                        {person.category}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {personnel.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-[11px] text-muted-foreground">
                      Belum ada data personel. Unggah berkas XLSX/CSV di atas.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Peta Sandi (Call Sign)</h3>
              <p className="text-[10px] text-muted-foreground">
                Dipakai mendeteksi perwira yang menyupervisi kegiatan dari caption WhatsApp.
              </p>
            </div>
            <Button size="sm" onClick={() => void saveSandi()} disabled={savingSandi}>
              {savingSandi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RadioTower className="h-3.5 w-3.5" />}
              Simpan sandi
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</p>
              <p className="mb-2 text-[9px] text-muted-foreground">{group.hint}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.codes.map((code) => (
                  <div key={code} className="rounded-lg border border-border/60 bg-muted/20 p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-mono text-[11px] font-semibold">{code}</span>
                      <span className="text-[8px] text-muted-foreground">
                        {sandiApi.data?.slots.find((slot) => slot.code === code)?.label ?? ''}
                      </span>
                    </div>
                    <Select
                      value={slotDraft[code] ?? EMPTY_PICK}
                      onValueChange={(value) => setSlotDraft((prev) => ({ ...prev, [code]: value }))}
                    >
                      <SelectTrigger className="h-8 text-[10px]">
                        <SelectValue placeholder="Pilih personel" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        <SelectItem value={EMPTY_PICK}>— belum ditentukan —</SelectItem>
                        {options.map((option) => (
                          <SelectItem key={option.id} value={option.id} className="text-[11px]">
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
