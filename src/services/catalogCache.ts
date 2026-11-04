// 轻量级 IndexedDB 缓存：用于缓存从外部数据源（bangumi-data / Bangumi / AniList）获取的
// 公共动漫资料与排期数据。缓存仅存在于当前浏览器/设备，不作为跨设备同步依据。
//
// 设计要点：
//  - 单 object store `kv`，键为字符串，值为 { v, writtenAt, expires }。
//  - 写入时若超过容量上限，按写入顺序清理最旧条目（近似 LRU）。
//  - 读取时若已过期视为缺失；任何异常都安全降级（返回 null），绝不让缓存错误阻断页面。
//  - 不使用第三方库，原生 IndexedDB，避免额外依赖。

const DB_NAME = 'animehub-cache';
const STORE = 'kv';
const MAX_ENTRIES = 600; // 容量上限，超出后清理最旧
const DB_VERSION = 1;

interface Entry {
  k: string;
  v: unknown;
  writtenAt: number;
  expires: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('no-indexeddb'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'k' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

// 内存兜底（IndexedDB 不可用时），进程级共享
const mem = new Map<string, Entry>();
const hasIndexedDB = typeof indexedDB !== 'undefined';

function nowMs(): number {
  return Date.now();
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function cacheGet<T>(key: string, allowStale = false): Promise<T | null> {
  const t = nowMs();
  if (!hasIndexedDB) {
    const e = mem.get(key);
    if (e && (e.expires > t || allowStale)) return e.v as T;
    if (e) mem.delete(key);
    return null;
  }
  try {
    const db = await getDB();
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    const e = await new Promise<Entry | undefined>((res, rej) => {
      req.onsuccess = () => res(req.result as Entry | undefined);
      req.onerror = () => rej(req.error);
    });
    if (e && (e.expires > t || allowStale)) return e.v as T;
    return null;
  } catch {
    const e = mem.get(key);
    if (e && (e.expires > t || allowStale)) return e.v as T;
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const t = nowMs();
  const entry: Entry = { k: key, v: value, writtenAt: t, expires: t + ttlMs };
  if (!hasIndexedDB) {
    if (mem.size >= MAX_ENTRIES) {
      const oldestKey = [...mem.entries()].sort((a, b) => a[1].writtenAt - b[1].writtenAt)[0]?.[0];
      if (oldestKey) mem.delete(oldestKey);
    }
    mem.set(key, entry);
    return;
  }
  try {
    const db = await getDB();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    // 容量清理：写入前若接近上限，删除最早写入的若干条
    const countReq = store.count();
    countReq.onsuccess = () => {
      if (countReq.result >= MAX_ENTRIES) {
        const curReq = store.openCursor();
        let removed = 0;
        curReq.onsuccess = () => {
          const cur = curReq.result;
          if (cur && removed < 50) {
            cur.delete();
            removed++;
            cur.continue();
          }
        };
      }
    };
    store.put(entry);
    await txDone(tx);
  } catch {
    if (mem.size >= MAX_ENTRIES) {
      const oldestKey = [...mem.entries()].sort((a, b) => a[1].writtenAt - b[1].writtenAt)[0]?.[0];
      if (oldestKey) mem.delete(oldestKey);
    }
    mem.set(key, entry);
  }
}

// 缓存有效期
export const TTL = {
  catalogIndex: 7 * 24 * 3600 * 1000, // 目录索引 7 天
  animeDetail: 3 * 24 * 3600 * 1000, // 单部作品详情 3 天
  schedule: 12 * 3600 * 1000, // 排期 12 小时
};
