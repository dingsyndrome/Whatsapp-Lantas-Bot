import { Badge } from '@/components/ui/badge';
import { statusLabel } from '@/lib/format';

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'destructive' | 'info' | 'muted' | 'violet'> = {
  parsed: 'success',
  review: 'warning',
  failed: 'destructive',
  valid: 'success',
  restricted: 'warning',
  invalid: 'destructive',
  unchecked: 'muted',
  active: 'info',
  completed: 'success',
  archived: 'muted',
  connected: 'success',
  qr: 'warning',
  error: 'destructive',
  mock: 'violet',
  disconnected: 'muted',
  connecting: 'info',
  authenticated: 'info'
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? 'outline'} className={className}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {statusLabel(status)}
    </Badge>
  );
}
