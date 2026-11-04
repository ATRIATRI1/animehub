import { SlidersHorizontal, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Switch, Segmented } from '../ui/primitives';
import {
  FORMAT_OPTIONS,
  STATUS_OPTIONS,
  SORT_OPTIONS,
  TAG_OPTIONS,
  SOURCE_OPTIONS,
  DEFAULT_FILTERS,
  type LibraryFilterState,
  type FilterToken,
  type SortKey,
} from '../../lib/filters';
import type { AnimeFormat, AnimeStatus } from '../../types';

interface Props {
  filters: LibraryFilterState;
  onChange: (next: LibraryFilterState) => void;
  resultCount?: number; // 已显示作品数（由分页补偿器给出，非精确过滤总数）
}

const YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015];

export function FilterBar({ filters, onChange, resultCount }: Props) {
  const set = (patch: Partial<LibraryFilterState>) => onChange({ ...filters, ...patch });

  const formatOpts = [
    { value: 'ALL' as const, label: '全部' },
    ...FORMAT_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  ];
  const statusOpts = [
    { value: 'ALL' as const, label: '全部' },
    ...STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  ];
  const sourceOpts = [
    { value: 'ALL' as const, label: '全部' },
    ...SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  ];
  const sortOpts = SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

  const toggleTag = (token: FilterToken) => {
    const has = filters.tags.includes(token);
    set({ tags: has ? filters.tags.filter((t) => t !== token) : [...filters.tags, token] });
  };

  const isDefault =
    filters.format === 'ALL' &&
    filters.status === 'ALL' &&
    filters.source === 'ALL' &&
    filters.year === 'ALL' &&
    filters.tags.length === 0 &&
    filters.sort === 'RECENT_UPDATE' &&
    filters.excludeCurrentSeason;

  const clearAll = () =>
    onChange({ ...filters, ...DEFAULT_FILTERS }); // 清除后恢复默认（含「排除本季度新番」默认开启）

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <SlidersHorizontal size={16} className="text-accent" /> 筛选
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-5 sm:gap-y-3">
        <Group label="形式">
          <Segmented<'ALL' | AnimeFormat>
            size="sm"
            value={filters.format}
            onChange={(v) => set({ format: v })}
            options={formatOpts}
          />
        </Group>
        <Group label="状态">
          <Segmented<'ALL' | AnimeStatus>
            size="sm"
            value={filters.status}
            onChange={(v) => set({ status: v })}
            options={statusOpts}
          />
        </Group>
        <Group label="改编">
          <Segmented<'ALL' | string>
            size="sm"
            value={filters.source}
            onChange={(v) => set({ source: v })}
            options={sourceOpts}
          />
        </Group>
        <Group label="排序">
          <Segmented<SortKey> size="sm" value={filters.sort} onChange={(v) => set({ sort: v })} options={sortOpts} />
        </Group>
        <Group label="年份">
          <select
            value={String(filters.year)}
            onChange={(e) => set({ year: e.target.value === 'ALL' ? 'ALL' : Number(e.target.value) })}
            className="bg-elevated border border-line rounded-lg text-sm text-ink px-2.5 py-1.5 outline-none focus:border-accent"
          >
            <option value="ALL">全部</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Group>
        <Group label="本季度新番">
          <div className="flex items-center gap-2">
            <Switch checked={filters.excludeCurrentSeason} onChange={(v) => set({ excludeCurrentSeason: v })} />
            <span className={cn('text-xs font-medium', filters.excludeCurrentSeason ? 'text-accent' : 'text-muted')}>
              {filters.excludeCurrentSeason ? '已排除' : '包含'}
            </span>
          </div>
        </Group>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted mb-1.5">作品标签（可多选）</div>
        <div className="flex flex-wrap gap-1.5">
          {TAG_OPTIONS.map((t) => {
            const active = filters.tags.includes(t.token);
            return (
              <button
                key={t.token}
                onClick={() => toggleTag(t.token)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full border transition',
                  active
                    ? 'nav-grad text-white border-transparent'
                    : 'bg-elevated border-line text-muted hover:text-ink',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-line">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted min-h-[20px]">
          {resultCount !== undefined && (
            <span>
              已显示 <b className="text-ink">{resultCount}</b> 部
            </span>
          )}
          {filters.tags.length > 0 && <span>已选 {filters.tags.length} 个标签</span>}
          {!isDefault && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              <X size={12} /> 清除筛选
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0 w-full sm:w-auto">
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
    </div>
  );
}
