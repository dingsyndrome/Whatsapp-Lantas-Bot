import * as React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Camera,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Link2,
  Menu,
  MessageSquareText,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Settings2,
  ShieldCheck,
  Sun,
  Wifi,
  WifiOff,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useRealtime } from '@/src/lib/realtime';
import { formatDateLong, statusLabel } from '@/lib/format';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { path: '/timemark', label: 'Rekap Foto Timemark', icon: Camera, end: false },
  { path: '/sprin', label: 'Data Surat Perintah', icon: FileText, end: false },
  { path: '/links', label: 'Rekap Link Anggota', icon: Link2, end: false },
  { path: '/settings', label: 'Settings / Bot', icon: Settings2, end: false }
];

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Monitoring harian' },
  '/timemark': { title: 'Rekap Foto Timemark', subtitle: 'Verifikasi lapangan' },
  '/sprin': { title: 'Data Surat Perintah', subtitle: 'Sprin & personel' },
  '/links': { title: 'Rekap Link Anggota', subtitle: 'Laporan tautan' },
  '/settings': { title: 'Settings / Bot', subtitle: 'Konfigurasi WhatsApp' }
};

function resolveMeta(pathname: string): { title: string; subtitle: string } {
  if (pathname.startsWith('/sprin/')) return PAGE_META['/sprin']!;
  return PAGE_META[pathname] ?? PAGE_META['/']!;
}

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3" aria-label="SIGAP Command Center">
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow">
        <MessageSquareText className="h-5 w-5" strokeWidth={2.2} />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-success" />
      </div>
      {!collapsed ? (
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[17px] font-extrabold tracking-[0.16em] text-sidebar-foreground">
              SIGAP
            </span>
            <span className="text-[8px] font-bold uppercase tracking-widest text-primary">v1.0</span>
          </div>
          <p className="text-[10px] font-medium tracking-[0.08em] text-sidebar-foreground/45">
            WHATSAPP COMMAND CENTER
          </p>
        </div>
      ) : null}
    </Link>
  );
}

