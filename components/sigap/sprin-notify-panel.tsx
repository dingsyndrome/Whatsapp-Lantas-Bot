import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Info,
  MapPin,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  UsersRound
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  NotificationFunctionDTO,
  SprinDTO,
  SprinNotifyPreviewDTO,
  SprinNotifyRecipientDTO
} from '@/shared/types';
import { SPRIN_NOTIFY_PLACEHOLDERS } from '@/shared/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApi } from '@/src/hooks/use-api';
import { api, copyText, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

function statusBadge(status: string) {
  if (status === 'sent') return <Badge variant="success" className="text-[8px]">Terkirim</Badge>;
  if (status === 'failed') return <Badge variant="destructive" className="text-[8px]">Gagal</Badge>;
  if (status === 'pending_review') return <Badge variant="warning" className="text-[8px]">Perlu verifikasi</Badge>;
  if (status === 'draft') return <Badge variant="info" className="text-[8px]">Draf</Badge>;
  return <Badge variant="muted" className="text-[8px]">Belum disiapkan</Badge>;
}

function RecBadge({ children, variant = 'outline' }: { children: React.ReactNode; variant?: 'outline' | 'warning' | 'info' | 'success' }) {
  return <Badge variant={variant} className="text-[8px] font-normal">{children}</Badge>;
}

export function SprinNotifyPanel({ sprin, onChanged }: { sprin: SprinDTO; onChanged: () => void }) {
  const functionsApi = useApi<NotificationFunctionDTO[]>('/settings/notification-functions');
  const [selectedCodes, setSelectedCodes] = React.useState<string[]>(
    sprin.notification?.functionCodes?.length ? sprin.notification.functionCodes : ['SATLANTAS']
  );
  const [excludePerwira, setExcludePerwira] = React.useState(true);
  const [resend, setResend] = React.useState(true);
  const [template, setTemplate] = React.useState('');
  const [templateTouched, setTemplateTouched] = React.useState(false);
  const [messageOverrides, setMessageOverrides] = React.useState<Record<string, string>>({});
  const [preview, setPreview] = React.useState<SprinNotifyPreviewDTO | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [selectedRecipient, setSelectedRecipient] = React.useState<SprinNotifyRecipientDTO | null>(null);
  const [showSkipped, setShowSkipped] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [reviewNote, setReviewNote] = React.useState('');

  const loadPreview = React.useCallback(
    async (params?: Partial<{ functionCodes: string[]; excludePerwira: boolean; template: string; force: boolean; overrides: Record<string, string> }>) => {
      setLoading(true);
      try {
        const body: Record<string, unknown> = {
          functionCodes: params?.functionCodes ?? selectedCodes,
          excludePerwira: params?.excludePerwira ?? excludePerwira,
          template: params?.template ?? (templateTouched ? template : undefined),
          force: params?.force ?? resend
        };
        // Saat pertama membuka panel, jangan kirim overrides kosong: server
        // harus membaca draf yang sudah tersimpan. Setelah pratinjau ada,
        // objek kosong berarti admin menghapus semua edit pesan.
        const overridesToSend = params?.overrides ?? (preview === null ? undefined : messageOverrides);
        if (overridesToSend !== undefined) body.overrides = overridesToSend;
        const result = await api.post<SprinNotifyPreviewDTO>(`/sprin/${sprin.id}/notify/preview`, body);
        setPreview(result);
        if (!templateTouched) setTemplate(result.template);
        setMessageOverrides(result.overrides ?? {});
        setSelectedRecipient((current) => {
          if (current) {
            const match = result.recipients.find((row) => row.personnelId === current.personnelId);
            if (match) return match;
          }
          return result.recipients[0] ?? null;
        });
      } catch (error) {
        toast.error('Gagal menyiapkan notifikasi', { description: errorMessage(error) });
      } finally {
        setLoading(false);
      }
    },
    [sprin.id, selectedCodes, excludePerwira, template, templateTouched, resend, messageOverrides, preview]
  );

  React.useEffect(() => {
    setSelectedCodes(sprin.notification?.functionCodes?.length ? sprin.notification.functionCodes : ['SATLANTAS']);
    setExcludePerwira(true);
    setTemplate('');
    setTemplateTouched(false);
    setMessageOverrides({});
    setPreview(null);
    setSelectedRecipient(null);
    setReviewNote('');
    setConfirmOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprin.id]);

  React.useEffect(() => {
    // Jangan kirim template kosong saat pertama membuka panel: server harus
    // memakai template draf yang sudah disimpan admin, bukan default global.
    void loadPreview({
      functionCodes: sprin.notification?.functionCodes?.length
        ? sprin.notification.functionCodes
        : ['SATLANTAS'],
      excludePerwira: true,
      force: true
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprin.id]);

  const toggleCode = (code: string) => {
    setSelectedCodes((current) =>
      current.includes(code) ? current.filter((value) => value !== code) : [...current, code]
    );
  };

  const applyPreview = () => void loadPreview();

  const saveDraft = async () => {
    setSaving(true);
    try {
      const result = await api.post<SprinNotifyPreviewDTO>(`/sprin/${sprin.id}/notify/draft`, {
        functionCodes: selectedCodes,
        excludePerwira,
        template,
        overrides: messageOverrides,
        force: resend,
        reviewNote
      });
      setPreview(result);
      toast.success('Draf notifikasi disimpan', {
        description: result.requiresReview
          ? 'Draf menunggu verifikasi admin sebelum dikirim.'
          : 'Draf siap dikirim setelah admin menekan tombol kirim.'
      });
      onChanged();
    } catch (error) {
      toast.error('Gagal menyimpan draf', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const doSend = async () => {
    setSending(true);
    setConfirmOpen(false);
    try {
      const result = await api.post<SprinNotifyPreviewDTO & { sent: number; failed: number; blocked: boolean }>(
        `/sprin/${sprin.id}/notify`,
        {
          functionCodes: selectedCodes,
          excludePerwira,
          template,
          overrides: messageOverrides,
          force: resend,
          confirmReview: true,
          reviewNote
        }
      );
      setPreview(result);
      if (result.blocked) {
        toast.warning('Notifikasi belum dikirim', {
          description: result.reviewReasons[0] ?? 'Periksa kembali pilihan fungsi dan lokasi.'
        });
      } else {
        toast.success('Notifikasi diproses', {
          description: `Terkirim ${result.sent} · gagal ${result.failed} · penerima ${result.recipients.length}`
        });
      }
      onChanged();
      await loadPreview({ functionCodes: selectedCodes, excludePerwira, template, force: resend, overrides: messageOverrides });
    } catch (error) {
      toast.error('Gagal mengirim notifikasi', { description: errorMessage(error) });
    } finally {
      setSending(false);
    }
  };

  const functions = functionsApi.data ?? [];
  const activeFunctions = functions.filter((row) => row.active);
  const selectedFunctionRows = functions.filter((row) => selectedCodes.includes(row.code));
  const phoneReady = selectedFunctionRows.some((row) => row.availableCount > 0);

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Notifikasi per fungsi kepolisian</CardTitle>
                {statusBadge(preview?.notificationStatus ?? sprin.notification?.status ?? 'none')}
              </div>
              <CardDescription className="mt-1 text-[11px] leading-relaxed">
                Pilih fungsi yang akan dikirimi notifikasi. Fungsi dibaca dari kolom Jabatan Sprin; nomor HP
                dicocokkan ke database personel. Perwira dikecualikan agar notifikasi fokus ke anggota pelaksana.
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={applyPreview} disabled={loading}>
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Muat pratinjau
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fungsi tujuan</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {functionsApi.loading && !functions.length ? (
                <Skeleton className="h-7 w-32" />
              ) : activeFunctions.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  Belum ada fungsi aktif. Tambahkan di Settings → Notifikasi.
                </p>
              ) : (
                activeFunctions.map((row) => {
                  const selected = selectedCodes.includes(row.code);
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => toggleCode(row.code)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[10px] font-semibold transition-colors',
                        selected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:border-primary/30'
                      )}
                    >
                      {row.name}
                      <span className="ml-1.5 font-normal opacity-70">
                        {row.availableCount > 0 ? `${row.availableCount} HP` : 'tanpa HP'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {!phoneReady && selectedCodes.length > 0 ? (
              <p className="mt-2 flex items-start gap-1.5 text-[10px] text-warning">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                Fungsi terpilih belum memiliki nomor HP di database personel. Impor database fungsi tersebut
                terlebih dahulu atau pilih Satlantas.
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card p-3">
              <div>
                <p className="text-[11px] font-semibold">Kecualikan perwira</p>
                <p className="text-[9px] text-muted-foreground">IPDA/IPTU/AKP/KOMPOL/AKBP tidak dikirimi.</p>
              </div>
              <Switch checked={excludePerwira} onCheckedChange={setExcludePerwira} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card p-3">
              <div>
                <p className="text-[11px] font-semibold">Kirim ulang yang sudah pernah dinotifikasi</p>
                <p className="text-[9px] text-muted-foreground">
                  {preview?.totals.already ?? 0} personel sudah pernah menerima notifikasi.
                </p>
              </div>
              <Switch checked={resend} onCheckedChange={setResend} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <UsersRound className="h-3 w-3" />
            <span>{preview?.totals.personnel ?? sprin.personnelCount} personel di Sprin</span>
            <span>·</span>
            <span className="font-semibold text-foreground">{preview?.recipients.length ?? 0} penerima</span>
            <span>·</span>
            <span>{preview?.totals.perwiraExcluded ?? 0} perwira dikecualikan</span>
            <span>·</span>
            <span>{preview?.totals.noPhone ?? 0} tanpa nomor HP</span>
            <span>·</span>
            <span>{preview?.totals.otherFunction ?? 0} fungsi lain</span>
          </div>
        </CardContent>
      </Card>

      {loading && !preview ? (
        <Skeleton className="h-48 w-full" />
      ) : preview ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">Lokasi yang tercantum di Sprin</CardTitle>
                </div>
                <CardDescription className="text-[10px]">
                  Dikutip dari uraian “Untuk” dan kolom KET/Jabatan. Tidak ada lokasi yang disimpulkan sendiri.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {preview.analysis.schedule ? (
                  <div className="rounded-lg border border-border/60 bg-muted/15 p-3">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Jadwal dari teks Sprin
                    </p>
                    <p className="mt-1 text-[11px] font-medium">{preview.analysis.schedule.text}</p>
                    <p className="mt-1 text-[9px] italic text-muted-foreground">
                      “{preview.analysis.schedule.sourceText}”
                    </p>
                  </div>
                ) : null}
                {preview.analysis.preTaskApel ? (
                  <div className="rounded-lg border border-info/20 bg-info/5 p-3">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-info">Apel umum (teks)</p>
                    <p className="mt-1 text-[11px] font-medium">{preview.analysis.preTaskApel.location}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {preview.analysis.preTaskApel.time ? `Pukul ${preview.analysis.preTaskApel.time}` : 'Jam tidak tertulis'}
                    </p>
                    <p className="mt-1 text-[9px] italic text-muted-foreground">“{preview.analysis.preTaskApel.sourceText}”</p>
                  </div>
                ) : null}
                {preview.analysis.directives.length === 0 && !preview.analysis.preTaskApel ? (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <p className="text-[10px] text-muted-foreground">
                      Tidak ada arahan apel per nomor pada teks Sprin ini. Lokasi tugas per anggota diambil dari
                      kolom KET/Jabatan bila tersedia.
                    </p>
                  </div>
                ) : null}
                {preview.analysis.directives.map((directive, index) => (
                  <div key={`${directive.rangeText}-${index}`} className="rounded-lg border border-border/60 bg-muted/15 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[8px]">Nomor {directive.rangeText}</Badge>
                      {directive.time ? <Badge variant="info" className="text-[8px]">Pukul {directive.time}</Badge> : null}
                    </div>
                    <p className="mt-1.5 text-[11px] font-semibold">{directive.location}</p>
                    {directive.exception ? (
                      <p className="mt-1 rounded border border-warning/30 bg-warning/10 p-1.5 text-[9px] text-warning">
                        Pengecualian: {directive.exception}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[9px] italic text-muted-foreground">“{directive.sourceText}”</p>
                  </div>
                ))}
                {preview.analysis.place ? (
                  <div className="rounded-lg border border-border/60 bg-muted/15 p-3">
                    <div className="flex items-center gap-2">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Tempat kegiatan (metadata)
                      </p>
                      <RecBadge variant={preview.analysis.place.confidence === 'low' ? 'warning' : 'outline'}>
                        {preview.analysis.place.confidence === 'low' ? 'perlu verifikasi' : 'terbaca'}
                      </RecBadge>
                    </div>
                    <p className="mt-1 text-[10px]">{preview.analysis.place.value}</p>
                    <p className="text-[9px] text-muted-foreground">{preview.analysis.place.reason}</p>
                  </div>
                ) : null}
                {preview.analysis.reasons.length > 0 ? (
                  <div className="rounded-lg border border-warning/25 bg-warning/5 p-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold text-warning">
                      <ShieldAlert className="h-3.5 w-3.5" /> Perlu perhatian admin
                    </p>
                    <ul className="mt-1.5 space-y-1 text-[9px] leading-relaxed text-muted-foreground">
                      {preview.analysis.reasons.map((reason) => (
                        <li key={reason}>• {reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm">Pesan notifikasi (dapat diedit admin)</CardTitle>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTemplate(preview.template);
                      setTemplateTouched(false);
                      toast.success('Template dikembalikan ke draf tersimpan');
                    }}
                  >
                    Pulihkan
                  </Button>
                </div>
                <CardDescription className="text-[10px]">
                  Satu template untuk semua penerima. Placeholder diganti otomatis per anggota.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Textarea
                  value={template}
                  onChange={(event) => {
                    setTemplate(event.target.value);
                    setTemplateTouched(true);
                  }}
                  className="min-h-[170px] font-mono text-[10px] leading-relaxed"
                />
                <div className="flex flex-wrap gap-1">
                  {SPRIN_NOTIFY_PLACEHOLDERS.map((placeholder) => (
                    <button
                      key={placeholder}
                      type="button"
                      onClick={() => {
                        setTemplate((current) => `${current}${current.endsWith('\n') ? '' : '\n'}${placeholder}`);
                        setTemplateTouched(true);
                      }}
                      className="rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground hover:border-primary/40 hover:text-primary"
                    >
                      {placeholder}
                    </button>
                  ))}
                </div>
                <Button size="sm" variant="secondary" onClick={applyPreview} disabled={loading}>
                  {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Terapkan &amp; pratinjau
                </Button>
              </CardContent>
            </Card>
          </div>

          {preview.requiresReview ? (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold text-warning">
                <ShieldAlert className="h-4 w-4" /> Verifikasi admin diperlukan sebelum kirim
              </p>
              <ul className="mt-2 space-y-1 text-[10px] leading-relaxed text-muted-foreground">
                {preview.reviewReasons.map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>
              <p className="mt-2 text-[9px] text-muted-foreground">
                Periksa lokasi per anggota di tabel bawah, edit pesan bila perlu, lalu isi catatan verifikasi dan
                setujui pengiriman.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-success/25 bg-success/5 p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold text-success">
                <CheckCircle2 className="h-4 w-4" /> Lokasi sudah jelas dan siap dikirim
              </p>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">Penerima dan lokasi per anggota</CardTitle>
                  <CardDescription className="text-[10px]">
                    Klik baris untuk melihat pesan lengkap. Lokasi tugas dan apel dikutip dari Sprin.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-[8px]">{preview.recipients.length} penerima</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[360px] overflow-auto rounded-lg border border-border/60">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="w-10">No</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead className="hidden sm:table-cell">Fungsi</TableHead>
                      <TableHead>Lokasi tugas</TableHead>
                      <TableHead className="hidden lg:table-cell">Lokasi apel</TableHead>
                      <TableHead className="w-16">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.recipients.map((recipient) => (
                      <TableRow
                        key={recipient.personnelId}
                        className={cn(
                          'cursor-pointer',
                          selectedRecipient?.personnelId === recipient.personnelId ? 'bg-primary/5' : ''
                        )}
                        onClick={() => setSelectedRecipient(recipient)}
                      >
                        <TableCell className="font-mono text-[9px] text-muted-foreground">{recipient.no}</TableCell>
                        <TableCell>
                          <p className="text-[10px] font-semibold">{recipient.name}</p>
                          <p className="font-mono text-[8px] text-muted-foreground">{recipient.rankNrp ?? '-'} · {recipient.phone}</p>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline" className="text-[8px]">{recipient.functionName}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[190px]">
                          <p className="line-clamp-2 text-[9px]">{recipient.locationTask}</p>
                          {recipient.locationTaskSource ? (
                            <p className="text-[8px] text-muted-foreground">Sumber: {recipient.locationTaskSource}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="hidden max-w-[240px] lg:table-cell">
                          <p className="whitespace-pre-line text-[9px] leading-relaxed">{recipient.locationApel}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {messageOverrides[recipient.personnelId] ? (
                              <RecBadge variant="info">diedit</RecBadge>
                            ) : null}
                            {recipient.previouslyNotified ? <RecBadge variant="info">sudah</RecBadge> : null}
                            {recipient.issues.length > 0 ? (
                              <RecBadge variant="warning">{recipient.issues.length} cek</RecBadge>
                            ) : (
                              <RecBadge variant="success">ok</RecBadge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {preview.recipients.length === 0 ? (
                  <div className="py-8 text-center text-[10px] text-muted-foreground">
                    Tidak ada penerima pada fungsi terpilih. Periksa fungsi/jabatan atau database nomor HP.
                  </div>
                ) : null}
              </div>

              {selectedRecipient ? (
                <div className="mt-3 rounded-lg border border-border/60 bg-muted/15 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-semibold">{selectedRecipient.name}</p>
                      <Badge variant="outline" className="text-[8px]">{selectedRecipient.functionName}</Badge>
                      {selectedRecipient.previouslyNotified ? <Badge variant="info" className="text-[8px]">Sudah pernah dikirim</Badge> : null}
                      {messageOverrides[selectedRecipient.personnelId] ? (
                        <Badge variant="violet" className="text-[8px]">Diedit admin</Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        onClick={() => {
                          setMessageOverrides((current) => {
                            const next = { ...current };
                            delete next[selectedRecipient.personnelId];
                            return next;
                          });
                          toast.success('Pesan dikembalikan ke template otomatis');
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Otomatis
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        onClick={async () => {
                          await copyText(
                            messageOverrides[selectedRecipient.personnelId] ?? selectedRecipient.generatedMessage
                          );
                          toast.success('Pesan disalin');
                        }}
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" /> Salin
                      </Button>
                    </div>
                  </div>
                  {selectedRecipient.issues.length > 0 ? (
                    <ul className="mt-1.5 space-y-0.5 text-[9px] text-warning">
                      {selectedRecipient.issues.map((issue) => <li key={issue}>• {issue}</li>)}
                    </ul>
                  ) : null}
                  <Textarea
                    value={messageOverrides[selectedRecipient.personnelId] ?? selectedRecipient.generatedMessage}
                    onChange={(event) =>
                      setMessageOverrides((current) => ({
                        ...current,
                        [selectedRecipient.personnelId]: event.target.value
                      }))
                    }
                    className="mt-2 min-h-[190px] font-mono text-[9px] leading-relaxed"
                  />
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    Edit langsung pesan untuk anggota ini. Perubahan disimpan saat menekan <b>Simpan draf</b> atau
                    <b> Kirim</b>. Tombol <b>Otomatis</b> mengembalikan pesan ke hasil template.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSkipped((current) => !current)}>
              {showSkipped ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Lihat yang dilewati ({preview.skipped.length})
            </Button>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void saveDraft()} disabled={saving || sending}>
                {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Simpan draf
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (preview.requiresReview) setConfirmOpen(true);
                  else void doSend();
                }}
                disabled={sending || preview.recipients.length === 0}
              >
                {sending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {preview.requiresReview ? 'Verifikasi & kirim' : 'Kirim notifikasi'}
              </Button>
            </div>
          </div>

          {showSkipped ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">Personel yang tidak dikirimi</CardTitle>
                <CardDescription className="text-[10px]">
                  Termasuk perwira, fungsi lain, tanpa nomor HP, dan yang sudah pernah dinotifikasi.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[260px] overflow-auto rounded border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">No</TableHead>
                        <TableHead>Nama</TableHead>
                        <TableHead>Alasan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.skipped.slice(0, 200).map((row, index) => (
                        <TableRow key={`${row.personnelId}-${row.status}-${index}`}>
                          <TableCell className="font-mono text-[9px]">{row.no}</TableCell>
                          <TableCell className="text-[9px]">{row.name}</TableCell>
                          <TableCell className="text-[9px] text-muted-foreground">{row.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {preview.skipped.length > 200 ? (
                  <p className="mt-2 text-[9px] text-muted-foreground">Menampilkan 200 dari {preview.skipped.length} baris.</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <div className="rounded-lg border border-border/60 bg-muted/15 p-3 text-[9px] leading-relaxed text-muted-foreground">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <Info className="h-3.5 w-3.5" /> Prinsip data
            </p>
            <p className="mt-1">
              Bot tidak mengarang lokasi. Semua lokasi diambil dari teks Sprin (uraian “Untuk”, KET, atau Jabatan).
              Bila teks tidak memuat lokasi yang pasti, pesan menuliskannya apa adanya dan pengiriman otomatis
              ditahan sampai admin memverifikasi.
            </p>
          </div>
        </>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Setujui pengiriman notifikasi?</DialogTitle>
            <DialogDescription>
              Sprin ini memiliki lokasi yang perlu verifikasi admin. Setelah disetujui, pesan akan dikirim ke{' '}
              {preview?.recipients.length ?? 0} anggota fungsi terpilih.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-warning/25 bg-warning/5 p-3">
              <ul className="space-y-1 text-[10px] text-muted-foreground">
                {preview?.reviewReasons.map((reason) => <li key={reason}>• {reason}</li>)}
              </ul>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Catatan verifikasi (opsional)
              </Label>
              <Textarea
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="Contoh: lokasi apel per kelompok sudah sesuai; pengecualian Kejaksaan sudah dicek."
                className="mt-1 min-h-[70px] text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Batal</Button>
            <Button onClick={() => void doSend()} disabled={sending}>
              {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Setujui &amp; kirim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
