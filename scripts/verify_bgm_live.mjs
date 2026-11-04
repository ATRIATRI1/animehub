// 线上验收 v2：修正卡片选择器 + 正确的 AniList ID
import { chromium } from 'playwright';

const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));

const goto = async (hash, wait = 2500) => {
  await page.goto(BASE + hash, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(wait);
};

// 1) 卡片中文覆盖率（正确选择器：标题为 div.font-semibold.text-ink）
await goto('#/search', 9000);
const cards = await page.evaluate(() => {
  return [...document.querySelectorAll('[data-testid="poster-card"]')].map((c) => {
    const t = c.querySelector('div.font-semibold.text-ink');
    return t ? t.textContent.trim() : '';
  });
});
let zhCards = 0;
cards.forEach((t) => { if (/[\u4e00-\u9fff]/.test(t)) zhCards++; });
console.log('[卡片] 数量:', cards.length, '| 含中文:', zhCards, '| 覆盖率:', (cards.length ? (100 * zhCards / cards.length).toFixed(0) : 0) + '%');
cards.forEach((t) => console.log('    -', t.slice(0, 40)));

// 2) 详情页主标题（正确 ID）
const cases = [
  { id: 'anilist-154587', label: '葬送的芙莉莲 154587' },
  { id: 'anilist-101922', label: '鬼灭之刃 101922' },
  { id: 'anilist-16498', label: '进击的巨人 16498' },
  { id: 'anilist-21', label: 'ONE PIECE 21(埃鲁巴夫篇映射)' },
];
for (const c of cases) {
  await goto('#/anime/' + c.id, 3500);
  const r = await page.evaluate(() => {
    const h1 = document.querySelector('h1')?.textContent?.trim() || '';
    const subs = [...document.querySelectorAll('h1 ~ div.text-muted')].map((d) => d.textContent.trim());
    return { h1, subs: subs.slice(0, 3) };
  });
  const ok = /[\u4e00-\u9fff]/.test(r.h1);
  console.log('[详情]', c.label, '→ h1:', JSON.stringify(r.h1.slice(0, 34)), ok ? '✅' : '❌', '| 副标题:', JSON.stringify(r.subs));
}

console.log('[错误]', errors.length ? errors.slice(0, 6).join('\n') : '无');
await browser.close();
