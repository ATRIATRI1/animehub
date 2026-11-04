import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import { publicConfig } from './cloudConfig';

// 全局唯一客户端实例：auth / database / storage / llm 都复用它。
// endpoint 与 publishableKey 强制来自 publicConfig；web 端额外传入 oauthRelayBaseUrl
// 以支持 WorkBuddy 账号登录（PKCE 跳转）。
export const cloud = createWorkBuddyCloud(publicConfig);
