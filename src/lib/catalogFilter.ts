// 动漫库「精选日本动画目录」收录规则（Phase 5.2 阶段 1）。
// ---------------------------------------------------------------------------
// 目标：默认只收录日本动画，排除国漫/美漫/电影/真人剧/低龄儿童向/低价值短片。
// 规则分两层：
//   1) 查询层（硬过滤）：直接作为 AniList GraphQL 查询参数，命中即不返回——
//      countryOfOrigin=JP、isAdult=false、format_not_in=[MOVIE,SPECIAL,MUSIC]、
//      tag_not_in=[儿童向/低价值标签]。
//   2) 客户端兜底过滤（软过滤）：对「产地/形式无法可靠确定」或已缓存的条目再做一次
//      保守判定，避免误混入目录。宁可漏判也不误判。
// ---------------------------------------------------------------------------

import type { Anime } from '../types';

// 默认排除的动画形式（MOVIE 剧场版、SPECIAL 特别篇、MUSIC 音乐/演唱会视频）。
// 说明：AniList 的 format 枚举含 TV / TV_SHORT / MOVIE / SPECIAL / OVA / ONA / MUSIC。
// TV_SHORT 属「短篇 TV」，仍在收录范围；OVA/ONA 作为扩展类型保留。
export const EXCLUDED_FORMATS: string[] = ['MOVIE', 'SPECIAL', 'MUSIC'];

// 儿童向 / 低价值标签黑名单（AniList MediaTag 真实值，已通过 MediaTagCollection 校验）。
// 覆盖：低龄教育动画、儿童向、以儿童为主角的低龄向内容。
// 这些 tag 作为 tag_not_in 传入查询；同时客户端兜底时对同名 tag 再做一次排除。
// 说明：AniList 430 个 tag 中与儿童/教育相关的真实值仅 Educational / Kids /
//       Primarily Child Cast，其余名称不存在，故不臆造。
export const KIDS_TAGS: string[] = [
  'Educational', // 教育向
  'Kids', // 儿童向
  'Primarily Child Cast', // 以儿童为主角（低龄向）
];

// 低价值「角色宣传 / 玩具宣传」短片标签（VTuber 虚拟主播短片、Idol 偶像宣传短片）。
// 这类内容多为 1-2 分钟的 ONA 短片，无实际追番价值；与 KIDS_TAGS 一并作为 tag_not_in。
// 注意：仅排除明确「宣传/短片」属性的标签，不误伤正常偶像番（如《偶像大师》《Lovelive》）。
export const LOW_VALUE_TAGS: string[] = [
  'VTuber', // 虚拟主播角色短片（如 hololive 短片）
  'Primarily Animal Cast', // 动物主角（多为低龄向治愈短片，如《小鲨鱼出门玩》）
];

// 极短短片阈值：单集时长 ≤ 该值（分钟）的 ONA / TV_SHORT 视为低价值短片，默认排除。
// 正常 TV_SHORT 短篇 ≥ 3 分钟；1-2 分钟的短片多为角色/玩具宣传短视频。
export const MIN_MEANINGFUL_DURATION_MIN = 3;

// 兜底判定：一条作品是否应被排除在「精选日本动画」之外。
// 仅依据「已确定」的信息做排除；信息缺失时不误伤（返回 false 放行）。
// opts.allowExcludedFormats=true 时放行剧场版/特别篇/音乐（用于「关键词检索」：
// 用户明确搜索某作品时应能搜到电影等，如《你的名字》），其余排除规则不变。
export function shouldExcludeFromCatalog(
  a: Anime,
  opts?: { allowExcludedFormats?: boolean },
): boolean {
  // 1) 成人内容
  if (a.isAdult) return true;
  // 2) 产地已明确且非日本 → 排除（国漫 CN / 美漫 US / 韩漫 KR 等）
  if (a.countryOfOrigin && a.countryOfOrigin !== 'JP') return true;
  // 3) 形式明确为剧场版/特别篇/音乐 → 排除（关键词检索时放行，允许搜到电影）
  if (!opts?.allowExcludedFormats && EXCLUDED_FORMATS.includes(a.format)) return true;
  // 4) 儿童向 / 低价值标签 → 排除（仅当 tags 明确命中黑名单）
  if (a.tags?.length) {
    const tagSet = new Set(a.tags.map((t) => t.toLowerCase()));
    if (KIDS_TAGS.some((k) => tagSet.has(k.toLowerCase()))) return true;
    if (LOW_VALUE_TAGS.some((k) => tagSet.has(k.toLowerCase()))) return true;
  }
  // 5) 极短 ONA / TV_SHORT 短片（角色/玩具宣传）→ 排除。仅当「时长已明确且 ≤ 阈值」时判定，
  //    时长缺失(0/undefined)时不误伤。
  if (
    (a.format === 'ONA' || a.format === 'TV') &&
    a.durationMin > 0 &&
    a.durationMin <= MIN_MEANINGFUL_DURATION_MIN
  ) {
    return true;
  }
  return false;
}

// 查询层硬过滤参数片段（供 browseAnime / searchAnime / getAiringNow / getTrending 复用）。
// 返回一组 GraphQL media 参数，避免各查询处重复拼写、保证收录规则全局一致。
export const CATALOG_MEDIA_ARGS = {
  type: 'ANIME' as const,
  countryOfOrigin: 'JP',
  isAdult: false,
};

// 传给 AniList 的 `format_not_in`（排除剧场版/特别篇/音乐）。
export const CATALOG_FORMAT_NOT_IN = EXCLUDED_FORMATS;

// 传给 AniList 的 `tag_not_in`（儿童向 + 低价值标签）。
export const CATALOG_TAG_NOT_IN = [...KIDS_TAGS, ...LOW_VALUE_TAGS];

// ---------------------------------------------------------------------------
// 「最近更新」季度窗口：只保留「最近 N 个季度内开播」的作品（含当前季度）。
// 用于过滤掉多年前开播、至今仍被标记为 RELEASING 的长寿番——
// 多为国民级/儿童向长寿番（如 2000 年代开播的番剧）或早已完结却被误标连载的低价值 ONA。
// 例：2026-11（FALL）时，窗口为 WINTER/SPRING/SUMMER/FALL 2026；2024 的 ONA、2000 年代老番被过滤。
// ---------------------------------------------------------------------------
export const RECENT_QUARTERS = 4;

const SEASON_ORDER = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;

export function isRecentSeason(a: Anime, windowQuarters = RECENT_QUARTERS): boolean {
  // 无季度信息（season/seasonYear 缺失）的条目通常是数据残缺的低价值内容
  // （如无开播日期的 OVA/短片），且无法判断是否「最近」，故排除。
  if (a.seasonYear == null || !a.season) return false;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const curSeason = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
  const curIdx = SEASON_ORDER.indexOf(curSeason);
  const aIdx = SEASON_ORDER.indexOf(a.season as (typeof SEASON_ORDER)[number]);
  if (curIdx < 0 || aIdx < 0) return false;
  // 作品所在季度与当前季度之间的季度差值（0 = 本季度，正数 = 更早）
  const diff = (year - a.seasonYear) * 4 + (curIdx - aIdx);
  return diff >= 0 && diff < windowQuarters;
}
