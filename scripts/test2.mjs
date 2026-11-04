import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:4173';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'screenshots/phase2b';

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});

async function getStore(page) {
  const raw = await page.evaluate(() => localStorage.getItem('animehub_mock_v1'));
  return raw ? JSON.parse(raw) : null;
}
async function getRating(page) {
  return await page.evaluate(() => {
    const label = [...document.querySelectorAll('div')].find(
      (d) => d.textContent?.trim() === '我的评分',
    );
    if (!label) return null;
    const field = label.parentElement;
    const span = [...field.querySelectorAll('span')].find((s) => {
      const t = (s.textContent || '').trim();
      return /^\d+\.\d$/.test(t) || t === '未评分';
    });
    return span?.textContent?.trim() ?? null;
  });
}

try {
  // ============ 1) 个人评分（含小数能力验证） ============
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = [];
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(BASE + '/#/library', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="poster-card"]');
    await page.locator('[data-testid="poster-card"]').first().click();
    await page.waitForSelector('text=我的评分');
    const before = await getRating(page);
    const cur = before && before !== '未评分' ? parseInt(before, 10) : 0;
    const target = cur === 6 ? 4 : 6; // 避免点到相同的星被清零
    await page.locator(`button[aria-label="${target} 分"]`).click();
    await page.waitForTimeout(400);
    const after = await getRating(page);
    check('个人评分：点击星级可设置评分', after === `${target}.0`, `before=${before} -> after=${after}`);
    // 持久化
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=我的评分');
    const persisted = await getRating(page);
    check('个人评分：刷新后仍持久化', persisted === `${target}.0`, `persisted=${persisted}`);
    check('个人评分：无控制台错误', errs.length === 0, errs.join(' | ').slice(0, 200));
    await page.close();
  }

  // ============ 2) 标签增删 ============
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE + '/#/library', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="poster-card"]');
    await page.locator('[data-testid="poster-card"]').first().click();
    await page.waitForSelector('text=个人标签');
    const animeId = await page.evaluate(() => location.hash.match(/anime\/(.+)/)?.[1]);
    // 点击“可用标签”里的第一个 chip 完成添加
    const tagName = await page.evaluate(() => {
      const label = [...document.querySelectorAll('div')].find((d) => d.textContent?.trim() === '个人标签');
      const field = label.parentElement;
      const addRow = [...field.querySelectorAll('div')].find(
        (d) => d.className.includes('flex-wrap') && d.className.includes('mt-2'),
      );
      const chip = addRow.querySelector('span');
      const name = chip.textContent.trim();
      chip.click();
      return name;
    });
    await page.waitForTimeout(400);
    let store = await getStore(page);
    const col = store.collections.find((c) => c.animeId === animeId);
    check('标签：点击可添加', col.tags.includes(tagName), `added="${tagName}" tags=${JSON.stringify(col.tags)}`);
    // 点击 × 删除
    await page.evaluate((t) => {
      const label = [...document.querySelectorAll('div')].find((d) => d.textContent?.trim() === '个人标签');
      const field = label.parentElement;
      const activeRow = [...field.querySelectorAll('div')].find(
        (d) => d.className.includes('flex-wrap') && !d.className.includes('mt-2'),
      );
      const chip = [...activeRow.querySelectorAll('span')].find((s) => s.textContent.trim() === t);
      chip.querySelector('button').click();
    }, tagName);
    await page.waitForTimeout(400);
    store = await getStore(page);
    const col2 = store.collections.find((c) => c.animeId === animeId);
    check('标签：点击 × 可删除', !col2.tags.includes(tagName), `tags=${JSON.stringify(col2.tags)}`);
    await page.close();
  }

  // ============ 3) 备注持久化 ============
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE + '/#/library', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="poster-card"]');
    await page.locator('[data-testid="poster-card"]').first().click();
    await page.waitForSelector('text=备注');
    const animeId = await page.evaluate(() => location.hash.match(/anime\/(.+)/)?.[1]);
    const note = '测试备注_' + Date.now();
    await page.locator('textarea').fill(note);
    await page.locator('h1').first().click(); // 失焦触发保存
    await page.waitForTimeout(400);
    let store = await getStore(page);
    let col = store.collections.find((c) => c.animeId === animeId);
    check('备注：失焦后写入存储', col.personalNotes === note, `stored="${col.personalNotes}"`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('textarea');
    const val = await page.locator('textarea').inputValue();
    check('备注：刷新后仍持久化', val === note, `value="${val}"`);
    await page.close();
  }

  // ============ 4) 网格 / 列表切换 ============
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE + '/#/library', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="poster-card"]');
    const listBtn = page.locator('button:has(svg.lucide-list)');
    await listBtn.click();
    await page.waitForTimeout(300);
    const listShown = await page.locator('[class*="space-y-2"]').count();
    check('视图切换：可切换到列表模式', listShown > 0, `listContainer=${listShown}`);
    const gridBtn = page.locator('button:has(svg.lucide-layout-grid), button:has(svg.lucide-grid)');
    await gridBtn.first().click();
    await page.waitForTimeout(300);
    const gridShown = await page.locator('div.grid').count();
    check('视图切换：可切回网格模式', gridShown > 0, `gridContainer=${gridShown}`);
    await page.screenshot({ path: `${OUT}_desktop_library_list.png`, fullPage: false });
    await page.close();
  }

  // ============ 5) JSON 导出（含小数评分验证） ============
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE + '/#/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=数据管理');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /导出预览数据/ }).click(),
    ]);
    const p = await download.path();
    const content = fs.readFileSync(p, 'utf8');
    let json;
    try {
      json = JSON.parse(content);
    } catch (e) {
      check('JSON 导出：文件为合法 JSON', false, String(e));
    }
    if (json) {
      const cols = json.collections || [];
      const hasDecimal = cols.some((c) => typeof c.score === 'number' && !Number.isInteger(c.score));
      const allInRange = cols.every((c) => c.score >= 0 && c.score <= 10);
      check('JSON 导出：生成合法文件且含收藏数据', cols.length > 0, `collections=${cols.length}`);
      check('评分字段：存在 0~10 小数示例（允许小数）', hasDecimal, `hasDecimal=${hasDecimal}`);
      check('评分字段：全部落在 0~10 区间', allInRange, `inRange=${allInRange}`);
    }
    await page.close();
  }

  // ============ 6) 手机端筛选 ============
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(BASE + '/#/library', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="poster-card"]');
    const totalBefore = await page.evaluate(() => {
      const m = document.querySelector('main')?.textContent?.match(/当前显示 (\d+) 部/);
      return m ? +m[1] : -1;
    });
    await page.getByRole('button', { name: /筛选/ }).click();
    await page.waitForSelector('[role="dialog"]');
    await page.screenshot({ path: `${OUT}_mobile_filter.png`, fullPage: false });
    const dialog = page.getByRole('dialog');
    await dialog.getByText('全部状态').click();
    await page.waitForTimeout(250);
    await dialog.getByText('在看', { exact: true }).click();
    await page.waitForTimeout(250);
    await dialog.getByRole('button', { name: /查看 .* 部结果/ }).click();
    await page.waitForTimeout(400);
    const chipVisible = await page.getByText('在看', { exact: true }).count();
    const totalAfter = await page.evaluate(() => {
      const m = document.querySelector('main')?.textContent?.match(/当前显示 (\d+) 部/);
      return m ? +m[1] : -1;
    });
    check('手机筛选：弹层可打开并设置“在看”', chipVisible >= 1, `chipCount=${chipVisible}`);
    check(
      '手机筛选：结果数量随筛选变化',
      totalAfter !== -1 && totalAfter < totalBefore && totalAfter > 0,
      `before=${totalBefore} after=${totalAfter}`,
    );
    await page.close();
  }

  // ============ 7) 主题偏好保存 ============
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE + '/#/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=外观');
    await page.getByRole('button', { name: 'Sakura', exact: true }).click();
    await page.waitForTimeout(300);
    const themeAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const lsTheme = await page.evaluate(() => localStorage.getItem('animehub_theme'));
    check('主题偏好：切换为 Sakura 并写入存储', themeAttr === 'sakura' && lsTheme === 'sakura', `attr=${themeAttr} ls=${lsTheme}`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=外观');
    const persisted = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check('主题偏好：刷新后仍保持 Sakura', persisted === 'sakura', `persisted=${persisted}`);
    await page.close();
  }

  // ============ 8) 手机端底部固定导航不遮挡内容 ============
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(BASE + '/#/library', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="poster-card"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const nav = document.querySelector('[data-testid="bottom-nav"]');
      const cards = document.querySelectorAll('[data-testid="poster-card"]');
      const last = cards[cards.length - 1].getBoundingClientRect();
      const nr = nav.getBoundingClientRect();
      const cs = getComputedStyle(nav);
      return {
        navTop: nr.top,
        navBottom: nr.bottom,
        navH: nr.height,
        navPos: cs.position,
        winH: window.innerHeight,
        lastBottom: last.bottom,
        obscured: last.bottom > nr.top + 2,
      };
    });
    await page.screenshot({ path: `${OUT}_mobile_bottomnav.png`, fullPage: false });
    check(
      '手机导航：固定底部且不被内容遮挡',
      m.navPos === 'fixed' && Math.abs(m.navBottom - m.winH) <= 2 && !m.obscured,
      `pos=${m.navPos} navTop=${Math.round(m.navTop)} winH=${m.winH} lastCardBottom=${Math.round(m.lastBottom)} obscured=${m.obscured}`,
    );
    check('手机导航：高度小于底部留白(96px)', m.navH <= 96, `navH=${Math.round(m.navH)}`);
    await page.close();
  }
} catch (e) {
  check('测试脚本异常', false, String(e));
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n==== 结果：${passed}/${results.length} 通过 ====`);
process.exit(passed === results.length ? 0 : 1);
