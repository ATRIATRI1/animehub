import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Loader2 } from 'lucide-react';
import { dataAccess } from '../services/dataAccess';
import { useAuth } from '../context/AuthContext';
import type { CollectionWithAnime, WatchHistory } from '../types';
import { PosterCard } from '../components/ui/PosterCard';
import { Button, EmptyState } from '../components/ui/primitives';
import { CLOUD_MODE } from '../lib/env';

export function Home() {
  const { user } = useAuth();
  const [cols, setCols] = useState<CollectionWithAnime[]>([]);
  const [history, setHistory] = useState<WatchHistory[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    // 个人数据按账号隔离（云端 RLS）；匿名访问时各自调用返回空，绝不读取/泄露他人收藏。
    // 每个调用单独 catch，避免任一失败导致整页空白。
    Promise.all([
      dataAccess.getCollections().catch(() => [] as CollectionWithAnime[]),
      dataAccess.getWatchHistory().catch(() => [] as WatchHistory[]),
    ]).then(([c, h]) => {
      if (!alive) return;
      setCols(c);
      setHistory(h);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const watching = useMemo(
    () =>
      cols
        .filter((c) => c.status === 'watching')
        .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
    [cols],
  );

  // 每个作品最近一次观看时间
  const lastWatched = useMemo(() => {
    const m = new Map<string, WatchHistory>();
    for (const h of history) if (!m.has(h.animeId)) m.set(h.animeId, h);
    return m;
  }, [history]);

  const isAnon = CLOUD_MODE && !user;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-extrabold text-2xl text-ink">我的在看</h1>
        <p className="text-sm text-muted mt-1">
          {isAnon ? '登录后查看你的追番进度与继续观看列表。' : '这里展示你正在观看的番剧与进度。'}
        </p>
      </div>

      {!ready ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted">
          <Loader2 size={20} className="animate-spin" /> 加载中…
        </div>
      ) : watching.length === 0 ? (
        <EmptyState
          icon={<Play size={26} />}
          title="还没有正在观看的番剧"
          description="去动漫库挑一部，加入清单开始追番吧。"
          action={
            <Link to="/search">
              <Button>去动漫库</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {watching.map((c, i) => {
            const lw = lastWatched.get(c.animeId);
            return (
              <div key={c.id} className="flex flex-col">
              <PosterCard anime={c.anime} collection={c} index={i} />
                {lw && (
                  <div className="mt-1.5 px-0.5 text-[11px] text-muted truncate">
                    最后观看 {new Date(lw.watchedAt).toLocaleDateString('zh-CN')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
