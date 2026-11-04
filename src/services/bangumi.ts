// Bangumi 公开 API 客户端（经同源代理 /api/bgm/* 规避 CORS）。
// 仅用于「补充中文译名 / 中文简介 / 封面」等展示增强；绝不在匹配不确定时覆盖原资料。
//
// 匹配策略（保守，避免把续作 / 剧场版 / 不同季度错配）：
//   1) 用 AniList 的日文原名(titleNative) / 英文(titleEnglish) / 罗马音(titleRomaji) / 别名 作为候选去 Bangumi 搜索；
//   2) 标题归一化后强匹配（相等或包含）；
//   3) 命中后拉取条目详情，校验 type ∈ {2 动画, 6 实拍} 且年份与 AniList seasonYear 相差 ≤1 年；
//   4) 校验通过才采用，否则不覆盖任何原资料。
//
// 【Phase 5.3 结论 · 实时 API 开关】
// api.bgm.tv 在当前 WorkBuddy 部署环境中经三种方式实测均不可达（本地 curl 经代理/直连、
// 线上服务端 fetch 均超时 502），因此这里默认关闭实时补全，避免每页产生数十条无意义的 502 报错。
// 中文标题已由静态数据集 catalog-index.json（bangumi-data，覆盖 ~95%）经 useZhTitle 提供，
// 实时 API 目前仅剩「中文简介 / Bangumi 封面 / 评分」等增强字段，缺失时回退 AniList 原资料即可。
// 若未来部署到可直连 api.bgm.tv 的环境，将本开关改为 true 即可恢复实时补全。
export const BGM_REALTIME_ENABLED = false;

import type { Anime } from '../types';

export interface BgmMatch {
  id: number;
  nameCn?: string;
  name?: string;
  summary?: string;
  images?: { large?: string; common?: string; medium?: string; small?: string };
  year?: number;
  type?: number;
}

const cache = new Map<string, BgmMatch | null>();

// 将补全的中文资料写回 AniList 外部缓存的同一 sessionStorage key，
// 使详情页 / 列表页 / 收藏库共享同一份中文资料（全站标题一致性）。
// 采用与 anilist.ts `cacheAnime` 相同的 key 格式 'anime:ext:<sourceId>'，避免模块循环依赖。
function persistToAnimeCache(animeId: string, patch: { titleChinese?: string; synopsis?: string; coverImageUrl?: string }) {
  try {
    const key = 'anime:ext:' + animeId;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    const a = JSON.parse(raw) as Anime;
    if (patch.titleChinese && !a.titleChinese) a.titleChinese = patch.titleChinese;
    if (patch.synopsis && !a.synopsis) a.synopsis = patch.synopsis;
    if (patch.coverImageUrl && !a.coverImageUrl) a.coverImageUrl = patch.coverImageUrl;
    sessionStorage.setItem(key, JSON.stringify(a));
  } catch {
    /* ignore quota */
  }
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-_·・：:、,，.。!！?？'’"”()（）\[\]【】]/g, '')
    .trim();
}

// 续作 / 衍生作标记。仅在「包含关系」的残余片段上判定，
// 用于把《作品》与《作品 II》《作品 第二季》《作品 剧场版》等区分开，避免错配。
const SEQUEL_MARKER =
  /^(ii|iii|iv|0?\d|第[二三四五六七八九十百零\d]+[季章期部话]|season\s*\d+|s\d{1,2}|2nd|3rd|movie|ova|oad|ona|special|final|剧场版|総集編|总集编|外伝|外传|新章|続|续)/i;

// 包含匹配时允许的最大残余长度（吸收标点、空格等差异），超过则视为不同作品
const MAX_RESIDUAL = 3;

function residualIsBenign(r: string): boolean {
  if (!r) return true;
  if (r.length > MAX_RESIDUAL) return false;
  return !SEQUEL_MARKER.test(r);
}

function similar(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb || na.length < 2) return false;
  if (na === nb) return true;
  // 包含关系：残余部分必须「无害」（很短且不是续作标记），否则判定为不同作品
  if (na.includes(nb)) return residualIsBenign(na.slice(nb.length));
  if (nb.includes(na)) return residualIsBenign(nb.slice(na.length));
  return false;
}

// WorkBuddy 云网关要求每个请求都携带 sharecode，缺失时返回 403「链接不完整」。
// 因此同源代理请求必须继承当前页面的 sharecode，否则 /api/bgm/* 到不了后端。
function withShareCode(url: string): string {
  try {
    const sc = new URLSearchParams(window.location.search).get('sharecode');
    if (!sc) return url;
    return `${url}${url.includes('?') ? '&' : '?'}sharecode=${encodeURIComponent(sc)}`;
  } catch {
    return url;
  }
}

