// Bangumi 数据集服务层（基于 bangumi-data 社区数据集，CC BY 4.0）。
//
// 为什么不是 Bangumi 实时 API：
//   在本运行环境（本地与 WorkBuddy 部署服务端）对 api.bgm.tv 的出网请求均超时/不可达，
//   实时 API 无法作为服务端主数据源。但源自 Bangumi 生态的 bangumi-data 数据集
//   （GitHub raw / unpkg）可达，且提供：
//     - 中文标题 titleTranslate.zh-Hans（覆盖 ~94%）
//     - AniList ID ↔ Bangumi Subject ID 跨源映射（~93%）
//     - 放送排期 begin / broadcast（RFC5545 循环，如 R/<start>/P7D = 每周）
//   因此以 bangumi-data 承担「中文资料 + ID 映射 + 排期」层，AniList 降为封面/评分/播出动态
//   等补充来源，符合「Bangumi 为主、其他来源补充」的设计意图。
//
// 数据来自 https://github.com/bangumi-data/bangumi-data ，遵循 CC BY 4.0，署名见 ATTRIBUTION。
import { cacheGet, cacheSet, TTL } from './catalogCache';

export interface CatalogRec {
  zh?: string | null; // 中文标题
  jp?: string | null; // 日文原名
  bg?: string | null; // Bangumi Subject ID
  ty?: string | null; // 类型：tv / ova / web / movie
  b?: string | null; // 开播时间 ISO（UTC，含 Z）
  c?: string | null; // 放送循环（RFC5545），如 R/<start>/P7D
}

const INDEX_URL = '/catalog-index.json';
const CACHE_KEY = 'catalog-index-v1';

// 已加载的索引（AniList ID -> CatalogRec）
let indexMap: Map<string, CatalogRec> | null = null;
// 反向索引（Bangumi ID -> AniList ID）
let bgmToAnilist: Map<string, string> | null = null;
// 日文原名精确索引（归一化后 -> CatalogRec），用于 AniList ID 未直接映射时的兜底匹配
let jpIndex: Map<string, CatalogRec> | null = null;
let loadPromise: Promise<Map<string, CatalogRec>> | null = null;

function norm(s?: string | null): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/[\s　!！?？、。,.\-－—~〜:：()（）「」『』'’""]/g, '');
}

/** 归一化 AniList ID：兼容纯数字 "123" 与完整源 ID "anilist:123"。 */
function normAnilistId(id: number | string): string {
  let s = String(id);
  if (s.startsWith('anilist:')) s = s.slice('anilist:'.length);
  return s;
}

function buildReverse(map: Map<string, CatalogRec>) {
  const rev = new Map<string, string>();
  const jp = new Map<string, CatalogRec>();
  for (const [alId, rec] of map) {
    if (rec.bg) rev.set(rec.bg, alId);
    const n = norm(rec.jp);
    if (n) jp.set(n, rec);
  }
  bgmToAnilist = rev;
  jpIndex = jp;
  return rev;
}

export async function loadCatalogIndex(force = false): Promise<Map<string, CatalogRec>> {
  if (indexMap && !force) return indexMap;
  if (loadPromise && !force) return loadPromise;

  loadPromise = (async () => {
    // 1) 尝试 IndexedDB 缓存（未过期）
    let data: Record<string, CatalogRec> | null = null;
    try {
      data = await cacheGet<Record<string, CatalogRec>>(CACHE_KEY);
    } catch {
      /* 忽略，走网络 */
    }
    // 2) 网络拉取（同域静态资源，无 CORS 问题）
    if (!data) {
      try {
        const res = await fetch(INDEX_URL, { cache: 'force-cache' });
        if (res.ok) {
          data = (await res.json()) as Record<string, CatalogRec>;
          cacheSet(CACHE_KEY, data, TTL.catalogIndex).catch(() => {});
        }
      } catch {
        data = null;
      }
    }
    // 3) 外部资源不可用时，回退到「过期缓存」继续展示已有中文标题，绝不清空缓存
    if (!data) {
      try {
        data = await cacheGet<Record<string, CatalogRec>>(CACHE_KEY, true);
      } catch {
        data = null;
      }
    }
    if (!data) {
      // 极端情况下连静态资源与缓存都失败：返回空索引，绝不阻断页面
      indexMap = new Map();
      bgmToAnilist = new Map();
      return indexMap;
    }
    indexMap = new Map(Object.entries(data));
    bgmToAnilist = buildReverse(indexMap);
    return indexMap;
  })();

  return loadPromise;
}

