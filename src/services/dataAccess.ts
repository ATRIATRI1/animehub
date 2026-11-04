import type {
  Anime,
  Collection,
  CollectionWithAnime,
  CustomTag,
  StatsResult,
  UserSettings,
  WatchHistory,
  WatchStatus,
} from '../types';
import {
  seedAnime,
  seedCollections,
  seedHistory,
  seedSettings,
  seedTags,
} from '../data/mockData';
import { STATUS_META, GENRE_ZH } from '../lib/utils';
import { CLOUD_MODE } from '../lib/env';
import { notify } from './notify';
import { cloudDataAccess } from './cloudDataAccess';

// ============================================================
// 数据访问层（DAL）
// ------------------------------------------------------------
// 统一接口 AnimeHubDataAccess 两种实现：
//  - MockDataAccess：本地 localStorage，仅用于 dev / 预览（无登录）
//  - CloudDataAccess：真实 WorkBuddy 云端（生产构建，需登录）
// 第三阶段：生产构建（!import.meta.env.DEV）默认走云端；dev 走 Mock，
// 既保留 Mock 数据层、又能在部署后无缝切换到真实数据库。
// ============================================================

export interface UpsertCollectionInput {
  animeId: string;
  status?: WatchStatus;
  score?: number;
  progressEpisodes?: number;
  rewatchCount?: number;
  isFavorite?: boolean;
  isPrivate?: boolean;
  personalNotes?: string;
  tags?: string[];
}

export interface ExportBundle {
  version: number;
  exportedAt: string;
  collections: Collection[];
  history: WatchHistory[];
  tags: CustomTag[];
  settings: UserSettings;
}

export interface AnimeHubDataAccess {
  getAnimeList(): Promise<Anime[]>;
  getAnimeById(id: string): Promise<Anime | undefined>;
  getCollections(): Promise<CollectionWithAnime[]>;
  getCollectionByAnime(animeId: string): Promise<Collection | undefined>;
  upsertCollection(input: UpsertCollectionInput): Promise<Collection>;
  getWatchHistory(): Promise<WatchHistory[]>;
  getCustomTags(): Promise<CustomTag[]>;
  getSettings(): Promise<UserSettings>;
  updateSettings(patch: Partial<UserSettings>): Promise<UserSettings>;
  getStats(): Promise<StatsResult>;
  resetDemoData(): Promise<void>;
  exportData(): Promise<ExportBundle>;
  importData(bundle: Partial<ExportBundle>): Promise<{ collections: number; history: number; tags: number }>;
}

interface PersistShape {
  collections: Collection[];
  history: WatchHistory[];
  settings: UserSettings;
  tags: CustomTag[];
}

class MockDataAccess implements AnimeHubDataAccess {
  private anime: Anime[] = seedAnime;
  private collections: Collection[];
  private history: WatchHistory[];
  private settings: UserSettings;
  private tags: CustomTag[];

  constructor() {
    const loaded = this.load();
    if (loaded) {
      this.collections = loaded.collections;
      this.history = loaded.history;
      this.settings = loaded.settings;
      this.tags = loaded.tags;
    } else {
      this.collections = seedCollections.map((c) => ({ ...c }));
      this.history = seedHistory.map((h) => ({ ...h }));
      this.settings = { ...seedSettings };
      this.tags = seedTags.map((t) => ({ ...t }));
      this.save();
    }
  }

