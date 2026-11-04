import { chromium } from 'playwright';
const HOST='https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:1280,height:800}});
const page=await ctx.newPage();
await page.goto(HOST,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
await page.waitForTimeout(1500);
const before=await page.evaluate(()=>document.documentElement.getAttribute('data-theme'));
const btn=page.locator('button[title*="切换主题"]').first();
let clicked=false;
try{if(await btn.count()>0){await btn.click({timeout:5000});clicked=true;await page.waitForTimeout(700);}}catch(e){}
const after=await page.evaluate(()=>document.documentElement.getAttribute('data-theme'));
const saved=await page.evaluate(()=>localStorage.getItem('animehub_theme'));
console.log(`[${before!==after&&clicked?'PASS':'FAIL'}] theme toggle via button: ${before} -> ${after} (clicked=${clicked}, localStorage=${saved})`);
// also verify URL override
const ctx2=await browser.newContext({viewport:{width:1280,height:800}});
const p2=await ctx2.newPage();
await p2.goto(HOST+'&theme=sakura',{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
await p2.waitForTimeout(1200);
const t2=await p2.evaluate(()=>document.documentElement.getAttribute('data-theme'));
console.log(`[${t2==='sakura'?'PASS':'FAIL'}] ?theme=sakura override: data-theme=${t2}`);
await browser.close();