export function getCatalogSync(): Map<string, CatalogRec> | null {
  return indexMap;
}

export function isCatalogReady(): boolean {
  return indexMap !== null;
}

/** 按 AniList ID 取中文标题（Bangumi 生态，主中文来源）。 */
export function zhTitleByAnilist(anilistId: number | string): string | undefined {
  if (!indexMap) return undefined;
  const rec = indexMap.get(normAnilistId(anilistId));
  return rec?.zh || undefined;
}

/** 按 AniList ID 取完整记录。 */
export function recByAnilist(anilistId: number | string): CatalogRec | undefined {
  return indexMap?.get(normAnilistId(anilistId));
}

/** AniList ID -> Bangumi Subject ID。 */
export function bangumiIdByAnilist(anilistId: number | string): string | undefined {
  return indexMap?.get(normAnilistId(anilistId))?.bg || undefined;
}

/**
 * 日文原名精确匹配兜底：当 AniList ID 未直接映射时，用归一化后的日文原名查表。
 * 仅做「完全相同」匹配（去除空格/标点/大小写），不做模糊相似，避免误配续作/剧场版。
 */
export function zhTitleByNative(nativeTitle?: string | null): string | undefined {
  if (!jpIndex || !nativeTitle) return undefined;
  const rec = jpIndex.get(norm(nativeTitle));
  return rec?.zh || undefined;
}

/** Bangumi Subject ID -> AniList ID（用于旧数据/将来 API 兼容）。 */
export function anilistIdByBangumi(bgmId: number | string): string | undefined {
  return bgmToAnilist?.get(String(bgmId)) || undefined;
}

/**
 * 按中文标题关键词反查 AniList ID（子串匹配，归一化后忽略标点/空格/大小写）。
 * AniList 的 search 只匹配日文/英文/罗马音，不认中文；中文检索需先经此函数反查
 * 命中条目的 AniList ID，再由调用方按 ID 拉取完整资料。
 * 返回去重后的 AniList ID 字符串数组（上限 50，避免超长关键词误命中过多条目）。
 */
export function searchCatalogZh(keyword: string): string[] {
  if (!indexMap) return [];
  const k = norm(keyword);
  if (!k) return [];
  const out: string[] = [];
  for (const [alId, rec] of indexMap) {
    if (rec.zh && norm(rec.zh).includes(k)) out.push(alId);
    if (out.length >= 50) break;
  }
  return out;
}

/**
 * 解析放送循环字符串为「星期几 + 北京时间(小时:分钟)」。
 * 例：R/1962-12-31T16:00:00.000Z/P7D → { weekday: 1, hour: 00, minute: 00 }（UTC 16:00 = 北京 00:00 次日）
 * 解析失败时返回 null（不得编造时间）。
 */
export function parseBroadcast(broadcast?: string | null): {
  weekday: number;
  hour: number;
  minute: number;
} | null {
  if (!broadcast) return null;
  const m = broadcast.match(/R\/([\dT:.Z-]+)\/P(\d+)D/);
  if (!m) return null;
  const start = new Date(m[1]);
  if (isNaN(start.getTime())) return null;
  const days = parseInt(m[2], 10);
  if (days <= 0 || days % 7 !== 0) return null; // 仅支持周更（7 天倍数近似为周更）
  // 转为北京时间（UTC+8）
  const bj = new Date(start.getTime() + 8 * 3600 * 1000);
  // JS getDay：0=周日 … 6=周六；统一为 0=周一…6=周日 以贴合中文习惯
  const weekday = (bj.getDay() + 6) % 7;
  return { weekday, hour: bj.getHours(), minute: bj.getMinutes() };
}
