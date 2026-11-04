// 极简 toast：不依赖 Tailwind JIT（用内联样式），用于登录失败等轻量提示。
let container: HTMLElement | null = null;

function ensure(): HTMLElement {
  if (container) return container;
  container = document.createElement('div');
  container.style.cssText =
    'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;' +
    'display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
  document.body.appendChild(container);
  return container;
}

export function showToast(message: string, type: 'error' | 'info' = 'info'): void {
  const c = ensure();
  const el = document.createElement('div');
  el.textContent = message;
  const base =
    'pointer-events:auto;max-width:90vw;padding:8px 16px;border-radius:12px;' +
    'font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.28);border:1px solid;' +
    'transition:opacity .3s ease;';
  const skin =
    type === 'error'
      ? 'background:rgba(220,38,38,.14);border-color:rgba(220,38,38,.45);color:#fca5a5;'
      : 'background:#1f2433;border-color:rgba(148,163,184,.35);color:#e7ecf5;';
  el.style.cssText = base + skin;
  c.appendChild(el);
  window.setTimeout(() => {
    el.style.opacity = '0';
  }, 3200);
  window.setTimeout(() => el.remove(), 3600);
}
