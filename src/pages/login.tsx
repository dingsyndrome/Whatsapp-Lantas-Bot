import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, LogIn, ShieldCheck, Smartphone } from 'lucide-react';
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

export function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = React.useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = React.useState('');
  const [code, setCode] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [info, setInfo] = React.useState<string | null>(null);

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
      navigate('/', { replace: true });
    } catch (error) {
      toast.error('Gagal masuk', { description: errorMessage(error) });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm font-semibold tracking-wide">SIGAP COMMAND CENTER</span>
          </div>
          <h1 className="text-lg font-bold">Masuk sebagai manajer</h1>
          <p className="text-[11px] text-muted-foreground">
            Masukkan nomor yang sudah didaftarkan admin. Kode verifikasi dikirim melalui WhatsApp.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="login-phone" className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Nomor HP
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

          <div className="flex flex-col gap-2">
            {step === 'phone' ? (
              <Button onClick={() => void requestOtp()} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Kirim kode WhatsApp
              </Button>
            ) : (
              <>
                <Button onClick={() => void verify()} disabled={pending}>
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
              </>
            )}
          </div>

          <p className="text-center text-[9px] text-muted-foreground">
            Admin tetap dapat masuk memakai kredensial admin yang berlaku.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
