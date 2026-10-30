import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, LogIn, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, errorMessage } from '@/lib/api';

interface LoginResponse {
  user: { name: string; role: string };
  token: string;
}

type Mode = 'password' | 'otp';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string } | null;
  const redirectTo = state?.from && state.from !== '/login' ? state.from : '/';

  const [mode, setMode] = React.useState<Mode>('password');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [step, setStep] = React.useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = React.useState('');
  const [code, setCode] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [info, setInfo] = React.useState<string | null>(null);

  const loginWithPassword = async () => {
    if (!username.trim() || !password) {
      toast.error('Username dan password wajib diisi');
      return;
    }
    setPending(true);
    try {
      const result = await api.post<LoginResponse>('/auth/login', {
        username: username.trim(),
        password
      });
      toast.success(`Selamat datang, ${result.user.name}`);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      toast.error('Gagal masuk', { description: errorMessage(error) });
    } finally {
      setPending(false);
    }
  };

  const requestOtp = async () => {
    if (phone.replace(/\D/g, '').length < 9) {
      toast.error('Nomor HP tidak valid', { description: 'Contoh: 082181281252' });
      return;
    }
    setPending(true);
    try {
      const result = await api.post<{ sent: boolean; reason?: string }>('/auth/request-otp', {
        phone
      });
      if (!result.sent) {
        toast.error('Kode tidak terkirim', { description: result.reason ?? 'Coba lagi.' });
        return;
      }
      setStep('code');
      setInfo(`Kode 6 digit dikirim ke WhatsApp ${phone}. Berlaku 5 menit.`);
      toast.success('Kode dikirim via WhatsApp');
    } catch (error) {
      toast.error('Gagal meminta kode', { description: errorMessage(error) });
    } finally {
      setPending(false);
    }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error('Kode harus 6 digit');
      return;
    }
    setPending(true);
    try {
      const result = await api.post<LoginResponse>('/auth/verify-otp', {
        phone,
        code: code.trim()
      });
      toast.success(`Selamat datang, ${result.user.name}`);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      toast.error('Gagal masuk', { description: errorMessage(error) });
    } finally {
      setPending(false);
    }
  };

  const tabClass = (active: boolean) =>
    active
      ? 'flex-1 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground'
      : 'flex-1 rounded-md px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/40';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm font-semibold tracking-wide">SIGAP COMMAND CENTER</span>
          </div>
          <h1 className="text-lg font-bold">Masuk ke dashboard</h1>
          <p className="text-[11px] text-muted-foreground">
            Gunakan username &amp; password, atau nomor HP terdaftar untuk menerima kode WhatsApp.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/20 p-1">
            <button type="button" className={tabClass(mode === 'password')} onClick={() => setMode('password')}>
              Username &amp; Password
            </button>
            <button type="button" className={tabClass(mode === 'otp')} onClick={() => setMode('otp')}>
              Nomor HP (OTP)
            </button>
          </div>

          {mode === 'password' ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="login-username" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Username
                </Label>
                <div className="mt-1 flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                  <Input
                    id="login-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="admin atau username manajer"
                    autoComplete="username"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="login-password" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Password
                </Label>
                <div className="mt-1 flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="h-9 text-sm"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void loginWithPassword();
                    }}
                  />
                </div>
              </div>
              <Button className="w-full" onClick={() => void loginWithPassword()} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Masuk
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label htmlFor="login-phone" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Nomor HP terdaftar
                </Label>
                <div className="mt-1 flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <Input
                    id="login-phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="082181281252"
                    inputMode="tel"
                    disabled={step === 'code'}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {step === 'code' ? (
                <div>
                  <Label htmlFor="login-code" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Kode OTP
                  </Label>
                  <div className="mt-1 flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      inputMode="numeric"
                      className="h-9 font-mono text-lg tracking-[0.3em]"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void verify();
                      }}
                    />
                  </div>
                  {info ? <p className="mt-1.5 text-[9px] text-muted-foreground">{info}</p> : null}
                </div>
              ) : null}

              {step === 'phone' ? (
                <Button className="w-full" onClick={() => void requestOtp()} disabled={pending}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  Kirim kode WhatsApp
                </Button>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button className="w-full" onClick={() => void verify()} disabled={pending}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                    Masuk
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStep('phone');
                      setCode('');
                      setInfo(null);
                    }}
                    disabled={pending}
                  >
                    Ganti nomor
                  </Button>
                </div>
              )}
            </div>
          )}

          <p className="text-center text-[9px] text-muted-foreground">
            Admin memakai kredensial admin. Manajer memakai username/password yang diberikan admin,
            atau nomor HP terdaftar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
