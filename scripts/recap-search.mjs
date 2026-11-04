import { chromium } from 'playwright';
const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
await p.waitForTimeout(2500);
await p.screenshot({ path: 'screenshots/acceptance/desktop-search-trending.png' });
const input = p.locator('input[placeholder*="例如"]').first();
await input.waitFor({ timeout: 8000 });
await input.fill('Naruto');
try { await p.waitForFunction(() => document.body.innerText.includes('NARUTO'), { timeout: 12000 }); } catch {}
await p.waitForTimeout(2500);
const cards = await p.locator('button[data-testid="poster-card"]').count();
const first = (await p.locator('button[data-testid="poster-card"]').first().innerText().catch(() => '')).slice(0, 60);
const body = (await p.locator('body').innerText()).slice(0, 120);
console.log('Naruto搜索 卡片数:', cards, '| 首卡:', first);
console.log('页面片段:', body.replace(/\s+/g, ' '));
await p.screenshot({ path: 'screenshots/acceptance/desktop-search-Naruto.png' });
// 再用罗马音搜 Frieren
await input.fill('葬送のフリーレン');
try { await p.waitForFunction(() => document.body.innerText.includes('フリーレン'), { timeout: 12000 }); } catch {}
await p.waitForTimeout(2000);
const fcards = await p.locator('button[data-testid="poster-card"]').count();
console.log('Frieren(罗马音)搜索 卡片数:', fcards);
await p.screenshot({ path: 'screenshots/acceptance/desktop-search-Frieren.png' });
await b.close();
