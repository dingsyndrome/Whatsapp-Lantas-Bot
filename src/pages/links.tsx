import * as React from 'react';
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Link2,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound
} from 'lucide-react';
import { toast } from 'sonner';
import type { DailyReport, LinkDTO, Paginated } from '@/shared/types';
import { PageHeader, EmptyState } from '@/components/sigap/page-header';
import { StatusBadge } from '@/components/sigap/status-badge';
import { PlatformIcon } from '@/components/sigap/platform-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi, useDebouncedValue } from '@/src/hooks/use-api';
import { useRealtimeVersion } from '@/src/lib/realtime';
import { api, copyText, downloadFile, errorMessage, exportUrl } from '@/lib/api';
import { formatDateTime, formatNumber, timeAgo, truncate } from '@/lib/format';
import { cn, initials } from '@/lib/utils';

interface LinkSummary {
  total: number;
  valid: number;
  restricted: number;
  invalid: number;
  unchecked: number;
  senders: number;
  platforms: Array<{ platform: string; count: number }>;
}

const PLATFORM_OPTIONS = [
  'Instagram',
  'TikTok',
  'Facebook',
  'YouTube',
  'X / Twitter',
  'Google Drive',
  'Google Maps',
  'Portal Berita',
  'Website'
];

function LinkSummaryCards({ summary }: { summary: LinkSummary }) {
  const cards = [
    { label: 'Total link', value: summary.total, icon: Link2, color: 'text-primary bg-primary/10 border-primary/20' },
    { label: 'Link valid', value: summary.valid, icon: ShieldCheck, color: 'text-success bg-success/10 border-success/20' },
    { label: 'Pengirim unik', value: summary.senders, icon: UsersRound, color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
    { label: 'Platform', value: summary.platforms.length, icon: FileSpreadsheet, color: 'text-info bg-info/10 border-info/20' }
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
              <p className="text-lg font-bold leading-tight">{formatNumber(card.value)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LinksTable({
  data,
  onRevalidated
}: {
  data: Paginated<LinkDTO>;
  onRevalidated: () => void;
}) {
  const [validatingId, setValidatingId] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const copy = async (link: LinkDTO) => {
    try {
      await copyText(link.normalizedUrl);
      setCopiedId(link.id);
      toast.success('Link disalin');
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      toast.error('Gagal menyalin link');
    }
  };

  const revalidate = async (link: LinkDTO) => {
    setValidatingId(link.id);
    try {
      await api.post(`/links/${link.id}/validate`);
      toast.success('Validasi ulang selesai', { description: link.platform });
      onRevalidated();
    } catch (error) {
      toast.error('Gagal memvalidasi link', { description: errorMessage(error) });
    } finally {
      setValidatingId(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[54px]">Platform</TableHead>
            <TableHead>Link & keterangan</TableHead>
            <TableHead className="hidden lg:table-cell">Pengirim</TableHead>
            <TableHead>Waktu</TableHead>
            <TableHead className="hidden xl:table-cell">Sprin</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[92px] text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((link) => (
            <TableRow key={link.id} className="group">
              <TableCell>
                <PlatformIcon platform={link.platform} />
              </TableCell>
              <TableCell className="max-w-[360px]">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="line-clamp-1 text-[11px] font-semibold text-foreground hover:text-primary hover:underline"
                >
                  {link.title ?? link.normalizedUrl}
                </a>
                <p className="mt-0.5 line-clamp-1 font-mono text-[9px] text-muted-foreground">
                  {truncate(link.normalizedUrl, 76)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[8px]">{link.category}</Badge>
                  {link.httpStatus ? (
                    <span className="font-mono text-[8px] text-muted-foreground">HTTP {link.httpStatus}</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted/40 text-[9px] font-bold">
                    {initials(link.senderName)}
                  </span>
                  <div className="min-w-0">
                    <p className="max-w-[140px] truncate text-[10px] font-medium">{link.senderName}</p>
                    <p className="font-mono text-[9px] text-muted-foreground">{link.senderNumber}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <p className="text-[10px] font-medium">{formatDateTime(link.receivedAt)}</p>
                <p className="text-[9px] text-muted-foreground">{timeAgo(link.receivedAt)}</p>
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                {link.sprinNumber ? (
                  <span className="font-mono text-[9px] text-muted-foreground">{link.sprinNumber}</span>
                ) : (
                  <span className="text-[9px] text-muted-foreground/60">—</span>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge status={link.status} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Salin link"
                    onClick={() => void copy(link)}
                  >
                    {copiedId === link.id ? <Check className="h-3.5 w-3.5 text-success" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Validasi ulang"
                    disabled={validatingId === link.id}
                    onClick={() => void revalidate(link)}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', validatingId === link.id && 'animate-spin')} />
                  </Button>
                  <Button variant="ghost" size="icon-sm" asChild title="Buka link">
                    <a href={link.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export function LinksPage() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [platform, setPlatform] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [copying, setCopying] = React.useState(false);
  const debounced = useDebouncedValue(search);
  const version = useRealtimeVersion();

  const query = React.useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '30' });
    if (debounced) params.set('search', debounced);
    if (platform !== 'all') params.set('platform', platform);
    if (status !== 'all') params.set('status', status);
    return params.toString();
  }, [page, debounced, platform, status]);

  const listApi = useApi<Paginated<LinkDTO>>(`/links?${query}`);
  const summaryApi = useApi<LinkSummary>('/links/summary');

  React.useEffect(() => {
    if (version === 0) return;
    void listApi.refresh();
    void summaryApi.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  React.useEffect(() => {
    setPage(1);
  }, [debounced, platform, status]);

  const data = listApi.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const copyRecap = async () => {
    setCopying(true);
    try {
      const report = await api.get<DailyReport>('/reports/preview');
      await copyText(report.text);
      toast.success('Rekap WhatsApp disalin', {
        description: `${report.counts.links} link · ${report.counts.timemark} foto · siap ditempel ke grup.`
      });
    } catch (error) {
      toast.error('Gagal menyiapkan rekap', { description: errorMessage(error) });
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="animate-slide-up space-y-6">
      <PageHeader
        eyebrow="Link Aggregator"
        title="Rekap Link Anggota"
        description="Tautan laporan dari Instagram, TikTok, Facebook, YouTube, X, Drive, maps, dan portal berita — terekam otomatis."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void copyRecap()} disabled={copying}>
              {copying ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ClipboardCopy className="h-4 w-4" />}
              Salin Rekap WA
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Download className="h-4 w-4" /> Ekspor
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Rekap hari ini</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => downloadFile(exportUrl('daily.xlsx'))}>
                  <FileSpreadsheet className="h-4 w-4 text-success" /> Excel semua data
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadFile(exportUrl('links.csv'))}>
                  <Link2 className="h-4 w-4 text-info" /> CSV link anggota
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadFile(exportUrl('turjawali.csv'))}>
                  <FileSpreadsheet className="h-4 w-4 text-warning" /> CSV rekap Turjawali
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadFile(exportUrl('daily.txt'))}>
                  <FileText className="h-4 w-4" /> Teks WhatsApp
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void copyRecap()}>
                  <ClipboardCopy className="h-4 w-4" /> Salin ke clipboard
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {summaryApi.data ? <LinkSummaryCards summary={summaryApi.data} /> : null}

      {summaryApi.data && summaryApi.data.platforms.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {summaryApi.data.platforms.map((item) => (
            <button
              key={item.platform}
              type="button"
              onClick={() => setPlatform(platform === item.platform ? 'all' : item.platform)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-colors',
                platform === item.platform
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border/70 bg-card text-muted-foreground hover:border-primary/20 hover:text-foreground'
              )}
            >
              <PlatformIcon platform={item.platform} className="h-5 w-5 rounded-md border-0 bg-transparent" />
              {item.platform}
              <span className="font-mono text-[9px] opacity-60">{item.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <Card>
        <CardContent className="p-3.5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari pengirim, URL, keterangan…"
                  className="h-9 pl-9 text-xs"
                />
              </div>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="h-9 w-full text-xs sm:w-[160px]">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua platform</SelectItem>
                  {PLATFORM_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 w-full text-xs sm:w-[145px]">
                  <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua status</SelectItem>
                  <SelectItem value="valid">Valid</SelectItem>
                  <SelectItem value="restricted">Dibatasi</SelectItem>
                  <SelectItem value="invalid">Tidak valid</SelectItem>
                  <SelectItem value="unchecked">Belum dicek</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>{formatNumber(data?.total ?? 0)} link</span>
              <span className="h-3 w-px bg-border" />
              <span className="flex items-center gap-1 text-success">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-success" /> realtime
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {listApi.loading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-[76px] w-full" />
          ))}
        </div>
      ) : listApi.error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Gagal memuat link"
          description={listApi.error}
          action={
            <Button onClick={() => void listApi.refresh(true)}>
              <RefreshCw className="h-4 w-4" /> Coba lagi
            </Button>
          }
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="Belum ada tautan anggota"
          description="Kirim link laporan ke grup WhatsApp yang dipantau, atau simulasikan dari panel Settings."
          action={
            <Button variant="outline" onClick={() => void summaryApi.refresh(true)}>
              <RefreshCw className="h-4 w-4" /> Muat ulang
            </Button>
          }
        />
      ) : (
        <LinksTable
          data={data}
          onRevalidated={() => {
            void listApi.refresh();
            void summaryApi.refresh();
          }}
        />
      )}

      {data && data.total > 30 ? (
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

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-muted/15 px-4 py-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Send className="h-3.5 w-3.5 text-primary" />
          Validasi HTTP berjalan di latar belakang.
        </span>
        <span className="hidden h-3 w-px bg-border sm:block" />
        <span>Status “Dibatasi” berarti situs menolak bot (401/403/429), bukan laporan hilang.</span>
      </div>
    </div>
  );
}
