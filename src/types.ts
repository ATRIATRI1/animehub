// AnimeHub 前端类型定义
// 这些字段与第一阶段设计的云端数据库逻辑模型一一对应，
// 当前阶段仅用于 Mock 数据层；接入 WorkBuddy 云数据库时可直接映射。

export type WatchStatus = 'planning' | 'watching' | 'completed' | 'rewatching' | 'paused' | 'dropped';
export type AnimeFormat = 'TV' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL';
export type AnimeStatus = 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED';
export type Season = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export interface Anime {
  id: string;
  anilistId?: number;
  titleNative: string; // 原始语言名称（如日文原名）
  titleChinese?: string; // 中文名称
  titleRomaji: string;
  titleEnglish?: string;
  synonyms?: string[];
  coverGradient: string; // 原创占位封面（渐变），无第三方素材
  coverImageUrl?: string; // 真实封面图 URL（接入真实资料后填充，可为空）
  bannerGradient: string;
  bannerImageUrl?: string; // 真实横幅图 URL（可为空）
  format: AnimeFormat;
  episodes: number;
  durationMin: number;
  status: AnimeStatus;
  season?: Season;
  seasonYear?: number;
  studios: string[];
  source: string;
  genres: string[];
  tags?: string[]; // AniList 标签（用于儿童向/低价值内容过滤）
  countryOfOrigin?: string; // 产地代码，如 "JP"（用于日本动画过滤）
  isAdult?: boolean; // 是否成人内容（默认过滤）
  synopsis: string;
  averageScore?: number; // 0-10；undefined 表示「无评分」（上游无数据或样本不足），绝不显示成 0 分
  airDay?: number; // 0-6，用于追番日历（0=周日）
  airTime?: string; // "HH:MM"
  // 下一次播出信息（AniList nextAiringEpisode）：用于追番页「接下来更新」精确倒计时与「最新集」计算。
  // airingAt 为 Unix 秒级时间戳，可直接 new Date(airingAt*1000) 得到精确播出时刻（含秒）。
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
}

export interface Collection {
  id: string;
  userId: string;
  animeId: string;
  status: WatchStatus;
  score: number; // 0-10，0 表示未评分
  progressEpisodes: number;
  startedAt?: string; // ISO
  completedAt?: string; // ISO
  rewatchCount: number;
  isFavorite: boolean;
  isPrivate: boolean;
  personalNotes: string;
  tags: string[]; // 自定义标签名称
  createdAt: string;
  updatedAt: string;
}

export interface WatchHistory {
  id: string;
  userId: string;
  collectionId?: string; // 关联的个人收藏记录（云端新增，保证历史↔收藏对应）
  animeId: string;
  episode: number;
  watchedAt: string; // ISO
  durationMin: number;
}

export interface CustomTag {
  id: string;
  userId: string;
  name: string;
  color: string;
}

export interface UserSettings {
  userId: string;
  theme: 'aurora' | 'sakura';
  displayName: string;
  bio: string;
  defaultView: 'grid' | 'list';
}

export interface CollectionWithAnime extends Collection {
  anime: Anime;
}

// 统计数据
export interface StatsResult {
  collectionTotal: number;
  completedCount: number;
  watchingCount: number;
  totalEpisodesWatched: number;
  totalWatchMinutes: number;
  watchDays: number;
  averageScore: number;
  scoreDistribution: { label: string; count: number }[];
  genreDistribution: { name: string; value: number }[];
  yearlyTrend: { year: number; episodes: number }[];
  statusDistribution: { name: string; key: WatchStatus; value: number; color: string }[];
  tagStats: { name: string; value: number }[];
}
