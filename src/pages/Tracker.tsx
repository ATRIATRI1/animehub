import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Radio, CalendarClock, History, ChevronLeft, ChevronRight } from 'lucide-react';
import { dataAccess } from '../services/dataAccess';
import { useReload } from '../hooks/useReload';
import type { CollectionWithAnime, WatchHistory } from '../types';
import {
  getSeasonFromDate,
  SEASON_LABEL,
  WEEKDAYS,
  latestAiredEpisode,
  nextAirDate,
  airedThisWeek,
} from '../lib/utils';
import { sourceIdToRoute } from '../services/anilist';
import { useCatalog, resolveZhTitle } from '../hooks/useCatalog';
import { Card, Button, Segmented } from '../components/ui/primitives';
import { PosterCard } from '../components/ui/PosterCard';
import { Countdown } from '../components/ui/Countdown';
import { EmptyState } from '../components/ui/primitives';

const SEASON_ORDER: ('WINTER' | 'SPRING' | 'SUMMER' | 'FALL')[] = [
  'WINTER',
  'SPRING',
  'SUMMER',
  'FALL',
];
function shiftSeason(season: string, year: number, delta: number) {
  let idx = SEASON_ORDER.indexOf(season as never) + delta;
  let y = year + Math.floor(idx / 4);
  idx = ((idx % 4) + 4) % 4;
  return { season: SEASON_ORDER[idx], year: y };
}

