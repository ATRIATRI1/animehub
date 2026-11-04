import { useNavigate } from 'react-router-dom';
import type { Anime, Collection } from '../../types';
import { cn } from '../../lib/utils';
import { STATUS_META, ANIME_STATUS_ZH } from '../../lib/utils';
import { StatusDot, ScoreChip } from './Badge';
import { ProgressBar } from './primitives';
import { CoverImage } from './CoverImage';
import { sourceIdToRoute } from '../../services/anilist';
import { useZhTitle } from '../../hooks/useCatalog';

interface PosterCardProps {
  anime: Anime;
  collection?: Collection;
  variant?: 'grid' | 'list';
  index?: number;
  titleOverride?: string; // 外部补全的中文标题（如 Bangumi name_cn），优先于 anime.titleChinese
}

export function PosterCard({ anime, collection, variant = 'grid', index = 0, titleOverride }: PosterCardProps) {
  const navigate = useNavigate();
  const status = collection?.status;
  const score: number | undefined = collection?.score ?? anime.averageScore;
  const progress = collection?.progressEpisodes ?? 0;
  // Bangumi 数据集提供的中文标题（主中文来源，覆盖 ~94%）；ID 未映射时按日文原名精确兜底
  const zh = useZhTitle(anime.anilistId, anime.titleNative);

  // 合并后的展示标题：外部补全中文 > Bangumi 中文 > 内建中文 > 罗马音 > 日文原名
  const title = titleOverride || zh || anime.titleChinese || anime.titleRomaji || anime.titleNative;
  // 网格卡片副信息：放送状态 · 年份（如「完结 · 2007」）
  const metaParts: string[] = [];
  const statusZh = ANIME_STATUS_ZH[anime.status];
  if (statusZh) metaParts.push(statusZh);
  if (anime.seasonYear) metaParts.push(String(anime.seasonYear));
  const meta = metaParts.join(' · ');
  // 列表视图仍保留次级名称（罗马音/原名）作为副标题
  const subSource = titleOverride || zh || anime.titleChinese;
  const sub = subSource
    ? (anime.titleRomaji && anime.titleRomaji !== title
        ? anime.titleRomaji
        : anime.titleNative && anime.titleNative !== title
          ? anime.titleNative
          : '')
    : anime.titleNative !== title
      ? anime.titleNative
      : '';

  if (variant === 'list') {
    return (
      <button
        data-testid="poster-card"
        onClick={() => navigate(`/anime/${sourceIdToRoute(anime.id)}`)}
        className="w-full flex items-center gap-4 p-3 rounded-2xl border border-line bg-surface hover:border-accent transition text-left animate-fadeUp"
        style={{ animationDelay: `${Math.min(index, 12) * 18}ms` }}
      >
        <div className="w-14 h-20 rounded-lg overflow-hidden shrink-0">
          <CoverImage anime={anime} className="h-full w-full" />
        </div>
          <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {status && <StatusDot status={status} />}
            <span className="font-semibold text-ink truncate">{title}</span>
          </div>
          {sub && <div className="text-xs text-muted truncate mt-0.5">{sub}</div>}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
            <span>{anime.format}</span>
            <span>·</span>
            <span>{anime.episodes} 集</span>
            <span>·</span>
            {anime.averageScore != null ? (
              <span>★ {anime.averageScore.toFixed(1)}</span>
            ) : (
              <span>暂无评分</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 w-24">
          {status && (
            <span className="text-xs font-semibold" style={{ color: STATUS_META[status].colorVar }}>
              {STATUS_META[status].label}
            </span>
          )}
          {collection && anime.episodes > 1 && (
            <div className="mt-1 text-[11px] text-muted">
              {progress}/{anime.episodes}
            </div>
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      data-testid="poster-card"
      onClick={() => navigate(`/anime/${sourceIdToRoute(anime.id)}`)}
      className="group relative flex flex-col rounded-2xl overflow-hidden border border-line bg-surface text-left transition hover:-translate-y-1 hover:shadow-card hover:border-transparent animate-fadeUp"
      style={{ animationDelay: `${Math.min(index, 16) * 22}ms` }}
    >
      <CoverImage anime={anime} className="aspect-[2/3] w-full">
        {status && (
          <span className="absolute top-2 left-2">
            <StatusDot status={status} size={10} />
          </span>
        )}
        {(collection?.score ?? 0) > 0 && (
          <span className="absolute top-2 right-2">
            <ScoreChip score={collection!.score} />
          </span>
        )}
        {!collection && (anime.averageScore ?? 0) > 0 && (
          <span className="absolute top-2 right-2">
            <ScoreChip score={anime.averageScore} />
          </span>
        )}
        {/* 集数角标（仅完结作品展示总集数，连载中集数未知不显示） */}
        {anime.status === 'FINISHED' && anime.episodes > 0 && (
          <span className="absolute bottom-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/55 text-white/90 backdrop-blur-sm">
            全 {anime.episodes} 集
          </span>
        )}
        {/* 悬停浮层：仅保留深色渐变，不再显示「查看详情」框 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition pointer-events-none" />
      </CoverImage>
      <div className="p-2.5 flex flex-col">
        <div className="font-semibold text-ink text-[13px] leading-tight line-clamp-1 group-hover:text-accent transition" title={title}>
          {title}
        </div>
        {meta && <div className="text-[11px] text-muted mt-0.5 truncate">{meta}</div>}
        {collection && (
          <div className="mt-2">
            {anime.episodes > 0 ? (
              <>
                <ProgressBar value={progress} max={anime.episodes} height={6} />
                <div className="text-[11px] text-muted mt-1">
                  {progress}/{anime.episodes} 集
                </div>
              </>
            ) : (
              // 未知总集数（AniList 未公布）时只显示已看进度，不伪造分母
              <div className="text-[11px] text-muted">已看 {progress} 集</div>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
