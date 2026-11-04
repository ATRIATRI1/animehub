import { cloud } from './cloudClient';
import { getAuthUser } from './auth';
import { notify } from './notify';
import { seedAnime } from '../data/mockData';
import { STATUS_META, GENRE_ZH } from '../lib/utils';
import {
  getCachedAnime,
  rehydrateAnimeFromCloud,
  isExternalSourceId,
} from './anilist';
import type {
  Anime,
  AnimeFormat,
  AnimeStatus,
  Collection,
  CollectionWithAnime,
  CustomTag,
  StatsResult,
  UserSettings,
  WatchHistory,
  WatchStatus,
} from '../types';
import type { AnimeHubDataAccess, ExportBundle, UpsertCollectionInput } from './dataAccess';

// 云端 SDK 的 database.from() 不带表结构类型，这里放宽到 any 以屏蔽 never[] 推断错误
const db = cloud.database as any;

// ============================================================================
// CloudDataAccess —— 真实 WorkBuddy 云端实现
// ----------------------------------------------------------------------------
// 设计要点：
// 1) 公共动漫资料来自 AniList（Phase 4），不入库；仅当用户「添加收藏」时，
//    才将该作品的真实元数据物化为一条云端 anime 行（source_id = 'anilist:xxx'），
//    供 collections/watch_history 外键引用。用户个人库初始为空。
// 2) 既有 40 部本地虚构目录（seedAnime）仍保留：用于 dev(Mock) 与未联网场景，
//    其 source_id 为 'a1'..'a40'。外部作品 source_id 为 'anilist:<id>'，
//    二者命名空间不同，绝不与云端 bigint 主键冲突。
// 3) 所有写操作不传 owner_id：默认值 auth.uid() + RLS WITH CHECK 双重保证
//    数据只落在该用户名下，前端无法伪造归属。
// ============================================================================

const ANIME_BY_ID = new Map<string, Anime>(seedAnime.map((a) => [a.id, a]));

// 目录 id -> 云端 bigint id 的运行期缓存（避免每次查库）
const animeIdCache = new Map<string, number>();

type Row = Record<string, any>;

