// 动漫库（原搜索页）筛选体系：中文标签映射、形式/状态/排序枚举、token→AniList 查询参数。
// 所有中文标签均依据 AniList 真实字段（GenreCollection / MediaTagCollection / source）建立映射，
// 不编造不存在的标签。OVA 与 OAD 在 AniList `format` 枚举中均为 OVA，无法区分，故合并为「OVA·OAD」。
import type { Anime, AnimeFormat, AnimeStatus } from '../types';
import { currentSeason, type MediaSeason, type BrowseFilters } from '../services/anilist';

export type SortKey =
  | 'RECENT_UPDATE'
  | 'PREV_SEASON'
  | 'THIS_SEASON'
  | 'LATEST'
  | 'SCORE'
  | 'POPULARITY'
  | 'TITLE';

// 说明：
//  - RECENT_UPDATE：走 AniList AiringSchedule（过去 7 天已播出集数去重），非 MediaSort，
//    由页面走专门的数据通道，anilist 字段不参与查询。
//  - PREV_SEASON / THIS_SEASON：本质是「季度预设」，会同时锁定 season(+seasonYear)，
//    排序仍使用 POPULARITY_DESC。
//  - SCORE（高分）：status 不限，按评分倒序，合并原「经典动画/完结动画/高分动画」三者。
export const SORT_OPTIONS: { value: SortKey; label: string; anilist: string }[] = [
  { value: 'RECENT_UPDATE', label: '最近更新', anilist: '' },
  { value: 'THIS_SEASON', label: '本季度新番', anilist: 'POPULARITY_DESC' },
  { value: 'PREV_SEASON', label: '上季度新番', anilist: 'POPULARITY_DESC' },
  { value: 'LATEST', label: '最新开播', anilist: 'START_DATE_DESC' },
  { value: 'SCORE', label: '高分', anilist: 'SCORE_DESC' },
  { value: 'POPULARITY', label: '热度', anilist: 'POPULARITY_DESC' },
  { value: 'TITLE', label: '标题', anilist: 'TITLE_ROMAJI' },
];

