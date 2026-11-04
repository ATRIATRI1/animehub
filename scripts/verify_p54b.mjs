import { chromium } from 'playwright';

const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 140)));

// ---------------- 1) 详情页简介语言优先级 + 评分 ----------------
const cases = [
  { id: 154587, name: '葬送的芙莉莲' }, // 有评分 + 英文简介
  { id: 101922, name: '鬼灭之刃' },     // 有评分 + 英文简介
  { id: 16498, name: '进击的巨人' },
  { id: 21, name: '航海王' },
];

console.log('=== 详情页简介语言优先级 + 评分 ===');
for (const c of cases) {
  await page.goto(`${BASE}#/anime/anilist:${c.id}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const tag = [...document.querySelectorAll('span')].find((s) => /简介$/.test(s.textContent.trim()))?.textContent?.trim() || '';
    const syn = document.querySelector('p.text-sm.text-muted')?.textContent?.trim()?.slice(0, 40) || '';
    // 社区评分 InfoCell 的值
    const scoreVal = [...document.querySelectorAll('div')].find((d) => d.textContent.trim().startsWith('社区评分'))?.textContent?.trim() || '';
    const h1 = document.querySelector('h1')?.textContent?.trim()?.slice(0, 16) || '';
    return { tag, syn, scoreVal, h1 };
  });
  console.log(`  ${c.name}(${c.id}): H1=${info.h1} | 简介标签=${info.tag} | 评分=${info.scoreVal.replace('社区评分', '').trim()}`);
  console.log(`      简介片段=${info.syn}`);
}

// ---------------- 2) 评分缺失：找一部新番（可能无评分） ----------------
console.log('\n=== 评分缺失展示 ===');
// 用排期表里出现的较新番剧，看是否有「暂无评分」
// 直接检查动漫库卡片是否有 0 分显示
await page.goto(`${BASE}#/search`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(5000);
const scoreCards = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('[data-testid="poster-card"]')].slice(0, 20);
  return cards.map((c) => {
    const scoreText = [...c.querySelectorAll('span')].map((s) => s.textContent.trim()).find((t) => /^★?\s*\d/.test(t)) || '';
    return scoreText;
  });
});
const zeroScores = scoreCards.filter((s) => /^★\s*0(\.0)?$/.test(s));
console.log('  前20张卡片的评分角标样例:', JSON.stringify(scoreCards.slice(0, 8)));
console.log('  显示为 0 分的卡片数:', zeroScores.length, '(应为 0)');

// ---------------- 3) 排期表周一数据 + JST 星期分组 ----------------
console.log('\n=== 排期表（JST 星期分组 + 周一）===');
await page.goto(`${BASE}#/schedule`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(8000);
const sched = await page.evaluate(() => {
  // 星期导航里的数量
  const navBtns = [...document.querySelectorAll('button')].filter((b) => {
    const t = b.textContent.trim();
    return /^(周[一二三四五六日])\s*\d+$/.test(t) || /^周[一二三四五六日]\d+$/.test(t);
  });
  const nav = navBtns.map((b) => b.textContent.trim().replace(/\s+/g, ''));
  // 本周放送 各星期区块（左侧 周X + N 部）
  const sections = [...document.querySelectorAll('section[id^="upcoming-"]')].map((s) => {
    const wd = s.querySelector('.font-display')?.textContent?.trim() || '';
    const cnt = s.querySelector('.text-xs.text-muted')?.textContent?.trim() || '';
    return wd + cnt;
  });
  // 今天区块
  const today = document.querySelector('#today-section')?.textContent?.trim()?.slice(0, 30) || '';
  // 星期导航是否吸顶
  return { nav, sections, today };
});
console.log('  星期导航:', JSON.stringify(sched.nav));
console.log('  本周放送星期区块:', JSON.stringify(sched.sections));
console.log('  今日区块:', sched.today);
const monday = (sched.nav.find((n) => n.startsWith('周一')) || '').replace('周一', '');
console.log('  → 周一数量:', monday || '(未找到)', monday && Number(monday) === 0 ? '← 问题未修复！' : monday && Number(monday) > 0 ? '✓ 周一有数据' : '');

console.log('\n=== 控制台错误数:', errs.length, '===');
if (errs.length) console.log('  样例:', errs.slice(0, 5).join('\n       '));

await browser.close();
