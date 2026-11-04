// 验收：卡片布局 + 排期表重构（吸顶星期导航 + 点击跳转）
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const OUT = 'screenshots/p53b';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function newPage(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  await page.addInitScript((t) => { try { localStorage.setItem('animehub_theme', t); } catch {} }, theme);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
  return { ctx, page, errors };
}

const goto = async (page, hash, wait) => {
  await page.goto(BASE + hash, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(wait);
};

// ---------- 1) 动漫库卡片布局 ----------
{
  const { ctx, page, errors } = await newPage('aurora');
  await goto(page, '#/search', 9000);
  const cards = await page.evaluate(() => {
    return [...document.querySelectorAll('[data-testid="poster-card"]')].slice(0, 6).map((c) => {
      const title = c.querySelector('div.font-semibold.text-ink')?.textContent?.trim() || '';
      const meta = c.querySelector('div.text-\\[11px\\]')?.textContent?.trim() || '';
      const score = c.querySelector('.text-white')?.textContent?.trim() || '';
      const eps = c.querySelector('span.bg-black\\/55')?.textContent?.trim() || '';
      return { title: title.slice(0, 18), meta, score: score.slice(0, 6), eps };
    });
  });
  console.log('[卡片] 样本:', JSON.stringify(cards, null, 1).slice(0, 900));
  await page.screenshot({ path: `${OUT}/card_search.png` });
  console.log('[卡片] 控制台错误:', errors.length ? errors.slice(0, 4) : '无');
  await ctx.close();
}

// ---------- 2) 排期表布局 + 吸顶 + 点击跳转 ----------
{
  const { ctx, page, errors } = await newPage('sakura');
  await goto(page, '#/schedule', 20000);
  // 等待内容
  const hasContent = await page.evaluate(() => !!document.getElementById('today-section'));
  console.log('[排期] today-section 存在:', hasContent);

  // 星期导航检查
  const nav = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('周一'));
    if (!el) return null;
    const sticky = el.closest('.sticky');
    return {
      navText: el.closest('.overflow-x-auto')?.textContent?.trim().replace(/\s+/g, ' '),
      stickyClass: sticky ? sticky.className.includes('sticky') : false,
    };
  });
  console.log('[排期] 导航:', JSON.stringify(nav));

  // 截图（顶部）
  await page.screenshot({ path: `${OUT}/schedule_top.png` });

  // 吸顶测试：滚动 900px 后检查导航是否仍固定顶部附近
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(1200);
  const pinned = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.sticky')].find((s) => {
      const b = s.querySelector('button');
      return b && b.textContent.includes('周一') && !b.closest('header');
    });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), visible: r.top >= 0 && r.top < 120 };
  });
  console.log('[排期] 吸顶位置(滚动后):', JSON.stringify(pinned));
  await page.screenshot({ path: `${OUT}/schedule_scrolled.png` });

  // 点击跳转：滚回顶部，点击「周六」应滚动到对应区块
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  const jumped = await page.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('周六'));
    if (!btn) return { clicked: false };
    btn.click();
    await new Promise((r) => setTimeout(r, 900));
    const target = document.getElementById('upcoming-6');
    if (!target) return { clicked: true, target: false };
    const r = target.getBoundingClientRect();
    return { clicked: true, target: true, top: Math.round(r.top) };
  });
  console.log('[排期] 点击周六跳转:', JSON.stringify(jumped));
  await page.screenshot({ path: `${OUT}/schedule_after_jump.png` });

  console.log('[排期] 控制台错误:', errors.length ? errors.slice(0, 6) : '无');
  await ctx.close();
}

await browser.close();
console.log('done');
