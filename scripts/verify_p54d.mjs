import { chromium } from 'playwright';
const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`${BASE}#/schedule`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(9000);

const r = await page.evaluate(() => {
  const out = {};

  // ① 今日进度线位置：应在番剧卡片下方
  const todaySection = document.getElementById('today-section');
  const hscroll = todaySection?.querySelector('.hscroll');
  out.todayHasHscroll = !!hscroll;
  if (hscroll) {
    const fc = hscroll.firstElementChild; // flex-col
    const children = [...fc.children];
    const cardsRow = children.find((c) => !c.classList.contains('relative')) || children[0];
    const timeline = children.find((c) => c.classList.contains('relative'));
    out.timelineBelowCards = !!timeline && timeline === fc.lastElementChild;
    // 刻度点与卡片对齐：比较第 i 张卡片中心 X 与第 i 个刻度槽中心 X
    const cards = [...cardsRow.children];
    const slots = [...timeline.children].filter((el) => !el.classList.contains('absolute'));
    const misalign = [];
    for (let i = 0; i < Math.min(cards.length, slots.length, 6); i++) {
      const cc = cards[i].getBoundingClientRect().left + cards[i].getBoundingClientRect().width / 2;
      const sc = slots[i].getBoundingClientRect().left + slots[i].getBoundingClientRect().width / 2;
      misalign.push(Math.round(cc - sc));
    }
    out.alignDeltas = misalign;
    // 图例/下一部文字应已移除
    out.hasLegend = todaySection.textContent.includes('已更新') && todaySection.textContent.includes('待播') && todaySection.textContent.includes('下一部');
    out.legendText = todaySection.textContent.includes('下一部') ? '仍含"下一部"' : '无"下一部"';
  }

  // ② 卡片内容：集数角标 + 播放时间 + 倒计时
  const cards = [...document.querySelectorAll('#today-section a.group')].slice(0, 6);
  out.todayCards = cards.map((c) => {
    const ep = c.querySelector('.aspect-\\[2\\/3\\] span')?.textContent?.trim() || '';
    const metaSpans = [...c.querySelectorAll('div.flex.items-center.justify-between > span')];
    return {
      ep: ep || '',
      playTime: metaSpans[0]?.textContent?.trim() || '',
      countdown: metaSpans[1]?.textContent?.trim() || '(无倒计时)',
    };
  });

  // ③ 即将播放：后天起的卡片不应有倒计时
  const upcoming = [...document.querySelectorAll('section[id^="upcoming-"]')];
  out.upcoming = upcoming.slice(0, 4).map((sec) => {
    const day = sec.querySelector('.font-display')?.textContent?.trim();
    const cards = [...sec.querySelectorAll('a.group')].slice(0, 3).map((c) => {
      const spans = [...c.querySelectorAll('div.flex.items-center.justify-between > span')];
      return { t: spans[0]?.textContent?.trim() || '', cd: spans[1]?.textContent?.trim() || '' };
    });
    return { day, cards };
  });

  // ④ hover 滚动条：hscroll 应为 overflow-x auto
  const hs = [...document.querySelectorAll('.hscroll')];
  out.hscrollCount = hs.length;
  out.overflowX = hs.map((h) => getComputedStyle(h).overflowX);

  return out;
});

console.log('=== ① 今日进度线 ===');
console.log('今日有 hscroll:', r.todayHasHscroll, '| 进度线在卡片下方:', r.timelineBelowCards);
console.log('刻度点与卡片中心对齐差(px, 前6):', JSON.stringify(r.alignDeltas));
console.log('图例/下一部文字:', r.legendText);

console.log('\n=== ② 今日卡片 ===');
for (const c of r.todayCards) console.log(`  [${c.ep}]  播放时间=${c.playTime}  倒计时=${c.countdown}`);

console.log('\n=== ③ 即将播放（后天起应无倒计时）===');
for (const g of r.upcoming) {
  console.log(`  ${g.day}:`);
  for (const c of g.cards) console.log(`      ${c.t}  | 倒计时=${c.cd || '(无)'}`);
}

console.log('\n=== ④ hover 滚动条 ===');
console.log('hscroll 容器数:', r.hscrollCount, '| overflowX:', JSON.stringify(r.overflowX));
console.log('\n控制台错误数:', errs.length);
if (errs.length) console.log(errs.slice(0, 5).join('\n'));

await page.screenshot({ path: 'screenshots/p54d/schedule_top.png', fullPage: false });
await browser.close();
