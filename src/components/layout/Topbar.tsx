import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, LogOut } from 'lucide-react';
import { IconButton, Input } from '../ui/primitives';
import { ThemeToggle } from '../ui/ThemeToggle';
import { signInWithWorkBuddy, signOut } from '../../services/auth';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../../lib/toast';
import { CLOUD_MODE } from '../../lib/env';

export function Topbar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  }

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-line glass">
      <form onSubmit={submit} className="flex-1 max-w-xl">
        <div className="relative">
          <Search
            size={17}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索动漫（中 / 英 / 罗马音 / 别名）…"
            className="pl-10"
            aria-label="全局搜索"
          />
        </div>
      </form>
      <div className="flex items-center gap-2 ml-auto">
        <IconButton onClick={() => navigate('/search')} title="搜索" className="hidden sm:grid">
          <Search size={18} />
        </IconButton>
        <IconButton title="通知" onClick={() => showToast('当前没有新通知', 'info')}>
          <Bell size={18} />
        </IconButton>
        <ThemeToggle />
        {CLOUD_MODE && (user ? (
          <button
            onClick={() => {
              if (confirm('确定退出登录吗？')) signOut();
            }}
            title={`${user.name ?? '账号'} · 退出登录`}
            className="w-9 h-9 grid place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-accent font-bold hover:bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition"
          >
            {(user.name ?? '我').slice(0, 1)}
          </button>
        ) : (
          <button
            onClick={async () => {
              const r = await signInWithWorkBuddy();
              if (r.error) showToast('登录失败：' + r.error, 'error');
            }}
            className="px-3.5 py-1.5 rounded-lg nav-grad text-white text-sm font-semibold hover:opacity-90 transition"
          >
            登录
          </button>
        ))}
      </div>
    </header>
  );
}
