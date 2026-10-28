import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
            <span className="h-px w-6 bg-primary/60" />
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  icon: Icon,
  action
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {description ? (
            <p className="truncate text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/10 px-6 py-14 text-center',
        className
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground shadow-soft">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
