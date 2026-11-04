// 分页补偿器：在 AniList 原始分页之上做「拉取—客户端过滤—补足」闭环。
// 解决两个核心问题：
//  1) 客户端过滤（如「排除本季度新番」）会让「可见数 / 原始总数 / 分页游标」错位；
//  2) 不能简单地「拉一页再过滤」，否则可见数不可控、分页边界失真。
//
// 关键设计（回应额外验收要求）：
//  - 每次 loadMore 以 `targetCount = items.length + visibleSize` 为目标，确保第 2、3…次点击都能继续请求；
//  - 单次安全上限 `maxRawPerLoad`（默认 5）：一次点击最多触发 5 次原始请求，避免无限/过多请求；
//  - 请求失败不跳过页码：仅当本次 fetch 成功才推进 rawPage；失败保留 rawPage，下次重试同一页；
//  - 筛选条件变化时调用 reset()，清空已累积结果、页码与去重集合，避免错位与重复作品；
//  - 去重：按 anime.id 去重，防止重复作品；
//  - 防重复请求：loading 守卫，loadMore 进行中直接返回，不并发。
import type { Anime } from '../types';

export interface PageResult {
  items: Anime[];
  page: number;
  hasNext: boolean;
  total: number;
}

export type PagerFetcher = (page: number, perPage: number) => Promise<PageResult>;
export type ItemFilter = (a: Anime) => boolean;

export class FilteredPager {
  private rawPage = 0;
  private rawHasNext = true;
  private rawTotal = 0;
  private seenIds = new Set<string>();
  items: Anime[] = [];
  loading = false;

  constructor(
    private fetcher: PagerFetcher,
    private filter: ItemFilter = () => true,
    private visibleSize = 20,
    private rawPerPage = 50,
    private maxRawPerLoad = 5,
  ) {}

  /** 筛选条件变化时调用：清空累积、页码、去重集合，防止错位与重复作品 */
  reset(): void {
    this.rawPage = 0;
    this.rawHasNext = true;
    this.rawTotal = 0;
    this.seenIds.clear();
    this.items = [];
  }

  /** 是否还有更多（基于原始分页是否耗尽，与已可见数无关） */
  get hasMore(): boolean {
    return this.rawHasNext;
  }
  get shown(): number {
    return this.items.length;
  }
  /** 原始总数（含被过滤项），仅作上限提示，非精确过滤数 */
  get rawTotalHint(): number {
    return this.rawTotal;
  }

  async loadMore(): Promise<void> {
    if (this.loading || !this.rawHasNext) return; // 防重复请求 / 越界
    this.loading = true;
    try {
      const targetCount = this.items.length + this.visibleSize;
      let rawFetched = 0;
      while (this.items.length < targetCount && this.rawHasNext && rawFetched < this.maxRawPerLoad) {
        const nextPage = this.rawPage + 1;
        const res = await this.fetcher(nextPage, this.rawPerPage);
        // 仅成功才推进页码；失败则保留 rawPage，下次重试同一页（不跳页）
        this.rawPage = nextPage;
        this.rawHasNext = res.hasNext;
        this.rawTotal = res.total;
        const kept = (this.filter ? res.items.filter(this.filter) : res.items).filter((a) => {
          if (this.seenIds.has(a.id)) return false; // 去重
          this.seenIds.add(a.id);
          return true;
        });
        this.items.push(...kept);
        rawFetched += 1;
      }
      // 达到单次安全上限仍未填满 → 保留已有结果，hasMore 仍为 true，用户可继续点击加载
    } finally {
      this.loading = false;
    }
  }
}
