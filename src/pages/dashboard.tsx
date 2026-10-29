import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Bot,
  Camera,
  Car,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Link2,
  MapPin,
  Radio,
  Radar,
  RefreshCw,
  Gavel,
  ScanLine,
  Search,
  Send,
  Shield,
  Sparkles,
  TrafficCone,
  UsersRound,
  Wifi
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { ActivityDTO, DashboardStats, TurjawaliRecap, TurjawaliType } from '@/shared/types';
import { TURJAWALI_LABELS } from '@/shared/types';
import { formatRankName, rankFromRankNrp } from '@/shared/personnel-name';
import { PageHeader } from '@/components/sigap/page-header';
import { StatCard } from '@/components/sigap/stat-card';
import { StatusBadge } from '@/components/sigap/status-badge';
import { PlatformIcon } from '@/components/sigap/platform-badge';
import { EmptyState } from '@/components/sigap/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/src/hooks/use-api';
import { useRealtime, useRealtimeVersion } from '@/src/lib/realtime';
import { api, copyText, downloadFile, exportUrl } from '@/lib/api';
import { toast } from 'sonner';
import {
  formatDate,
  formatDateLong,
  formatNumber,
  formatTime,
  greeting,
  percentChange,
  timeAgo,
  truncate
} from '@/lib/format';
import { cn } from '@/lib/utils';

const PIE_COLORS = ['#facc15', '#38bdf8', '#34d399', '#a78bfa', '#fb7185', '#fb923c', '#22d3ee', '#94a3b8'];

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  timemark: Camera,
  timemark_failed: CircleAlert,
  link: Link2,
  sprin: FileText,
  sprin_updated: FileCheck2,
  sprin_status: CheckCircle2,
  wa_connected: Radio,
  wa_disconnected: Radio,
  report: FileCheck2,
  report_failed: CircleAlert,
  simulation: Sparkles,
  message_failed: CircleAlert
};

function ChartCard({ data }: { data: DashboardStats }) {
  return (
    <Card className="overflow-hidden lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <h3 className="text-sm font-semibold">Tren Aktivitas 7 Hari</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Foto Timemark dan link laporan yang masuk
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-medium text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#facc15]" /> Timemark
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#38bdf8]" /> Link
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.weekly} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="timemarkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#facc15" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#facc15" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="linkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 4" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} dy={8} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={38} />
              <ChartTooltip
                cursor={{ stroke: 'hsl(var(--border))', strokeDasharray: '4 4' }}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '10px',
                  fontSize: '11px',
                  boxShadow: '0 12px 32px rgba(0,0,0,.25)',
                  color: 'hsl(var(--foreground))'
                }}
                labelStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              />
              <Area
                type="monotone"
                dataKey="timemark"
                name="Timemark"
                stroke="#facc15"
                strokeWidth={2.2}
                fill="url(#timemarkFill)"
                dot={{ r: 2.5, fill: '#facc15', strokeWidth: 0 }}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="links"
                name="Link"
                stroke="#38bdf8"
                strokeWidth={2.2}
                fill="url(#linkFill)"
                dot={{ r: 2.5, fill: '#38bdf8', strokeWidth: 0 }}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

const TURJAWALI_META: Record<
  Exclude<TurjawaliType, 'LAINNYA'>,
  { icon: React.ElementType; className: string; bar: string; soft: string }
> = {
  PENGATURAN: {
    icon: TrafficCone,
    className: 'border-primary/25 bg-primary/10 text-primary',
    bar: 'bg-primary',
    soft: 'from-primary/[0.09]'
  },
  PENJAGAAN: {
    icon: Shield,
    className: 'border-info/25 bg-info/10 text-info',
    bar: 'bg-info',
    soft: 'from-info/[0.08]'
  },
  PENGAWALAN: {
    icon: Car,
    className: 'border-violet-500/25 bg-violet-500/10 text-violet-400',
    bar: 'bg-violet-400',
    soft: 'from-violet-500/[0.08]'
  },
  PENEGAKKAN: {
    icon: Gavel,
    className: 'border-warning/25 bg-warning/10 text-warning',
    bar: 'bg-warning',
    soft: 'from-warning/[0.08]'
  },
  PATROLI: {
    icon: Radar,
    className: 'border-success/25 bg-success/10 text-success',
    bar: 'bg-success',
    soft: 'from-success/[0.08]'
  }
};

