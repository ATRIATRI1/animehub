import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'aurora' | 'sakura';

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({
  theme: 'aurora',
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // 支持 ?theme=aurora|sakura 强制覆盖（用于截图/演示），兼容 HashRouter 下参数位于 hash 内的情况
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    const params = new URLSearchParams(
      qIndex >= 0 ? hash.slice(qIndex + 1) : window.location.search,
    );
    const q = params.get('theme');
    if (q === 'aurora' || q === 'sakura') return q;
    const saved = localStorage.getItem('animehub_theme') as Theme | null;
    return saved ?? 'aurora';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // 仅持久化主题“偏好”，不是数据库——第三阶段接入云端后由用户设置表接管
    localStorage.setItem('animehub_theme', theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggle = () => setThemeState((p) => (p === 'aurora' ? 'sakura' : 'aurora'));

  return <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
