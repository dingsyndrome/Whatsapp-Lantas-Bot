import {
  Facebook,
  Globe2,
  HardDrive,
  Instagram,
  MapPin,
  MessageCircle,
  Music2,
  Newspaper,
  Twitter,
  Youtube,
  type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PLATFORM_META: Record<string, { icon: LucideIcon; className: string }> = {
  Instagram: { icon: Instagram, className: 'bg-pink-500/12 text-pink-400 border-pink-500/20' },
  TikTok: { icon: Music2, className: 'bg-slate-200/10 text-slate-200 border-slate-300/15' },
  Facebook: { icon: Facebook, className: 'bg-blue-500/12 text-blue-400 border-blue-500/20' },
  YouTube: { icon: Youtube, className: 'bg-red-500/12 text-red-400 border-red-500/20' },
  'X / Twitter': { icon: Twitter, className: 'bg-sky-500/12 text-sky-400 border-sky-500/20' },
  'Google Drive': { icon: HardDrive, className: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20' },
  'Google Maps': { icon: MapPin, className: 'bg-rose-500/12 text-rose-400 border-rose-500/20' },
  'Portal Berita': { icon: Newspaper, className: 'bg-orange-500/12 text-orange-400 border-orange-500/20' },
  WhatsApp: { icon: MessageCircle, className: 'bg-green-500/12 text-green-400 border-green-500/20' },
  Website: { icon: Globe2, className: 'bg-violet-500/12 text-violet-400 border-violet-500/20' }
};

export function PlatformIcon({
  platform,
  className,
  withLabel = false
}: {
  platform: string;
  className?: string;
  withLabel?: boolean;
}) {
  const meta = PLATFORM_META[platform] ?? PLATFORM_META.Website!;
  const Icon = meta.icon;
  if (withLabel) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold',
          meta.className,
          className
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {platform}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg border',
        meta.className,
        className
      )}
      title={platform}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

export { PLATFORM_META };
