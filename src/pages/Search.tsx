import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { browseAnime, getRecentlyUpdated, RateLimitError } from '../services/anilist';
import { enrichChineseTitles } from '../services/bangumi';
import type { Anime } from '../types';
import { PosterCard } from '../components/ui/PosterCard';
import { FilterBar } from '../components/common/FilterBar';
import { FilteredPager } from '../lib/pager';
import {
  toBrowseFilters,
  makeExcludeSeasonFilter,
  shouldExcludeCurrentSeason,
  DEFAULT_FILTERS,
  type LibraryFilterState,
} from '../lib/filters';

type Status = 'idle' | 'loading' | 'done' | 'error';

// 「最近更新」整段列表只需拉取一次（内部按页取完并缓存），之后由分页器在本地切片分页。
// 关键词存在时改走 browseAnime（浏览接口支持关键词检索）。
// 数据源：getRecentlyUpdated 返回「当前仍在连载(RELEASING)」的日本 TV 动画，按开播时间倒序。
let recentListCache: { promise: Promise<Anime[]> } | null = null;
function getRecentList(): Promise<Anime[]> {
  if (recentListCache) return recentListCache.promise;
  const promise = getRecentlyUpdated().catch(() => [] as Anime[]);
  recentListCache = { promise };
  return promise;
}

// 响应式列数（与下方 grid 断点保持严格一致，供「整行加载」按列数取整）
function gridColumns(width: number): number {
  if (width >= 1280) return 7;
  if (width >= 1024) return 6;
  if (width >= 768) return 5;
  if (width >= 640) return 4;
  return 3;
}

function useColumns() {
  const [cols, setCols] = useState(() => gridColumns(window.innerWidth));
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setCols(gridColumns(window.innerWidth)));
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
    };
  }, []);
  return cols;
}

