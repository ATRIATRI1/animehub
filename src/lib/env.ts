// 运行环境判定：是否走「真实云端」数据层（CloudDataAccess）。
//
// 判定规则（取并集，任一满足即视为云端）：
//   1) 生产构建：import.meta.env.DEV === false（vite build 产物）；
//   2) 防御性兜底：运行在 WorkBuddy 云 host（app.workbuddy.host）上。
//
// 这样即使部署被意外以 dev 模式拉起，匿名用户也绝不会看到本地 Mock 演示数据，
// 而是落到真实云端（按 RLS 隔离，匿名返回空）。仅本地 dev(localhost) 使用 Mock 便于预览。
const IS_CLOUD_HOST =
  typeof window !== 'undefined' &&
  /(^|\.)app\.workbuddy\.host$/.test(window.location.host);

// 允许通过构建变量 VITE_FORCE_MOCK=1 强制走本地 Mock（localStorage），
// 便于在没有 WorkBuddy 云环境的独立服务器上完整运行（个人数据存浏览器本地）。
// 不设置该变量时，行为完全保持原样（生产构建/WorkBuddy 云 host 走云端）。
export const CLOUD_MODE =
  import.meta.env.VITE_FORCE_MOCK === '1'
    ? false
    : !import.meta.env.DEV || IS_CLOUD_HOST;
