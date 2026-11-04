import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatRankName } from '@/shared/personnel-name';

export interface PersonnelComboboxOption {
  id: string;
  name: string;
  rank?: string | null;
  nrp?: string | null;
  jabatan?: string | null;
}

interface PersonnelComboboxProps {
  value: string;
  options: PersonnelComboboxOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
}

/**
 * Combobox personel dengan pencarian ketik. Dropdown biasa kurang praktis
 * untuk roster ratusan orang, jadi input ini bisa difilter berdasarkan nama,
 * pangkat, NRP, atau jabatan.
 */
export function PersonnelCombobox({
  value,
  options,
  onChange,
  placeholder = 'Ketik nama / NRP personel…',
  allowEmpty = true,
  emptyLabel = 'Kosongkan / belum cocok',
  className
}: PersonnelComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const blurTimer = React.useRef<number | null>(null);

  const selected = options.find((option) => option.id === value) ?? null;
  const selectedLabel = selected ? formatRankName(selected.rank, selected.name) : '';

  const needle = query.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    const source = needle
      ? options.filter((option) =>
          `${option.name} ${option.rank ?? ''} ${option.nrp ?? ''} ${option.jabatan ?? ''}`
            .toLowerCase()
            .includes(needle)
        )
      : options;
    return source.slice(0, 80);
  }, [needle, options]);

  React.useEffect(
    () => () => {
      if (blurTimer.current) window.clearTimeout(blurTimer.current);
    },
    []
  );

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const select = (id: string) => {
    onChange(id);
    close();
  };

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={open ? query : selectedLabel}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className="h-8 pl-8 pr-8 text-[10px]"
          onFocus={() => {
            if (blurTimer.current) window.clearTimeout(blurTimer.current);
            setOpen(true);
            setQuery('');
          }}
          onBlur={() => {
            blurTimer.current = window.setTimeout(close, 140);
          }}
          onChange={(event) => {
            setOpen(true);
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              close();
              return;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              if (filtered[0]) select(filtered[0].id);
            }
          }}
        />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>

      {open ? (
        <div
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          role="listbox"
        >
          {allowEmpty ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[10px] hover:bg-accent"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select('')}
            >
              <span className="h-3.5 w-3.5 shrink-0" />
              {emptyLabel}
            </button>
          ) : null}
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-[10px] text-muted-foreground">
              Personel tidak ditemukan.
            </p>
          ) : (
            filtered.map((option) => {
              const label = formatRankName(option.rank, option.name);
              const isSelected = option.id === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-accent',
                    isSelected && 'bg-accent/70'
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(option.id)}
                >
                  <Check
                    className={cn(
                      'mt-0.5 h-3.5 w-3.5 shrink-0',
                      isSelected ? 'text-primary' : 'text-transparent'
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[10px] font-medium">{label}</span>
                    <span className="block truncate text-[9px] text-muted-foreground">
                      {[option.nrp ? `NRP ${option.nrp}` : null, option.jabatan]
                        .filter(Boolean)
                        .join(' · ') || 'Tanpa NRP/jabatan'}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
