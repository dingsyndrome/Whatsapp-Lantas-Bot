import { BarChart3, CalendarClock, ExternalLink, LayoutGrid, Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/sigap/page-header';
import { LinksPage } from '@/src/pages/links';
import { RecapPanel } from '@/src/pages/settings-recap';

/**
 * Menu Rekapitulasi: seluruh kebutuhan rekap data dalam satu tempat.
 * - Rekap link anggota (agregator tautan + kirim ke WhatsApp)
 * - Rekap kustom (tanggal/jam/kategori, fokus roster)
 * - Jadwal rekap (pintasan ke pengaturan otomatis)
 */
export function RekapitulasiPage() {
  return (
    <div className="animate-slide-up space-y-6">
      <PageHeader
        eyebrow="Pelaporan"
        title="Rekapitulasi"
        description="Semua rekap data: link anggota, rekap kustom per tanggal/jam, dan jadwal rekap otomatis."
      />

      <Tabs defaultValue="link" className="space-y-4">
        <TabsList className="h-10 w-full justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="link" className="text-[11px]">
            <Link2 className="h-3.5 w-3.5" /> Rekap Link Anggota
          </TabsTrigger>
          <TabsTrigger value="kustom" className="text-[11px]">
            <LayoutGrid className="h-3.5 w-3.5" /> Rekap Kustom
          </TabsTrigger>
          <TabsTrigger value="jadwal" className="text-[11px]">
            <CalendarClock className="h-3.5 w-3.5" /> Jadwal Rekap
          </TabsTrigger>
        </TabsList>

        <TabsContent value="link" className="mt-0">
          <LinksPage embedded />
        </TabsContent>

        <TabsContent value="kustom" className="mt-0">
          <RecapPanel />
        </TabsContent>

        <TabsContent value="jadwal" className="mt-0">
          <Card>
            <CardHeader className="pb-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="h-4 w-4 text-primary" /> Rekap otomatis harian
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Jam kirim, grup tujuan, dan isi rekap otomatis diatur di Settings → Jadwal Rekap.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-border/60 bg-muted/15 p-3 text-[10px] text-muted-foreground">
                <p className="font-medium text-foreground">Yang diatur di sana:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>Jam pengiriman rekap harian (mis. 21:00)</li>
                  <li>Grup WhatsApp tujuan</li>
                  <li>Rekap mingguan dan pengingat personel</li>
                  <li>Pratinjau teks sebelum dikirim</li>
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to="/settings">
                    <CalendarClock className="h-4 w-4" /> Buka pengaturan jadwal
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/timemark">
                    <BarChart3 className="h-4 w-4" /> Rekap foto Timemark
                  </Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/sprin">
                    <ExternalLink className="h-4 w-4" /> Data Surat Perintah
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
