import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Loader2, AlertTriangle, Star, ChevronLeft, ChevronRight, Tv } from 'lucide-react';
import { getAiringSchedule, RateLimitError, sourceIdToRoute, type AiringEntry } from '../services/anilist';
import { dataAccess } from '../services/dataAccess';
import { useAuth } from '../context/AuthContext';
import { WEEKDAYS, cn } from '../lib/utils';
import { Segmented, EmptyState } from '../components/ui/primitives';
import { ScoreChip } from '../components/ui/Badge';
import { CoverImage } from '../components/ui/CoverImage';
import { useZhTitle } from '../hooks/useCatalog';

// 星期顺序：周一 → 周日（中文习惯）。getDay() 返回 0=周日，故 DAY_ORDER=[1,2,3,4,5,6,0]。
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type LoadStatus = 'loading' | 'done' | 'error';
type MineFilter = 'all' | 'mine';

// ---------------------------------------------------------------------------
// 时区处理：日本电视台播出时间以「日本当地时间 (JST, UTC+9)」为基准。
// 技巧：把 UTC 毫秒 +9h 后当作 UTC 读取，其 UTC 字段即等于 JST 墙上时间。
// ---------------------------------------------------------------------------
const JST_SHIFT = 9 * 3600 * 1000;
function jst(ms: number): Date {
  return new Date(ms + JST_SHIFT);
}
function jstWeekday(ms: number): number {
  return jst(ms).getUTCDay(); // 0=周日
}
function sameJstDay(msA: number, msB: number): boolean {
  const a = jst(msA);
  const b = jst(msB);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** 以「JST 周一 00:00」为起点的整周秒级窗口（用于 AniList airingAt 过滤） */
function weekWindow(offsetWeeks: number) {
  const cur = jst(Date.now());
  const day = cur.getUTCDay(); // 0=周日
  const back = day === 0 ? 6 : day - 1; // 距本周一的天数
  const mon = new Date(
    Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate() - back, 0, 0, 0),
  );
  mon.setUTCDate(mon.getUTCDate() + offsetWeeks * 7);
  const startMs = mon.getTime();
  const endMs = startMs + 7 * 24 * 3600 * 1000;
  const fmt = (ms: number) => {
    const d = jst(ms);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  };
  return {
    startSec: Math.floor(startMs / 1000),
    endSec: Math.floor(endMs / 1000),
    label: `${fmt(startMs)} – ${fmt(endMs - 1000)}`,
  };
}

