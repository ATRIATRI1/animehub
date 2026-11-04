// AniList GraphQL 适配层（Phase 4 公共动漫资料来源）
// ---------------------------------------------------------------------------
// 设计要点：
// 1) 无需 API Key：AniList 公开 GraphQL 接口，浏览器可直接调用（CORS: Access-Control-Allow-Origin: *）。
// 2) 公共资料（搜索/详情/放送中/热门）来自 AniList；个人收藏仍走 CloudDataAccess（Phase 3）。
// 3) 外部 ID 以 `anilist:<数字>` 形式作为稳定作品标识，与云端 bigint 主键完全隔离
//    （落入云端 anime 表时通过 source_id = 'anilist:xxx' 关联）。
// 4) 缓存：内存 + sessionStorage，TTL 5 分钟；降低限流概率、刷新后可秒开。
// 5) 限流：遇到 429 最多退避重试 1 次；若仍需等待 > 5s 直接抛 RateLimitError，绝不无限重试。
// 6) 中文标题：AniList 无官方中文字段，但 synonyms 中常含中文别名（如「千与千寻」），
//    故从 synonyms 提取首个含中日韩字符者作为 titleChinese；覆盖不全属已知限制（见交付文档）。
// 7) 图片：优先返回 AniList 真实地址；加载失败由前端 CoverImage 回退到渐变占位（绝不把占位当真图）。
// ---------------------------------------------------------------------------

import type { Anime, AnimeFormat, AnimeStatus } from '../types';
import { shouldExcludeFromCatalog, isRecentSeason, CATALOG_TAG_NOT_IN } from '../lib/catalogFilter';
import { loadCatalogIndex, searchCatalogZh } from './bangumiData';

const ENDPOINT = 'https://graphql.anilist.co';
const CACHE_TTL = 5 * 60 * 1000;

export class RateLimitError extends Error {
  constructor() {
    super('请求过于频繁，请稍后再试');
    this.name = 'RateLimitError';
  }
}

// ---------- 外部动漫缓存（物化后供数据层与个人库复用） ----------
const externalCache = new Map<string, Anime>();
const recCache = new Map<string, Anime[]>(); // sourceId -> 推荐列表

