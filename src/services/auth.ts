import { cloud } from './cloudClient';

export interface AuthUser {
  uid: string;
  name?: string;
  avatarUrl?: string;
}

let currentUser: AuthUser | null = null;
const listeners = new Set<(u: AuthUser | null) => void>();

export function getAuthUser(): AuthUser | null {
  return currentUser;
}

export function onAuthChange(cb: (u: AuthUser | null) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setUser(u: AuthUser | null) {
  currentUser = u;
  listeners.forEach((l) => l(u));
}

function toUser(u: { id: string; name?: string; avatarUrl?: string }): AuthUser {
  return { uid: u.id, name: u.name, avatarUrl: u.avatarUrl };
}

/**
 * 必须在路由守卫之前调用一次：
 * 1) 处理 WorkBuddy OAuth 回调（兑换 code → 会话）
 * 2) 恢复已有会话
 * 3) 订阅登录态变化
 */
export async function initAuth(): Promise<void> {
  try {
    const cb = await cloud.auth.handleWorkBuddyCallback();
    if (cb.data) {
      // 兑换成功：清掉 URL 上的 OAuth 参数，但保留业务参数（如 sharecode）
      const url = new URL(window.location.href);
      for (const k of ['code', 'state', 'provider']) url.searchParams.delete(k);
      window.history.replaceState(null, '', url);
    }
  } catch {
    /* 非回调场景，忽略 */
  }
  try {
    const { data } = await cloud.auth.getSession();
    if (data?.user) setUser(toUser(data.user));
  } catch {
    /* 取会话失败不阻塞渲染 */
  }
  cloud.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user ? toUser(session.user) : null);
  });
}

/** WorkBuddy 账号登录（网页 PKCE）。成功时 SDK 会跳转，本函数不返回。 */
export async function signInWithWorkBuddy(): Promise<{ error?: string }> {
  try {
    const back = new URL(window.location.href);
    back.pathname = '/';
    for (const k of ['code', 'state', 'provider']) back.searchParams.delete(k);
    const { data, error } = await cloud.auth.signInWithOAuth({
      provider: 'workbuddy',
      redirectTo: back.toString(),
    });
    if (error) return { error: error.message ?? '登录失败' };
    if (data?.url) {
      window.location.assign(data.url);
      return {};
    }
    return { error: '未获取到授权地址，请稍后重试或联系管理员' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[auth] signInWithWorkBuddy failed:', e);
    return { error: msg || '登录启动失败' };
  }
}

export async function signOut(): Promise<void> {
  await cloud.auth.signOut();
  setUser(null);
}
