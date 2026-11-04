// 目录索引（Bangumi 数据集）的 React 接入层。
// 应用挂载后空闲时加载一次；加载完成通过 context 下发，组件读取中文标题时若索引尚未就绪
// 会等待一次重渲染（加载完成后自动刷新）。
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  loadCatalogIndex,
  zhTitleByAnilist,
  zhTitleByNative,
  recByAnilist,
  isCatalogReady,
  type CatalogRec,
} from '../services/bangumiData';
import { displayTitle } from '../lib/utils';
import type { Anime } from '../types';

interface CatalogCtx {
  ready: boolean;
  version: number; // 每次索引加载完成自增，用于强制依赖它的组件重渲染
  zhTitle: (anilistId: number | string) => string | undefined;
  rec: (anilistId: number | string) => CatalogRec | undefined;
}

const Ctx = createContext<CatalogCtx>({
  ready: false,
  version: 0,
  zhTitle: () => undefined,
  rec: () => undefined,
});

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(isCatalogReady());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    // 空闲时加载，避免阻塞首屏
    const run = () => {
      loadCatalogIndex()
        .then(() => {
          if (!alive) return;
          setReady(true);
          setVersion((v) => v + 1);
        })
        .catch(() => {
          if (alive) {
            setReady(true); // 即使失败也标记就绪，避免无限等待
            setVersion((v) => v + 1);
          }
        });
    };
    const t = setTimeout(run, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  const api: CatalogCtx = {
    ready,
    version,
    zhTitle: (id) => zhTitleByAnilist(id),
    rec: (id) => recByAnilist(id),
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCatalog(): CatalogCtx {
  return useContext(Ctx);
}

/** 便捷 Hook：直接取某 AniList ID 的中文标题（依赖 version 以便索引就绪后刷新）。 */
export function useZhTitle(
  anilistId: number | string | undefined,
  nativeTitle?: string | null,
): string | undefined {
  const { zhTitle, version } = useCatalog();
  // version 仅用于触发依赖；下面显式读取
  void version;
  if (anilistId === undefined) return undefined;
  const byId = zhTitle(anilistId);
  if (byId) return byId;
  // 兜底：AniList ID 未直接映射时，用日文原名精确匹配
  return zhTitleByNative(nativeTitle);
}

/**
 * 同步版中文优先标题解析（供列表/行内渲染使用，避免每个列表项都调用 Hook）。
 * 优先级：内建中文 > Bangumi 中文(按 AniList ID) > Bangumi 中文(按日文原名兜底) > displayTitle(罗马音/日文)。
 * 仅当 Bangumi 索引已加载（indexMap 非空）时返回中文；调用方应消费 useCatalog().version 以在加载完成后触发重渲染。
 */
export function resolveZhTitle(
  a: Pick<Anime, 'titleChinese' | 'anilistId' | 'titleNative' | 'titleRomaji'>,
): string {
  if (a.titleChinese) return a.titleChinese;
  if (a.anilistId != null) {
    const z = zhTitleByAnilist(a.anilistId);
    if (z) return z;
  }
  const z2 = zhTitleByNative(a.titleNative);
  if (z2) return z2;
  return displayTitle(a);
}
