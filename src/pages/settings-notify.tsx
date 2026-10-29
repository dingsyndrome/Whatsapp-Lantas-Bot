import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  UsersRound
} from 'lucide-react';
import { toast } from 'sonner';
import type { NotificationFunctionDTO, SettingsDTO } from '@/shared/types';
import { DEFAULT_SPRIN_NOTIFY_TEMPLATE, SPRIN_NOTIFY_PLACEHOLDERS } from '@/shared/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

const SAMPLE_VARS: Record<string, string> = {
  botName: 'SIGAP Command Center',
  nama: 'BUDI SETIONO',
  pangkat_nrp: ' (AIPDA/850101)',
  sprin: 'Sprin/1810/X/PAM.3.3./2026',
  kategori: 'Pengaturan (Gatur)',
  tugas: 'BA SATLANTAS — pengaturan pagi',
  kegiatan: 'Penjagaan dan pengaturan lalu lintas pada simpul jalan dan pintu masuk sekolah.',
  lokasi_tugas: 'DEPAN SMPN 6 TULUNGAGUNG',
  lokasi_apel:
    'Apel kelompok (1 s.d. 12 dan 26 s.d. 113): halaman Pemkab Tulungagung pukul 08.00 WIB\nApel umum (teks "sebelum melaksanakan tugas"): halaman Kantor DPRD Kab. Tulungagung pukul 08.00 WIB',
  jadwal: 'Kamis, 29 Oktober 2026, pukul 06.15 WIB',
  catatan_lokasi:
    '• Sumber lokasi tugas: Jabatan (KET kosong).\n• Ada pengecualian Pam Kejaksaan; mohon verifikasi admin.'
};

function sampleText(template: string): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => SAMPLE_VARS[key] ?? match);
}

interface FunctionForm {
  code: string;
  name: string;
  keywords: string;
  excludePerwira: boolean;
  active: boolean;
  sortOrder: number;
}

const EMPTY_FUNCTION: FunctionForm = {
  code: '',
  name: '',
  keywords: '',
  excludePerwira: true,
  active: true,
  sortOrder: 100
};