function PersonnelCoverageDialog({
  open,
  onOpenChange,
  recap
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recap: TurjawaliRecap;
}) {
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'reported' | 'pending'>('all');
  const [copied, setCopied] = React.useState(false);
  const [sendingReminder, setSendingReminder] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setFilter('all');
      setCopied(false);
    }
  }, [open]);

  const details = React.useMemo(() => {
    const needle = query.toLowerCase();
    return recap.personnel.details.filter((person) => {
      const matchesFilter =
        filter === 'all' || (filter === 'reported' ? person.reported : !person.reported);
      const matchesSearch =
        !needle ||
        person.name.toLowerCase().includes(needle) ||
        (person.rankNrp ?? '').toLowerCase().includes(needle) ||
        person.sprinNumber.toLowerCase().includes(needle);
      return matchesFilter && matchesSearch;
    });
  }, [recap.personnel.details, query, filter]);

  const copyPending = async () => {
    const pending = recap.personnel.details.filter((person) => !person.reported);
    const text = [
      `*PERSONEL BELUM MELAPOR*`,
      `Periode: ${recap.label}`,
      `Aktif: ${recap.personnel.active} · Sudah: ${recap.personnel.reported} · Belum: ${recap.personnel.pending}`,
      '',
      ...pending.map(
        (person, index) =>
          `${index + 1}. ${formatRankName(rankFromRankNrp(person.rankNrp), person.name)} — ${person.sprinNumber}`
      ),
      '',
      '_Mohon segera mengirim foto Timemark dan link laporan._'
    ].join('\n');
    await copyText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const sendReminder = async () => {
    setSendingReminder(true);
    try {
      const result = await api.post<{
        sent: boolean;
        target: string | null;
        pendingCount: number;
        reason?: string;
      }>('/reports/personnel-reminder', { period: recap.period });
      if (result.sent) {
        toast.success('Pengingat personel dikirim', {
          description: `${result.pendingCount} personel belum melapor · tujuan ${result.target}`
        });
      } else {
        toast.warning('Pengingat tidak terkirim', {
          description: result.reason ?? 'Tidak ada grup tujuan.'
        });
      }
    } catch (error) {
      toast.error('Gagal mengirim pengingat', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan.'
      });
    } finally {
      setSendingReminder(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Cakupan Laporan Personel
            <Badge variant="outline" className="text-[9px]">{recap.label}</Badge>
          </DialogTitle>
          <DialogDescription>
            {recap.personnel.reported} dari {recap.personnel.active} personel unik sudah mengirim
            laporan · {recap.personnel.pending} belum melapor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama, pangkat/NRP, atau Sprin…"
              className="h-9 pl-9 text-xs"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-muted/20 p-1">
            {[
              ['all', 'Semua', recap.personnel.active],
              ['reported', 'Sudah', recap.personnel.reported],
              ['pending', 'Belum', recap.personnel.pending]
            ].map(([value, label, count]) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => setFilter(value as 'all' | 'reported' | 'pending')}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors',
                  filter === value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label} <span className="font-mono opacity-60">{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[52vh] overflow-auto rounded-lg border border-border/60">
          {details.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Tidak ada personel yang cocok.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {details.map((person) => (
                <div key={person.id} className="flex items-center gap-3 p-3">
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold',
                      person.reported
                        ? 'border-success/25 bg-success/10 text-success'
                        : 'border-border bg-muted/40 text-muted-foreground'
                    )}
                  >
                    {person.name
                      .split(' ')
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[11px] font-semibold">{person.name}</p>
                      <span className="font-mono text-[9px] text-muted-foreground">
                        {person.rankNrp ?? '-'}
                      </span>
                      <Badge variant={person.reported ? 'success' : 'muted'} className="text-[8px]">
                        {person.reported ? 'Sudah melapor' : 'Belum melapor'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[9px] text-muted-foreground">
                      <span>{person.sprinNumber}</span>
                      <span>·</span>
                      <span>{person.penugasan ?? 'Peserta'}</span>
                      {person.turjawaliTypes.length > 0 ? (
                        <>
                          <span>·</span>
                          <span className="text-primary">
                            {person.turjawaliTypes.map((type) => TURJAWALI_LABELS[type]).join(', ')}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[10px]">{person.photoCount} foto</p>
                    <p className="text-[8px] text-muted-foreground">
                      {person.lastReportAt ? timeAgo(person.lastReportAt) : 'belum ada'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
          <Button
            variant="outline"
            onClick={() => void copyPending()}
            disabled={recap.personnel.pending === 0}
          >
            <Copy className="h-4 w-4" /> {copied ? 'Tersalin' : 'Salin daftar'}
          </Button>
          <Button
            onClick={() => void sendReminder()}
            disabled={recap.personnel.pending === 0 || sendingReminder}
          >
            {sendingReminder ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Kirim pengingat ke grup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TurjawaliOverview({ data }: { data: DashboardStats }) {
  const [period, setPeriod] = React.useState<'daily' | 'weekly'>('daily');
  const [weeklyRecap, setWeeklyRecap] = React.useState<TurjawaliRecap | null>(null);
  const [loadingWeekly, setLoadingWeekly] = React.useState(false);
  const [personnelOpen, setPersonnelOpen] = React.useState(false);
  const version = useRealtimeVersion();
  const recap = period === 'weekly' ? weeklyRecap ?? data.turjawali : data.turjawali;
  const total = recap.totalPhotos;

  React.useEffect(() => {
    if (period !== 'weekly') {
      setWeeklyRecap(null);
      return;
    }
    let active = true;
    setLoadingWeekly(true);
    void api
      .get<TurjawaliRecap>('/timemark/turjawali-recap?period=weekly')
      .then((result) => {
        if (active) setWeeklyRecap(result);
      })
      .catch(() => {
        if (active) setWeeklyRecap(data.turjawali);
      })
      .finally(() => {
        if (active) setLoadingWeekly(false);
      });
    return () => {
      active = false;
    };
  }, [period, version, data.turjawali]);

  return (
    <>
      <Card className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_15%_0%,hsl(var(--primary)/0.11),transparent_65%)]" />
      <CardHeader className="relative flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Rekap Giat Turjawali</h3>
            <Badge variant="success" className="gap-1">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-current" /> LIVE
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pengaturan, penjagaan, pengawalan, dan patroli · {recap.label}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-border/70 bg-muted/20 p-0.5">
            {(['daily', 'weekly'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                disabled={loadingWeekly}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition-colors',
                  period === value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {value === 'daily' ? 'Harian' : 'Mingguan'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPersonnelOpen(true)}
            className="group flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-1.5 text-left transition-colors hover:border-primary/30"
          >
            <div>
              <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Personel melapor</p>
              <p className="text-[11px] font-bold">
                {recap.personnel.reported}
                <span className="font-normal text-muted-foreground">/{recap.personnel.active}</span>
              </p>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
          <Button asChild variant="outline" size="sm" className="text-xs">
            <Link to="/timemark">
              Detail <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="relative">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {recap.categories.map((category) => {
            const meta = TURJAWALI_META[category.type];
            const Icon = meta.icon;
            const matchedRate =
              category.photoCount > 0
                ? Math.round((category.matchedCount / category.photoCount) * 100)
                : 0;
            const partialRate =
              category.photoCount > 0
                ? Math.round((category.partialCount / category.photoCount) * 100)
                : 0;
            return (
              <Link
                key={category.type}
                to={`/timemark?type=${category.type}`}
                className={cn(
                  'group relative overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br to-transparent p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md',
                  meta.soft
                )}
              >
                <div className="flex items-start justify-between">
                  <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg border', meta.className)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {category.matchedCount}M · {category.partialCount}P
                  </span>
                </div>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {TURJAWALI_LABELS[category.type]}
                </p>
                <div className="mt-1 flex items-end gap-2">
                  <p className="text-3xl font-bold leading-none">{category.photoCount}</p>
                  <span className="mb-0.5 text-[9px] text-muted-foreground">foto</span>
                </div>
                <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full transition-all', meta.bar)}
                    style={{ width: `${matchedRate}%` }}
                  />
                  <div
                    className="h-full bg-warning/60 transition-all"
                    style={{ width: `${partialRate}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[9px] text-muted-foreground">
                  <span>{category.personnelReported} personel melapor</span>
                  <span>{matchedRate}% matched</span>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full min-w-[720px] text-left text-[9px]">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold uppercase tracking-wider">Kategori</th>
                <th className="px-2 py-2 text-center font-semibold">Foto</th>
                <th className="px-2 py-2 text-center font-semibold">Matched</th>
                <th className="px-2 py-2 text-center font-semibold">Partial</th>
                <th className="px-2 py-2 text-center font-semibold">Unmatched</th>
                <th className="px-2 py-2 text-center font-semibold">Personel</th>
                <th className="px-3 py-2 font-semibold">Lokasi utama</th>
              </tr>
            </thead>
            <tbody>
              {recap.categories.map((category) => (
                <tr key={category.type} className="border-t border-border/40">
                  <td className="px-3 py-2 font-medium">{TURJAWALI_LABELS[category.type]}</td>
                  <td className="px-2 py-2 text-center font-mono">{category.photoCount}</td>
                  <td className="px-2 py-2 text-center font-mono text-success">{category.matchedCount}</td>
                  <td className="px-2 py-2 text-center font-mono text-warning">{category.partialCount}</td>
                  <td className="px-2 py-2 text-center font-mono text-muted-foreground">{category.unmatchedCount}</td>
                  <td className="px-2 py-2 text-center font-mono">
                    <button
                      type="button"
                      onClick={() => setPersonnelOpen(true)}
                      className="rounded px-1 text-primary hover:bg-primary/10"
                      title="Lihat cakupan personel"
                    >
                      {category.personnelReported}
                      {category.personnelAssigned > 0 ? `/${category.personnelAssigned}` : ''}
                    </button>
                  </td>
                  <td className="max-w-[330px] truncate px-3 py-2 text-muted-foreground">
                    {category.locations[0]?.address ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/50 pt-3 text-[9px] text-muted-foreground">
          <span>
            <span className="font-semibold text-success">{recap.matchedPhotos}</span> matched
          </span>
          <span>
            <span className="font-semibold text-warning">{recap.partialPhotos}</span> partial
          </span>
          <span>
            <span className="font-semibold text-muted-foreground">{recap.unmatchedPhotos}</span> unmatched
          </span>
          <span className="ml-auto">
            Total {total} foto Turjawali
            {recap.otherPhotos > 0 ? ` · ${recap.otherPhotos} lainnya` : ''}
          </span>
        </div>
      </CardContent>
      </Card>
      <PersonnelCoverageDialog
        open={personnelOpen}
        onOpenChange={setPersonnelOpen}
        recap={recap}
      />
    </>
  );
}

function SupervisionCard({ data }: { data: DashboardStats }) {
  const supervision = data.turjawali.supervisions;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            Supervisi Perwira
            <Badge variant="violet" className="text-[8px]">12.1 – 12.6 · AGUNG 1 – 16</Badge>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Caption perwira yang melakukan supervisi/pengecekan pada kegiatan hari ini
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-mono text-lg font-semibold leading-none">{supervision.total}</p>
            <p className="text-[9px] text-muted-foreground">laporan supervisi</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-semibold leading-none">{supervision.uniqueOfficers}</p>
            <p className="text-[9px] text-muted-foreground">perwira</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        {supervision.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-4 text-center text-[10px] text-muted-foreground">
            Belum ada supervisi terdeteksi. Bot mengenali sandi (mis. “12.1” / “Agung 6”), pangkat perwira
            (IPDA–AKBP), atau pengirim yang terdaftar sebagai perwira.
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {supervision.items.slice(0, 6).map((item) => (
              <div key={item.photoId} className="flex flex-wrap items-center gap-2 py-2">
                <Badge variant="violet" className="font-mono text-[8px]">
                  {item.sandi ?? 'SANDI -'}
                </Badge>
                <span className="text-[11px] font-semibold">
                  {[item.rank, item.name].filter(Boolean).join(' ') || item.senderName}
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {TURJAWALI_LABELS[item.turjawaliType as TurjawaliType]}
                </span>
                <span className="max-w-[280px] truncate text-[9px] text-muted-foreground">
                  {item.address ?? 'lokasi tidak tercatat'}
                </span>
                <span className="ml-auto font-mono text-[9px] text-muted-foreground">
                  {item.createdAt ? timeAgo(item.createdAt) : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlatformCard({ data }: { data: DashboardStats }) {
  const total = data.linksByPlatform.reduce((sum, row) => sum + row.count, 0);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-1">
        <h3 className="text-sm font-semibold">Distribusi Platform</h3>
        <p className="text-xs text-muted-foreground">Asal tautan laporan anggota</p>
      </CardHeader>
      <CardContent>
        <div className="relative mx-auto h-[168px] w-full max-w-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.linksByPlatform}
                dataKey="count"
                nameKey="platform"
                innerRadius={52}
                outerRadius={76}
                paddingAngle={3}
                stroke="none"
                isAnimationActive={false}
              >
                {data.linksByPlatform.map((entry, index) => (
                  <Cell key={entry.platform} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold">{formatNumber(total)}</span>
            <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Total link</span>
          </div>
        </div>
        <div className="mt-2 space-y-2.5">
          {data.linksByPlatform.slice(0, 5).map((row, index) => {
            const percent = total ? Math.round((row.count / total) * 100) : 0;
            return (
              <div key={row.platform} className="flex items-center gap-2.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
                />
                <span className="flex-1 truncate text-[11px] text-muted-foreground">{row.platform}</span>
                <span className="text-[11px] font-semibold">{row.count}</span>
                <span className="w-8 text-right text-[10px] text-muted-foreground">{percent}%</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function LatestTimemarks({ data }: { data: DashboardStats }) {
  return (
    <Card className="overflow-hidden lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <h3 className="text-sm font-semibold">Foto Timemark Terbaru</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Verifikasi waktu, lokasi, dan satuan</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground">
          <Link to="/timemark">
            Lihat semua <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {data.latestTimemark.slice(0, 3).map((photo) => (
          <Link
            key={photo.id}
            to="/timemark"
            className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-border/60 bg-muted"
          >
            <img
              src={photo.thumbnailUrl}
              alt={`Timemark ${photo.unitName ?? photo.senderName}`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 image-shade" />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
              <span className="rounded-md bg-slate-950/65 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white backdrop-blur-sm">
                {photo.timeText ?? '--:--'}
              </span>
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[9px] font-bold backdrop-blur-sm',
                  photo.status === 'parsed'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-300'
                )}
              >
                {photo.confidence}%
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-2.5">
              <p className="truncate text-[11px] font-semibold text-white">
                {photo.unitName ?? 'Satuan tidak terbaca'}
              </p>
              <p className="mt-0.5 flex items-center gap-1 truncate text-[9px] text-slate-300">
                <MapPin className="h-2.5 w-2.5 shrink-0 text-primary" />
                {truncate(photo.address, 44)}
              </p>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function ActivityCard({ activities }: { activities: ActivityDTO[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <h3 className="text-sm font-semibold">Aktivitas Terbaru</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Alur masuk secara realtime</p>
        </div>
        <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-success">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-success" /> Live
        </span>
      </CardHeader>
      <CardContent className="pt-1">
        <div className="relative space-y-0">
          {activities.slice(0, 6).map((activity, index) => {
            const Icon = ACTIVITY_ICONS[activity.type] ?? Activity;
            return (
              <div key={activity.id} className="relative flex gap-3 pb-4 last:pb-0">
                {index < activities.slice(0, 6).length - 1 ? (
                  <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-border" />
                ) : null}
                <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-[11px] font-semibold leading-snug">{activity.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
                    {activity.description ?? activity.actor}
                  </p>
                  <p className="mt-1 text-[9px] text-muted-foreground/60">{timeAgo(activity.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SprinProgressCard({ data }: { data: DashboardStats }) {
  return (
    <Card className="overflow-hidden lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <h3 className="text-sm font-semibold">Progres Pelaporan Sprin</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Perbandingan personel dan link terkait</p>
        </div>
        <Button asChild variant="outline" size="sm" className="text-xs">
          <Link to="/sprin">
            Kelola Sprin <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.sprinProgress.length ? (
          data.sprinProgress.map((sprin) => (
            <div key={sprin.id} className="rounded-lg border border-border/60 bg-muted/15 p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <p className="truncate text-xs font-semibold">{sprin.number}</p>
                    <Badge variant="info" className="hidden sm:inline-flex">
                      Aktif
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-1 pl-5 text-[10px] text-muted-foreground">
                    {sprin.about ?? 'Tanpa perihal'}
                  </p>
                </div>
                <span className="text-[10px] font-semibold text-primary">{sprin.percent}%</span>
              </div>
              <Progress value={sprin.percent} className="mt-3 h-1.5" />
              <div className="mt-2 flex items-center justify-between text-[9px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <UsersRound className="h-2.5 w-2.5" /> {sprin.personnelCount} personel
                </span>
                <span className="flex items-center gap-1">
                  <Link2 className="h-2.5 w-2.5" /> {sprin.reportedLinks} link
                </span>
                <span>{sprin.activityDate ? formatDate(sprin.activityDate) : 'Tanggal fleksibel'}</span>
              </div>
            </div>
          ))
        ) : (
          <EmptyState icon={FileText} title="Belum ada Sprin aktif" />
        )}
      </CardContent>
    </Card>
  );
}

function BotCard() {
  const { waStatus, connected } = useRealtime();
  const online = waStatus?.status === 'connected';
  const mock = waStatus?.status === 'mock';
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.16),transparent_70%)]" />
      <CardHeader className="relative pb-3">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <StatusBadge status={waStatus?.status ?? 'disconnected'} />
        </div>
        <h3 className="pt-2 text-sm font-semibold">WhatsApp Bot</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {online
            ? `Terhubung sebagai ${waStatus?.pushName ?? 'perangkat'}${waStatus?.phone ? ` · ${waStatus.phone}` : ''}.`
            : mock
              ? 'Mode simulator aktif. Semua pipeline dapat diuji tanpa scan QR.'
              : 'Hubungkan perangkat untuk mulai menerima pesan grup secara otomatis.'}
        </p>
      </CardHeader>
      <CardContent className="relative space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Driver</p>
            <p className="mt-0.5 text-[11px] font-semibold capitalize">{waStatus?.driver ?? 'mock'}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Realtime</p>
            <p className={cn('mt-0.5 flex items-center gap-1 text-[11px] font-semibold', connected ? 'text-success' : 'text-muted-foreground')}>
              <Wifi className="h-3 w-3" /> {connected ? 'Aktif' : 'Terputus'}
            </p>
          </div>
        </div>
        <Button asChild className="w-full" size="sm">
          <Link to="/settings">
            <ScanLine className="h-4 w-4" /> Kelola & scan QR
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[126px] w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[350px] lg:col-span-2" />
        <Skeleton className="h-[350px]" />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const statsApi = useApi<DashboardStats>('/stats');
  const activitiesApi = useApi<ActivityDTO[]>('/activities?limit=8');
  const version = useRealtimeVersion();

  React.useEffect(() => {
    if (version === 0) return;
    void statsApi.refresh();
    void activitiesApi.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const data = statsApi.data;
  const activities = activitiesApi.data ?? [];

  if (!data && statsApi.loading) return <DashboardSkeleton />;

  if (!data) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Dashboard belum dapat dimuat"
        description={statsApi.error ?? 'Pastikan API SIGAP berjalan dan database sudah di-seed.'}
        action={
          <Button onClick={() => void statsApi.refresh(true)}>
            <RefreshCw className="h-4 w-4" /> Coba lagi
          </Button>
        }
      />
    );
  }

  return (
    <div className="animate-slide-up space-y-6">
      <PageHeader
        eyebrow="Command Center"
        title={`${greeting()}, Admin Ops`}
        description={`Ringkasan ${formatDateLong(new Date())}. Pantau Timemark, Sprin, dan laporan anggota dalam satu layar.`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/settings">
                <Bot className="h-4 w-4" /> Panel Bot
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Download className="h-4 w-4" /> Ekspor Rekap
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Rekap hari ini</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => downloadFile(exportUrl('daily.xlsx'))}>
                  <FileCheck2 className="h-4 w-4 text-success" /> Excel lengkap (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadFile(exportUrl('daily.txt'))}>
                  <FileText className="h-4 w-4 text-info" /> Format WhatsApp (.txt)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => downloadFile(exportUrl('links.csv'))}>
                  <Link2 className="h-4 w-4" /> CSV link anggota
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadFile(exportUrl('timemark.csv'))}>
                  <Camera className="h-4 w-4" /> CSV foto Timemark
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadFile(exportUrl('turjawali.csv'))}>
                  <TrafficCone className="h-4 w-4" /> CSV rekap Turjawali
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Foto Timemark Masuk"
          value={formatNumber(data.timemarkToday)}
          hint="hari ini"
          icon={Camera}
          delta={percentChange(data.timemarkToday, data.timemarkYesterday)}
          accent="primary"
        />
        <StatCard
          label="Sprin Aktif"
          value={formatNumber(data.activeSprin)}
          hint={`${data.activeSprinThisMonth} dibuat bulan ini`}
          icon={FileCheck2}
          accent="info"
        />
        <StatCard
          label="Link Terekap"
          value={formatNumber(data.linksToday)}
          hint="hari ini"
          icon={Link2}
          delta={percentChange(data.linksToday, data.linksYesterday)}
          accent="success"
        />
        <StatCard
          label="Personel Terlibat"
          value={formatNumber(data.personnelInvolved)}
          hint={`${formatNumber(data.totalPersonnel)} penugasan`}
          icon={UsersRound}
          accent="violet"
        />
      </div>

      <TurjawaliOverview data={data} />

      <SupervisionCard data={data} />

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard data={data} />
        <PlatformCard data={data} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <LatestTimemarks data={data} />
        <ActivityCard activities={activities} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SprinProgressCard data={data} />
        <BotCard />
      </div>

      <div className="flex flex-col items-center justify-between gap-2 rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-3 text-[10px] text-muted-foreground sm:flex-row">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          OCR rata-rata keyakinan {data.avgConfidence}% · {formatNumber(data.totalTimemark)} foto terarsip
        </span>
        <span className="flex items-center gap-3">
          <span>Data diperbarui otomatis</span>
          <span className="flex items-center gap-1 font-mono">
            <Radio className="h-3 w-3 text-success" /> SSE
          </span>
          <Link to="/links" className="flex items-center gap-1 text-primary hover:underline">
            Buka rekap <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        </span>
      </div>
    </div>
  );
}
