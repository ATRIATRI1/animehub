import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  placeholder = '请选择',
  className,
  size = 'md',
}: {
  value: T | '';
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const current = options.find((o) => o.value === value);
  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center justify-between gap-2 rounded-xl border border-line bg-surface text-ink transition hover:border-accent',
          size === 'sm' ? 'px-3 py-1.5 text-[13px]' : 'px-3.5 py-2.5 text-sm',
        )}
      >
        <span className={cn(!current && 'text-muted')}>{current ? current.label : placeholder}</span>
        <ChevronDown
          size={16}
          className={cn('text-muted transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-line bg-surface shadow-card overflow-hidden py-1 max-h-72 overflow-y-auto animate-pop">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between gap-2 px-3.5 py-2 text-sm text-left transition hover:bg-elevated',
                o.value === value ? 'text-accent font-semibold' : 'text-ink',
              )}
            >
              {o.label}
              {o.value === value && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
