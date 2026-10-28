import * as React from 'react';
import { cn } from '@/lib/utils';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  delta,
  accent = 'primary',
  loading = false
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ElementType;
  delta?: number | null;
  accent?: 'primary' | 'info' | 'success' | 'violet' | 'warning';
  loading?: boolean;
}) {
  const accentMap = {
    primary: 'bg-primary/12 text-primary border-primary/20',
    info: 'bg-info/12 text-info border-info/20',
    success: 'bg-success/12 text-success border-success/20',
    violet: 'bg-violet-500/12 text-violet-400 border-violet-500/20',
    warning: 'bg-warning/12 text-warning border-warning/20'
  } as const;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/80 bg-card p-5 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-lg">
      <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-primary/[0.04] blur-2xl transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          {loading ? (
            <div className="mt-3 h-8 w-24 animate-pulse rounded-md bg-muted" />
          ) : (
            <p className="mt-2 text-[28px] font-bold leading-none tracking-tight">{value}</p>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs">
            {typeof delta === 'number' ? (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold',
                  delta > 0
                    ? 'bg-success/10 text-success'
                    : delta < 0
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {delta > 0 ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : delta < 0 ? (
                  <ArrowDownRight className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                {Math.abs(delta)}%
              </span>
            ) : null}
            {hint ? <span className="truncate text-muted-foreground">{hint}</span> : null}
          </div>
        </div>
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
            accentMap[accent]
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
    </div>
  );
}
