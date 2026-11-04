// AnimeHub 公共目录索引生成脚本（手动更新用）
// ---------------------------------------------------------------------------
// 输入：根目录 bgm_data_latest.json（bangumi-data 社区数据集，CC BY 4.0）
// 输出：public/catalog-index.json（扁平映射：anilistId -> {zh,jp,bg,ty,b,c}）
//       public/catalog-index.meta.json（版本/生成时间/数量，供维护识别）
// 安全：生成前先备份旧文件为 public/catalog-index.json.bak；任何错误都不覆盖旧文件。
//
// 用法：node scripts/build-catalog-index.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'bgm_data_latest.json');
const OUT = path.join(ROOT, 'public', 'catalog-index.json');
const META = path.join(ROOT, 'public', 'catalog-index.meta.json');
const BAK = path.join(ROOT, 'public', 'catalog-index.json.bak');

if (!fs.existsSync(SRC)) {
  console.error('✗ 源文件不存在:', SRC);
  process.exit(1);
}

function firstSiteId(sites, site) {
  for (const s of sites || []) if (s.site === site && s.id) return String(s.id);
  return null;
}

try {
  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const items = Array.isArray(raw) ? raw : raw.items;
  if (!Array.isArray(items)) {
    console.error('✗ 源文件结构异常：缺少 items 数组');
    process.exit(1);
  }

  const index = {};
  let skipped = 0;
  for (const it of items) {
    const alId = firstSiteId(it.sites, 'aniList');
    if (!alId) { skipped++; continue; }
    const zhArr = it.titleTranslate && it.titleTranslate['zh-Hans'];
    const rec = {
      zh: Array.isArray(zhArr) && zhArr.length ? zhArr[0] : null,
      jp: it.title || null,
      bg: firstSiteId(it.sites, 'bangumi'),
      ty: it.type || null,
      b: it.begin || null,
      c: it.broadcast || null,
    };
    index[alId] = rec;
  }

  // 备份旧文件（仅在已存在且解析成功时才覆盖）
  if (fs.existsSync(OUT)) {
    try { fs.copyFileSync(OUT, BAK); } catch {}
  }

  fs.writeFileSync(OUT, JSON.stringify(index));
  const meta = {
    version: 1,
    generator: 'scripts/build-catalog-index.mjs',
    source: 'bgm_data_latest.json (bangumi-data, CC BY 4.0)',
    generatedAt: new Date().toISOString(),
    count: Object.keys(index).length,
    skippedNoAnilist: skipped,
  };
  fs.writeFileSync(META, JSON.stringify(meta, null, 2));

  console.log(`✓ 生成完成：${meta.count} 条记录（跳过无 AniList ID 的 ${skipped} 条）`);
  console.log(`  索引: ${OUT} (${fs.statSync(OUT).size} bytes)`);
  console.log(`  元信息: ${META}`);
  console.log('  浏览器缓存键版本: catalog-index-v1（见 src/services/catalogCache.ts）');
} catch (e) {
  console.error('✗ 生成失败，旧文件保持不变：', e.message);
  process.exit(1);
}
