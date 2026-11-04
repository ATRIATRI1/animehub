import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/utils';

// ---------------- Button ----------------
type Variant = 'primary' | 'ghost' | 'soft' | 'danger';
type Size = 'sm' | 'md' | 'lg';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}
const variantCls: Record<Variant, string> = {
  primary: 'nav-grad text-white hover:brightness-110 shadow-[0_6px_18px_rgba(139,92,246,.35)]',
  ghost: 'bg-surface border border-line text-ink hover:border-accent',
  soft: 'bg-elevated text-ink hover:bg-[color-mix(in_srgb,var(--border)_60%,transparent)]',
  danger:
    'text-drop border border-[color-mix(in_srgb,var(--c-drop)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--c-drop)_14%,transparent)]',
};
const sizeCls: Record<Size, string> = {
  sm: 'text-[13px] px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2.5 gap-2',
  lg: 'text-base px-5 py-3 gap-2.5',
};
export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none',
        sizeCls[size],
        variantCls[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------------- IconButton ----------------
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  active?: boolean;
}
export function IconButton({ className, children, active, ...rest }: IconButtonProps) {
  return (
    <button
      className={cn(
        'grid place-items-center rounded-xl w-10 h-10 bg-surface border border-line text-muted transition hover:text-ink hover:border-accent',
        active && 'text-accent border-accent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------------- Card ----------------
export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card p-5', className)} {...rest}>
      {children}
    </div>
  );
}

// ---------------- Input ----------------
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full bg-surface border border-line rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-accent focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]',
          className,
        )}
        {...rest}
      />
    );
  },
);

// ---------------- Switch ----------------
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition',
        checked ? 'nav-grad' : 'bg-elevated border border-line',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
      {label && <span className="sr-only">{label}</span>}
    </button>
  );
}

// ---------------- Segmented ----------------
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex bg-elevated border border-line rounded-xl p-1 gap-1 overflow-x-auto no-scrollbar max-w-full',
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'whitespace-nowrap rounded-lg font-semibold transition',
            size === 'sm' ? 'text-[13px] px-3 py-1.5' : 'text-sm px-4 py-2',
            value === o.value
              ? 'nav-grad text-white shadow'
              : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- ProgressBar ----------------
export function ProgressBar({
  value,
  max,
  className,
  height = 8,
}: {
  value: number;
  max: number;
  className?: string;
  height?: number;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={cn('w-full rounded-full bg-elevated overflow-hidden', className)}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
        }}
      />
    </div>
  );
}

// ---------------- EmptyState ----------------
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && (
        <div className="w-16 h-16 rounded-2xl grid place-items-center bg-elevated border border-line text-muted mb-4">
          {icon}
        </div>
      )}
      <div className="text-lg font-bold text-ink">{title}</div>
      {description && <div className="text-sm text-muted mt-1.5 max-w-sm">{description}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ---------------- DemoBanner ----------------
export function DemoBanner() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line px-3.5 py-2 text-[13px] text-muted bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]">
      <span className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] text-accent px-1.5 py-0.5 font-semibold">
        云端账号
      </span>
      <span>作品均为虚构占位数据，但你的收藏、评分、观看进度与标签已按账号隔离，安全保存在 WorkBuddy 云端，可跨设备同步。</span>
    </div>
  );
}
