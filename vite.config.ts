import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// WorkBuddy 网站应用以单端口 HTTP 静态服务运行；base './' 让产物使用相对路径，
// 适配本地预览、vite preview 与云端静态托管。路由使用 HashRouter，无需服务端 SPA fallback。
// 部署时 WorkBuddy 注入 PORT 环境变量，必须监听该端口，否则反向代理无法连通。
const PORT = Number((globalThis as any).process?.env?.PORT);

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: true, port: PORT || 5173, strictPort: false, allowedHosts: true },
  preview: { host: true, port: PORT || 4173, strictPort: false, allowedHosts: true },
});
