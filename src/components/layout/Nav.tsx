import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  Radio,
  BarChart3,
  Search as SearchIcon,
  CalendarDays,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const ITEMS: NavItem[] = [
  { to: '/tracker', label: '首页', icon: Radio },
  { to: '/schedule', label: '排期表', icon: CalendarDays },
  { to: '/search', label: '动漫库', icon: SearchIcon },
  { to: '/library', label: '收藏库', icon: LayoutGrid },
  { to: '/stats', label: '统计', icon: BarChart3 },
  { to: '/settings', label: '设置', icon: SettingsIcon },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2.5 pb-5 pt-1">
      <div className="w-8 h-8 rounded-xl nav-grad grid place-items-center text-white font-extrabold text-base shadow-[0_4px_14px_rgba(139,92,246,.4)]">
        A
      </div>
      <span className="font-display font-extrabold text-lg tracking-wide text-ink">
        Anime<span className="grad-text">Hub</span>
      </span>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-line bg-surface sticky top-0 h-screen p-3">
      <Brand />
      <nav className="flex flex-col gap-1.5 mt-1">
        {ITEMS.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition',
                isActive
                  ? 'text-ink bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'
                  : 'text-muted hover:text-ink hover:bg-elevated',
              )
            }
          >
            <it.icon size={19} />
            {it.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto">
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-elevated">
          <div className="w-9 h-9 rounded-full nav-grad shrink-0" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink truncate">我的收藏</div>
            <div className="text-[11px] text-muted truncate">个人版 · 预览</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function BottomNav() {
  const { pathname } = useLocation();
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  return (
    <nav
      data-testid="bottom-nav"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex justify-around items-stretch border-t border-line bg-surface/95 backdrop-blur"
    >
      {ITEMS.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === '/'}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 py-2 px-3 text-[11px] font-medium transition',
            isActive(it.to) ? 'text-accent' : 'text-muted',
          )}
        >
          <it.icon size={21} />
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}
