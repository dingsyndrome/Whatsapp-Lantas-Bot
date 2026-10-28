import * as React from 'react';
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardCopy,
  Clock,
  Cpu,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  KeyRound,
  Link2,
  Loader2,
  MapPin,
  MessageSquareText,
  LogOut,
  Plus,
  QrCode,
  RefreshCw,
  Route,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  UsersRound,
  Wand2,
  Wifi,
  WifiOff,
  Zap,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  AvailableGroup,
  DailyReport,
  MonitoredGroupDTO,
  SettingsDTO,
  SimulateKind,
  TurjawaliActivityType,
  WhatsAppStatusDTO
} from '@/shared/types';
import {
  DEFAULT_AUTO_REPLY,
  DEFAULT_DOCUMENT_PROMPT,
  DEFAULT_TIMEMARK_PROMPT,
  DEFAULT_TURJAWALI_KEYWORDS,
  DEFAULT_TURJAWALI_RULES,
  TURJAWALI_LABELS
} from '@/shared/types';
import { PageHeader } from '@/components/sigap/page-header';
import { StatusBadge } from '@/components/sigap/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/src/hooks/use-api';
import { useRealtime } from '@/src/lib/realtime';
import { api, copyText, downloadFile, errorMessage, exportUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { PersonnelPanel } from './settings-personnel';

type SimulatorLog = {
  id: string;
  kind: SimulateKind;
  title: string;
  message: string;
  at: string;
};

const TIMEZONES = [
  { value: 'Asia/Jakarta', label: 'WIB · Asia/Jakarta' },
  { value: 'Asia/Makassar', label: 'WITA · Asia/Makassar' },
  { value: 'Asia/Jayapura', label: 'WIT · Asia/Jayapura' },
  { value: 'UTC', label: 'UTC' }
];

function ConnectionPanel({
  form,
  setForm,
  status,
  onConnect,
  onDisconnect,
  onLogout,
  onRestart,
  pending
}: {
  form: SettingsDTO;
  setForm: React.Dispatch<React.SetStateAction<SettingsDTO | null>>;
  status: WhatsAppStatusDTO | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onLogout: () => void;
  onRestart: () => void;
  pending: boolean;
}) {
  const currentStatus = status?.status ?? 'disconnected';
  const qr = status?.qrDataUrl?.startsWith('data:image') ? status.qrDataUrl : null;
  const isMock = form.waDriver === 'mock' && currentStatus === 'mock';
  const [pairPhone, setPairPhone] = React.useState('');
  const [pairCode, setPairCode] = React.useState<string | null>(null);
  const [pairPending, setPairPending] = React.useState(false);

  /**
   * Ganti driver langsung tersimpan: halaman ini menerima pembaruan realtime,
   * jadi pilihan yang hanya ada di state lokal akan kembali ke nilai server
   * (itu sebabnya QR yang tampil dulu masih milik driver lama).
   */
  const applyDriver = (driver: 'mock' | 'webjs' | 'baileys') => {
    setForm((current) => (current ? { ...current, waDriver: driver } : current));
    void api
      .put<SettingsDTO>('/settings', { waDriver: driver })
      .then(() => {
        setPairCode(null);
        toast.success(`Driver ${driver} aktif`, {
          description: driver === 'baileys' ? 'QR/proses login akan dibuat oleh Baileys.' : 'Pengaturan disimpan.'
        });
      })
      .catch((error) => toast.error('Gagal mengganti driver', { description: errorMessage(error) }));
  };

  const requestPairing = async () => {
    if (pairPhone.replace(/\D/g, '').length < 10) {
      toast.error('Masukkan nomor bot, contoh 08563639888.');
      return;
    }
    setPairPending(true);
    try {
      const result = await api.post<WhatsAppStatusDTO>('/wa/pairing', { phone: pairPhone });
      if (result.pairingCode) {
        setPairCode(result.pairingCode);
        toast.success('Kode pairing dibuat', {
          description: 'Masukkan di WhatsApp → Perangkat tertaut → Tautkan dengan nomor telepon.'
        });
      } else {
        toast.warning('Kode belum tersedia', {
          description: result.lastError ?? 'Tunggu QR muncul, lalu klik lagi.'
        });
      }
    } catch (error) {
      toast.error('Gagal meminta kode pairing', { description: errorMessage(error) });
    } finally {
      setPairPending(false);
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <Card className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_20%_0%,hsl(var(--primary)/0.13),transparent_70%)]" />
        <CardHeader className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <MessageSquareText className="h-6 w-6" />
              </div>
              <div>
                <CardTitle>Koneksi WhatsApp</CardTitle>
                <CardDescription className="mt-1">
                  Pilih simulator atau hubungkan perangkat WhatsApp Web.
                </CardDescription>
              </div>
            </div>
            <StatusBadge status={currentStatus} />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="bot-name">Nama bot</Label>
            <Input
              id="bot-name"
              value={form.botName}
              onChange={(event) => setForm((current) => (current ? { ...current, botName: event.target.value } : current))}
              placeholder="SIGAP Command Center"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => applyDriver('mock')}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                form.waDriver === 'mock'
                  ? 'border-primary/40 bg-primary/[0.06] shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]'
                  : 'border-border/70 bg-muted/10 hover:border-primary/20'
              )}
            >
              <div className="flex items-center justify-between">
                <Sparkles className={cn('h-5 w-5', form.waDriver === 'mock' ? 'text-primary' : 'text-muted-foreground')} />
                {form.waDriver === 'mock' ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}
              </div>
              <p className="mt-3 text-xs font-semibold">Mode Simulasi</p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                Tanpa scan QR. Cocok untuk demo, uji OCR, dan pengembangan.
              </p>
            </button>
            <button
              type="button"
              onClick={() => applyDriver('webjs')}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                form.waDriver === 'webjs'
                  ? 'border-primary/40 bg-primary/[0.06] shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]'
                  : 'border-border/70 bg-muted/10 hover:border-primary/20'
              )}
            >
              <div className="flex items-center justify-between">
                <Smartphone className={cn('h-5 w-5', form.waDriver === 'webjs' ? 'text-primary' : 'text-muted-foreground')} />
                {form.waDriver === 'webjs' ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}
              </div>
              <p className="mt-3 text-xs font-semibold">WhatsApp Web</p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                Scan QR dengan nomor bot. Membutuhkan Chrome/Chromium di server.
              </p>
            </button>
            <button
              type="button"
              onClick={() => applyDriver('baileys')}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                form.waDriver === 'baileys'
                  ? 'border-primary/40 bg-primary/[0.06] shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]'
                  : 'border-border/70 bg-muted/10 hover:border-primary/20'
              )}
            >
              <div className="flex items-center justify-between">
                <Zap className={cn('h-5 w-5', form.waDriver === 'baileys' ? 'text-primary' : 'text-muted-foreground')} />
                {form.waDriver === 'baileys' ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}
              </div>
              <p className="mt-3 text-xs font-semibold">Baileys</p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                Protokol WebSocket, tanpa Chromium. Paling stabil untuk server.
              </p>
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Akun</p>
              <p className="mt-1 text-[11px] font-semibold">
                {isMock ? 'Simulator lokal' : status?.pushName ?? 'Belum terhubung'}
                {status?.phone ? <span className="ml-1 font-mono text-[9px] text-muted-foreground">{status.phone}</span> : null}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Terakhir terhubung</p>
              <p className="mt-1 text-[11px] font-semibold">
                {isMock ? 'Aktif tanpa perangkat' : status?.lastConnectedAt ? formatDateTime(status.lastConnectedAt) : '-'}
              </p>
            </div>
          </div>

          {status?.lastError ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-[10px] leading-relaxed text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{status.lastError}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onConnect} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
              {form.waDriver === 'mock' ? 'Aktifkan simulator' : currentStatus === 'connected' ? 'Hubungkan ulang' : 'Hubungkan & tampilkan QR'}
            </Button>
            <Button size="sm" variant="outline" onClick={onRestart} disabled={pending}>
              <RefreshCw className={cn('h-4 w-4', pending && 'animate-spin')} /> Restart
            </Button>
            {currentStatus !== 'disconnected' && currentStatus !== 'mock' ? (
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onDisconnect}>
                <WifiOff className="h-4 w-4" /> Putuskan
              </Button>
            ) : null}
            {form.waDriver !== 'mock' ? (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onLogout}>
                <LogOut className="h-4 w-4" /> Logout sesi
              </Button>
            ) : null}
          </div>

          {form.waDriver !== 'mock' ? (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                Login tanpa QR — via nomor HP
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={pairPhone}
                  onChange={(event) => setPairPhone(event.target.value)}
                  placeholder="08563639888"
                  className="h-8 flex-1 text-xs"
                />
                <Button size="sm" variant="outline" onClick={() => void requestPairing()} disabled={pairPending}>
                  {pairPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />}
                  Minta kode
                </Button>
              </div>
              {pairCode ?? status?.pairingCode ? (
                <div className="mt-2 flex items-center gap-3">
                  <p className="font-mono text-xl font-bold tracking-[0.2em] text-primary">
                    {pairCode ?? status?.pairingCode}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void copyText(pairCode ?? status?.pairingCode ?? '')}
                  >
                    Salin
                  </Button>
                </div>
              ) : null}
              <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground">
                WhatsApp di HP bot → <span className="font-semibold text-foreground">Perangkat tertaut</span> →{' '}
                <span className="font-semibold text-foreground">Tautkan dengan nomor telepon</span>, lalu masukkan
                kode di atas. Kode berlaku ±1 menit.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" /> Scan QR WhatsApp
          </CardTitle>
          <CardDescription>QR hanya ditampilkan di dashboard dan berlaku sementara.</CardDescription>
        </CardHeader>
        <CardContent>
          {qr ? (
            <div className="space-y-4">
              <div className="mx-auto w-fit rounded-2xl bg-white p-3 shadow-lg">
                <img src={qr} alt="QR WhatsApp" className="h-[260px] w-[260px]" />
              </div>
              <div className="text-center">
                <Badge variant="warning" className="mb-2">Menunggu scan</Badge>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Buka WhatsApp → Perangkat tertaut → Tautkan perangkat, lalu pindai QR ini.
                </p>
              </div>
            </div>
          ) : currentStatus === 'connected' ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-success/25 bg-success/10 text-success">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <p className="mt-4 text-sm font-semibold">WhatsApp terhubung</p>
              <p className="mt-1 max-w-[240px] text-[10px] leading-relaxed text-muted-foreground">
                Listener aktif. Pesan gambar, dokumen, dan tautan dari grup yang dipantau diproses otomatis.
              </p>
              <Badge variant="success" className="mt-3">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-current" /> Online
              </Badge>
            </div>
          ) : (
            <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted/30 text-muted-foreground">
                <QrCode className="h-8 w-8" />
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-card bg-muted-foreground/50" />
              </div>
              <p className="mt-4 text-sm font-semibold">Belum ada QR aktif</p>
              <p className="mt-1 max-w-[250px] text-[10px] leading-relaxed text-muted-foreground">
                Pilih WhatsApp Web, simpan pengaturan, lalu klik “Hubungkan & tampilkan QR”.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          {[
            ['01', 'Pilih driver', 'Simulator untuk demo cepat, WhatsApp Web untuk produksi.'],
            ['02', 'Pindai QR', 'Gunakan nomor bot khusus. Sesi disimpan di volume Docker.'],
            ['03', 'Pantau otomatis', 'Whitelist grup, auto-reply, dan OCR berjalan non-blocking.']
          ].map(([number, title, text]) => (
            <div key={number} className="flex gap-3 rounded-lg border border-border/60 bg-muted/15 p-3">
              <span className="font-mono text-[10px] font-bold text-primary">{number}</span>
              <div>
                <p className="text-[11px] font-semibold">{title}</p>
                <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">{text}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function GroupsPanel({
  groups,
  onChanged
}: {
  groups: MonitoredGroupDTO[];
  onChanged: () => Promise<void>;
}) {  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [available, setAvailable] = React.useState<AvailableGroup[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [manualJid, setManualJid] = React.useState('');
  const [manualName, setManualName] = React.useState('');
  const [busyJid, setBusyJid] = React.useState<string | null>(null);

  const loadAvailable = async () => {
    setLoading(true);
    try {
      setAvailable(await api.get<AvailableGroup[]>('/wa/groups'));
    } catch (error) {
      toast.error('Gagal memuat grup', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (dialogOpen) void loadAvailable();
  }, [dialogOpen]);

  const addGroup = async (jid: string, name: string) => {
    setBusyJid(jid);
    try {
      await api.post('/settings/groups', { jid, name });
      toast.success('Grup ditambahkan ke whitelist');
      await onChanged();
      await loadAvailable();
    } catch (error) {
      toast.error('Gagal menambahkan grup', { description: errorMessage(error) });
    } finally {
      setBusyJid(null);
    }
  };

  const toggleGroup = async (group: MonitoredGroupDTO, active: boolean) => {
    try {
      await api.patch(`/settings/groups/${group.id}`, { active });
      await onChanged();
      toast.success(active ? 'Grup dipantau kembali' : 'Grup dijeda');
    } catch (error) {
      toast.error('Gagal memperbarui grup', { description: errorMessage(error) });
    }
  };

  const removeGroup = async (group: MonitoredGroupDTO) => {
    try {
      await api.delete(`/settings/groups/${group.id}`);
      toast.success('Grup dihapus dari whitelist');
      await onChanged();
    } catch (error) {
      toast.error('Gagal menghapus grup', { description: errorMessage(error) });
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-primary" /> Grup WhatsApp Dipantau
            </CardTitle>
            <CardDescription className="mt-1">
              Hanya pesan dari grup aktif yang diproses. Kosongkan untuk memantau semua grup.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Tambah
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {groups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <UsersRound className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-xs font-semibold">Belum ada whitelist</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Saat ini semua grup yang masuk akan diproses. Tambahkan grup untuk membatasi.
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div
                key={group.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/15 p-3"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                  <MessageSquareText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold">{group.name}</p>
                  <p className="truncate font-mono text-[9px] text-muted-foreground">{group.jid}</p>
                </div>
                <Badge variant={group.active ? 'success' : 'muted'} className="hidden sm:inline-flex">
                  {group.active ? 'Dipantau' : 'Dijeda'}
                </Badge>
                <Switch checked={group.active} onCheckedChange={(checked) => void toggleGroup(group, checked)} />
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => void removeGroup(group)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambah Grup Dipantau</DialogTitle>
            <DialogDescription>
              Muat grup dari sesi WhatsApp aktif, atau masukkan JID grup secara manual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Grup tersedia</p>
              <Button variant="ghost" size="sm" onClick={() => void loadAvailable()} disabled={loading}>
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Muat
              </Button>
            </div>
            <div className="max-h-56 space-y-2 overflow-auto">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((key) => <Skeleton key={key} className="h-12 w-full" />)}
                </div>
              ) : available.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-[10px] text-muted-foreground">
                  Belum ada grup tersedia. Hubungkan WhatsApp terlebih dahulu.
                </p>
              ) : (
                available.map((group) => {
                  const added = groups.some((row) => row.jid === group.jid);
                  return (
                    <div key={group.jid} className="flex items-center gap-2 rounded-lg border border-border/60 p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium">{group.name}</p>
                        <p className="truncate font-mono text-[8px] text-muted-foreground">{group.jid}</p>
                      </div>
                      <Button
                        size="sm"
                        variant={added ? 'ghost' : 'outline'}
                        disabled={added || busyJid === group.jid}
                        onClick={() => void addGroup(group.jid, group.name)}
                      >
                        {added ? 'Ditambahkan' : busyJid === group.jid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Tambah'}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
            <Separator />
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="jid">JID grup</Label>
                <Input id="jid" value={manualJid} onChange={(event) => setManualJid(event.target.value)} placeholder="1203...@g.us" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="group-name">Nama grup</Label>
                <Input id="group-name" value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Grup Laporan" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Tutup</Button>
            <Button
              disabled={!manualJid || !manualName || busyJid === manualJid}
              onClick={() => void addGroup(manualJid, manualName)}
            >
              <Plus className="h-4 w-4" /> Tambah manual
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AutoReplyPanel({
  form,
  setForm
}: {
  form: SettingsDTO;
  setForm: React.Dispatch<React.SetStateAction<SettingsDTO | null>>;
}) {
  const preview = form.autoReplyTemplate
    .replaceAll('{name}', 'Bripka Marthen')
    .replaceAll('{summary}', 'Foto Timemark 08:43 · Satlantas Polres Sikka')
    .trim();
  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" /> Auto-reply Laporan
            </CardTitle>
            <CardDescription className="mt-1">
              Balas otomatis setelah foto, dokumen, atau link berhasil diproses.
            </CardDescription>
          </div>
          <Switch
            checked={form.autoReplyEnabled}
            onCheckedChange={(checked) => setForm((current) => (current ? { ...current, autoReplyEnabled: checked } : current))}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="auto-reply">Template pesan</Label>
            <Textarea
              id="auto-reply"
              value={form.autoReplyTemplate}
              onChange={(event) => setForm((current) => (current ? { ...current, autoReplyTemplate: event.target.value } : current))}
              className="min-h-[180px] font-mono text-[11px] leading-relaxed"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {['{name}', '{summary}'].map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() =>
                    setForm((current) =>
                      current ? { ...current, autoReplyTemplate: `${current.autoReplyTemplate}${token}` } : current
                    )
                  }
                  className="rounded-md border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground hover:text-foreground"
                >
                  {token}
                </button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 text-[10px]"
                onClick={() => setForm((current) => (current ? { ...current, autoReplyTemplate: DEFAULT_AUTO_REPLY } : current))}
              >
                Reset default
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xs">Pratinjau balasan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl bg-[#0b141a] p-3">
            <div className="ml-auto max-w-[92%] rounded-lg rounded-tr-none bg-[#005c4b] p-3 shadow">
              <p className="whitespace-pre-wrap text-[10px] leading-relaxed text-[#e9edef]">
                {preview || 'Template kosong.'}
              </p>
              <p className="mt-1.5 text-right text-[8px] text-[#9fb3ad]">21:48 ✓✓</p>
            </div>
          </div>
          <p className="mt-3 text-[9px] leading-relaxed text-muted-foreground">
            Balasan hanya dikirim di mode WhatsApp Web yang terhubung. Di mode simulasi, pesan dicatat sebagai aktivitas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AiPanel({
  form,
  setForm
}: {
  form: SettingsDTO;
  setForm: React.Dispatch<React.SetStateAction<SettingsDTO | null>>;
}) {
  const [promptTab, setPromptTab] = React.useState('timemark');
  const set = <K extends keyof SettingsDTO>(key: K, value: SettingsDTO[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" /> Vision & AI Parser
            </CardTitle>
            <CardDescription className="mt-1">
              Opsional. AI dipakai sebagai fallback saat OCR/keyakinan rendah, melalui endpoint OpenAI-compatible.
            </CardDescription>
          </div>
          <Switch checked={form.aiEnabled} onCheckedChange={(checked) => set('aiEnabled', checked)} />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="ai-base">Base URL</Label>
            <Input id="ai-base" value={form.aiBaseUrl} onChange={(event) => set('aiBaseUrl', event.target.value)} placeholder="https://api.openai.com/v1" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-model">Model</Label>
            <Input id="ai-model" value={form.aiModel} onChange={(event) => set('aiModel', event.target.value)} placeholder="gpt-4o-mini" />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label htmlFor="ai-key">API key</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="ai-key"
                type="password"
                value={form.aiApiKey}
                onChange={(event) => set('aiApiKey', event.target.value)}
                placeholder={form.aiApiKeySet ? 'Kunci tersimpan — isi untuk mengganti' : 'sk-...'}
                className="pl-9"
              />
            </div>
            <p className="text-[9px] text-muted-foreground">
              Kunci tidak pernah dikirim balik ke browser. Biarkan kosong untuk mempertahankan kunci yang ada.
            </p>
          </div>
          <div className="space-y-2 md:col-span-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="min-confidence">Ambang keyakinan OCR</Label>
              <span className="font-mono text-[10px] font-semibold text-primary">{form.minOcrConfidence}%</span>
            </div>
            <input
              id="min-confidence"
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.minOcrConfidence}
              onChange={(event) => set('minOcrConfidence', Number(event.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
            <p className="text-[9px] text-muted-foreground">
              Foto di bawah ambang ini ditandai “Perlu review” dan tidak otomatis dianggap terverifikasi.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" /> Prompt Ekstraksi
              </CardTitle>
              <CardDescription className="mt-1">Instruksi ini dikirim ke AI saat fallback diaktifkan.</CardDescription>
            </div>
            <Tabs value={promptTab} onValueChange={setPromptTab}>
              <TabsList className="h-9">
                <TabsTrigger value="timemark" className="text-[10px]">
                  <ImageIcon className="h-3.5 w-3.5" /> Foto
                </TabsTrigger>
                <TabsTrigger value="document" className="text-[10px]">
                  <FileText className="h-3.5 w-3.5" /> Dokumen
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {promptTab === 'timemark' ? (
            <div className="space-y-2">
              <Textarea
                value={form.timemarkPrompt}
                onChange={(event) => set('timemarkPrompt', event.target.value)}
                className="min-h-[260px] font-mono text-[10px] leading-relaxed"
              />
              <Button variant="ghost" size="sm" className="text-[10px]" onClick={() => set('timemarkPrompt', DEFAULT_TIMEMARK_PROMPT)}>
                Reset prompt foto
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                value={form.documentPrompt}
                onChange={(event) => set('documentPrompt', event.target.value)}
                className="min-h-[260px] font-mono text-[10px] leading-relaxed"
              />
              <Button variant="ghost" size="sm" className="text-[10px]" onClick={() => set('documentPrompt', DEFAULT_DOCUMENT_PROMPT)}>
                Reset prompt dokumen
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3 text-[10px] leading-relaxed text-warning">
        <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          OCR Tesseract berjalan lokal. AI hanya dipanggil jika diaktifkan dan hasil OCR perlu penguatan. Pastikan
          endpoint mendukung format OpenAI chat completions dan menerima gambar base64 untuk mode vision.
        </span>
      </div>
    </div>
  );
}

function TurjawaliSettingsPanel({
  form,
  setForm
}: {
  form: SettingsDTO;
  setForm: React.Dispatch<React.SetStateAction<SettingsDTO | null>>;
}) {
  const [keywordType, setKeywordType] = React.useState<TurjawaliActivityType>('PENGATURAN');
  const [keywordDraft, setKeywordDraft] = React.useState(
    form.turjawaliKeywords.PENGATURAN.join(', ')
  );
  const [rematching, setRematching] = React.useState(false);

  const set = <K extends keyof SettingsDTO>(key: K, value: SettingsDTO[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const applyKeywords = () => {
    const keywords = keywordDraft
      .split(/[,\n]/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    setForm((current) =>
      current
        ? {
            ...current,
            turjawaliKeywords: {
              ...current.turjawaliKeywords,
              [keywordType]: [...new Set(keywords)]
            }
          }
        : current
    );
    toast.success(`Kata kunci ${TURJAWALI_LABELS[keywordType]} diperbarui`);
  };

  const resetAll = () => {
    setForm((current) =>
      current
        ? {
            ...current,
            turjawaliKeywords: {
              PENGATURAN: [...DEFAULT_TURJAWALI_KEYWORDS.PENGATURAN],
              PENJAGAAN: [...DEFAULT_TURJAWALI_KEYWORDS.PENJAGAAN],
              PENGAWALAN: [...DEFAULT_TURJAWALI_KEYWORDS.PENGAWALAN],
              PATROLI: [...DEFAULT_TURJAWALI_KEYWORDS.PATROLI],
              PENEGAKKAN: [...DEFAULT_TURJAWALI_KEYWORDS.PENEGAKKAN]
            },
            gaturMorningStart: DEFAULT_TURJAWALI_RULES.gaturMorningStart,
            gaturMorningEnd: DEFAULT_TURJAWALI_RULES.gaturMorningEnd,
            gaturEveningStart: DEFAULT_TURJAWALI_RULES.gaturEveningStart,
            gaturEveningEnd: DEFAULT_TURJAWALI_RULES.gaturEveningEnd,
            patrolNightStart: DEFAULT_TURJAWALI_RULES.patrolNightStart,
            patrolNightEnd: DEFAULT_TURJAWALI_RULES.patrolNightEnd,
            matchTimeToleranceMinutes: DEFAULT_TURJAWALI_RULES.matchTimeToleranceMinutes,
            matchLocationRadiusMeters: DEFAULT_TURJAWALI_RULES.matchLocationRadiusMeters
          }
        : current
    );
    setKeywordDraft(DEFAULT_TURJAWALI_KEYWORDS[keywordType].join(', '));
    toast.success('Aturan Turjawali dikembalikan ke default');
  };

  const rematch = async () => {
    setRematching(true);
    try {
      const result = await api.post<{
        processed: number;
        matched: number;
        partial: number;
        unmatched: number;
        failed: number;
      }>('/timemark/rematch', { scope: 'both' });
      toast.success('Pencocokan ulang selesai', {
        description: `${result.processed} diproses · ${result.matched} matched · ${result.partial} partial · ${result.unmatched} unmatched${result.failed ? ` · ${result.failed} gagal` : ''}`
      });
    } catch (error) {
      toast.error('Gagal menjalankan pencocokan ulang', { description: errorMessage(error) });
    } finally {
      setRematching(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Route className="h-4 w-4 text-primary" /> Smart Matching Turjawali
              </CardTitle>
              <CardDescription className="mt-1">
                Klasifikasi 4 giat Polantas dan cocokkan foto ke Sprin, waktu, lokasi, serta personel.
              </CardDescription>
            </div>
            <Switch
              checked={form.turjawaliMatchingEnabled}
              onCheckedChange={(checked) => set('turjawaliMatchingEnabled', checked)}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="time-tolerance">Toleransi waktu (menit)</Label>
                <Input
                  id="time-tolerance"
                  type="number"
                  min={0}
                  max={720}
                  value={form.matchTimeToleranceMinutes}
                  onChange={(event) => set('matchTimeToleranceMinutes', Number(event.target.value))}
                />
                <p className="text-[9px] text-muted-foreground">
                  Selisih jam foto vs jam Sprin yang masih dianggap cocok.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="location-radius">Toleransi lokasi (meter)</Label>
                <Input
                  id="location-radius"
                  type="number"
                  min={25}
                  max={50000}
                  step={25}
                  value={form.matchLocationRadiusMeters}
                  onChange={(event) => set('matchLocationRadiusMeters', Number(event.target.value))}
                />
                <p className="text-[9px] text-muted-foreground">
                  Dipakai saat Sprin memiliki titik koordinat GPS.
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Ambang status
                </p>
                <div className="flex gap-1.5">
                  <Badge variant="success">Matched ≥ 75</Badge>
                  <Badge variant="warning">Partial ≥ 45</Badge>
                  <Badge variant="muted">Unmatched</Badge>
                </div>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                Skor menggabungkan tanggal (30), jam (22), lokasi (25), kategori Sprin (18), dan
                personel pengirim (18). Kategori yang berbeda dari Sprin dibatasi menjadi Partial.
              </p>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info/5 p-3 text-[10px] leading-relaxed text-info">
              <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Engine membaca caption WA, teks OCR/alamat, unit, dan nama pengirim. Jika AI aktif
                dan klasifikasi awal lemah, AI fallback dipanggil otomatis.
              </span>
            </div>
            <div className="flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[9px] leading-relaxed text-muted-foreground">
                Setelah mengubah aturan, cocokkan ulang foto berstatus unmatched/partial. Override
                manual yang sudah matched tidak diubah.
              </p>
              <Button variant="outline" size="sm" onClick={() => void rematch()} disabled={rematching}>
                {rematching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Cocokkan ulang
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Rentang Jam Krusial
            </CardTitle>
            <CardDescription>
              Jam Gatur dan Patroli Malam membantu klasifikasi saat caption tidak lengkap.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              ['Gatur Pagi', 'gaturMorningStart', 'gaturMorningEnd'],
              ['Gatur Sore', 'gaturEveningStart', 'gaturEveningEnd'],
              ['Patroli Malam', 'patrolNightStart', 'patrolNightEnd']
            ].map(([label, startKey, endKey]) => (
              <div key={label} className="space-y-1.5">
                <Label>{label}</Label>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <Input
                    type="time"
                    value={form[startKey as keyof SettingsDTO] as string}
                    onChange={(event) =>
                      set(
                        startKey as
                          | 'gaturMorningStart'
                          | 'gaturMorningEnd'
                          | 'gaturEveningStart'
                          | 'gaturEveningEnd'
                          | 'patrolNightStart'
                          | 'patrolNightEnd',
                        event.target.value
                      )
                    }
                  />
                  <span className="text-[10px] text-muted-foreground">s/d</span>
                  <Input
                    type="time"
                    value={form[endKey as keyof SettingsDTO] as string}
                    onChange={(event) =>
                      set(
                        endKey as
                          | 'gaturMorningStart'
                          | 'gaturMorningEnd'
                          | 'gaturEveningStart'
                          | 'gaturEveningEnd'
                          | 'patrolNightStart'
                          | 'patrolNightEnd',
                        event.target.value
                      )
                    }
                  />
                </div>
              </div>
            ))}
            <p className="text-[9px] leading-relaxed text-muted-foreground">
              Rentang Patroli Malam mendukung lintas tengah malam (mis. 21:00–04:00).
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Kata Kunci Kustom per Giat
            </CardTitle>
            <CardDescription className="mt-1">
              Pisahkan dengan koma atau baris baru. Kata kunci caption memiliki bobot tertinggi.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={resetAll}>
            Reset default
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs
            value={keywordType}
            onValueChange={(value) => {
              const type = value as TurjawaliActivityType;
              setKeywordType(type);
              setKeywordDraft(form.turjawaliKeywords[type].join(', '));
            }}
          >
            <TabsList className="h-9 w-full justify-start overflow-x-auto">
              {(['PENGATURAN', 'PENJAGAAN', 'PENGAWALAN', 'PATROLI'] as TurjawaliActivityType[]).map(
                (type) => (
                  <TabsTrigger key={type} value={type} className="text-[10px]">
                    {TURJAWALI_LABELS[type]}
                    <Badge variant="outline" className="ml-1 h-4 px-1 text-[8px]">
                      {form.turjawaliKeywords[type].length}
                    </Badge>
                  </TabsTrigger>
                )
              )}
            </TabsList>
          </Tabs>
          <Textarea
            value={keywordDraft}
            onChange={(event) => {
              const draft = event.target.value;
              setKeywordDraft(draft);
              const keywords = draft
                .split(/[,\n]/)
                .map((value) => value.trim().toLowerCase())
                .filter(Boolean);
              setForm((current) =>
                current
                  ? {
                      ...current,
                      turjawaliKeywords: {
                        ...current.turjawaliKeywords,
                        [keywordType]: [...new Set(keywords)]
                      }
                    }
                  : current
              );
            }}
            className="min-h-[140px] font-mono text-[10px] leading-relaxed"
            placeholder="gatur, pengaturan, simpang, rawan pagi, ..."
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={applyKeywords}>
              <Check className="h-4 w-4" /> Terapkan kata kunci
            </Button>
            <span className="text-[9px] text-muted-foreground">
              {form.turjawaliKeywords[keywordType].length} kata kunci aktif
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {form.turjawaliKeywords[keywordType].slice(0, 18).map((keyword) => (
              <Badge key={keyword} variant="outline" className="text-[8px]">
                {keyword}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SchedulePanel({
  form,
  setForm,
  onPreview,
  onSendNow,
  sending
}: {
  form: SettingsDTO;
  setForm: React.Dispatch<React.SetStateAction<SettingsDTO | null>>;
  onPreview: () => void;
  onSendNow: () => void;
  sending: boolean;
}) {
  const set = <K extends keyof SettingsDTO>(key: K, value: SettingsDTO[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));
  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" /> Rekap Harian Otomatis
            </CardTitle>
            <CardDescription className="mt-1">
              Bot mengirim ringkasan harian ke grup tujuan pada jam yang dipilih.
            </CardDescription>
          </div>
          <Switch checked={form.scheduleEnabled} onCheckedChange={(checked) => set('scheduleEnabled', checked)} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-time">Jam kirim</Label>
              <Input
                id="schedule-time"
                type="time"
                value={form.scheduleTime}
                onChange={(event) => set('scheduleTime', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Zona waktu</Label>
              <Select value={form.scheduleTimezone} onValueChange={(value) => set('scheduleTimezone', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((timezone) => (
                    <SelectItem key={timezone.value} value={timezone.value}>
                      {timezone.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Grup tujuan</Label>
            <Select
              value={form.scheduleGroupJid || 'none'}
              onValueChange={(value) => {
                const group = form.groups.find((row) => row.jid === value);
                setForm((current) =>
                  current
                    ? {
                        ...current,
                        scheduleGroupJid: value === 'none' ? '' : value,
                        scheduleGroupName: group?.name ?? ''
                      }
                    : current
                );
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih grup" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Belum dipilih</SelectItem>
                {form.groups.map((group) => (
                  <SelectItem key={group.jid} value={group.jid}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[9px] text-muted-foreground">
              Pastikan grup tujuan ada di whitelist dan bot sudah menjadi anggota.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
            <Button variant="outline" size="sm" onClick={onPreview}>
              <Eye className="h-4 w-4" /> Pratinjau teks
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadFile(exportUrl('daily.txt'))}>
              <Download className="h-4 w-4" /> Unduh .txt
            </Button>
            <Button size="sm" onClick={onSendNow} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Kirim sekarang
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-border/60 bg-muted/20 px-5 py-3">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> Isi rekap
          </p>
        </div>
        <CardContent className="space-y-3 pt-4 text-[10px] leading-relaxed text-muted-foreground">
          <div className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            Statistik foto Timemark, link, Sprin, dan personel.
          </div>
          <div className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            Detail jam, satuan, alamat, dan koordinat foto.
          </div>
          <div className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            Daftar link per platform beserta pengirim.
          </div>
          <div className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            Ringkasan Sprin aktif dan personel yang terlibat.
          </div>
          <div className="mt-4 rounded-lg border border-border/60 bg-background/60 p-3">
            <p className="font-semibold text-foreground">
              {form.scheduleEnabled ? `Setiap hari ${form.scheduleTime}` : 'Jadwal nonaktif'}
            </p>
            <p className="mt-1">
              {form.scheduleGroupName || form.scheduleGroupJid || 'Belum ada grup tujuan'} · {form.scheduleTimezone}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SimulatorPanel({
  logs,
  busy,
  onSimulate
}: {
  logs: SimulatorLog[];
  busy: SimulateKind | null;
  onSimulate: (kind: SimulateKind) => void;
}) {
  const cards: Array<{
    kind: SimulateKind;
    title: string;
    description: string;
    icon: React.ElementType;
    accent: string;
    cta: string;
  }> = [
    {
      kind: 'image',
      title: 'Foto Timemark',
      description: 'OCR gambar, ekstraksi waktu/alamat/koordinat, lalu verifikasi otomatis.',
      icon: ImageIcon,
      accent: 'text-primary bg-primary/10 border-primary/20',
      cta: 'Simulasikan foto'
    },
    {
      kind: 'document',
      title: 'Dokumen Sprin',
      description: 'Parser PDF/DOCX, metadata surat, dan tabel personel lintas halaman.',
      icon: FileText,
      accent: 'text-info bg-info/10 border-info/20',
      cta: 'Simulasikan dokumen'
    },
    {
      kind: 'links',
      title: 'Link Anggota',
      description: 'Deteksi URL, klasifikasi platform, validasi HTTP, dan kaitkan Sprin.',
      icon: Link2,
      accent: 'text-success bg-success/10 border-success/20',
      cta: 'Simulasikan link'
    }
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.kind} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col p-4">
                  <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg border', card.accent)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="mt-3 text-xs font-semibold">{card.title}</p>
                  <p className="mt-1 flex-1 text-[9px] leading-relaxed text-muted-foreground">{card.description}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-4 w-full text-[10px]"
                    onClick={() => onSimulate(card.kind)}
                    disabled={Boolean(busy)}
                  >
                    {busy === card.kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {busy === card.kind ? 'Memproses…' : card.cta}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info/5 p-3 text-[10px] leading-relaxed text-info">
          <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Simulator menjalankan pipeline backend yang sama dengan pesan WhatsApp. OCR dan parsing berjalan di queue
          terpisah, sehingga API tetap responsif.
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-xs">Riwayat simulasi</CardTitle>
          <CardDescription>Hasil terakhir diproses oleh pipeline.</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
              <Sparkles className="h-7 w-7 text-muted-foreground/50" />
              <p className="mt-3 text-[11px] font-medium">Belum ada simulasi</p>
              <p className="mt-1 max-w-[200px] text-[9px] text-muted-foreground">
                Pilih salah satu kartu untuk menguji listener tanpa WhatsApp.
              </p>
            </div>
          ) : (
            <div className="max-h-[360px] space-y-2 overflow-auto">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border border-border/60 bg-muted/15 p-2.5">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[8px] uppercase">{log.kind}</Badge>
                    <span className="text-[8px] text-muted-foreground">{log.at}</span>
                  </div>
                  <p className="mt-1.5 text-[10px] font-semibold">{log.title}</p>
                  <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">{log.message}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function SettingsPage() {
  const settingsApi = useApi<SettingsDTO>('/settings');
  const { waStatus, refreshWhatsApp } = useRealtime();
  const [form, setForm] = React.useState<SettingsDTO | null>(null);
  const [tab, setTab] = React.useState('koneksi');
  const [saving, setSaving] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<DailyReport | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [logs, setLogs] = React.useState<SimulatorLog[]>([]);
  const [busy, setBusy] = React.useState<SimulateKind | null>(null);

  React.useEffect(() => {
    if (settingsApi.data) setForm(settingsApi.data);
  }, [settingsApi.data]);

  const reload = React.useCallback(async () => {
    try {
      const latest = await api.get<SettingsDTO>('/settings');
      setForm((current) =>
        current ? { ...current, groups: latest.groups } : { ...latest, aiApiKey: '' }
      );
    } catch {
      await settingsApi.refresh();
    }
    await refreshWhatsApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshWhatsApp]);

  const save = async (notify = true): Promise<boolean> => {
    if (!form) return false;
    setSaving(true);
    try {
      const payload = {
        botName: form.botName,
        waDriver: form.waDriver,
        autoReplyEnabled: form.autoReplyEnabled,
        autoReplyTemplate: form.autoReplyTemplate,
        timemarkPrompt: form.timemarkPrompt,
        documentPrompt: form.documentPrompt,
        aiEnabled: form.aiEnabled,
        aiBaseUrl: form.aiBaseUrl,
        aiApiKey: form.aiApiKey,
        aiModel: form.aiModel,
        scheduleEnabled: form.scheduleEnabled,
        scheduleTime: form.scheduleTime,
        scheduleTimezone: form.scheduleTimezone,
        scheduleGroupJid: form.scheduleGroupJid,
        scheduleGroupName: form.scheduleGroupName,
        minOcrConfidence: form.minOcrConfidence,
        turjawaliMatchingEnabled: form.turjawaliMatchingEnabled,
        turjawaliKeywords: form.turjawaliKeywords,
        gaturMorningStart: form.gaturMorningStart,
        gaturMorningEnd: form.gaturMorningEnd,
        gaturEveningStart: form.gaturEveningStart,
        gaturEveningEnd: form.gaturEveningEnd,
        patrolNightStart: form.patrolNightStart,
        patrolNightEnd: form.patrolNightEnd,
        matchTimeToleranceMinutes: form.matchTimeToleranceMinutes,
        matchLocationRadiusMeters: form.matchLocationRadiusMeters
      };
      const updated = await api.put<SettingsDTO>('/settings', payload);
      setForm({ ...updated, aiApiKey: '' });
      await refreshWhatsApp();
      if (notify) toast.success('Pengaturan bot disimpan');
      return true;
    } catch (error) {
      toast.error('Gagal menyimpan pengaturan', { description: errorMessage(error) });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAndConnect = async () => {
    setPending(true);
    try {
      const saved = await save(false);
      if (!saved) return;
      await api.post('/wa/connect');
      await refreshWhatsApp();
      toast.success(form?.waDriver === 'mock' ? 'Mode simulator aktif' : 'Koneksi WhatsApp dimulai', {
        description: form?.waDriver === 'mock' ? 'Pipeline siap diuji.' : 'QR akan muncul jika diperlukan.'
      });
    } catch (error) {
      toast.error('Gagal menghubungkan WhatsApp', { description: errorMessage(error) });
    } finally {
      setPending(false);
    }
  };

  const disconnect = async () => {
    setPending(true);
    try {
      await api.post('/wa/disconnect');
      await refreshWhatsApp();
      toast.success('Koneksi diputuskan');
    } catch (error) {
      toast.error('Gagal memutuskan koneksi', { description: errorMessage(error) });
    } finally {
      setPending(false);
    }
  };

  const logout = async () => {
    setPending(true);
    try {
      await api.post('/wa/logout');
      await refreshWhatsApp();
      toast.success('Sesi WhatsApp di-logout');
    } catch (error) {
      toast.error('Gagal logout', { description: errorMessage(error) });
    } finally {
      setPending(false);
    }
  };

  const restart = async () => {
    setPending(true);
    try {
      await api.post('/wa/restart');
      await refreshWhatsApp();
      toast.success('Koneksi di-restart');
    } catch (error) {
      toast.error('Gagal restart', { description: errorMessage(error) });
    } finally {
      setPending(false);
    }
  };

  const openPreview = async () => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      setPreview(await api.get<DailyReport>('/reports/preview'));
    } catch (error) {
      toast.error('Gagal memuat pratinjau', { description: errorMessage(error) });
    } finally {
      setPreviewLoading(false);
    }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const saved = await save(false);
      if (!saved) return;
      const result = await api.post<{ sent: boolean; target: string | null; counts: Record<string, number> }>('/reports/send');
      if (result.sent) {
        toast.success('Rekap harian dikirim', { description: `Tujuan: ${result.target}` });
      } else {
        toast.warning('Rekap tidak terkirim', { description: 'Belum ada grup tujuan atau bot belum terhubung.' });
      }
      await refreshWhatsApp();
    } catch (error) {
      toast.error('Gagal mengirim rekap', { description: errorMessage(error) });
    } finally {
      setSending(false);
    }
  };

  const simulate = async (kind: SimulateKind) => {
    setBusy(kind);
    try {
      const result = await api.post<{ kind: SimulateKind; message: string; data: unknown }>('/wa/simulate', {
        kind
      });
      const title = kind === 'image' ? 'Foto Timemark diproses' : kind === 'document' ? 'Dokumen Sprin diproses' : 'Link anggota diproses';
      setLogs((current) => [
        {
          id: `${Date.now()}`,
          kind,
          title,
          message: result.message,
          at: new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date())
        },
        ...current
      ]);
      toast.success(title, { description: result.message });
      await reload();
    } catch (error) {
      toast.error('Simulasi gagal', { description: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  if (!form && settingsApi.loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-[520px]" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[430px]" />
          <Skeleton className="h-[430px]" />
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
        <p className="mt-2 text-sm font-semibold">Gagal memuat pengaturan</p>
        <p className="mt-1 text-xs text-muted-foreground">{settingsApi.error ?? 'Coba muat ulang halaman.'}</p>
        <Button className="mt-4" size="sm" onClick={() => void settingsApi.refresh(true)}>
          <RefreshCw className="h-4 w-4" /> Muat ulang
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-slide-up space-y-6">
      <PageHeader
        eyebrow="Bot Customization"
        title="Settings / Kustomisasi Bot"
        description="Atur koneksi WhatsApp, grup yang dipantau, balasan otomatis, prompt AI, dan jadwal rekap."
        actions={
          <Button onClick={() => void save()} disabled={saving || !form}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan perubahan
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-10 w-max min-w-full justify-start gap-1 bg-muted/50 p-1 sm:min-w-0">
            <TabsTrigger value="koneksi" className="text-[11px]"><Smartphone className="h-3.5 w-3.5" /> Koneksi</TabsTrigger>
            <TabsTrigger value="grup" className="text-[11px]"><UsersRound className="h-3.5 w-3.5" /> Grup & Auto-reply</TabsTrigger>
            <TabsTrigger value="ai" className="text-[11px]"><Cpu className="h-3.5 w-3.5" /> AI & Prompt</TabsTrigger>
            <TabsTrigger value="turjawali" className="text-[11px]"><Route className="h-3.5 w-3.5" /> Turjawali</TabsTrigger>
            <TabsTrigger value="personel" className="text-[11px]"><UsersRound className="h-3.5 w-3.5" /> Personel</TabsTrigger>
            <TabsTrigger value="jadwal" className="text-[11px]"><CalendarClock className="h-3.5 w-3.5" /> Jadwal Rekap</TabsTrigger>
            <TabsTrigger value="simulator" className="text-[11px]"><Sparkles className="h-3.5 w-3.5" /> Simulator</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="koneksi" className="mt-5">
          <ConnectionPanel
            form={form}
            setForm={setForm}
            status={waStatus}
            onConnect={() => void saveAndConnect()}
            onDisconnect={() => void disconnect()}
            onLogout={() => void logout()}
            onRestart={() => void restart()}
            pending={pending}
          />
        </TabsContent>

        <TabsContent value="grup" className="mt-5 space-y-4">
          <GroupsPanel groups={form.groups} onChanged={reload} />
          <AutoReplyPanel form={form} setForm={setForm} />
        </TabsContent>

        <TabsContent value="ai" className="mt-5">
          <AiPanel form={form} setForm={setForm} />
        </TabsContent>

        <TabsContent value="turjawali" className="mt-5">
          <TurjawaliSettingsPanel form={form} setForm={setForm} />
        </TabsContent>

        <TabsContent value="personel" className="mt-5">
          <PersonnelPanel />
        </TabsContent>

        <TabsContent value="jadwal" className="mt-5">
          <SchedulePanel
            form={form}
            setForm={setForm}
            onPreview={() => void openPreview()}
            onSendNow={() => void sendNow()}
            sending={sending}
          />
        </TabsContent>

        <TabsContent value="simulator" className="mt-5">
          <SimulatorPanel logs={logs} busy={busy} onSimulate={(kind) => void simulate(kind)} />
        </TabsContent>
      </Tabs>

      <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-border/70 bg-muted/15 p-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <div>
            <p className="text-[11px] font-semibold">Konfigurasi tersimpan di SQLite</p>
            <p className="mt-0.5 text-[9px] text-muted-foreground">
              Perubahan prompt dan jadwal langsung dipakai setelah disimpan. Kunci AI tidak ditampilkan kembali.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Simpan sekarang
        </Button>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pratinjau Rekap Harian</DialogTitle>
            <DialogDescription>Teks ini akan dikirim ke grup tujuan.</DialogDescription>
          </DialogHeader>
          {previewLoading ? (
            <div className="space-y-2"><Skeleton className="h-40 w-full" /></div>
          ) : (
            <pre className="max-h-[55vh] overflow-auto rounded-lg border border-border/60 bg-[#0b141a] p-4 font-mono text-[10px] leading-relaxed text-[#e9edef] whitespace-pre-wrap">
              {preview?.text ?? 'Tidak ada pratinjau.'}
            </pre>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={async () => {
                if (!preview) return;
                await copyText(preview.text);
                toast.success('Teks rekap disalin');
              }}
            >
              <ClipboardCopy className="h-4 w-4" /> Salin
            </Button>
            <Button asChild>
              <a href={exportUrl('daily.txt')} download>
                <Download className="h-4 w-4" /> Unduh .txt
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
