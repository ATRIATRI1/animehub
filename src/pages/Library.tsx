import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Fuse from 'fuse.js';
import { LayoutGrid, List, SlidersHorizontal, X, Search } from 'lucide-react';
import { dataAccess } from '../services/dataAccess';
import { useReload } from '../hooks/useReload';
import type { CollectionWithAnime, CustomTag } from '../types';
import { STATUS_META, GENRE_ZH, type WatchStatus } from '../lib/utils';
import { Input, Segmented, Button } from '../components/ui/primitives';
import { Select } from '../components/ui/Select';
import { Sheet } from '../components/ui/Sheet';
import { TagChip, StatusBadge } from '../components/ui/Badge';
import { PosterCard } from '../components/ui/PosterCard';
import { EmptyState } from '../components/ui/primitives';

type SortKey = 'score_desc' | 'recent' | 'updated' | 'title_asc' | 'progress';
type ViewMode = 'grid' | 'list';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  ...(['planning', 'watching', 'completed', 'rewatching', 'paused', 'dropped'] as WatchStatus[]).map((s) => ({
    value: s,
    label: STATUS_META[s].label,
  })),
];
const SORT_OPTIONS = [
  { value: 'score_desc', label: '评分高低' },
  { value: 'updated', label: '最近更新' },
  { value: 'recent', label: '最近添加' },
  { value: 'progress', label: '观看进度' },
  { value: 'title_asc', label: '名称 A-Z' },
];
const SCORE_OPTIONS = [
  { value: '', label: '不限评分' },
  { value: '7', label: '≥ 7.0' },
  { value: '8', label: '≥ 8.0' },
  { value: '9', label: '≥ 9.0' },
];

