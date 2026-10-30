import * as React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Membungkus halaman dashboard: pastikan pengguna sudah punya sesi.
 * Bila /api/auth/me membalas 401, arahkan ke /login.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [status, setStatus] = React.useState<'loading' | 'authenticated' | 'guest'>('loading');

  React.useEffect(() => {
    let cancelled = false;
    api
      .get<{ user: unknown }>('/auth/me')
      .then(() => {
        if (!cancelled) setStatus('authenticated');
      })
      .catch(() => {
        if (!cancelled) setStatus('guest');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Memeriksa sesi…
      </div>
    );
  }

  if (status === 'guest') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
