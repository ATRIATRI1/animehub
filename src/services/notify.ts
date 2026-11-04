// 轻量订阅机制：任意数据写入后通知所有订阅者重新拉取。
// Mock 与 Cloud 两种实现共享同一组监听器，useReload 依赖它刷新页面。
const listeners = new Set<() => void>();

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function notify() {
  listeners.forEach((l) => l());
}
