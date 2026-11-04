// WorkBuddy Cloud 公开配置（来自云服务激活后的 publicConfig）
// ⚠️ publishableKey 仅用于标识应用、不含任何权限，可写入前端产物；
//    不要把 access token / 服务端密钥写进这里或日志。
export const publicConfig = {
  endpoint: 'https://animehub-06330.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_BPJ24wIS8j3SP59FkXEXqS_5nTJd2RvEj33T5NPvNhlFr5ZR13oMVAP',
} as const;