export function Tracker() {
  const reload = useReload();
  const [cols, setCols] = useState<CollectionWithAnime[]>([]);
  const [history, setHistory] = useState<WatchHistory[]>([]);

  const cur = useMemo(() => getSeasonFromDate(), []);
  const [seasonSel, setSeasonSel] = useState({ season: cur.season, year: cur.year });
  const [weekday, setWeekday] = useState<number | 'all'>('all');

  useEffect(() => {
    let alive = true;
    Promise.all([dataAccess.getCollections(), dataAccess.getWatchHistory()]).then(([c, h]) => {
      if (!alive) return;
      setCols(c);
      setHistory(h);
    });
    return () => {
      alive = false;
    };
  }, [reload]);

  const seasonLabel = `${seasonSel.year} ${SEASON_LABEL[seasonSel.season]}`;

  // 本季放送：用户收藏中处于连载状态的番剧
  const airing = useMemo(
    () =>
      cols.filter((c) => c.anime.status === 'RELEASING' && c.anime.airDay !== undefined),
    [cols],
  );

  const calendar = useMemo(
    () =>
      airing
        .filter((c) => (weekday === 'all' ? true : c.anime.airDay === weekday))
        .sort((a, b) => (a.anime.airDay ?? 0) - (b.anime.airDay ?? 0)),
    [airing, weekday],
  );

  // 我追的新番（连载中且有播出信息）：用于「接下来更新」「本周已更」两个围绕新番的板块。
  const myReleasing = useMemo(
    () => cols.filter((c) => c.anime.status === 'RELEASING' && c.anime.nextAiringEpisode),
    [cols],
  );

  // 接下来更新：按「下一次播出时间」升序排列（精确到秒），最近的先更。
  const upcoming = useMemo(() => {
    return myReleasing
      .map((c) => ({ c, next: nextAirDate(c.anime)! }))
      .filter((x) => x.next.getTime() > Date.now())
      .sort((a, b) => a.next.getTime() - b.next.getTime());
  }, [myReleasing]);

  // 本周已更：本周内已播出的最新一集（按播出时间倒序，最近先显示）。
  const weeklyAired = useMemo(() => {
    return myReleasing
      .map((c) => {
        const info = airedThisWeek(c.anime);
        return info ? { c, info } : null;
      })
      .filter((x): x is { c: CollectionWithAnime; info: { episode: number; airedAt: Date } } => x != null)
      .sort((a, b) => b.info.airedAt.getTime() - a.info.airedAt.getTime());
  }, [myReleasing]);

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: WatchHistory[] = [];
    for (const h of history) {
      if (!seen.has(h.animeId)) {
        seen.add(h.animeId);
        out.push(h);
      }
      if (out.length >= 8) break;
    }
    return out
      .map((h) => ({ h, c: cols.find((x) => x.animeId === h.animeId) }))
      .filter((x) => x.c) as { h: WatchHistory; c: CollectionWithAnime }[];
  }, [history, cols]);

  // 消费目录版本号：Bangumi 中文索引加载完成后触发本页重渲染，使标题切换为中文
  const { version: catalogVersion } = useCatalog();
  void catalogVersion;

  const weekOptions = [
    { value: 'all' as const, label: '全部' },
    ...WEEKDAYS.map((label, i) => ({ value: i as number, label })),
  ];

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-ink flex items-center gap-2">
            <Radio size={22} className="text-accent" /> 首页
          </h1>
          <p className="text-sm text-muted mt-1">我的追番 · {seasonLabel}档放送日历</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="w-9 h-9 grid place-items-center rounded-xl border border-line bg-surface text-muted hover:text-ink"
            onClick={() => setSeasonSel((s) => shiftSeason(s.season, s.year, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="px-2 font-semibold text-ink min-w-[120px] text-center">{seasonLabel}</span>
          <button
            className="w-9 h-9 grid place-items-center rounded-xl border border-line bg-surface text-muted hover:text-ink"
            onClick={() => setSeasonSel((s) => shiftSeason(s.season, s.year, 1))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* 接下来更新：我追的新番，按实际播出时间排序，精确到秒 */}
      <h2 className="font-display font-bold text-lg text-ink mt-7 mb-3 flex items-center gap-2">
        <CalendarClock size={18} className="text-accent2" /> 接下来更新
      </h2>
      {upcoming.length === 0 ? (
        <Card className="text-sm text-muted">暂无正在连载、且已知播出时间的新番，去动漫库追更多作品吧。</Card>
      ) : (
        <div className="space-y-3">
          {upcoming.map(({ c, next }) => {
            const latest = latestAiredEpisode(c.anime);
            return (
              <Link
                key={c.id}
                to={`/anime/${sourceIdToRoute(c.anime.id)}`}
                className="flex items-center gap-4 p-3 rounded-2xl border border-line bg-surface hover:border-accent transition"
              >
                <div
                  className="w-12 h-16 rounded-lg shrink-0 bg-cover bg-center"
                  style={
                    c.anime.coverImageUrl
                      ? { backgroundImage: `url(${c.anime.coverImageUrl})` }
                      : { background: c.anime.coverGradient }
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink truncate">{resolveZhTitle(c.anime)}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {latest != null ? `最新集 第 ${latest} 集` : '最新集 —'} / {c.anime.episodes} 集
                  </div>
                </div>
                <div className="text-right shrink-0 w-32">
                  <div className="text-xs text-muted">下次更新</div>
                  <div className="font-semibold text-ink text-sm">最新集 {latest != null ? `第 ${latest} 集` : '—'}</div>
                  <div className="text-[11px] text-accent2 mt-0.5">
                    {c.anime.airDay !== undefined && (
                      <Countdown airDay={c.anime.airDay} airTime={c.anime.airTime} compact />
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* 本周已更：我追的新番本周内已播出的集数 */}
      <h2 className="font-display font-bold text-lg text-ink mt-7 mb-3 flex items-center gap-2">
        <History size={18} className="text-accent" /> 本周已更
      </h2>
      {weeklyAired.length === 0 ? (
        <Card className="text-sm text-muted">本周还没有已更新的追番，新的一集快来啦。</Card>
      ) : (
        <div className="space-y-3">
          {weeklyAired.map(({ c, info }) => (
            <Link
              key={c.id}
              to={`/anime/${sourceIdToRoute(c.anime.id)}`}
              className="flex items-center gap-4 p-3 rounded-2xl border border-line bg-surface hover:border-accent transition"
            >
              <div
                className="w-12 h-16 rounded-lg shrink-0 bg-cover bg-center"
                style={
                  c.anime.coverImageUrl
                    ? { backgroundImage: `url(${c.anime.coverImageUrl})` }
                    : { background: c.anime.coverGradient }
                }
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ink truncate">{resolveZhTitle(c.anime)}</div>
                <div className="text-xs text-muted mt-0.5">
                  本周已更 第 {info.episode} 集
                </div>
              </div>
              <div className="text-right shrink-0 w-32">
                <div className="text-xs text-muted">已更新于</div>
                <div className="font-semibold text-ink text-sm">
                  {info.airedAt.getMonth() + 1}/{info.airedAt.getDate()}
                </div>
                <div className="text-[11px] text-accent2 mt-0.5">
                  {String(info.airedAt.getHours()).padStart(2, '0')}:
                  {String(info.airedAt.getMinutes()).padStart(2, '0')}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 星期放送日历 */}
      <h2 className="font-display font-bold text-lg text-ink mt-7 mb-3">星期放送日历</h2>
      <Segmented
        value={String(weekday)}
        onChange={(v) => setWeekday(v === 'all' ? 'all' : Number(v))}
        options={weekOptions.map((o) => ({ value: String(o.value), label: o.label }))}
        className="mb-4 w-full sm:w-auto"
      />
      {calendar.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={26} />}
          title="该时段暂无放送"
          description="切换星期或季度查看其他作品的更新安排。"
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {calendar.map((c, i) => (
            <PosterCard key={c.id} anime={c.anime} collection={c} index={i} />
          ))}
        </div>
      )}

      {/* 最近观看记录 */}
      <h2 className="font-display font-bold text-lg text-ink mt-7 mb-3 flex items-center gap-2">
        <History size={18} className="text-accent" /> 最近观看记录
      </h2>
      <div className="space-y-2">
        {recent.map(({ h, c }) => (
          <Link
            key={h.id}
            to={`/anime/${sourceIdToRoute(c.anime.id)}`}
            className="flex items-center gap-3 p-2.5 rounded-xl border border-line bg-surface hover:border-accent transition"
          >
            <div
              className="w-9 h-12 rounded-lg shrink-0"
              style={{ background: c.anime.coverGradient }}
            />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink truncate text-sm">{resolveZhTitle(c.anime)}</div>
              <div className="text-xs text-muted">第 {h.episode} 集</div>
            </div>
            <div className="text-xs text-muted shrink-0">
              {new Date(h.watchedAt).toLocaleDateString('zh-CN')}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
