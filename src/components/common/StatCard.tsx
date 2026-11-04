import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function StatCard({
  label,
  value,
  sub,
  icon,
  gradient = false,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: ReactNode;
  gradient?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('card p-4 flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-muted">{label}</span>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <div
        className={cn(
          'text-2xl font-extrabold leading-none',
          gradient ? 'grad-text' : 'text-ink',
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