/** 上一季度（用于「上季度新番」预设） */
export function previousSeason(
  season: MediaSeason,
  year: number,
): { season: MediaSeason; year: number } {
  const order: MediaSeason[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
  const i = order.indexOf(season);
  if (i < 0) return { season, year };
  if (i === 0) return { season: 'FALL', year: year - 1 };
  return { season: order[i - 1], year };
}

// 形式筛选（仅收录日本动画的主要形式；剧场版 MOVIE / 特别篇 SPECIAL / 音乐 MUSIC
// 已在查询层默认排除，故不在此提供筛选选项，避免用户选中后恒为空结果）。
// OVA/OAD 在 AniList `format` 枚举中均为 OVA，无法区分，故合并为「OVA · OAD」。
export const FORMAT_OPTIONS: { value: AnimeFormat; label: string }[] = [
  { value: 'TV', label: 'TV 动画' },
  { value: 'OVA', label: 'OVA · OAD' },
  { value: 'ONA', label: 'Web 动画' },
];

export const STATUS_OPTIONS: { value: AnimeStatus; label: string }[] = [
  { value: 'RELEASING', label: '连载中' },
  { value: 'FINISHED', label: '已完结' },
  { value: 'NOT_YET_RELEASED', label: '即将播出' },
  { value: 'CANCELLED', label: '已搁置' },
];

// 作品标签：每个中文标签映射到 AniList 的 genre / tag 字段（不含 source，source 见 SOURCE_OPTIONS）。
// token 形如 "genre:Fantasy" | "tag:Yuri"。按常见性（热度/大类）排序，便于优先点选。
export type FilterToken = string;
export interface TagOption {
  label: string;
  token: FilterToken;
}
export const TAG_OPTIONS: TagOption[] = [
  { label: '异世界', token: 'tag:Isekai' },
  { label: '剧情', token: 'genre:Drama' },
  { label: '战斗', token: 'genre:Action' },
  { label: '恋爱', token: 'genre:Romance' },
  { label: '日常', token: 'genre:Slice of Life' },
  { label: '后宫', token: 'tag:Harem' },
  { label: '奇幻', token: 'genre:Fantasy' },
  { label: '科幻', token: 'genre:Sci-Fi' },
  { label: '悬疑', token: 'genre:Mystery' },
  { label: '冒险', token: 'genre:Adventure' },
  { label: '校园', token: 'tag:School' },
  { label: '百合', token: 'tag:Yuri' },
  { label: '运动', token: 'genre:Sports' },
  { label: '机战', token: 'genre:Mecha' },
  { label: '音乐', token: 'genre:Music' },
  { label: '喜剧', token: 'genre:Comedy' },
  { label: '美食', token: 'tag:Cooking' },
  { label: '职场', token: 'tag:Workplace' },
  { label: '推理', token: 'tag:Detective' },
  { label: '纯爱', token: 'tag:Romance' },
  { label: '少年向', token: 'tag:Shounen' },
  { label: '少女向', token: 'tag:Shoujo' },
  { label: '青年向', token: 'tag:Seinen' },
];

// 改编来源：从作品标签中独立出来的「分类选项」，单选自成一组（不再混在标签里）。
export interface SourceOption {
  value: string; // AniList source 枚举
  label: string;
  token: FilterToken;
}
export const SOURCE_OPTIONS: SourceOption[] = [
  { value: 'MANGA', label: '漫画改', token: 'source:MANGA' },
  { value: 'LIGHT_NOVEL', label: '小说改', token: 'source:LIGHT_NOVEL' },
  { value: 'GAME', label: '游戏改', token: 'source:GAME' },
  { value: 'ORIGINAL', label: '原创', token: 'source:ORIGINAL' },
];

export function tokensToArgs(tokens: FilterToken[]): {
  genre_in?: string[];
  tag_in?: string[];
  source_in?: string[];
} {
  const genre: string[] = [];
  const tag: string[] = [];
  const source: string[] = [];
  for (const t of tokens) {
    const idx = t.indexOf(':');
    if (idx < 0) continue;
    const kind = t.slice(0, idx);
    const value = t.slice(idx + 1);
    if (kind === 'genre') genre.push(value);
    else if (kind === 'tag') tag.push(value);
    else if (kind === 'source') source.push(value);
  }
  // 同维度 OR（AniList 的 _in 即 OR）；跨维度 AND（多个参数同时生效）。
  return {
    genre_in: genre.length ? genre : undefined,
    tag_in: tag.length ? tag : undefined,
    source_in: source.length ? source : undefined,
  };
}

// 动漫库页面使用的筛选状态
export interface LibraryFilterState {
  format: AnimeFormat | 'ALL';
  status: AnimeStatus | 'ALL';
  year: number | 'ALL';
  tags: FilterToken[];
  source: string | 'ALL'; // 改编来源（漫画改/小说改/游戏改/原创），独立于标签
  sort: SortKey;
  excludeCurrentSeason: boolean;
}

export const DEFAULT_FILTERS: LibraryFilterState = {
  format: 'ALL',
  status: 'ALL',
  year: 'ALL',
  tags: [],
  source: 'ALL',
  sort: 'RECENT_UPDATE', // 默认「最近更新」
  excludeCurrentSeason: true, // 默认排除本季度新番
};

export function toBrowseFilters(state: LibraryFilterState): BrowseFilters {
  const { genre_in, tag_in, source_in } = tokensToArgs(state.tags);
  const cur = currentSeason();

  let season: MediaSeason | undefined;
  let seasonYear: number | undefined = state.year === 'ALL' ? undefined : state.year;
  let sort = SORT_OPTIONS.find((s) => s.value === state.sort)?.anilist;

  if (state.sort === 'THIS_SEASON') {
    season = cur.season;
    // 未指定年份时锁定本季年份；已指定年份则以用户选择为准（如「2020 冬季新番」）
    seasonYear = seasonYear ?? cur.year;
    sort = 'POPULARITY_DESC';
  } else if (state.sort === 'PREV_SEASON') {
    const prev = previousSeason(cur.season, cur.year);
    season = prev.season;
    seasonYear = seasonYear ?? prev.year;
    sort = 'POPULARITY_DESC';
  }

  return {
    format: state.format === 'ALL' ? undefined : state.format,
    status: state.status === 'ALL' ? undefined : state.status,
    seasonYear,
    season,
    genre_in,
    tag_in,
    source_in,
    // 改编来源：独立筛选维度（与标签 AND 叠加）
    source: state.source === 'ALL' ? undefined : state.source,
    sort: sort || undefined,
  };
}

/**
 * 「排除本季度新番」的实际生效判断。
 * 当排序为「本季度新番」时，用户明确想看本季作品，排除规则必须让路，否则结果恒为空。
 */
export function shouldExcludeCurrentSeason(state: LibraryFilterState): boolean {
  if (state.sort === 'THIS_SEASON') return false;
  return state.excludeCurrentSeason;
}

// 排除本季度新番的客户端过滤器（AniList 无 season_not 反选，只能客户端过滤）
export function makeExcludeSeasonFilter(exclude: boolean): (a: Anime) => boolean {
  if (!exclude) return () => true;
  const { season, year } = currentSeason();
  return (a: Anime) => !(a.season === season && a.seasonYear === year);
}
