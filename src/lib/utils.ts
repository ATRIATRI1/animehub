export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// 判断一段简介最可能的语言（用于详情页「中文 > 日文 > 英文」展示优先级与语言标签）。
// AniList 的 description 是单一字段，语言不固定：多数英文、少数日文、极个别中文，
// 需据此标注真实语言，避免把英文简介误标为中文，也便于按优先级回退。
const SYN_KANA_RE = /[぀-ゟ゠-ヿ]/;
const SYN_SIMPLIFIED_RE =
  /[国卫说电关们飞龙汉图书记车贝见亲进击术态觉开写爱义产兰变体报东长门问间远厂广团园归办总认让话课这还实会学时视网语]/;
const SYN_ZH_PARTICLE_RE = /[的了吗呢吧啊呀哦啦之版]/;
export type SynopsisLang = 'zh' | 'ja' | 'en';
export function synopsisLang(text?: string | null): SynopsisLang {
  if (!text) return 'en';
  if (SYN_KANA_RE.test(text)) return 'ja'; // 含假名 → 日文
  if (SYN_SIMPLIFIED_RE.test(text) || SYN_ZH_PARTICLE_RE.test(text)) return 'zh';
  return 'en';
}

export type { WatchStatus } from '../types';

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d} 天 ${rh} 小时` : `${d} 天`;
}

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// 将 0-10 评分转为 5 星制（用于星级显示）
export function scoreToStars(score: number): number {
  return Math.round((score / 10) * 5 * 2) / 2;
}

// 计算下一个该星期几的播出时间（动态，不写死季度）
export function nextAiringTime(airDay: number, airTime = '23:00'): Date {
  const now = new Date();
  const [hh, mm] = airTime.split(':').map(Number);
  const result = new Date(now);
  result.setHours(hh, mm, 0, 0);
  let diff = (airDay - now.getDay() + 7) % 7;
  if (diff === 0) {
    // 今天已播出则顺延一周；否则若还没到时间则今天
    if (now.getHours() * 60 + now.getMinutes() >= hh * 60 + mm) diff = 7;
  }
  result.setDate(result.getDate() + diff);
  return result;
}

export function getSeasonFromDate(d = new Date()): { season: string; year: number } {
  const m = d.getMonth();
  const y = d.getFullYear();
  if (m <= 1 || m === 11) return { season: 'WINTER', year: m === 11 ? y + 1 : y };
  if (m <= 4) return { season: 'SPRING', year: y };
  if (m <= 7) return { season: 'SUMMER', year: y };
  return { season: 'FALL', year: y };
}

// ---- 追番页「放送进度」辅助函数 ----

/** 本周一 00:00（本地时区），用于判断「本周已更」。 */
export function weekStartMonday(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=周日
  const diff = (day + 6) % 7; // 距离本周一的天数
  d.setDate(d.getDate() - diff);
  return d;
}

/** 已播出的最新集数（基于 AniList nextAiringEpisode：下一集 - 1）。无数据返回 null。 */
export function latestAiredEpisode(a: {
  episodes?: number;
  status?: string;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
}): number | null {
  if (a.nextAiringEpisode && a.nextAiringEpisode.episode > 1) return a.nextAiringEpisode.episode - 1;
  if (a.status === 'FINISHED' && a.episodes) return a.episodes;
  return null;
}

/** 下一次播出时间（精确）。优先使用 nextAiringEpisode.airingAt（秒级），否则退化为星期+时刻估算。 */
export function nextAirDate(a: {
  airDay?: number;
  airTime?: string;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
}): Date | null {
  if (a.nextAiringEpisode) return new Date(a.nextAiringEpisode.airingAt * 1000);
  if (a.airDay !== undefined) return nextAiringTime(a.airDay, a.airTime);
  return null;
}

/**
 * 本周已更的集数信息（针对每周放送的新番）。
 * 计算最近一次「过去」播出 = 下次播出 - 7 天；若落在本周一 00:00 之后即为本周已更。
 * 返回 { episode, airedAt }，否则 null。
 */
export function airedThisWeek(a: {
  episodes?: number;
  status?: string;
  airDay?: number;
  airTime?: string;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
}): { episode: number; airedAt: Date } | null {
  const next = nextAirDate(a);
  if (!next) return null;
  const lastAired = new Date(next.getTime() - 7 * 86400000);
  if (lastAired.getTime() < weekStartMonday().getTime()) return null;
  if (lastAired.getTime() > Date.now()) return null;
  const ep = latestAiredEpisode(a);
  if (ep == null) return null;
  return { episode: ep, airedAt: lastAired };
}

export const STATUS_META: Record<
  string,
  { label: string; colorVar: string; tw: string }
> = {
  planning: { label: '想看', colorVar: 'var(--c-plan)', tw: 'plan' },
  watching: { label: '在看', colorVar: 'var(--c-watch)', tw: 'watch' },
  completed: { label: '看过', colorVar: 'var(--c-done)', tw: 'done' },
  rewatching: { label: '再看', colorVar: 'var(--c-rewatch)', tw: 'rewatch' },
  paused: { label: '搁置', colorVar: 'var(--c-hold)', tw: 'hold' },
  dropped: { label: '弃番', colorVar: 'var(--c-drop)', tw: 'drop' },
};

export const SEASON_LABEL: Record<string, string> = {
  WINTER: '冬季',
  SPRING: '春季',
  SUMMER: '夏季',
  FALL: '秋季',
};

export const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 中文优先的展示标题：优先已校验过的中文译名，其次罗马音，最后日文原名。
// 注意：titleChinese 在 anilist.ts 的 toAnimeModel 中已通过 looksChinese 严格校验，
// 不会把日文标题误判为中文，因此此处可安全优先使用。
export function displayTitle(a: {
  titleChinese?: string;
  titleRomaji: string;
  titleNative: string;
}): string {
  return a.titleChinese || a.titleRomaji || a.titleNative;
}

// 以下映射表将 AniList 的英文枚举/标签翻译为中文，供详情页、统计图表、筛选器统一展示。
// 仅做「已知英文 → 中文」的静态映射，绝不臆造未经验证的翻译；查不到时原样回退。
export const GENRE_ZH: Record<string, string> = {
  Action: '动作',
  Adventure: '冒险',
  Comedy: '喜剧',
  Drama: '剧情',
  Ecchi: '擦边',
  Fantasy: '奇幻',
  Horror: '恐怖',
  'Mahou Shoujo': '魔法少女',
  Mecha: '机战',
  Music: '音乐',
  Mystery: '悬疑',
  Psychological: '心理',
  Romance: '恋爱',
  'Sci-Fi': '科幻',
  'Slice of Life': '日常',
  Sports: '运动',
  Supernatural: '超自然',
  Thriller: '惊悚',
};

export const SOURCE_ZH: Record<string, string> = {
  MANGA: '漫画改',
  'LIGHT_NOVEL': '小说改',
  NOVEL: '小说改',
  'WEB_NOVEL': '小说改',
  GAME: '游戏改',
  'VISUAL_NOVEL': '游戏改',
  '4_KOMA_MANGA': '漫画改',
  'WEB_MANGA': '漫画改',
  ORIGINAL: '原创',
};

export const FORMAT_ZH: Record<string, string> = {
  TV: 'TV 动画',
  MOVIE: '剧场版',
  OVA: 'OVA',
  ONA: 'Web 动画',
  SPECIAL: '其他',
};

// 作品放送状态中文（用于卡片副信息「状态 · 年份」）
export const ANIME_STATUS_ZH: Record<string, string> = {
  FINISHED: '完结',
  RELEASING: '连载中',
  NOT_YET_RELEASED: '未开播',
  CANCELLED: '已搁置',
};

export function zhGenre(g: string): string {
  return GENRE_ZH[g] ?? g;
}
