import { useEffect, useState, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Layout } from './components/layout/Layout';
import { Library } from './pages/Library';
import { AnimeDetail } from './pages/AnimeDetail';
import { Tracker } from './pages/Tracker';
import { Stats } from './pages/Stats';
import { Settings } from './pages/Settings';
import { Search } from './pages/Search';
import { Schedule } from './pages/Schedule';
import { Login } from './pages/Login';
import { initAuth } from './services/auth';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/AuthContext';
import { CatalogProvider } from './hooks/useCatalog';
import { CLOUD_MODE } from './lib/env';

/** 个人数据页（收藏/追番/统计/设置）必须登录；公共资料页（首页/搜索/详情）所有人可访问 */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (CLOUD_MODE && !user) return <Login />;
  return <>{children}</>;
}

export default function App() {
  const [ready, setReady] = useState(!CLOUD_MODE);

  useEffect(() => {
    if (!CLOUD_MODE) {
      setReady(true);
      return;
    }
    let alive = true;
    initAuth().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-base">
        <Loader2 size={28} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <AuthProvider>
      <CatalogProvider>
        <Routes>
          <Route element={<Layout />}>
            {/* 公共资料页：无需登录，所有人可浏览/搜索真实动漫（动漫库/排期表/详情） */}
            {/* 原「首页」已移除，追番页（/tracker）作为新的首页入口 */}
            <Route path="/" element={<Navigate to="/tracker" replace />} />
            <Route path="/search" element={<Search />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/anime/:id" element={<AnimeDetail />} />
            {/* 个人数据页：需登录 */}
            <Route
              path="/library"
              element={
                <RequireAuth>
                  <Library />
                </RequireAuth>
              }
            />
            <Route
              path="/tracker"
              element={
                <RequireAuth>
                  <Tracker />
                </RequireAuth>
              }
            />
            <Route
              path="/stats"
              element={
                <RequireAuth>
                  <Stats />
                </RequireAuth>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireAuth>
                  <Settings />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </CatalogProvider>
    </AuthProvider>
  );
}