async function getJson(url: string, timeoutMs = 8000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(withShareCode(url), {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function parseYear(date?: string): number | undefined {
  if (!date) return undefined;
  const m = date.match(/(\d{4})/);
  return m ? Number(m[1]) : undefined;
}

/**
 * 为某部作品查找 Bangumi 中文元数据（译名 / 简介 / 封面）。
 * 匹配不可靠时返回 null（调用方回退到 AniList 原资料），绝不抛错。
 */
export async function findBgmForAnime(anime: Anime): Promise<BgmMatch | null> {
  if (!BGM_REALTIME_ENABLED) return null; // 实时 API 不可达时直接短路，不发无效请求
  const key = anime.id;
  if (cache.has(key)) return cache.get(key) ?? null;

  const titles = Array.from(
    new Set(
      [anime.titleNative, anime.titleEnglish, anime.titleRomaji, ...(anime.synonyms ?? [])].filter(
        (t): t is string => !!t && t.length > 0,
      ),
    ),
  );

  let candidateId: number | null = null;
  for (const t of titles.slice(0, 4)) {
    const data = await getJson(
      `/api/bgm/search?keyword=${encodeURIComponent(t)}&type=2`,
    );
    const list: any[] = data?.list ?? [];
    for (const item of list.slice(0, 5)) {
      if (similar(t, item.name) || similar(t, item.name_cn)) {
        candidateId = Number(item.id);
        break;
      }
    }
    if (candidateId) break;
  }

  let result: BgmMatch | null = null;
  if (candidateId) {
    const subj = await getJson(`/api/bgm/subjects/${candidateId}`);
    if (subj) {
      const type = Number(subj.type);
      // 仅接受动画(2)或实拍(6)；其他类型（书籍/游戏/音乐）直接拒绝
      if (type === 2 || type === 6) {
        const year = parseYear(subj.date);
        const okYear =
          !anime.seasonYear || !year || Math.abs(anime.seasonYear - year) <= 1;
        if (okYear) {
          result = {
            id: candidateId,
            name: subj.name,
            nameCn: subj.name_cn || undefined,
            summary: subj.summary || undefined,
            images: subj.images,
            year,
            type,
          };
        }
      }
    }
  }

  cache.set(key, result);
  if (result) {
    persistToAnimeCache(anime.id, {
      titleChinese: result.nameCn,
      synopsis: result.summary,
      coverImageUrl: result.images?.large,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// 批量中文标题补全（列表页 / 卡片使用）。
// 设计要点：
//  - 并发上限 CONCURRENCY 避免打爆 Bangumi 限流；每个请求间也有最小间隔。
//  - 命中结果写回外部 Anime 的 titleChinese（仅当原本没有可靠中文时才补）。
//  - 全程不抛错：单个作品失败静默跳过，绝不阻塞列表渲染。
//  - 结果缓存到模块级 cache，刷新后可复用。
// ---------------------------------------------------------------------------
const CONCURRENCY = 3;
const MIN_INTERVAL_MS = 350;

export interface BgmEnrichment {
  animeId: string;
  titleCn?: string;
  summary?: string;
  cover?: string;
}

/**
 * 批量补全一批作品的中文译名（调用方传入需补全的 Anime 列表）。
 * 返回 `animeId -> 中文译名` 映射，调用方据此更新 UI，无需改动原 Anime 对象。
 */
export async function enrichChineseTitles(
  animes: Anime[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!BGM_REALTIME_ENABLED) return result; // 实时 API 不可达，直接返回空映射
  // 仅处理「尚无可靠中文标题」的作品（避免覆盖已确认的中文）
  const todo = animes.filter((a) => !a.titleChinese);
  if (!todo.length) return result;

  let lastCall = 0;
  const queue = [...todo];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const a = queue.shift()!;
      // 最小间隔节流
      const wait = MIN_INTERVAL_MS - (Date.now() - lastCall);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCall = Date.now();
      try {
        const m = await findBgmForAnime(a);
        if (m?.nameCn) {
          result.set(a.id, m.nameCn);
          // 写回缓存，供 getCachedAnime 复用
          cache.set(a.id, m);
          persistToAnimeCache(a.id, { titleChinese: m.nameCn, synopsis: m.summary, coverImageUrl: m.images?.large });
        }
      } catch {
        /* 单个失败跳过 */
      }
    }
  });
  await Promise.all(workers);
  return result;
}