function NavItems({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav className="space-y-1.5">
      {!collapsed ? (
        <p className="mb-3 px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-sidebar-foreground/35">
          Workspace
        </p>
      ) : (
        <div className="mx-auto mb-3 h-px w-8 bg-sidebar-border" />
      )}
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const link = (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center rounded-lg text-[13px] font-medium transition-all duration-200',
                collapsed ? 'mx-auto h-11 w-11 justify-center' : 'gap-3 px-3 py-2.5',
                isActive
                  ? 'bg-primary/12 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.16)]'
                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && !collapsed ? (
                  <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                ) : null}
                <Icon
                  className={cn(
                    'h-[18px] w-[18px] shrink-0 transition-colors',
                    isActive ? 'text-primary' : 'text-sidebar-foreground/45 group-hover:text-sidebar-foreground/80'
                  )}
                />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
                {!collapsed && isActive ? <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-50" /> : null}
              </>
            )}
          </NavLink>
        );

        if (!collapsed) return link;
        return (
          <Tooltip key={item.path} delayDuration={100}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

function BotStatus({ collapsed }: { collapsed: boolean }) {
  const { waStatus, connected } = useRealtime();
  const status = waStatus?.status ?? 'disconnected';
  const isOnline = status === 'connected';
  const isMock = status === 'mock';
  const label = isOnline
    ? 'Bot terhubung'
    : isMock
      ? 'Mode simulasi'
      : status === 'qr'
        ? 'Menunggu scan QR'
        : status === 'connecting'
          ? 'Menghubungkan…'
          : status === 'error'
            ? 'Koneksi bermasalah'
            : 'Bot belum aktif';

  const inner = (
    <Link
      to="/settings"
      className={cn(
        'group flex items-center rounded-lg border border-sidebar-border bg-sidebar-accent/50 transition-colors hover:border-primary/25 hover:bg-sidebar-accent',
        collapsed ? 'mx-auto h-11 w-11 justify-center' : 'gap-3 p-3'
      )}
    >
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar">
        <Radio className="h-4 w-4 text-primary" />
        <span
          className={cn(
            'absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar',
            isOnline
              ? 'bg-success'
              : isMock
                ? 'bg-violet-400'
                : status === 'qr' || status === 'connecting'
                  ? 'animate-pulse-soft bg-warning'
                  : 'bg-muted-foreground'
          )}
        />
      </div>
      {!collapsed ? (
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-sidebar-foreground">{label}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[9px] text-sidebar-foreground/40">
            {connected ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
            {connected ? 'Realtime aktif' : 'Realtime offline'}
          </p>
        </div>
      ) : null}
      {!collapsed ? (
        <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/30 transition-transform group-hover:translate-x-0.5" />
      ) : null}
    </Link>
  );

  if (!collapsed) return inner;
  return (
    <Tooltip delayDuration={100}>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={12}>
        {label} · {statusLabel(status)}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarBody({
  collapsed,
  onToggleCollapse,
  onNavigate
}: {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_20%_0%,hsl(var(--primary)/0.12),transparent_65%)]" />
      <div className="relative flex h-[76px] shrink-0 items-center px-4">
        <Brand collapsed={collapsed} />
      </div>
      <ScrollArea className="min-h-0 flex-1 px-3 py-3">
        <NavItems collapsed={collapsed} onNavigate={onNavigate} />
        {!collapsed ? (
          <div className="mt-8">
            <p className="mb-3 px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-sidebar-foreground/35">
              Ringkasan
            </p>
            <div className="mx-1 rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-3">
              <div className="flex items-center gap-2 text-[10px] font-semibold text-sidebar-foreground/70">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                SIGAP PROTECT
              </div>
              <p className="mt-1.5 text-[9px] leading-relaxed text-sidebar-foreground/40">
                Verifikasi Timemark, Sprin, dan link laporan dalam satu alur.
              </p>
            </div>
          </div>
        ) : null}
      </ScrollArea>
      <div className="shrink-0 border-t border-sidebar-border p-3">
        <BotStatus collapsed={collapsed} />
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'mt-2 flex w-full items-center rounded-lg text-[11px] text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground/70',
              collapsed ? 'h-9 justify-center' : 'gap-2 px-3 py-2'
            )}
            aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                Ciutkan sidebar
              </>
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export interface DashboardWithCollapsibleSidebarProps {
  children: React.ReactNode;
  isDark: boolean;
  onToggleTheme: () => void;
}

export function DashboardWithCollapsibleSidebar({
  children,
  isDark,
  onToggleTheme
}: DashboardWithCollapsibleSidebarProps) {
  const location = useLocation();
  const meta = resolveMeta(location.pathname);
  const [collapsed, setCollapsed] = React.useState(() => {
    return localStorage.getItem('sigap-sidebar-collapsed') === 'true';
  });
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { connected, waStatus } = useRealtime();

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      localStorage.setItem('sigap-sidebar-collapsed', String(!current));
      return !current;
    });
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.045),transparent_45%),radial-gradient(ellipse_at_bottom_left,hsl(var(--info)/0.035),transparent_40%)]" />

        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-300 lg:block',
            collapsed ? 'w-[84px]' : 'w-[264px]'
          )}
        >
          <SidebarBody collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
              aria-label="Tutup menu"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-[286px] border-r border-sidebar-border bg-sidebar shadow-2xl">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-5 z-10 rounded-md p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent"
                aria-label="Tutup menu"
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarBody collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        ) : null}

        <div
          className={cn(
            'relative z-10 min-h-screen transition-[padding] duration-300',
            collapsed ? 'lg:pl-[84px]' : 'lg:pl-[264px]'
          )}
        >
          <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
            <div className="flex h-[76px] items-center gap-3 px-4 sm:px-6 lg:px-8">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Buka menu"
              >
                <Menu className="h-5 w-5" />
              </Button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/60">
                  <span>SIGAP</span>
                  <span className="text-border">/</span>
                  <span className="truncate text-muted-foreground">{meta.subtitle}</span>
                </div>
                <h2 className="truncate text-sm font-semibold text-foreground sm:text-[15px]">
                  {meta.title}
                </h2>
              </div>

              <div className="hidden items-center gap-3 md:flex">
                <div
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold',
                    connected
                      ? 'border-success/20 bg-success/10 text-success'
                      : 'border-border bg-muted/40 text-muted-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      connected ? 'animate-pulse-soft bg-success' : 'bg-muted-foreground'
                    )}
                  />
                  {connected ? 'LIVE' : 'OFFLINE'}
                </div>
                <div className="hidden h-5 w-px bg-border xl:block" />
                <span className="hidden text-xs text-muted-foreground xl:block">
                  {formatDateLong(new Date())}
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleTheme}
                aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
                className="rounded-lg border border-border/70"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>

              <div className="hidden items-center gap-2.5 border-l border-border pl-3 sm:flex">
                <Avatar className="h-8 w-8 border border-primary/20">
                  <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                    AD
                  </AvatarFallback>
                </Avatar>
                <div className="hidden leading-tight xl:block">
                  <p className="text-xs font-semibold">Admin Ops</p>
                  <p className="flex items-center gap-1 text-[9px] text-muted-foreground">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        waStatus?.status === 'connected'
                          ? 'bg-success'
                          : waStatus?.status === 'mock'
                            ? 'bg-violet-400'
                            : 'bg-muted-foreground'
                      )}
                    />
                    {waStatus?.status === 'mock'
                      ? 'Simulator aktif'
                      : waStatus?.status === 'connected'
                        ? 'WhatsApp online'
                        : 'WhatsApp offline'}
                  </p>
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
