import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

export interface Palette {
  accent: string;
  accent2: string;
  pop: string;
  plan: string;
  watch: string;
  done: string;
  rewatch: string;
  hold: string;
  drop: string;
  text: string;
  text2: string;
  surface: string;
  border: string;
  base: string;
  series: string[];
}

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const g = (n: string) => s.getPropertyValue(n).trim();
  const accent = g('--accent') || '#8B5CF6';
  const accent2 = g('--accent-2') || '#22D3EE';
  const pop = g('--pop') || '#F472B6';
  return {
    accent,
    accent2,
    pop,
    plan: g('--c-plan') || '#60A5FA',
    watch: g('--c-watch') || '#34D399',
    done: g('--c-done') || '#A78BFA',
    rewatch: g('--c-rewatch') || '#22D3EE',
    hold: g('--c-hold') || '#FBBF24',
    drop: g('--c-drop') || '#F87171',
    text: g('--text') || '#ECECF4',
    text2: g('--text-2') || '#9AA0B4',
    surface: g('--bg-surface') || '#171827',
    border: g('--border') || 'rgba(255,255,255,.08)',
    base: g('--bg-base') || '#0E0F1A',
    series: [accent, accent2, pop, '#34D399', '#FBBF24', '#60A5FA', '#A78BFA'],
  };
}

// 读取当前主题下的设计令牌颜色，供 Recharts 等需要具体颜色的库使用；
// 主题切换时自动重新读取并触发重渲染。
export function useThemeColors(): Palette {
  const { theme } = useTheme();
  const [palette, setPalette] = useState<Palette>(() =>
    typeof window !== 'undefined' ? readPalette() : ({} as Palette),
  );
  useEffect(() => {
    // 等待 data-theme 属性与 CSS 变量应用
    const id = requestAnimationFrame(() => setPalette(readPalette()));
    return () => cancelAnimationFrame(id);
  }, [theme]);
  return palette;
}