export function cacheAnime(a: Anime) {
  externalCache.set(a.id, a);
  try {
    sessionStorage.setItem('anime:ext:' + a.id, JSON.stringify(a));
  } catch {
    /* ignore quota */
  }
}
export function getCachedAnime(sourceId: string): Anime | undefined {
  if (externalCache.has(sourceId)) return externalCache.get(sourceId);
  try {
    const raw = sessionStorage.getItem('anime:ext:' + sourceId);
    if (raw) {
      const a = JSON.parse(raw) as Anime;
      externalCache.set(sourceId, a);
      return a;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function restoreCache() {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('anime:ext:')) {
        const id = k.slice('anime:ext:'.length);
        if (!externalCache.has(id)) {
          try {
            externalCache.set(id, JSON.parse(sessionStorage.getItem(k)!));
          } catch {
            /* ignore */
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
}
restoreCache();

// ---------- sourceId 编解码（URL 安全） ----------
export function toSourceId(anilistId: number): string {
  return `anilist:${anilistId}`;
}
export function sourceIdToRoute(id: string): string {
  return id.replace(':', '-'); // anilist:154587 -> anilist-154587
}
export function routeToSourceId(param: string): string {
  return param.replace('-', ':'); // 首个 '-' 即分隔符（provider 不含 '-'）
}
export function isExternalSourceId(id: string): boolean {
  return id.startsWith('anilist:');
}

// ---------- 确定性渐变（占位回退，按 id 生成） ----------
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
export function gradientFor(seed: string): string {
  const h = hashStr(seed);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + (h % 60)) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 70% 58%), hsl(${hue2} 72% 46%))`;
}

// ---------- HTML 描述清洗 ----------
function stripHtml(html?: string | null): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(i|b|span|div|p)>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&ndash;|&mdash;/g, '—')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function mapFormat(f?: string): AnimeFormat {
  const ok: AnimeFormat[] = ['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL'];
  return (ok as string[]).includes(f ?? '') ? (f as AnimeFormat) : 'TV';
}
function mapStatus(s?: string): AnimeStatus {
  const map: Record<string, AnimeStatus> = {
    FINISHED: 'FINISHED',
    RELEASING: 'RELEASING',
    NOT_YET_RELEASED: 'NOT_YET_RELEASED',
    CANCELLED: 'CANCELLED',
  };
  return map[s ?? ''] ?? 'RELEASING';
}

// 判断字符串是否像中文标题（而非日文原名）。AniList 的 synonyms 可能含日文原名（含汉字），
// 不能仅凭「含汉字」就当作中文译名。规则：
//  ① 含假名（平/片假名）→ 日文，排除；② 无汉字 → 排除；
//  ③ 含简体中文独有字形（日文不使用的新字体）或中文助词（的/了/是/版…）→ 判定为中文。
// 宁可漏判也不误判：纯汉字且无简体标记/中文助词的日文标题会被保守地排除，避免「日文当中文」。
const KANA_RE = /[぀-ゟ゠-ヿ]/;
const CJK_RE = /[㐀-鿿]/;
const SIMPLIFIED_RE =
  /[国卫说电关们飞龙汉图书记车贝见亲进击术态觉开写爱义产兰变体报东长门问间远厂广团园归办总认让话课这还实会学时视网语]/;
const ZH_PARTICLE_RE = /[的了吗呢吧啊呀哦啦之版]/;
function looksChinese(s?: string | null): boolean {
  if (!s) return false;
  const t = s.trim();
  if (!t) return false;
  if (KANA_RE.test(t)) return false;
  if (!CJK_RE.test(t)) return false;
  if (SIMPLIFIED_RE.test(t)) return true;
  if (ZH_PARTICLE_RE.test(t)) return true;
  return false;
}

interface RawMedia {
  id: number;
  idMal?: number | null;
  title: { romaji?: string | null; english?: string | null; native?: string | null };
  coverImage?: { extraLarge?: string | null; large?: string | null; medium?: string | null } | null;
  bannerImage?: string | null;
  description?: string | null;
  episodes?: number | null;
  duration?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  format?: string | null;
  status?: string | null;
  genres?: string[] | null;
  tags?: { name: string }[] | null;
  studios?: { nodes?: { name: string }[] } | null;
  averageScore?: number | null;
  source?: string | null;
  synonyms?: string[] | null;
  countryOfOrigin?: string | null;
  isAdult?: boolean | null;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
  recommendations?: {
    nodes?: { mediaRecommendation?: RawMedia | null }[];
  } | null;
}

function toAnimeModel(m: RawMedia): Anime {
  const id = toSourceId(m.id);
  const titleChinese = (m.synonyms ?? []).find((s) => looksChinese(s)) ?? undefined;
  const next = m.nextAiringEpisode;
  const airDate = next ? new Date(next.airingAt * 1000) : null;
  return {
    id,
    anilistId: m.id,
    titleNative: m.title.native || m.title.romaji || '未知作品',
    titleChinese,
    titleRomaji: m.title.romaji || '',
    titleEnglish: m.title.english || undefined,
    synonyms: m.synonyms ?? [],
    coverGradient: gradientFor(id),
    coverImageUrl: m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || undefined,
    bannerGradient: gradientFor(id + '|b'),
    bannerImageUrl: m.bannerImage || undefined,
    format: mapFormat(m.format ?? undefined),
    episodes: m.episodes ?? 1,
    durationMin: m.duration ?? 24,
    status: mapStatus(m.status ?? undefined),
    season: (m.season as Anime['season']) || undefined,
    seasonYear: m.seasonYear ?? undefined,
    studios: (m.studios?.nodes ?? []).map((s) => s.name),
    source: m.source || '',
    genres: m.genres ?? [],
    tags: (m.tags ?? []).map((t) => t.name),
    countryOfOrigin: m.countryOfOrigin ?? undefined,
    isAdult: !!m.isAdult,
    synopsis: stripHtml(m.description),
    // 上游无评分（null/undefined）时保留 undefined，绝不回退为 0，避免「无评分」被当成「0 分」。
    averageScore:
      typeof m.averageScore === 'number' ? Math.round((m.averageScore / 10) * 100) / 100 : undefined,
    airDay: airDate ? airDate.getDay() : undefined,
    airTime: airDate ? airDate.toTimeString().slice(0, 5) : undefined,
    // 保留完整 nextAiringEpisode（含精确 airingAt 秒级时间戳），供追番页「接下来更新/最新集」使用。
    nextAiringEpisode: next ? { episode: next.episode, airingAt: next.airingAt } : null,
  };
}

// ---------- GraphQL 请求 ----------
interface GqlResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function gql<T>(query: string, variables: Record<string, unknown>, attempt = 0): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 429) {
    if (attempt >= 1) throw new RateLimitError();
    const retryAfterHeader = res.headers.get('Retry-After');
    let wait = retryAfterHeader ? Number(retryAfterHeader) : 0;
    if (!wait) {
      const reset = res.headers.get('X-RateLimit-Reset');
      if (reset) wait = Math.max(0, Number(reset) - Math.floor(Date.now() / 1000));
    }
    if (!wait || wait > 5) throw new RateLimitError(); // 不无限等待
    await new Promise((r) => setTimeout(r, wait * 1000));
    return gql<T>(query, variables, attempt + 1);
  }

  if (!res.ok) throw new Error(`AniList 请求失败（HTTP ${res.status}）`);
  const json = (await res.json()) as GqlResponse<T>;
  if (json.errors?.length) throw new Error(json.errors[0].message || 'AniList 返回错误');
  if (!json.data) throw new Error('AniList 返回空数据');
  return json.data;
}

// ---------- 缓存包装 ----------
function cacheKey(prefix: string, vars: Record<string, unknown>): string {
  return prefix + ':' + JSON.stringify(vars);
}
async function cached<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const mem = sessionStorageGet(key) as { ts: number; data: T } | null;
  if (mem && Date.now() - mem.ts < ttl) return mem.data;
  const data = await fetcher();
  sessionStorageSet(key, { ts: Date.now(), data });
  return data;
}
function sessionStorageGet(key: string): any {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function sessionStorageSet(key: string, val: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore quota */
  }
}

// ---------- 对外 API ----------
const SEARCH_FIELDS = `
  id idMal
  title { romaji english native }
  coverImage { extraLarge large medium }
  bannerImage
  format status episodes duration season seasonYear
  genres tags { name }
  studios(isMain: true) { nodes { name } }
  averageScore source synonyms
  countryOfOrigin isAdult
`;

export interface SearchResult {
  items: Anime[];
  page: number;
  hasNext: boolean;
  total: number;
}

// 动漫库浏览/搜索的统一筛选参数（形式/状态/年份/标签/sort 均为 AniList 查询参数；
// 「排除本季度新番」是客户端过滤，不在此处）
// AniList MediaSeason 枚举（与 GraphQL schema 一致）
export type MediaSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export interface BrowseFilters {
  query?: string;
  format?: AnimeFormat;
  status?: AnimeStatus;
  seasonYear?: number;
  season?: MediaSeason;
  genre_in?: string[];
  tag_in?: string[];
  source_in?: string[];
  source?: string; // 改编来源（单值，AniList source 枚举，如 MANGA/LIGHT_NOVEL/GAME/ORIGINAL）
  sort?: string; // AniList MediaSort 值，如 POPULARITY_DESC / SCORE_DESC / START_DATE_DESC / TITLE_ROMAJI / SEARCH_MATCH
}

export interface AiringEntry {
  anime: Anime;
  episode: number;
  airingAt: number; // Unix 秒级时间戳
}

export async function searchAnime(query: string, page = 1, perPage = 20): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { items: [], page, hasNext: false, total: 0 };
  const key = cacheKey('anilist:search', { q, page, perPage });
  const data = await cached<{ Page: { media: RawMedia[]; pageInfo: { currentPage: number; hasNextPage: boolean; total: number } } }>(
    key,
    CACHE_TTL,
    () =>
      gql(
        `query($q:String,$page:Int,$pp:Int,$tag_not_in:[String]){Page(page:$page,perPage:$pp){pageInfo{currentPage hasNextPage total} media(search:$q,type:ANIME,countryOfOrigin:JP,isAdult:false,format_not_in:[MOVIE,SPECIAL,MUSIC],tag_not_in:$tag_not_in,sort:SEARCH_MATCH){${SEARCH_FIELDS}}}}`,
        { q, page, pp: perPage, tag_not_in: CATALOG_TAG_NOT_IN },
      ),
  );
  const items = data.Page.media.map(toAnimeModel).filter((a) => !shouldExcludeFromCatalog(a));
  items.forEach(cacheAnime);
  return {
    items,
    page: data.Page.pageInfo.currentPage,
    hasNext: data.Page.pageInfo.hasNextPage,
    total: data.Page.pageInfo.total,
  };
}

export async function getAnimeDetail(anilistId: number): Promise<{ anime: Anime; recommendations: Anime[] }> {
  const key = cacheKey('anilist:detail', { id: anilistId });
  const data = await cached<{ Media: RawMedia }>(key, CACHE_TTL, () =>
    gql(
      `query($id:Int){Media(id:$id,type:ANIME){${SEARCH_FIELDS}
        description(asHtml:false)
        duration
        nextAiringEpisode { episode airingAt }
        recommendations(sort:RATING_DESC,perPage:8){ nodes { mediaRecommendation { ${SEARCH_FIELDS} } } }
      }}`,
      { id: anilistId },
    ),
  );
  const anime = toAnimeModel(data.Media);
  cacheAnime(anime);
  const recs = (data.Media.recommendations?.nodes ?? [])
    .map((n) => n.mediaRecommendation)
    .filter((x): x is RawMedia => !!x)
    .map(toAnimeModel);
  recs.forEach(cacheAnime);
  recCache.set(anime.id, recs);
  return { anime, recommendations: recs };
}

/** 根据当前日期推导 AniList 季度（WINTER/SPRING/SUMMER/FALL + 年份） */
export function currentSeason(): { season: MediaSeason; year: number } {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  if (month >= 1 && month <= 3) return { season: 'WINTER', year };
  if (month >= 4 && month <= 6) return { season: 'SPRING', year };
  if (month >= 7 && month <= 9) return { season: 'SUMMER', year };
  return { season: 'FALL', year };
}

export async function getAiringNow(perPage = 12): Promise<Anime[]> {
  const { season, year } = currentSeason();
  const key = cacheKey('anilist:airing', { perPage, season, year });
  const data = await cached<{ Page: { media: RawMedia[] } }>(key, CACHE_TTL, () =>
    gql(
      `query($pp:Int,$s:MediaSeason,$y:Int,$tag_not_in:[String]){Page(perPage:$pp){media(season:$s,seasonYear:$y,sort:POPULARITY_DESC,type:ANIME,countryOfOrigin:JP,isAdult:false,format_not_in:[MOVIE,SPECIAL,MUSIC],tag_not_in:$tag_not_in,status:RELEASING){${SEARCH_FIELDS}}}}`,
      { pp: perPage, s: season, y: year, tag_not_in: CATALOG_TAG_NOT_IN },
    ),
  );
  const items = data.Page.media.map(toAnimeModel).filter((a) => !shouldExcludeFromCatalog(a));
  items.forEach(cacheAnime);
  return items;
}

export async function getTrending(perPage = 12): Promise<Anime[]> {
  const key = cacheKey('anilist:trending', { perPage });
  const data = await cached<{ Page: { media: RawMedia[] } }>(key, CACHE_TTL, () =>
    gql(
      `query($pp:Int,$tag_not_in:[String]){Page(perPage:$pp){media(sort:TRENDING_DESC,type:ANIME,countryOfOrigin:JP,isAdult:false,format_not_in:[MOVIE,SPECIAL,MUSIC],tag_not_in:$tag_not_in){${SEARCH_FIELDS}}}}`,
      { pp: perPage, tag_not_in: CATALOG_TAG_NOT_IN },
    ),
  );
  const items = data.Page.media.map(toAnimeModel).filter((a) => !shouldExcludeFromCatalog(a));
  items.forEach(cacheAnime);
  return items;
}

// 动漫库统一查询：同时支持「关键词搜索」与「无关键词浏览」，并把形式/状态/年份/标签/排序
// 作为 AniList 查询参数。返回标准 SearchResult 供 FilteredPager 做客户端过滤与分页补偿。
export async function browseAnime(
  filters: BrowseFilters,
  page = 1,
  perPage = 50,
): Promise<SearchResult> {
  const hasQuery = !!(filters.query && filters.query.trim());
  const vars: Record<string, unknown> = {
    page,
    pp: perPage,
    sort: [filters.sort ?? (hasQuery ? 'SEARCH_MATCH' : 'POPULARITY_DESC')],
    tag_not_in: CATALOG_TAG_NOT_IN,
  };
  const decl: string[] = ['$page:Int', '$pp:Int', '$sort:[MediaSort]', '$tag_not_in:[String]'];
  const args: string[] = [
    'type:ANIME',
    'sort:$sort',
    'countryOfOrigin:JP',
    'isAdult:false',
    'tag_not_in:$tag_not_in',
  ];
  // 无关键词浏览时排除剧场版/特别篇/音乐（保持「精选 TV 动画目录」）；
  // 有关键词检索时不排除，确保用户明确搜索的作品（如电影《你的名字》）也能被搜到。
  if (!hasQuery) args.push('format_not_in:[MOVIE,SPECIAL,MUSIC]');

  if (hasQuery) {
    vars.q = filters.query!.trim();
    decl.push('$q:String');
    args.push('search:$q');
  }
  if (filters.format) {
    vars.format = filters.format;
    decl.push('$format:MediaFormat');
    args.push('format:$format');
  }
  if (filters.status) {
    vars.status = filters.status;
    decl.push('$status:MediaStatus');
    args.push('status:$status');
  }
  if (filters.seasonYear) {
    vars.seasonYear = filters.seasonYear;
    decl.push('$seasonYear:Int');
    args.push('seasonYear:$seasonYear');
  }
  if (filters.season) {
    vars.season = filters.season;
    decl.push('$season:MediaSeason');
    args.push('season:$season');
  }
  if (filters.genre_in?.length) {
    vars.genre_in = filters.genre_in;
    decl.push('$genre_in:[String]');
    args.push('genre_in:$genre_in');
  }
  if (filters.tag_in?.length) {
    vars.tag_in = filters.tag_in;
    decl.push('$tag_in:[String]');
    args.push('tag_in:$tag_in');
  }
  if (filters.source_in?.length) {
    vars.source_in = filters.source_in;
    decl.push('$source_in:[MediaSource]');
    args.push('source_in:$source_in');
  }
  if (filters.source) {
    vars.source = filters.source;
    decl.push('$source:MediaSource');
    args.push('source:$source');
  }

  const query = `query(${decl.join(',')}){Page(page:$page,perPage:$pp){pageInfo{currentPage hasNextPage total} media(${args.join(',')}){${SEARCH_FIELDS}}}}`;
  const key = cacheKey('anilist:browse', vars);
  const data = await cached<{
    Page: { pageInfo: { currentPage: number; hasNextPage: boolean; total: number }; media: RawMedia[] };
  }>(key, CACHE_TTL, () => gql(query, vars));
  const items = data.Page.media
    .map(toAnimeModel)
    .filter((a) => !shouldExcludeFromCatalog(a, { allowExcludedFormats: hasQuery }));

  // 中文检索兜底：AniList search 不匹配中文，改用 Bangumi 目录反查 AniList ID 后按 ID 拉取并合并。
  // 仅在首页（page===1）合并一次，避免翻页时重复；失败静默跳过，绝不阻断英文/日文检索结果。
  if (hasQuery && page === 1) {
    try {
      await loadCatalogIndex();
      const zhIds = searchCatalogZh(filters.query!.trim());
      if (zhIds.length) {
        const extra = await getAnimeByIds(zhIds.map(Number));
        const seen = new Set(items.map((a) => a.id));
        for (const a of extra) {
          if (a && !seen.has(a.id)) {
            seen.add(a.id);
            items.push(a);
          }
        }
      }
    } catch {
      /* 中文反查失败不阻断主流程 */
    }
  }

  items.forEach(cacheAnime);
  return {
    items,
    page: data.Page.pageInfo.currentPage,
    hasNext: data.Page.pageInfo.hasNextPage,
    total: data.Page.pageInfo.total,
  };
}

/** 按一组 AniList ID 批量拉取完整资料（供中文检索反查后按 ID 取数）。 */
export async function getAnimeByIds(anilistIds: number[]): Promise<Anime[]> {
  const ids = anilistIds.filter((n) => Number.isFinite(n)).slice(0, 50);
  if (!ids.length) return [];
  const key = cacheKey('anilist:byIds', { ids: [...ids].sort((a, b) => a - b) });
  return cached<Anime[]>(key, CACHE_TTL, async () => {
    const query = `query($ids:[Int]){Page(page:1,perPage:50){media(id_in:$ids,type:ANIME){${SEARCH_FIELDS}}}}`;
    const data = await gql<{ Page: { media: RawMedia[] } }>(query, { ids });
    return data.Page.media.map(toAnimeModel);
  });
}

// 排期表：按「周」拉取完整播出档期。一周可能有 50~200 条，AniList 单次最多 50 条，
// 故内部循环分页（page 递增，airingAt_greater/lesser 固定为本周窗口），合并所有页。
// airingAt 为秒级时间戳，调用方需用 new Date(airingAt * 1000) 转换。
// 每页独立缓存（key 含 page），既能整周复用，又能在单页失败时从断点续拉，避免重复请求。
export async function getAiringSchedule(startSec: number, endSec: number): Promise<AiringEntry[]> {
  const out: AiringEntry[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext && page <= 25) {
    const pageKey = cacheKey('anilist:airing-page', { startSec, endSec, page });
    const data = await cached<{
      Page: { pageInfo: { hasNextPage: boolean }; airingSchedules: { episode: number; airingAt: number; media: RawMedia }[] };
    }>(pageKey, CACHE_TTL, () =>
      gql(
        `query($start:Int,$end:Int,$page:Int,$pp:Int){Page(page:$page,perPage:$pp){pageInfo{hasNextPage} airingSchedules(airingAt_greater:$start,airingAt_lesser:$end,sort:TIME){episode airingAt media{${SEARCH_FIELDS} nextAiringEpisode{episode airingAt}}}}}`,
        { start: startSec, end: endSec, page, pp: 50 },
      ),
    );
    const list = data.Page.airingSchedules || [];
    for (const s of list) {
      if (!s.media) continue;
      const anime = toAnimeModel(s.media);
      if (shouldExcludeFromCatalog(anime)) continue;
      cacheAnime(anime);
      out.push({ anime, episode: s.episode, airingAt: s.airingAt });
    }
    hasNext = data.Page.pageInfo.hasNextPage;
    page += 1;
  }
  return out;
}

/**
 * 「最近更新」排序数据源：返回「最近开播」的日本 TV 动画（含已完结与仍在连载），
 * 按开播时间倒序（START_DATE_DESC）。
 *   - status_in: [RELEASING, FINISHED] → 最近开播的番（含上个季度已完结的番），
 *     这是「看到上个季度的番」的关键：若仅限 RELEASING，上个季度开播的番大多已完结、
 *     不会再出现，反而只剩多年仍连载的老番。
 *   - sort: START_DATE_DESC      → 最新开播在前，天然覆盖「本季新番 + 上季番」。
 *   - isRecentSeason             → 只保留最近 N 个季度内开播，过滤多年前开播的老番
 *     （儿童向/国民长寿番、2000 年代番、早被误标连载的低价值 ONA 等）。
 *   - 查询层直接过滤 format/countryOfOrigin/isAdult/tag/duration，杜绝短片与低价值内容。
 */
export async function getRecentlyUpdated(days = 7, maxItems = 300): Promise<Anime[]> {
  void days; // 参数保留以兼容调用方签名；实际语义由「最近季度」决定，不再依赖时间窗
  const out: Anime[] = [];
  const seen = new Set<string>();

  let page = 1;
  let hasNext = true;
  while (hasNext && page <= 12 && out.length < maxItems) {
    const pageKey = cacheKey('anilist:recent-releasing', { page });
    const data = await cached<{
      Page: { pageInfo: { hasNextPage: boolean }; media: RawMedia[] };
    }>(pageKey, CACHE_TTL, () =>
      gql(
        `query($page:Int,$pp:Int,$tag_not_in:[String]){Page(page:$page,perPage:$pp){pageInfo{hasNextPage} media(type:ANIME,countryOfOrigin:JP,isAdult:false,format_not_in:[MOVIE,SPECIAL,MUSIC],duration_greater:3,tag_not_in:$tag_not_in,status_in:[RELEASING,FINISHED],sort:START_DATE_DESC){${SEARCH_FIELDS}}}}`,
        { page, pp: 50, tag_not_in: CATALOG_TAG_NOT_IN },
      ),
    );

    for (const m of data.Page.media ?? []) {
      const anime = toAnimeModel(m);
      if (shouldExcludeFromCatalog(anime)) continue;
      if (!isRecentSeason(anime)) continue; // 过滤多年前开播的老番
      if (seen.has(anime.id)) continue;
      seen.add(anime.id);
      cacheAnime(anime);
      out.push(anime);
    }

    hasNext = data.Page.pageInfo.hasNextPage;
    page += 1;
  }

  return out;
}

export function getCachedRecommendations(sourceId: string): Anime[] {
  return recCache.get(sourceId) ?? [];
}

// 供数据层从云端 anime 行重建 Anime（刷新后无需重新请求 API 即可显示真实资料）
export function rehydrateAnimeFromCloud(row: Record<string, any>): Anime {
  const id = row.source_id as string;
  const cached = id ? getCachedAnime(id) : undefined;
  if (cached) return cached;
  return {
    id: id || `anilist:${row.anilist_id ?? row.id}`,
    anilistId: row.anilist_id ?? undefined,
    titleNative: row.title_native || '未知作品',
    titleChinese: row.title_chinese || undefined,
    titleRomaji: row.title_romaji || '',
    titleEnglish: row.title_english || undefined,
    synonyms: Array.isArray(row.synonyms) ? row.synonyms : [],
    coverGradient: row.cover_gradient || gradientFor(id || String(row.id)),
    coverImageUrl: row.cover_image_url || undefined,
    bannerGradient: row.banner_gradient || gradientFor((id || String(row.id)) + '|b'),
    bannerImageUrl: row.banner_image_url || undefined,
    format: (row.format as AnimeFormat) || 'TV',
    episodes: row.episodes ?? 1,
    durationMin: row.duration_min ?? 24,
    status: (row.status as AnimeStatus) || 'FINISHED',
    season: row.season || undefined,
    seasonYear: row.season_year ?? undefined,
    studios: Array.isArray(row.studios) ? row.studios : [],
    source: row.source || '',
    genres: Array.isArray(row.genres) ? row.genres : [],
    tags: Array.isArray(row.tags) ? row.tags : undefined,
    countryOfOrigin: row.country_of_origin || undefined,
    isAdult: !!row.is_adult,
    synopsis: row.synopsis || '',
    // 数据库未存评分时保留 undefined，与 toAnimeModel 一致，避免「无评分」显示为 0 分。
    averageScore: typeof row.average_score === 'number' ? row.average_score : undefined,
  };
}