function num(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 构建 bigint -> source_id 映射（仅取已物化的 anime 行） */
async function buildSourceMap(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const { data } = await db.from('anime').select('id, source_id').not('source_id', 'is', null);
  (data ?? []).forEach((r: Row) => {
    if (r.source_id) map.set(num(r.id), String(r.source_id));
  });
  return map;
}

/** 将作品标识解析为云端 anime 表的 bigint id；必要时物化一条 anime 行 */
async function resolveAnimeId(catalogId: string): Promise<number> {
  const cached = animeIdCache.get(catalogId);
  if (cached) return cached;

  const { data: found } = await db
    .from('anime')
    .select('id')
    .eq('source_id', catalogId)
    .maybeSingle();
  if (found) {
    const id = num(found.id);
    animeIdCache.set(catalogId, id);
    return id;
  }

  // 外部作品：优先用搜索/详情阶段已缓存的真实元数据物化
  const ext = getCachedAnime(catalogId);
  const row = ext ? toAnimeRow(ext, catalogId) : toAnimeRowMinimal(catalogId);

  const { data: inserted, error } = await db.from('anime').insert(row).select('id').single();
  if (error) {
    // 唯一索引保护（并发/重试）：回退查询已有行
    const { data: retry } = await db
      .from('anime')
      .select('id')
      .eq('source_id', catalogId)
      .maybeSingle();
    if (retry) {
      const id = num(retry.id);
      animeIdCache.set(catalogId, id);
      return id;
    }
    throw error;
  }
  const id = num(inserted.id);
  animeIdCache.set(catalogId, id);
  return id;
}

/** 仅含 source_id 的最小物化行（无缓存元数据时兜底，仍可外键关联） */
function toAnimeRowMinimal(sourceId: string): Row {
  return {
    source_id: sourceId,
    title_native: sourceId,
    title_romaji: '',
    title_chinese: null,
    title_english: null,
    synonyms: [],
    format: 'TV',
    episodes: 1,
    duration_min: 24,
    status: 'FINISHED',
    season: null,
    season_year: null,
    studios: [],
    source: '',
    genres: [],
    synopsis: '',
    cover_gradient: '',
    cover_image_url: null,
    banner_gradient: '',
    banner_image_url: null,
    average_score: 0,
  };
}

function toAnimeRow(a: Anime, sourceId: string) {
  return {
    source_id: sourceId,
    title_native: a.titleNative,
    title_chinese: a.titleChinese ?? null,
    title_romaji: a.titleRomaji,
    title_english: a.titleEnglish ?? null,
    synonyms: a.synonyms ?? [],
    format: a.format,
    episodes: a.episodes,
    duration_min: a.durationMin,
    status: a.status,
    season: a.season ?? null,
    season_year: a.seasonYear ?? null,
    studios: a.studios,
    source: a.source,
    genres: a.genres,
    synopsis: a.synopsis,
    cover_gradient: a.coverGradient,
    cover_image_url: a.coverImageUrl ?? null,
    banner_gradient: a.bannerGradient,
    banner_image_url: a.bannerImageUrl ?? null,
    average_score: a.averageScore ?? null,
  };
}

function toCollection(row: Row, catalogId: string, anime: Anime): Collection {
  return {
    id: String(row.id),
    userId: row.owner_id,
    animeId: catalogId,
    status: row.status,
    score: num(row.score),
    progressEpisodes: num(row.progress_episodes),
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    rewatchCount: num(row.rewatch_count),
    isFavorite: !!row.is_favorite,
    isPrivate: !!row.is_private,
    personalNotes: row.personal_notes ?? '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSettings(r: Row): UserSettings {
  return {
    userId: r.owner_id,
    theme: r.theme === 'sakura' ? 'sakura' : 'aurora',
    displayName: r.display_name ?? '我的收藏',
    bio: r.bio ?? '',
    defaultView: r.default_view === 'list' ? 'list' : 'grid',
  };
}

/** 进度增加时补写观看历史（让「最近观看 / 年度趋势」有真实数据） */
async function recordHistory(
  existing: Row | null,
  row: Row,
  animeBigint: number,
  catalogId: string,
  durationMin = 24,
) {
  const user = getAuthUser();
  const prev = existing ? num(existing.progress_episodes) : 0;
  const next = num(row.progress_episodes);
  if (!user || next <= prev) return;
  const rows: Row[] = [];
  for (let ep = prev + 1; ep <= next; ep++) {
    rows.push({
      collection_id: num(row.id),
      anime_id: animeBigint,
      episode: ep,
      watched_at: new Date().toISOString(),
      duration_min: durationMin,
    });
  }
  if (!rows.length) return;
  try {
    await db.from('watch_history').insert(rows);
  } catch {
    /* 历史为衍生数据，写入失败不影响主流程 */
  }
}

class CloudDataAccess implements AnimeHubDataAccess {
  // 目录为本地只读数据，不依赖云端
  async getAnimeList(): Promise<Anime[]> {
    return seedAnime;
  }
  async getAnimeById(id: string): Promise<Anime | undefined> {
    return ANIME_BY_ID.get(id);
  }

  async getCollections(): Promise<CollectionWithAnime[]> {
    const { data, error } = await db
      .from('collections')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    const sourceMap = await buildSourceMap();
    const ids = (data ?? []).map((r: Row) => num(r.anime_id));
    let animeRows = new Map<number, Row>();
    if (ids.length) {
      const { data: rows } = await db.from('anime').select('*').in('id', ids);
      (rows ?? []).forEach((a: Row) => animeRows.set(num(a.id), a));
    }
    const out: CollectionWithAnime[] = [];
    for (const r of data ?? []) {
      const sourceId = sourceMap.get(num(r.anime_id)) ?? '';
      let anime: Anime | undefined = ANIME_BY_ID.get(sourceId);
      if (!anime) {
        const row = animeRows.get(num(r.anime_id));
        if (row) anime = rehydrateAnimeFromCloud(row);
      }
      if (!anime || !sourceId) continue;
      out.push({ ...toCollection(r, sourceId, anime), anime });
    }
    return out;
  }

  async getCollectionByAnime(animeId: string): Promise<Collection | undefined> {
    const animeBigint = await resolveAnimeId(animeId);
    const { data } = await db
      .from('collections')
      .select('*')
      .eq('anime_id', animeBigint)
      .maybeSingle();
    if (!data) return undefined;
    let anime = ANIME_BY_ID.get(animeId) ?? getCachedAnime(animeId);
    if (!anime) {
      const { data: arow } = await db.from('anime').select('*').eq('id', animeBigint).maybeSingle();
      if (arow) anime = rehydrateAnimeFromCloud(arow);
    }
    if (!anime) return undefined;
    return toCollection(data, animeId, anime);
  }

  async upsertCollection(input: UpsertCollectionInput): Promise<Collection> {
    const catalogId = input.animeId;
    const animeBigint = await resolveAnimeId(catalogId);
    const { data: existing } = await db
      .from('collections')
      .select('*')
      .eq('anime_id', animeBigint)
      .maybeSingle();

    const now = new Date().toISOString();
    const status: WatchStatus = input.status ?? (existing?.status as WatchStatus) ?? 'planning';
    const score = input.score ?? num(existing?.score);
    const progress = input.progressEpisodes ?? num(existing?.progress_episodes);
    const rewatch = input.rewatchCount ?? num(existing?.rewatch_count);
    const fav = input.isFavorite ?? !!existing?.is_favorite;
    const priv = input.isPrivate ?? !!existing?.is_private;
    const notes = input.personalNotes ?? (existing?.personal_notes ?? '');
    const tags = input.tags ?? (Array.isArray(existing?.tags) ? existing.tags : []);

    const startedAt = existing?.started_at
      ? existing.started_at
      : status === 'planning'
        ? null
        : now;
    // 完成时间：仅「看过」设为 now；「再看/在看/想看/搁置/弃番」都清空完成标记
    // （再看=重新观看未完成，在看/想看/搁置/弃番=尚未完成）。
    const completedAt = status === 'completed' ? (existing?.completed_at ?? now) : null;

    const patch = {
      status,
      score,
      progress_episodes: progress,
      rewatch_count: rewatch,
      is_favorite: fav,
      is_private: priv,
      personal_notes: notes,
      tags,
      started_at: startedAt,
      completed_at: completedAt,
      updated_at: now,
    };

    let row: Row;
    if (existing) {
      const { data, error } = await db
        .from('collections')
        .update(patch)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      row = data;
    } else {
      const { data, error } = await db
        .from('collections')
        .insert({ ...patch, anime_id: animeBigint })
        .select('*')
        .single();
      if (error) throw error;
      row = data;
    }

    await recordHistory(
      existing,
      row,
      animeBigint,
      catalogId,
      getCachedAnime(catalogId)?.durationMin ?? 24,
    );
    notify();
    return toCollection(row, catalogId, ANIME_BY_ID.get(catalogId) ?? getCachedAnime(catalogId)!);
  }

  async getWatchHistory(): Promise<WatchHistory[]> {
    const { data, error } = await db
      .from('watch_history')
      .select('*')
      .order('watched_at', { ascending: false });
    if (error) throw error;
    const sourceMap = await buildSourceMap();
    return (data ?? []).map((r: Row) => ({
      id: String(r.id),
      userId: r.owner_id,
      collectionId: String(r.collection_id),
      animeId: sourceMap.get(num(r.anime_id)) ?? String(r.anime_id),
      episode: num(r.episode),
      watchedAt: r.watched_at,
      durationMin: num(r.duration_min),
    }));
  }

  async getCustomTags(): Promise<CustomTag[]> {
    const { data, error } = await db
      .from('custom_tags')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: Row) => ({
      id: String(r.id),
      userId: r.owner_id,
      name: r.name,
      color: r.color ?? '#8B5CF6',
    }));
  }

  async getSettings(): Promise<UserSettings> {
    const user = getAuthUser();
    const { data, error } = await db.from('user_settings').select('*').maybeSingle();
    if (error) throw error;
    if (!data) {
      const defaults = {
        owner_id: user?.uid ?? '',
        owner_name: user?.name ?? null,
        theme: 'aurora',
        display_name: '我的收藏',
        bio: '',
        default_view: 'grid',
      };
      const { data: created, error: e2 } = await db
        .from('user_settings')
        .upsert(defaults)
        .select('*')
        .single();
      if (e2) throw e2;
      return mapSettings(created);
    }
    return mapSettings(data);
  }

  async updateSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
    const user = getAuthUser();
    const set: Row = { owner_id: user?.uid ?? '', owner_name: user?.name ?? null };
    if (patch.theme) set.theme = patch.theme;
    if (patch.displayName !== undefined) set.display_name = patch.displayName;
    if (patch.bio !== undefined) set.bio = patch.bio;
    if (patch.defaultView) set.default_view = patch.defaultView;
    const { data, error } = await db.from('user_settings').upsert(set).select('*').single();
    if (error) throw error;
    notify();
    return mapSettings(data);
  }

  async getStats(): Promise<StatsResult> {
    const [cols, history] = await Promise.all([this.getCollections(), this.getWatchHistory()]);
    const completedCount = cols.filter((c) => c.status === 'completed').length;
    const watchingCount = cols.filter((c) => c.status === 'watching').length;
    const totalEpisodesWatched = cols.reduce((s, c) => s + c.progressEpisodes, 0);
    const totalWatchMinutes = cols.reduce((s, c) => {
      return s + c.progressEpisodes * (c.anime?.durationMin ?? 24);
    }, 0);
    const watchDays = new Set(history.map((h) => h.watchedAt.slice(0, 10))).size;
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
      c.anime?.genres.forEach((g) => genreMap.set(GENRE_ZH[g] ?? g, (genreMap.get(GENRE_ZH[g] ?? g) ?? 0) + 1));
    });
    const genreDistribution = [...genreMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const yearMap = new Map<number, number>();
    history.forEach((h) => {
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

  async resetDemoData(): Promise<void> {
    const user = getAuthUser();
    if (!user) return;
    // 仅清空本人个人数据（RLS 已强制 owner 范围，这里再显式加 owner 过滤）
    await db.from('watch_history').delete().eq('owner_id', user.uid);
    await db.from('collections').delete().eq('owner_id', user.uid);
    await db.from('custom_tags').delete().eq('owner_id', user.uid);
    await db
      .from('user_settings')
      .update({ theme: 'aurora', display_name: '我的收藏', bio: '', default_view: 'grid' })
      .eq('owner_id', user.uid);
    notify();
  }

  async exportData(): Promise<ExportBundle> {
    const [cols, history, tags, settings] = await Promise.all([
      this.getCollections(),
      this.getWatchHistory(),
      this.getCustomTags(),
      this.getSettings(),
    ]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      collections: cols.map((c) => {
        const { anime, ...rest } = c;
        void anime;
        return rest;
      }),
      history,
      tags,
      settings,
    };
  }

  async importData(bundle: Partial<ExportBundle>): Promise<{ collections: number; history: number; tags: number }> {
    let collections = 0;
    let historyCount = 0;
    let tags = 0;
    const user = getAuthUser();
    if (!user) throw new Error('未登录');

    if (bundle.settings) {
      await this.updateSettings(bundle.settings);
    }

    if (Array.isArray(bundle.collections)) {
      for (const c of bundle.collections) {
        // 本地目录（a1..a40）或外部作品（anilist:xxx）均可导入；其余跳过
        if (!ANIME_BY_ID.has(c.animeId) && !isExternalSourceId(c.animeId)) continue;
        await this.upsertCollection({
          animeId: c.animeId,
          status: c.status,
          score: c.score,
          progressEpisodes: c.progressEpisodes,
          rewatchCount: c.rewatchCount,
          isFavorite: c.isFavorite,
          isPrivate: c.isPrivate,
          personalNotes: c.personalNotes,
          tags: c.tags,
        });
        collections++;
      }
    }

    if (Array.isArray(bundle.tags)) {
      for (const t of bundle.tags) {
        if (!t.name) continue;
        const { error } = await db.from('custom_tags').insert({ name: t.name, color: t.color ?? '#8B5CF6' });
        if (!error) tags++;
      }
    }

    if (Array.isArray(bundle.history)) {
      for (const h of bundle.history) {
        if (!ANIME_BY_ID.has(h.animeId) && !isExternalSourceId(h.animeId)) continue;
        const animeBigint = await resolveAnimeId(h.animeId);
        const { data: col } = await db
          .from('collections')
          .select('id')
          .eq('anime_id', animeBigint)
          .maybeSingle();
        if (!col) continue;
        const { error } = await db.from('watch_history').insert({
          collection_id: num(col.id),
          anime_id: animeBigint,
          episode: h.episode,
          watched_at: h.watchedAt,
          duration_min: h.durationMin,
        });
        if (!error) historyCount++;
      }
    }

    notify();
    return { collections, history: historyCount, tags };
  }
}

export const cloudDataAccess = new CloudDataAccess();
