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
import { formatNumber } from '@/lib/format';

type Category =
  | 'ALL'
  | 'POS_PAGI'
  | 'PENGATURAN'
  | 'PENJAGAAN'
  | 'PENGAWALAN'
  | 'PATROLI'
  | 'PENEGAKKAN'
  | 'LAINNYA';

const CATEGORY_LABELS: Array<[Category, string]> = [
  ['ALL', 'Semua kegiatan'],
  ['POS_PAGI', 'Rekap pos pagi (jam gatur)'],
  ['PENGATURAN', 'Pengaturan (Gatur)'],
  ['PENJAGAAN', 'Penjagaan'],
  ['PENGAWALAN', 'Pengawalan (Wal)'],
  ['PATROLI', 'Patroli'],
  ['PENEGAKKAN', 'Penegakan Hukum (Gakkum)'],
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
  return new Date().toISOString().slice(0, 10);
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
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, category, rosterOnly: 'true' });
      if (hourFrom !== '') params.set('hourFrom', hourFrom);
      if (hourTo !== '') params.set('hourTo', hourTo);
      const data = await api.get<CustomRecapResponse>(`/reports/custom?${params.toString()}`);
      setResult(data);
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
            Pilih tanggal, rentang jam, dan jenis kegiatan. Personel mengikuti roster Satlantas.
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
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Jam mulai (0–23)</Label>
              <Input
                value={hourFrom}
                onChange={(e) => setHourFrom(e.target.value)}
                placeholder="mis. 13"
                className="mt-1 h-9 text-xs"
              />
            </div>
            <div>
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Jam selesai (0–23)</Label>
              <Input
                value={hourTo}
                onChange={(e) => setHourTo(e.target.value)}
                placeholder="mis. 16"
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
              <Button variant="outline" onClick={() => void copyText(result.text)}>
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
