import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export function SectionHeader({
  title,
  subtitle,
  to,
  actionLabel = '查看全部',
  icon,
}: {
  title: string;
  subtitle?: string;
  to?: string;
  actionLabel?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mt-7 mb-3.5 first:mt-0">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className="w-8 h-8 rounded-lg grid place-items-center bg-elevated border border-line text-accent">
            {icon}
          </span>
        )}
        <div>
          <h2 className="font-display font-bold text-[17px] text-ink leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {to && (
        <Link
          to={to}
          className="flex items-center gap-0.5 text-[13px] font-medium text-muted hover:text-accent transition shrink-0"
        >
          {actionLabel}
          <ChevronRight size={15} />
        </Link>
      )}
    </div>
  );
}
