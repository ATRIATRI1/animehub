import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { STATUS_META, type WatchStatus } from '../../lib/utils';

export function StatusDot({ status, size = 9 }: { status: WatchStatus; size?: number }) {
  const m = STATUS_META[status];
  return (
    <span
      className="inline-block rounded-full"
      style={{ width: size, height: size, background: m.colorVar }}
    />
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: WatchStatus;
  className?: string;
}) {
  const m = STATUS_META[status];
  return (
    <span
      className={cn('status-pill', className)}
      style={{
        background: `color-mix(in srgb, ${m.colorVar} 18%, transparent)`,
        color: m.colorVar,
      }}
    >
      {m.label}
    </span>
  );
}

// 评分胶囊（如 8.7）
export function ScoreChip({ score, className }: { score: number | undefined; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold text-white',
        className,
      )}
      style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}
    >
      ★ {typeof score === 'number' ? score.toFixed(1) : '—'}
    </span>
  );
}

export function TagChip({
  label,
  color,
  active,
  onClick,
  onRemove,
  className,
}: {
  label: string;
  color?: string;
  active?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}) {
  const c = color ?? 'var(--accent)';
  return (
    <span
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold border transition cursor-default select-none',
        onClick && 'cursor-pointer',
        className,
      )}
      style={{
        background: active
          ? `color-mix(in srgb, ${c} 22%, transparent)`
          : 'var(--bg-elevated)',
        color: active ? c : 'var(--text-2)',
        borderColor: active ? c : 'var(--border)',
      }}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 opacity-60 hover:opacity-100"
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}
