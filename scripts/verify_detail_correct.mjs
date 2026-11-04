import { chromium } from 'playwright';
const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const browser = await chromium.launch();
const page = await (await browser.newContext({viewport:{width:1280,height:800}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto(`${BASE}#/anime/anilist-1`, {waitUntil:'networkidle',timeout:25000}).catch(()=>{});
await page.waitForTimeout(4000);
const d = await page.evaluate(()=>{
  const h1=document.querySelector('h1'); 
  const t=document.body?document.body.innerText:'';
  return {h1:h1?h1.innerText:null, len:t.length, img:!!document.querySelector('img'), snip:t.replace(/\s+/g,' ').slice(0,140)};
});
console.log(`[${d.h1&&d.len>200?'PASS':'FAIL'}] detail #/anime/anilist-1: h1="${d.h1}" len=${d.len} img=${d.img} errs=${errs.length}`);
console.log('   '+d.snip);
await browser.close();