  private load(): PersistShape | null {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as PersistShape;
    } catch {
      return null;
    }
  }
  private save() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          collections: this.collections,
          history: this.history,
          settings: this.settings,
          tags: this.tags,
        }),
      );
    } catch {
      /* 忽略持久化失败（如隐私模式） */
    }
  }

  private notify() {
    this.save();
    notify();
  }

  async getAnimeList() {
    return this.anime;
  }
  async getAnimeById(id: string) {
    return this.anime.find((a) => a.id === id);
  }
  private withAnime(c: Collection): CollectionWithAnime {
    const anime = this.anime.find((a) => a.id === c.animeId)!;
    return { ...c, anime };
  }
  async getCollections(): Promise<CollectionWithAnime[]> {
    return this.collections
      .slice()
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
      .map((c) => this.withAnime(c));
  }
  async getCollectionByAnime(animeId: string) {
    return this.collections.find((c) => c.animeId === animeId);
  }
  async upsertCollection(input: UpsertCollectionInput): Promise<Collection> {
    const now = new Date().toISOString();
    const existing = this.collections.find((c) => c.animeId === input.animeId);
    if (existing) {
      const updated: Collection = {
        ...existing,
        ...input,
        updatedAt: now,
        completedAt:
          input.status === 'completed'
            ? (existing.completedAt ?? now)
            : undefined,
      };
      this.collections = this.collections.map((c) =>
        c.animeId === input.animeId ? updated : c,
      );
      this.notify();
      return updated;
    }
    const created: Collection = {
      id: `c_${input.animeId}_${Date.now()}`,
      userId: 'u_demo',
      animeId: input.animeId,
      status: input.status ?? 'planning',
      score: input.score ?? 0,
      progressEpisodes: input.progressEpisodes ?? 0,
      startedAt: input.status === 'planning' ? undefined : now,
      completedAt: input.status === 'completed' ? now : undefined,
      rewatchCount: input.rewatchCount ?? 0,
      isFavorite: input.isFavorite ?? false,
      isPrivate: input.isPrivate ?? false,
      personalNotes: input.personalNotes ?? '',
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.collections = [created, ...this.collections];
    this.notify();
    return created;
  }
  async getWatchHistory() {
    return this.history.slice().sort((a, b) => +new Date(b.watchedAt) - +new Date(a.watchedAt));
  }
  async getCustomTags() {
    return this.tags;
  }
  async getSettings() {
    return this.settings;
  }
  async updateSettings(patch: Partial<UserSettings>) {
    this.settings = { ...this.settings, ...patch };
    this.notify();
    return this.settings;
  }
  async getStats(): Promise<StatsResult> {
    const animeById = new Map(this.anime.map((a) => [a.id, a]));
    const cols = this.collections;
    const completedCount = cols.filter((c) => c.status === 'completed').length;
    const watchingCount = cols.filter((c) => c.status === 'watching').length;
    const totalEpisodesWatched = cols.reduce((s, c) => s + c.progressEpisodes, 0);
    const totalWatchMinutes = cols.reduce((s, c) => {
      const a = animeById.get(c.animeId);
      return s + c.progressEpisodes * (a?.durationMin ?? 24);
    }, 0);
    const watchDays = new Set(this.history.map((h) => h.watchedAt.slice(0, 10))).size;
    const scored = cols.filter((c) => c.score > 0);
    const averageScore = scored.length
      ? Math.round((scored.reduce((s, c) => s + c.score, 0) / scored.length) * 100) / 100
      : 0;

    const buckets = [
      { label: '0-5.9', min: 0, max: 5.9 },
      { label: '6-6.9', min: 6, max: 6.9 },
      { label: '7-7.9', min: 7, max: 7.9 },
      { label: '8-8.9', min: 8, max: 8.9 },
      { label: '9-10', min: 9, max: 10 },
    ];
    const scoreDistribution = buckets.map((b) => ({
      label: b.label,
      count: scored.filter((c) => c.score >= b.min && c.score <= b.max).length,
    }));

    const genreMap = new Map<string, number>();
    cols.forEach((c) => {
      const a = animeById.get(c.animeId);
      a?.genres.forEach((g) => genreMap.set(GENRE_ZH[g] ?? g, (genreMap.get(GENRE_ZH[g] ?? g) ?? 0) + 1));
    });
    const genreDistribution = [...genreMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const yearMap = new Map<number, number>();
    this.history.forEach((h) => {
      const y = new Date(h.watchedAt).getFullYear();
      yearMap.set(y, (yearMap.get(y) ?? 0) + 1);
    });
    const minYear = Math.min(2021, ...yearMap.keys());
    const maxYear = new Date().getFullYear();
    const yearlyTrend: { year: number; episodes: number }[] = [];
    for (let y = minYear; y <= maxYear; y++) {
      yearlyTrend.push({ year: y, episodes: yearMap.get(y) ?? 0 });
    }

    const statusKeys: WatchStatus[] = ['planning', 'watching', 'completed', 'rewatching', 'paused', 'dropped'];
    const statusDistribution = statusKeys.map((k) => ({
      name: STATUS_META[k].label,
      key: k,
      value: cols.filter((c) => c.status === k).length,
      color: STATUS_META[k].colorVar,
    }));

    const tagMap = new Map<string, number>();
    cols.forEach((c) => c.tags.forEach((t) => tagMap.set(t, (tagMap.get(t) ?? 0) + 1)));
    const tagStats = [...tagMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      collectionTotal: cols.length,
      completedCount,
      watchingCount,
      totalEpisodesWatched,
      totalWatchMinutes,
      watchDays,
      averageScore,
      scoreDistribution,
      genreDistribution,
      yearlyTrend,
      statusDistribution,
      tagStats,
    };
  }
  async resetDemoData() {
    this.collections = seedCollections.map((c) => ({ ...c }));
    this.history = seedHistory.map((h) => ({ ...h }));
    this.settings = { ...seedSettings };
    this.tags = seedTags.map((t) => ({ ...t }));
    this.notify();
  }
  async exportData(): Promise<ExportBundle> {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      collections: this.collections.map((c) => ({ ...c })),
      history: this.history.map((h) => ({ ...h })),
      tags: this.tags.map((t) => ({ ...t })),
      settings: { ...this.settings },
    };
  }
  async importData(bundle: Partial<ExportBundle>): Promise<{ collections: number; history: number; tags: number }> {
    let collections = 0;
    let history = 0;
    let tags = 0;
    if (bundle.settings) this.settings = { ...this.settings, ...bundle.settings };
    if (Array.isArray(bundle.collections)) {
      this.collections = bundle.collections.map((c) => ({ ...c }));
      collections = this.collections.length;
    }
    if (Array.isArray(bundle.history)) {
      this.history = bundle.history.map((h) => ({ ...h }));
      history = this.history.length;
    }
    if (Array.isArray(bundle.tags)) {
      this.tags = bundle.tags.map((t) => ({ ...t }));
      tags = this.tags.length;
    }
    this.notify();
    return { collections, history, tags };
  }
}

const STORE_KEY = 'animehub_mock_v1';

// ---- 订阅：数据变更后通知所有订阅者重新拉取（Mock 与 Cloud 共用） ----
export { subscribe } from './notify';

// 云端（生产构建或 WorkBuddy 云 host）走真实数据层；仅本地 dev 走 Mock。
export const dataAccess: AnimeHubDataAccess = CLOUD_MODE
  ? cloudDataAccess
  : new MockDataAccess();