/** 今天的日期文案（如「11月2日 · 周一」），以 JST 为准 */
function todayLabel(): string {
  const d = jst(Date.now());
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 · ${WEEKDAYS[d.getUTCDay()]}`;
}

/** 相对时间 + 更新倒计时（均 JST）。future 表示尚未播出。 */
interface RelInfo {
  text: string; // 徽标：已更新 / 今天 HH:MM / 明天 HH:MM / 周X HH:MM
  future: boolean;
  countdown: string; // 精确倒计时：已更新 / X 分钟后 / X 小时后 / X 天后
}
function relLabel(sec: number, nowMs: number): RelInfo {
  const dt = jst(sec * 1000);
  const hh = String(dt.getUTCHours()).padStart(2, '0');
  const mm = String(dt.getUTCMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;
  const wd = WEEKDAYS[dt.getUTCDay()];
  const diff = sec * 1000 - nowMs;

  if (diff <= 0) return { text: '已更新', future: false, countdown: '' };

  const dayStart = (ms: number) => {
    const d = jst(ms);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  };
  const diffDays = Math.round((dayStart(sec * 1000) - dayStart(nowMs)) / 86400000);
  let text: string;
  if (diffDays === 0) text = `今天 ${time}`;
  else if (diffDays === 1) text = `明天 ${time}`;
  else text = `${wd} ${time}`;

  // 倒计时只在「今天 / 明天」显示，后天起不显示（保持卡片简洁）
  let countdown = '';
  if (diffDays <= 1) {
    const mins = Math.floor(diff / 60000);
    if (mins < 60) countdown = `${Math.max(1, mins)} 分钟后`;
    else if (mins < 1440) countdown = `${Math.floor(mins / 60)} 小时后`;
    else countdown = `${Math.floor(mins / 1440)} 天后`;
  }

  return { text, future: true, countdown };
}

export function Schedule() {
  const { user } = useAuth();
  const [offset, setOffset] = useState(0);
  const [entries, setEntries] = useState<AiringEntry[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [mine, setMine] = useState<MineFilter>('all');
  const [myIds, setMyIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());

  const win = useMemo(() => weekWindow(offset), [offset]);

  // 整周拉取
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    setErrorMsg('');
    getAiringSchedule(win.startSec, win.endSec)
      .then((es) => {
        if (alive) {
          setEntries(es);
          setStatus('done');
        }
      })
      .catch((e) => {
        if (!alive) return;
        setStatus('error');
        setErrorMsg(e instanceof RateLimitError ? e.message : '排期加载失败，请稍后重试');
      });
    return () => {
      alive = false;
    };
  }, [win.startSec, win.endSec]);

  // 我的追番
  useEffect(() => {
    let alive = true;
    dataAccess
      .getCollections()
      .then((cols) => {
        if (!alive) return;
        const ids = new Set(
          cols
            .filter((c) => c.status === 'watching' || c.status === 'planning' || c.status === 'rewatching')
            .map((c) => c.animeId),
        );
        setMyIds(ids);
      })
      .catch(() => {
        /* 匿名/失败：保持空集 */
      });
    return () => {
      alive = false;
    };
  }, [user]);

  // 定时刷新相对时间/倒计时（10s 一次，让「分钟后」与游标跳动更跟手）
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  // 去重
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    const out: AiringEntry[] = [];
    for (const e of entries) {
      const k = `${e.anime.id}-${e.airingAt}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
    return out;
  }, [entries]);

  // 仅我的追番过滤
  const visible = useMemo(() => {
    if (mine === 'mine' && myIds.size > 0) return deduped.filter((e) => myIds.has(e.anime.id));
    if (mine === 'mine') return [];
    return deduped;
  }, [deduped, mine, myIds]);

  const jstToday = jstWeekday(now); // 0=周日
  const todayPos = DAY_ORDER.indexOf(jstToday); // 今天在 DAY_ORDER 的位置

  // 按 JST 星期分桶（整周 7 天，含已播与未播）
  const weekByDay = useMemo(() => {
    const buckets: AiringEntry[][] = Array.from({ length: 7 }, () => []);
    for (const e of visible) {
      buckets[jstWeekday(e.airingAt * 1000)].push(e);
    }
    buckets.forEach((arr) => arr.sort((a, b) => a.airingAt - b.airingAt));
    return buckets;
  }, [visible]);

  // ① 今日播放：今天 JST 全天（已播 + 待播），按时间升序
  const todayEntries = useMemo(() => weekByDay[jstToday], [weekByDay, jstToday]);

  // ② 即将播放：明天及之后（正序），不含今天
  const futureDays = DAY_ORDER.slice(todayPos + 1);
  const upcomingGroups = useMemo(
    () => futureDays.map((d) => ({ d, list: weekByDay[d] })).filter((g) => g.list.length > 0),
    [weekByDay, futureDays],
  );

  // ③ 本周已更：今天已播（最近）+ 之前星期（倒序，最近在前）
  const airedGroups = useMemo(() => {
    const airedToday = todayEntries.filter((e) => e.airingAt * 1000 <= now);
    const pastDays = DAY_ORDER.slice(0, todayPos).reverse();
    const groups: { d: number; list: AiringEntry[] }[] = [];
    if (airedToday.length) groups.push({ d: jstToday, list: airedToday });
    for (const d of pastDays) {
      if (weekByDay[d].length) groups.push({ d, list: weekByDay[d] });
    }
    return groups;
  }, [todayEntries, weekByDay, jstToday, todayPos, now]);

  const dayCounts = useMemo(() => weekByDay.map((arr) => arr.length), [weekByDay]);

  const total = visible.length;
  const todayCount = todayEntries.length;

  // 星期导航点击 → 平滑滚动到对应板块
  function scrollToDay(d: number) {
    let id: string;
    if (d === jstToday) id = 'today-section';
    else if (DAY_ORDER.indexOf(d) > todayPos) id = `upcoming-${d}`; // 未来 → 即将播放
    else id = `aired-${d}`; // 过去 → 本周已更
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="space-y-4">
      {/* 标题 + 工具 */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-ink flex items-center gap-2">
            <CalendarDays size={22} className="text-accent" /> 放送排期表
          </h1>
          <p className="text-sm text-muted mt-1">
            按日本当地时间（JST）展示本周番剧播出安排（数据来自 AniList，播出时间为日本电视台时间）。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Segmented<string>
            size="sm"
            value={mine}
            onChange={(v) => setMine(v as MineFilter)}
            options={[
              { value: 'all', label: '全部放送' },
              { value: 'mine', label: '仅我的追番' },
            ]}
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="上一周"
              className="w-9 h-9 grid place-items-center rounded-xl border border-line bg-surface text-muted hover:text-ink"
              onClick={() => setOffset((o) => o - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <span className="px-2 font-semibold text-ink min-w-[120px] text-center text-sm">{win.label}</span>
            <button
              type="button"
              aria-label="下一周"
              className="w-9 h-9 grid place-items-center rounded-xl border border-line bg-surface text-muted hover:text-ink"
              onClick={() => setOffset((o) => o + 1)}
            >
              <ChevronRight size={18} />
            </button>
            {offset !== 0 && (
              <button type="button" className="ml-1 text-xs text-accent hover:underline" onClick={() => setOffset(0)}>
                回到本周
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 星期导航：吸顶；点击周几跳转对应板块（未来→即将播放，过去→本周已更，今天→今日播放） */}
      <div className="sticky top-[64px] z-20 -mx-1 px-1 py-1.5 bg-[color-mix(in_srgb,var(--bg-base)_90%,transparent)] backdrop-blur-md">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar rounded-2xl border border-line bg-surface p-1.5">
          {DAY_ORDER.map((d) => {
            const isToday = d === jstToday;
            const count = dayCounts[d];
            const disabled = count === 0 && !isToday;
            return (
              <button
                key={d}
                type="button"
                onClick={() => !disabled && scrollToDay(d)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition',
                  isToday
                    ? 'nav-grad text-white shadow-card'
                    : disabled
                      ? 'text-muted/50 cursor-default'
                      : 'text-muted hover:text-ink hover:bg-elevated',
                )}
              >
                <span className={cn(isToday ? 'text-white' : 'text-ink')}>{WEEKDAYS[d]}</span>
                <span className={cn('text-xs', isToday ? 'text-white/85' : 'text-muted')}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {status === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-20 text-muted">
          <Loader2 size={20} className="animate-spin" /> 正在加载本周排期…
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center justify-center gap-2 py-20 text-pop">
          <AlertTriangle size={20} /> {errorMsg}
        </div>
      )}

      {status === 'done' && total === 0 && (
        <EmptyState
          icon={<Tv size={26} />}
          title={mine === 'mine' ? '你的追番本周暂无更新' : '本周暂无放送数据'}
          description={
            mine === 'mine' ? '去动漫库挑一部加入追番，开播时会在这里提醒你。' : '换个星期看看其他时段的播出安排。'
          }
          action={
            mine === 'mine' ? (
              <Link to="/search">
                <button className="px-4 py-2.5 rounded-xl nav-grad text-white text-sm font-semibold">去动漫库</button>
              </Link>
            ) : (
              <button
                className="px-4 py-2.5 rounded-xl border border-line bg-surface text-sm font-semibold text-ink hover:border-accent"
                onClick={() => setOffset(0)}
              >
                回到本周
              </button>
            )
          }
        />
      )}

      {status === 'done' && total > 0 && (
        <div className="space-y-5">
          {/* ① 今日播放 · TODAY（粉色主模块，含进度线） */}
          <section
            id="today-section"
            className="scroll-mt-[140px] rounded-2xl border border-[color-mix(in_srgb,var(--accent)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] p-4"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--pop)]" />
                <h2 className="font-display font-extrabold text-xl text-ink">今日播放</h2>
                <span className="text-sm text-muted">{todayLabel()}</span>
              </div>
              <span className="text-sm font-semibold text-accent">{todayCount > 0 ? `${todayCount} 番更新` : '暂无'}</span>
            </div>

            {todayCount === 0 ? (
              <div className="py-6 text-center text-sm text-muted">今天暂无番剧播出。</div>
            ) : (
              <div className="hscroll pb-1">
                <div className="flex flex-col gap-2 min-w-max">
                  <div className="flex gap-3">
                    {todayEntries.map((e) => (
                      <AiringCard key={`${e.anime.id}-${e.airingAt}`} entry={e} isMine={myIds.has(e.anime.id)} now={now} />
                    ))}
                  </div>
                  {/* 今日进度线（在番剧下方，刻度点与卡片对齐，游标夹在已更/待更之间） */}
                  <TodayTimeline entries={todayEntries} now={now} />
                </div>
              </div>
            )}
          </section>

          {/* ② 即将播放 · UPCOMING（明天起正序） */}
          {upcomingGroups.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-display font-extrabold text-xl text-ink">即将播放</h2>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full border border-line bg-elevated text-muted">
                  UPCOMING
                </span>
              </div>
              <div className="space-y-3">
                {upcomingGroups.map(({ d, list }) => (
                  <section
                    key={d}
                    id={`upcoming-${d}`}
                    className="scroll-mt-[140px] flex gap-4 rounded-2xl border border-line bg-surface p-4"
                  >
                    <div className="w-14 sm:w-16 shrink-0 flex flex-col gap-0.5">
                      <span className="font-display font-extrabold text-lg text-ink">{WEEKDAYS[d]}</span>
                      <span className="text-xs text-muted">{list.length} 部</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="hscroll flex gap-3 pb-1">
                        {list.map((e) => (
                          <AiringCard key={`${e.anime.id}-${e.airingAt}`} entry={e} isMine={myIds.has(e.anime.id)} now={now} />
                        ))}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </section>
          )}

          {/* ③ 本周已更 · AIRED（已播出内容，最近更新倒序，最下面） */}
          {airedGroups.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-display font-extrabold text-xl text-ink">本周已更</h2>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full border border-line bg-elevated text-muted">
                  AIRED
                </span>
              </div>
              <div className="space-y-3">
                {airedGroups.map(({ d, list }) => {
                  const label = d === jstToday ? '今天' : WEEKDAYS[d];
                  const id = d === jstToday ? 'aired-today' : `aired-${d}`;
                  return (
                    <section
                      key={id}
                      id={id}
                      className="scroll-mt-[140px] flex gap-4 rounded-2xl border border-line bg-surface p-4"
                    >
                      <div className="w-14 sm:w-16 shrink-0 flex flex-col gap-0.5">
                        <span className="font-display font-extrabold text-lg text-ink">{label}</span>
                        <span className="text-xs text-muted">{list.length} 部</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="hscroll flex gap-3 pb-1">
                          {list.map((e) => (
                            <AiringCard key={`${e.anime.id}-${e.airingAt}`} entry={e} isMine={myIds.has(e.anime.id)} now={now} />
                          ))}
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 今日进度线：位于番剧卡片下方，横向时间轴。
 * - 每个今天播出的番 = 一个刻度点（已播实心 / 待播空心），与上方卡片一一对齐
 * - 游标（小突起）标记「现在」，夹在「最后已播」与「下一待播」之间的缝隙，
 *   随 now 每 10s 刷新，自动跳到下一组缝隙
 */
function TodayTimeline({ entries, now }: { entries: AiringEntry[]; now: number }) {
  const sorted = useMemo(() => [...entries].sort((a, b) => a.airingAt - b.airingAt), [entries]);
  // 已播数量：游标夹在「最后已播」与「下一待播」之间的缝隙
  const airedCount = sorted.filter((e) => e.airingAt * 1000 <= now).length;

  return (
    <div className="relative flex gap-3" data-testid="today-timeline">
      {sorted.map((e, i) => {
        const aired = e.airingAt * 1000 <= now;
        const isLastAired = aired && i === airedCount - 1;
        return (
          <div key={`${e.anime.id}-${e.airingAt}`} className="relative h-7 w-[120px] sm:w-[140px] shrink-0">
            {/* 轨道段：向两侧各延伸半个 gap，连成连续直线 */}
            <div
              className="absolute -left-1.5 -right-1.5 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
              style={{ background: aired ? 'var(--accent)' : 'color-mix(in srgb, var(--line) 70%, transparent)' }}
            />
            {/* 刻度点（与上方卡片中心对齐） */}
            <div
              className={cn(
                'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full',
                aired
                  ? 'w-2.5 h-2.5 bg-white border-2 border-[var(--accent)]'
                  : 'w-2 h-2 bg-[var(--accent)]/25 border border-[var(--accent)]',
              )}
            />
            {/* 现在游标：夹在最后已播与下一待播之间的缝隙，随 now 自动跳到下一组 */}
            {isLastAired && (
              <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-10" style={{ left: 'calc(100% + 6px)' }}>
                <div className="w-3.5 h-3.5 rounded-full bg-[var(--pop)] ring-2 ring-white shadow-card" />
              </div>
            )}
          </div>
        );
      })}
      {/* 今天尚无已播时，游标置于最左（第一张卡之前） */}
      {airedCount === 0 && sorted.length > 0 && (
        <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="w-3.5 h-3.5 rounded-full bg-[var(--pop)] ring-2 ring-white shadow-card" />
        </div>
      )}
    </div>
  );
}

/**
 * 排期竖版卡片：上方 2:3 海报（右上评分、左下集数「第 N 集」、追番星标），
 * 下方中文标题 + 播放时间（今天/明天/周X HH:MM）+ 倒计时（仅今天/明天）。
 * 已播显示「已更新」，未播显示「X 分钟/小时/天后」（后天起不显示倒计时）。
 */
function AiringCard({ entry, isMine, now }: { entry: AiringEntry; isMine: boolean; now: number }) {
  const a = entry.anime;
  const zh = useZhTitle(a.anilistId, a.titleNative);
  const title = zh || a.titleChinese || a.titleRomaji || a.titleNative;
  const { text, future, countdown } = relLabel(entry.airingAt, now);

  return (
    <Link to={`/anime/${sourceIdToRoute(a.id)}`} className="group w-[120px] sm:w-[140px] shrink-0">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden border border-line bg-surface">
        <CoverImage anime={a} className="h-full w-full" />
        {(a.averageScore ?? 0) > 0 && <ScoreChip score={a.averageScore} className="absolute top-1.5 right-1.5" />}
        {isMine && (
          <span className="absolute top-1.5 left-1.5">
            <Star size={12} className="text-[#fbbf24]" fill="currentColor" aria-label="我的追番" />
          </span>
        )}
        {entry.episode > 0 && (
          <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/55 text-white/90 backdrop-blur-sm">
            第 {entry.episode} 集
          </span>
        )}
      </div>
      <div className="mt-1.5 px-0.5">
        <div className="text-xs font-semibold text-ink leading-snug line-clamp-1 group-hover:text-accent transition" title={title}>
          {title}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className={cn('text-[10px] font-semibold truncate', future ? 'text-ink' : 'text-muted')}>{text}</span>
          {countdown && <span className="text-[10px] font-semibold text-accent shrink-0">{countdown}</span>}
        </div>
      </div>
    </Link>
  );
}