export function NotifySettingsPanel({
  form,
  setForm
}: {
  form: SettingsDTO;
  setForm: React.Dispatch<React.SetStateAction<SettingsDTO | null>>;
}) {
  const functionsApi = useApiFunctions();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<NotificationFunctionDTO | null>(null);
  const [functionForm, setFunctionForm] = React.useState<FunctionForm>(EMPTY_FUNCTION);
  const [savingFunction, setSavingFunction] = React.useState(false);

  const functions = functionsApi.data ?? [];

  const set = <K extends keyof SettingsDTO>(key: K, value: SettingsDTO[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const toggleDefault = (code: string) => {
    const selected = form.sprinNotifyDefaultFunctions.includes(code)
      ? form.sprinNotifyDefaultFunctions.filter((value) => value !== code)
      : [...form.sprinNotifyDefaultFunctions, code];
    set('sprinNotifyDefaultFunctions', selected);
  };

  const openCreate = () => {
    setEditing(null);
    setFunctionForm(EMPTY_FUNCTION);
    setDialogOpen(true);
  };

  const openEdit = (row: NotificationFunctionDTO) => {
    setEditing(row);
    setFunctionForm({
      code: row.code,
      name: row.name,
      keywords: row.keywords.join(', '),
      excludePerwira: row.excludePerwira,
      active: row.active,
      sortOrder: row.sortOrder
    });
    setDialogOpen(true);
  };

  const submitFunction = async () => {
    const keywords = functionForm.keywords
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!functionForm.code.trim() || !functionForm.name.trim() || keywords.length === 0) {
      toast.error('Kode, nama, dan minimal satu kata kunci wajib diisi.');
      return;
    }
    setSavingFunction(true);
    try {
      const payload = {
        code: functionForm.code.trim().toUpperCase(),
        name: functionForm.name.trim(),
        keywords,
        excludePerwira: functionForm.excludePerwira,
        active: functionForm.active,
        sortOrder: functionForm.sortOrder
      };
      if (editing) {
        await api.patch(`/settings/notification-functions/${editing.id}`, payload);
        toast.success(`Fungsi ${payload.code} diperbarui`);
      } else {
        await api.post('/settings/notification-functions', payload);
        toast.success(`Fungsi ${payload.code} ditambahkan`);
      }
      setDialogOpen(false);
      await functionsApi.refresh(true);
    } catch (error) {
      toast.error('Gagal menyimpan fungsi', { description: errorMessage(error) });
    } finally {
      setSavingFunction(false);
    }
  };

  const toggleActive = async (row: NotificationFunctionDTO, active: boolean) => {
    try {
      await api.patch(`/settings/notification-functions/${row.id}`, { active });
      await functionsApi.refresh(true);
    } catch (error) {
      toast.error('Gagal mengubah status fungsi', { description: errorMessage(error) });
    }
  };

  const removeFunction = async (row: NotificationFunctionDTO) => {
    if (!window.confirm(`Hapus fungsi ${row.code}? Database nomor HP tidak ikut terhapus.`)) return;
    try {
      await api.delete(`/settings/notification-functions/${row.id}`);
      toast.success(`Fungsi ${row.code} dihapus`);
      await functionsApi.refresh(true);
    } catch (error) {
      toast.error('Gagal menghapus fungsi', { description: errorMessage(error) });
    }
  };

  const resetTemplate = () => {
    set('sprinNotifyTemplate', DEFAULT_SPRIN_NOTIFY_TEMPLATE);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Mode pengiriman</CardTitle>
            </div>
            <CardDescription className="text-[11px]">
              Notifikasi hanya dikirim ke fungsi yang dipilih. Perwira dapat dikecualikan secara otomatis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => set('sprinNotifyMode', 'review')}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  form.sprinNotifyMode === 'review'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30'
                )}
              >
                <p className="text-[11px] font-semibold">Tinjau admin dulu</p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  Draf disiapkan otomatis, tetapi pengiriman menunggu persetujuan admin. Aman untuk Sprin dengan
                  lokasi berkelompok atau pengecualian.
                </p>
              </button>
              <button
                type="button"
                onClick={() => set('sprinNotifyMode', 'auto')}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  form.sprinNotifyMode === 'auto'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30'
                )}
              >
                <p className="text-[11px] font-semibold">Kirim otomatis</p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  Langsung dikirim setelah Sprin diunggah bila lokasi sudah jelas. Bila ada keraguan, tetap
                  ditahan untuk verifikasi admin.
                </p>
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
              <div>
                <p className="text-[11px] font-semibold">Kecualikan perwira</p>
                <p className="text-[10px] text-muted-foreground">
                  IPDA, IPTU, AKP, KOMPOL, AKBP dan pangkat di atasnya tidak dikirimi notifikasi.
                </p>
              </div>
              <Switch
                checked={form.sprinNotifyExcludePerwira}
                onCheckedChange={(checked) => set('sprinNotifyExcludePerwira', checked)}
              />
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Fungsi default untuk notifikasi baru
              </Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {functions.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground">Belum ada fungsi. Tambahkan di bawah.</p>
                ) : (
                  functions.map((row) => {
                    const selected = form.sprinNotifyDefaultFunctions.includes(row.code);
                    return (
                      <button
                        key={row.code}
                        type="button"
                        onClick={() => toggleDefault(row.code)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-[10px] font-semibold transition-colors',
                          selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-card text-muted-foreground hover:border-primary/30'
                        )}
                      >
                        {row.name}
                        <span className="ml-1.5 font-normal opacity-70">{row.availableCount} HP</span>
                      </button>
                    );
                  })
                )}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Default hanya Satlantas karena saat ini baru fungsi itu yang memiliki database nomor HP.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Template pesan notifikasi</CardTitle>
              </div>
              <Button size="sm" variant="outline" onClick={resetTemplate}>
                <RefreshCw className="h-3.5 w-3.5" /> Default
              </Button>
            </div>
            <CardDescription className="text-[11px]">
              Admin dapat mengubah isi pesan. Placeholder diganti otomatis per anggota.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={form.sprinNotifyTemplate}
              onChange={(event) => set('sprinNotifyTemplate', event.target.value)}
              className="min-h-[220px] font-mono text-[10px] leading-relaxed"
            />
            <div className="flex flex-wrap gap-1.5">
              {SPRIN_NOTIFY_PLACEHOLDERS.map((placeholder) => (
                <button
                  key={placeholder}
                  type="button"
                  onClick={() =>
                    set('sprinNotifyTemplate', `${form.sprinNotifyTemplate}${form.sprinNotifyTemplate.endsWith('\n') ? '' : '\n'}${placeholder}`)
                  }
                  className="rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground hover:border-primary/40 hover:text-primary"
                >
                  {placeholder}
                </button>
              ))}
            </div>
            <div>
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pratinjau contoh
              </p>
              <pre className="max-h-[190px] overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-[#0b141a] p-3 font-mono text-[9px] leading-relaxed text-[#e9edef]">
                {sampleText(form.sprinNotifyTemplate)}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <UsersRound className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Fungsi kepolisian</CardTitle>
              </div>
              <CardDescription className="text-[11px]">
                Fungsi dideteksi dari kolom Jabatan pada Sprin dan dari kolom Jabatan/Satuan pada database
                personel. Tambahkan fungsi baru saat database nomor HP-nya sudah tersedia.
              </CardDescription>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> Tambah fungsi
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {functionsApi.loading && !functionsApi.data ? (
            <p className="py-6 text-center text-[11px] text-muted-foreground">Memuat fungsi…</p>
          ) : functionsApi.error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center">
              <AlertTriangle className="mx-auto h-5 w-5 text-destructive" />
              <p className="mt-1 text-[11px] text-muted-foreground">{functionsApi.error}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => void functionsApi.refresh(true)}>
                Coba lagi
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {functions.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-[11px] font-bold">{row.code}</p>
                      <p className="text-[11px] font-semibold">{row.name}</p>
                      {row.active ? (
                        <Badge variant="success" className="text-[8px]">Aktif</Badge>
                      ) : (
                        <Badge variant="muted" className="text-[8px]">Nonaktif</Badge>
                      )}
                      {row.excludePerwira ? (
                        <Badge variant="outline" className="text-[8px]">Tanpa perwira</Badge>
                      ) : null}
                      {row.availableCount > 0 ? (
                        <Badge variant="info" className="text-[8px]">{row.availableCount} nomor HP</Badge>
                      ) : (
                        <Badge variant="warning" className="text-[8px]">Belum ada nomor HP</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-[9px] text-muted-foreground">
                      Kata kunci jabatan: {row.keywords.join(', ') || '-'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch checked={row.active} onCheckedChange={(checked) => void toggleActive(row, checked)} />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void removeFunction(row)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/15 p-4">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <div>
          <p className="text-[11px] font-semibold">Akses admin</p>
          <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">
            Pengaturan ini hanya dapat diubah dari dashboard admin. Setiap perubahan fungsi dan template dicatat
            pada feed aktivitas. Untuk menambah fungsi lain, impor database personel dengan kolom Satuan/Jabatan
            yang sesuai, lalu tambahkan kata kuncinya di sini.
          </p>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit fungsi ${editing.code}` : 'Tambah fungsi kepolisian'}</DialogTitle>
            <DialogDescription>
              Fungsi dicocokkan dari kolom Jabatan pada Sprin, lalu dicari nomor HP-nya di database personel.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Kode *</Label>
              <Input
                value={functionForm.code}
                onChange={(event) => setFunctionForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                placeholder="SATLANTAS"
                className="mt-1 font-mono text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nama tampilan *</Label>
              <Input
                value={functionForm.name}
                onChange={(event) => setFunctionForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Satlantas"
                className="mt-1 text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Kata kunci jabatan * (pisahkan dengan koma)
              </Label>
              <Input
                value={functionForm.keywords}
                onChange={(event) => setFunctionForm((current) => ({ ...current, keywords: event.target.value }))}
                placeholder="SATLANTAS, TURJAGWALI, REGIDENT, KAMSEL"
                className="mt-1 text-xs"
              />
              <p className="mt-1 text-[9px] text-muted-foreground">
                Contoh: untuk Polsek gunakan <span className="font-mono">POLSEK</span>. Hindari kata terlalu umum
                seperti <span className="font-mono">LANTAS</span> agar personel Polsek tidak ikut terpilih.
              </p>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Urutan</Label>
              <Input
                type="number"
                value={functionForm.sortOrder}
                onChange={(event) =>
                  setFunctionForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))
                }
                className="mt-1 text-xs"
              />
            </div>
            <div className="flex flex-col gap-2 pt-5">
              <label className="flex items-center gap-2 text-[10px]">
                <Switch
                  checked={functionForm.excludePerwira}
                  onCheckedChange={(checked) => setFunctionForm((current) => ({ ...current, excludePerwira: checked }))}
                />
                Kecualikan perwira
              </label>
              <label className="flex items-center gap-2 text-[10px]">
                <Switch
                  checked={functionForm.active}
                  onCheckedChange={(checked) => setFunctionForm((current) => ({ ...current, active: checked }))}
                />
                Aktif
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={() => void submitFunction()} disabled={savingFunction}>
              {savingFunction ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan fungsi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function useApiFunctions() {
  // Hook kecil agar panel tetap mandiri dan bisa di-refresh setelah CRUD.
  const [data, setData] = React.useState<NotificationFunctionDTO[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      setData(await api.get<NotificationFunctionDTO[]>('/settings/notification-functions'));
      setError(null);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(true);
  }, [load]);

  return { data, loading, error, refresh: load };
}
