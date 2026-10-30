import * as React from 'react';
import { ClipboardCopy, Loader2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { api, copyText, errorMessage } from '@/lib/api';
import { formatNumber, normalizeTimeInput } from '@/lib/format';

type Category =
  | 'ALL'
  | 'POS_PAGI'
  | 'PENGATURAN'
  | 'PENJAGAAN'
  | 'PENGAWALAN'
  | 'PATROLI'
  | 'PENEGAKKAN'
  | 'REGIDENT'
  | 'LAINNYA';

const CATEGORY_LABELS: Array<[Category, string]> = [
  ['ALL', 'Semua kegiatan'],
  ['POS_PAGI', 'Rekap pos pagi (jam gatur)'],
  ['PENGATURAN', 'Pengaturan (Gatur)'],
  ['PENJAGAAN', 'Penjagaan'],
  ['PENGAWALAN', 'Pengawalan (Wal)'],
  ['PATROLI', 'Patroli'],
  ['PENEGAKKAN', 'Penegakan Hukum (Gakkum)'],
  ['REGIDENT', 'Registrasi Identitas (Regident)'],
  ['LAINNYA', 'Kegiatan lainnya']
];

interface CustomRecapResponse {
  counts: { photos: number; links: number; activities: number; supervisors: number };
  personnel: {
    rosterTotal: number;
    submitted: Array<{ name: string; rankNrp: string | null; photos: number; links: number }>;
    notSubmitted: Array<{ name: string; rankNrp: string | null; phone: string | null }>;
  };
  text: string;
}

function today(): string {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

export function RecapPanel() {
  const [from, setFrom] = React.useState(today());
  const [to, setTo] = React.useState(today());
  const [hourFrom, setHourFrom] = React.useState('');
  const [hourTo, setHourTo] = React.useState('');
  const [category, setCategory] = React.useState<Category>('ALL');
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<CustomRecapResponse | null>(null);

  const run = async () => {
    const start = normalizeTimeInput(hourFrom);
    const end = normalizeTimeInput(hourTo);
    if (start === null || end === null) {
      toast.error('Format jam tidak dikenali', {
        description: 'Gunakan format 24 jam HH:MM, contoh 13:36.'
      });
      return;
    }
    // Jam selesai lebih kecil hanya sah bila tanggalnya berbeda (lintas hari).
    if (from === to && start !== '' && end !== '' && start > end) {
      toast.error('Rentang jam tidak valid', {
        description: 'Pada tanggal yang sama, jam selesai harus setelah jam mulai.'
      });
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, category, rosterOnly: 'true' });
      if (start !== '') params.set('hourFrom', start);
      if (end !== '') params.set('hourTo', end);
      const data = await api.get<CustomRecapResponse>(`/reports/custom?${params.toString()}`);
      setResult(data);
      setHourFrom(start);
      setHourTo(end);
      toast.success('Rekap dibuat', {
        description: `${data.counts.photos} foto · ${data.counts.links} link · ${data.personnel.submitted.length}/${data.personnel.rosterTotal} personel melapor`
      });
    } catch (error) {
      toast.error('Gagal membuat rekap', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <h3 className="text-sm font-semibold">Rekap Kustom</h3>
          <p className="text-[10px] text-muted-foreground">
            Pilih tanggal, rentang jam (format 24 jam), dan jenis kegiatan. Rentang boleh melewati
            tengah malam, mis. 29 Okt 13:36 sampai 30 Okt 08:26.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Dari tanggal</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-9 text-xs" />
            </div>
            <div>
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Sampai tanggal</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-9 text-xs" />
            </div>
            <div>
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Jam mulai</Label>
              <Input
                value={hourFrom}
                onChange={(e) => setHourFrom(e.target.value)}
                onBlur={(e) => {
                  const normalized = normalizeTimeInput(e.target.value);
                  if (normalized) setHourFrom(normalized);
                }}
                placeholder="mis. 13:36"
                inputMode="numeric"
                maxLength={5}
                autoComplete="off"
                className="mt-1 h-9 text-xs"
              />
            </div>
            <div>
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Jam selesai</Label>
              <Input
                value={hourTo}
                onChange={(e) => setHourTo(e.target.value)}
                onBlur={(e) => {
                  const normalized = normalizeTimeInput(e.target.value);
                  if (normalized) setHourTo(normalized);
                }}
                placeholder="mis. 08:26"
                inputMode="numeric"
                maxLength={5}
                autoComplete="off"
                className="mt-1 h-9 text-xs"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Jenis rekap</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as Category)}>
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_LABELS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => void run()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Tampilkan rekap
            </Button>
            {result ? (
              <Button
                variant="outline"
                onClick={() => {
                  void copyText(result.text).then((copied) => {
                    if (copied) toast.success('Rekap disalin');
                    else
                      toast.error('Gagal menyalin', {
                        description: 'Browser menolak akses clipboard. Pilih teks lalu tekan Ctrl+C.'
                      });
                  });
                }}
              >
                <ClipboardCopy className="h-4 w-4" /> Salin teks
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Hasil Rekap</h3>
                <p className="text-[10px] text-muted-foreground">
                  {formatNumber(result.counts.photos)} foto · {formatNumber(result.counts.links)} link ·{' '}
                  {result.counts.supervisors} perwira pengawas · {result.personnel.submitted.length}/
                  {result.personnel.rosterTotal} personel melapor
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void run()} disabled={loading}>
                <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /> Muat ulang
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/20 p-3 font-mono text-[10px] leading-relaxed">
              {result.text}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