export function Library() {
  const reload = useReload();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState('');
  const [genre, setGenre] = useState('');
  const [year, setYear] = useState('');
  const [tag, setTag] = useState('');
  const [minScore, setMinScore] = useState('');
  const [sort, setSort] = useState<SortKey>('score_desc');
  const [view, setView] = useState<ViewMode>('grid');
  const [sheetOpen, setSheetOpen] = useState(false);

  const [cols, setCols] = useState<CollectionWithAnime[]>([]);
  const [tags, setTags] = useState<CustomTag[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([dataAccess.getCollections(), dataAccess.getCustomTags()]).then(([c, t]) => {
      if (!alive) return;
      setCols(c);
      setTags(t);
    });
    return () => {
      alive = false;
    };
  }, [reload]);

  useEffect(() => {
    const q = params.get('q') ?? '';
    setSearch(q);
  }, [params]);

  function updateSearch(v: string) {
    setSearch(v);
    setParams(v ? { q: v } : {}, { replace: true });
  }

  const fuse = useMemo(
    () =>
      new Fuse(cols, {
        keys: [
          { name: 'anime.titleNative', weight: 0.4 },
          { name: 'anime.titleRomaji', weight: 0.3 },
          { name: 'anime.titleEnglish', weight: 0.2 },
          { name: 'anime.synonyms', weight: 0.1 },
          { name: 'anime.studios', weight: 0.1 },
          { name: 'anime.genres', weight: 0.1 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [cols],
  );

  const genreOptions = useMemo(() => {
    const set = new Set<string>();
    cols.forEach((c) => c.anime.genres.forEach((g) => set.add(g)));
    return [
      { value: '', label: '全部类型' },
      ...[...set].sort().map((g) => ({ value: g, label: GENRE_ZH[g] ?? g })),
    ];
  }, [cols]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    cols.forEach((c) => c.anime.seasonYear && set.add(c.anime.seasonYear));
    return [
      { value: '', label: '全部年份' },
      ...[...set].sort((a, b) => b - a).map((y) => ({ value: String(y), label: `${y}` })),
    ];
  }, [cols]);

  // 有效评分优先用个人评分；个人未评分时回退社区评分；社区评分缺失(undefined)记 -1，
  // 保证「高分排序」时未评分作品统一排在有效评分之后，且不会产生 NaN。
  const effectiveScore = (c: CollectionWithAnime): number =>
    c.score > 0 ? c.score : (c.anime.averageScore ?? -1);

  const filtered = useMemo(() => {
    let list = cols;
    if (search.trim()) list = fuse.search(search.trim()).map((r) => r.item);
    if (status) list = list.filter((c) => c.status === status);
    if (genre) list = list.filter((c) => c.anime.genres.includes(genre));
    if (year) list = list.filter((c) => String(c.anime.seasonYear) === year);
    if (tag) list = list.filter((c) => c.tags.includes(tag));
    if (minScore) list = list.filter((c) => effectiveScore(c) >= Number(minScore));
    const sorted = [...list];
    switch (sort) {
      case 'score_desc':
        sorted.sort((a, b) => effectiveScore(b) - effectiveScore(a));
        break;
      case 'recent':
        sorted.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        break;
      case 'updated':
        sorted.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
        break;
      case 'title_asc':
        sorted.sort((a, b) => a.anime.titleNative.localeCompare(b.anime.titleNative, 'zh'));
        break;
      case 'progress':
        sorted.sort((a, b) => b.progressEpisodes - a.progressEpisodes);
        break;
    }
    return sorted;
  }, [cols, fuse, search, status, genre, year, tag, minScore, sort]);

  const activeFilters = [
    status && { k: 'status', label: STATUS_META[status as WatchStatus].label },
    genre && { k: 'genre', label: genre },
    year && { k: 'year', label: `${year} 年` },
    tag && { k: 'tag', label: tag },
    minScore && { k: 'minScore', label: `≥ ${minScore}.0` },
  ].filter(Boolean) as { k: string; label: string }[];

  function clearFilter(k: string) {
    if (k === 'status') setStatus('');
    if (k === 'genre') setGenre('');
    if (k === 'year') setYear('');
    if (k === 'tag') setTag('');
    if (k === 'minScore') setMinScore('');
  }

  const FilterPanel = (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">状态</div>
        <Select value={status} options={STATUS_OPTIONS} onChange={(v) => setStatus(v)} />
      </div>
      <div>
        <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">类型</div>
        <Select value={genre} options={genreOptions} onChange={(v) => setGenre(v)} />
      </div>
      <div>
        <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">年份</div>
        <Select value={year} options={yearOptions} onChange={(v) => setYear(v)} />
      </div>
      <div>
        <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">评分</div>
        <Select value={minScore} options={SCORE_OPTIONS} onChange={(v) => setMinScore(v)} />
      </div>
      <div>
        <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">标签</div>
        <div className="flex flex-wrap gap-1.5">
          {tags.length === 0 && <span className="text-sm text-muted">暂无标签</span>}
          {tags.map((t) => (
            <TagChip
              key={t.id}
              label={t.name}
              color={t.color}
              active={tag === t.name}
              onClick={() => setTag(tag === t.name ? '' : t.name)}
            />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-ink">收藏库</h1>
          <p className="text-sm text-muted mt-1">
            共 {cols.length} 部作品 · 当前显示 {filtered.length} 部
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            value={view}
            onChange={(v) => setView(v as ViewMode)}
            options={[
              { value: 'grid', label: <LayoutGrid size={16} /> },
              { value: 'list', label: <List size={16} /> },
            ]}
          />
          <div className="lg:hidden">
            <Button variant="ghost" size="md" onClick={() => setSheetOpen(true)}>
              <SlidersHorizontal size={16} /> 筛选
            </Button>
          </div>
        </div>
      </div>

      {/* 搜索 + 排序 工具栏 */}
      <div className="flex flex-col sm:flex-row gap-3 mt-4">
        <div className="relative flex-1">
          <Search
            size={17}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <Input
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="搜索中 / 英 / 罗马音名称、工作室、类型…"
            className="pl-10"
          />
        </div>
        <div className="w-full sm:w-44">
          <Select value={sort} options={SORT_OPTIONS} onChange={(v) => setSort(v as SortKey)} />
        </div>
      </div>

      {/* 已选筛选 chips */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {activeFilters.map((f) => (
            <button
              key={f.k}
              onClick={() => clearFilter(f.k)}
              className="inline-flex items-center gap-1 rounded-full bg-elevated border border-line px-2.5 py-1 text-xs text-ink hover:border-accent"
            >
              {f.label} <X size={12} />
            </button>
          ))}
          <button
            onClick={() => {
              setStatus(''); setGenre(''); setYear(''); setTag(''); setMinScore('');
            }}
            className="text-xs text-muted hover:text-accent"
          >
            清除全部
          </button>
        </div>
      )}

      <div className="flex gap-6 mt-5">
        {/* 桌面侧栏筛选 */}
        <aside className="hidden lg:block w-56 shrink-0 sticky top-20 self-start">
          {FilterPanel}
        </aside>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Search size={28} />}
              title="没有匹配的作品"
              description="试试调整搜索词或清除部分筛选条件。"
              action={
                <Button
                  variant="ghost"
                  onClick={() => {
                    updateSearch(''); setStatus(''); setGenre(''); setYear(''); setTag(''); setMinScore('');
                  }}
                >
                  清除筛选
                </Button>
              }
            />
          ) : view === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((c, i) => (
                <PosterCard key={c.id} anime={c.anime} collection={c} index={i} />
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((c, i) => (
                <PosterCard key={c.id} anime={c.anime} collection={c} variant="list" index={i} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 移动端筛选弹层 */}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="筛选与排序">
        {FilterPanel}
        <div className="mt-6">
          <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">排序</div>
          <Select value={sort} options={SORT_OPTIONS} onChange={(v) => setSort(v as SortKey)} />
        </div>
        <Button className="w-full mt-6" onClick={() => setSheetOpen(false)}>
          查看 {filtered.length} 部结果
        </Button>
      </Sheet>
    </div>
  );
}