export function Search() {
  const [params] = useSearchParams();
  // 关键词完全由顶部搜索框 / URL 提供（?q=），页面不再内置搜索框
  const query = params.get('q') ?? '';
  const [filters, setFilters] = useState<LibraryFilterState>(DEFAULT_FILTERS);
  const [items, setItems] = useState<Anime[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  // 中文标题批量补全：Bangumi 命中后回写（无可靠中文标题时），不覆盖已有中文
  const [zhTitleMap, setZhTitleMap] = useState<Map<string, string>>(new Map());
  const pagerRef = useRef<FilteredPager | null>(null);
  const cols = useColumns();
  // 「整行加载」：当前应展示的作品数（始终为整行数的倍数），滚动到底自动 +1 行
  const [visibleCount, setVisibleCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // 关键词（防抖后）或筛选条件变化 → 重建分页补偿器（自动 reset 分页 + 去重集合）并拉取首屏
  useEffect(() => {
    let alive = true;
    const keyword = query.trim();
    const isRecent = filters.sort === 'RECENT_UPDATE' && !keyword;

    const fetcher = isRecent
      ? async (page: number, perPage: number) => {
          const all = await getRecentList();
          const start = (page - 1) * perPage;
          const slice = all.slice(start, start + perPage);
          return {
            items: slice,
            hasNext: start + slice.length < all.length,
            total: all.length,
            page,
          };
        }
      : (page: number, perPage: number) =>
          browseAnime({ ...toBrowseFilters(filters), query: keyword || undefined }, page, perPage);

    const pager = new FilteredPager(
      fetcher,
      makeExcludeSeasonFilter(shouldExcludeCurrentSeason(filters)),
    );
    pagerRef.current = pager;
    setStatus('loading');
    setErrorMsg('');
    setItems([]);
    // 初始展示 2 整行（按当前列数取整）
    setVisibleCount(cols * 2);
    pager
      .loadMore()
      .then(() => {
        if (alive && pagerRef.current === pager) {
          setItems(pager.items.slice());
          setStatus('done');
        }
      })
      .catch((e) => {
        if (alive && pagerRef.current === pager) {
          setStatus('error');
          setErrorMsg(e instanceof RateLimitError ? e.message : '加载失败，请稍后重试');
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters]);

  // 无限滚动：滚动接近底部时自动「多展示一整行」；已加载内容展示完后自动拉取下一页。
  useEffect(() => {
    if (status !== 'done') return;
    const pager = pagerRef.current;
    if (!pager) return;
    const fullRows = Math.floor(items.length / cols) * cols;
    const onScroll = () => {
      if (pagerRef.current !== pager) return;
      const doc = document.documentElement;
      if (window.innerHeight + window.scrollY < doc.scrollHeight - 600) return;
      if (visibleCount < fullRows) {
        // 还有已加载的整行未展示 → 多展示一行（不发起请求）
        setVisibleCount((v) => v + cols);
      } else if (pager.hasMore && !pager.loading) {
        // 已展示到当前加载末尾 → 拉取更多
        setLoadingMore(true);
        pager
          .loadMore()
          .then(() => {
            if (pagerRef.current === pager) {
              setItems(pager.items.slice());
              setVisibleCount((v) => v + cols);
            }
          })
          .finally(() => setLoadingMore(false));
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [status, visibleCount, cols, items.length]);

  // 窗口尺寸变化 → 列数改变，把「已展示数量」对齐到新列数的整行倍数，避免出现残缺行
  useEffect(() => {
    setVisibleCount((v) => Math.max(cols, Math.floor(v / cols) * cols));
  }, [cols]);

  // 中文标题批量补全（Bangumi，节流 + 缓存）。仅在非「最近更新」快照、且存在缺中文标题的作品时触发。
  // 结果写回 zhTitleMap，PosterCard 据此显示中文标题；失败静默跳过，绝不阻塞列表。
  useEffect(() => {
    if (status !== 'done' || items.length === 0) return;
    const missing = items.filter((a) => !a.titleChinese);
    if (!missing.length) return;
    let alive = true;
    enrichChineseTitles(missing).then((map) => {
      if (alive && map.size) {
        setZhTitleMap((prev) => {
          const next = new Map(prev);
          map.forEach((v, k) => next.set(k, v));
          return next;
        });
      }
    });
    return () => {
      alive = false;
    };
  }, [items, status]);

  const pager = pagerRef.current;
  // 展示数量取「目标展示数」与「已加载完整行数」的较小值；数据已尽时展示全部（含最后的残缺尾行）
  const fullRows = Math.floor(items.length / cols) * cols;
  const shownCount = pager?.hasMore ? Math.min(visibleCount, fullRows) : items.length;
  const shown = items.slice(0, shownCount);

  const showEmpty = status === 'done' && items.length === 0;
  const isRecentMode = filters.sort === 'RECENT_UPDATE' && !query.trim();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-extrabold text-2xl text-ink">动漫库</h1>
        <p className="text-sm text-muted mt-1">
          精选日本 TV 动画目录，使用顶部搜索框即可按中文 / 日文 / 罗马音 / 英文检索，并按形式、状态、年份、标签与排序自由筛选。
        </p>
        {isRecentMode && (
          <p className="text-xs text-muted mt-1">
            当前默认按「最近更新」排序：展示本季与最近仍在连载的日本 TV 动画，按开播时间倒序；多年前开播的旧连载番已自动过滤。
          </p>
        )}
      </div>

      <FilterBar filters={filters} onChange={setFilters} resultCount={status === 'done' ? shown.length : undefined} />

      {status === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted">
          <Loader2 size={20} className="animate-spin" /> 正在加载…
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center justify-center gap-2 py-16 text-pop">
          <AlertTriangle size={20} /> {errorMsg}
        </div>
      )}

      {showEmpty && (
        <div className="py-16 text-center text-muted">
          没有找到符合条件的作品，换个关键词或筛选条件试试？
        </div>
      )}

      {shown.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {shown.map((a, i) => (
            <PosterCard key={a.id} anime={a} index={i} titleOverride={zhTitleMap.get(a.id)} />
          ))}
        </div>
      )}

      {/* 滚动加载指示：还有更多数据时在底部显示加载态；数据已尽则不显示 */}
      {status === 'done' && pagerRef.current?.hasMore && (
        <div className="flex justify-center py-4">
          {loadingMore ? (
            <Loader2 size={18} className="animate-spin text-muted" />
          ) : (
            <span className="text-xs text-muted">继续下滑加载更多</span>
          )}
        </div>
      )}
    </div>
  );
}
