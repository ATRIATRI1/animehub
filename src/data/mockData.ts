import type {
  Anime,
  AnimeFormat,
  AnimeStatus,
  Collection,
  CustomTag,
  Season,
  UserSettings,
  WatchHistory,
  WatchStatus,
} from '../types';
import { getSeasonFromDate } from '../lib/utils';

// ============================================================
// 原创占位数据集（全部为虚构作品，不含任何第三方授权素材）
// 使用确定性伪随机（mulberry32）生成，保证每次刷新种子数据一致。
// 用户改动通过 dataAccess 写入 localStorage 覆盖种子，不影响种子本身。
// ⚠️ 此为本阶段“预览数据”，非真实用户数据，非云端存储。
// ============================================================

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261031);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

const GRADIENTS = [
  'linear-gradient(135deg,#8B5CF6,#22D3EE)',
  'linear-gradient(135deg,#F472B6,#8B5CF6)',
  'linear-gradient(135deg,#22D3EE,#34D399)',
  'linear-gradient(135deg,#FBBF24,#F472B6)',
  'linear-gradient(135deg,#60A5FA,#8B5CF6)',
  'linear-gradient(135deg,#A78BFA,#22D3EE)',
  'linear-gradient(135deg,#34D399,#60A5FA)',
  'linear-gradient(135deg,#F472B6,#FBBF24)',
  'linear-gradient(135deg,#7C6CD4,#22D3EE)',
  'linear-gradient(135deg,#E85A8A,#8B5CF6)',
];

const CN_A = ['星海', '琉璃', '机神', '夜行', '苍蓝', '薄荷', '深渊', '晴空', '银翼', '幻月', '枫色', '光之', '破晓', '悠长', '紫电', '星屑', '绯红', '霜雪', '碧空', '混沌', '黎明', '落樱', '炽焰', '幽暗'];
const CN_B = ['彼端', '之庭', '纪元', '抄', '航线', '夏日', '回响', '列车', '骑士', '物语', '协奏', '彼方', '之诗', '假日', '一闪', '咖啡屋', '誓约', '恋曲', '守护', '传说', '之刃', '绘卷', '序曲', '夜话'];
const EN_A = ['Stellar', 'Crystal', 'Mecha', 'Nocturne', 'Azure', 'Mint', 'Abyss', 'Sky', 'Silver', 'Lunar', 'Maple', 'Radiant', 'Dawn', 'Eternal', 'Violet', 'Stardust', 'Crimson', 'Frost', 'Azure', 'Chaos', 'Twilight', 'Sakura', 'Blaze', 'Shadow'];
const EN_B = ['Horizon', 'Garden', 'Genesis', 'Watch', 'Line', 'Summer', 'Echo', 'Train', 'Wing', 'Tale', 'Sonata', 'Beyond', 'Poem', 'Holiday', 'Flash', 'Cafe', 'Oath', 'Romance', 'Guardian', 'Legend', 'Blade', 'Scroll', 'Prelude', 'Night'];

const GENRES = ['奇幻', '科幻', '日常', '战斗', '治愈', '悬疑', '机战', '冒险', '恋爱', '喜剧', '运动', '音乐', '历史', '推理', '萌系', '热血'];
const STUDIOS = ['Aurora Studio', 'Studio Lumen', 'Nova Animation', 'Crimson Pix', 'Blue OceanWorks', 'Starlight Studio', 'Pixel Forge', 'Moonlit Arts', 'Zephyr Animation', 'Kaze Production'];
const SOURCES = ['轻小说', '漫画', '原创', '游戏', '小说', 'Web漫画'];
const FORMATS: AnimeFormat[] = ['TV', 'TV', 'TV', 'MOVIE', 'OVA', 'ONA'];
const SEASONS: Season[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

const SYNOPSES = [
  '在遥远的未来，少年与一台古老机魂相遇，命运的齿轮就此转动。',
  '一座被遗忘的庭园里，藏着关于时间与记忆的秘密。',
  '当世界被机械吞噬，最后的守护者挺身而出，踏上归乡之路。',
  '都市的霓虹之下，一群少年用音乐对抗沉寂的夜晚。',
  '深海之下潜伏着未知文明，一次探险揭开了文明的真相。',
  '平凡的日常因转学生的到来而悄然改变，夏天从此不再相同。',
  '星空彼端，有一座只存在于传说中的城市，等待被重新发现。',
  '剑与誓约交织的战场上，少年写下属于自己的传奇。',
  '季节轮转，小镇的咖啡屋成为所有故事的起点。',
  '在末日之后的废土上，他们用微小的善意点亮彼此。',
];

const TAG_NAMES = ['神作候选', '年度期待', '机战控', '治愈系', '画风党', '声优厨', '催泪', '燃系', '脑洞大', '轻松向', '必看', '待补'];
const TAG_COLORS = ['#8B5CF6', '#22D3EE', '#F472B6', '#34D399', '#FBBF24', '#60A5FA', '#A78BFA', '#F87171', '#7C6CD4', '#10B981', '#E85A8A', '#3B82F6'];

function makeTitles(i: number) {
  const cn = CN_A[i % CN_A.length] + CN_B[(i * 7) % CN_B.length];
  const romaji = EN_A[i % EN_A.length] + ' ' + EN_B[(i * 5) % EN_B.length];
  const en = EN_A[(i * 3) % EN_A.length] + ' ' + EN_B[(i * 11) % EN_B.length];
  return { cn, romaji, en };
}

function generateAnime(count: number): Anime[] {
  const list: Anime[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    let { cn, romaji, en } = makeTitles(i);
    while (used.has(cn)) {
      cn += '·续';
      romaji += ' II';
    }
    used.add(cn);
    const format = pick(FORMATS);
    const episodes = format === 'MOVIE' ? 1 : format === 'OVA' ? between(2, 6) : pick([12, 13, 24, 24, 25]);
    const status: AnimeStatus = rnd() < 0.5 ? 'FINISHED' : 'RELEASING';
    // 连载中的作品归入“当前真实季度”，保证追番日历默认视图有内容且随运行时间动态变化；
    // 已完结作品则随机分布于历史季度。
    const cur = getSeasonFromDate();
    const year = status === 'RELEASING' ? cur.year : between(2021, cur.year);
    const season: Season = status === 'RELEASING' ? (cur.season as Season) : pick(SEASONS);
    const gcount = between(2, 4);
    const genres: string[] = [];
    while (genres.length < gcount) {
      const g = pick(GENRES);
      if (!genres.includes(g)) genres.push(g);
    }
    const scount = between(1, 2);
    const studios: string[] = [];
    while (studios.length < scount) {
      const s = pick(STUDIOS);
      if (!studios.includes(s)) studios.push(s);
    }
    list.push({
      id: `a${i + 1}`,
      anilistId: 100000 + i,
      titleNative: cn,
      titleRomaji: romaji,
      titleEnglish: en,
      synonyms: rnd() < 0.4 ? [`${cn}外传`] : [],
      coverGradient: GRADIENTS[i % GRADIENTS.length],
      bannerGradient: GRADIENTS[(i + 3) % GRADIENTS.length],
      format,
      episodes,
      durationMin: pick([23, 24, 24, 25]),
      status,
      season,
      seasonYear: year,
      studios,
      source: pick(SOURCES),
      genres,
      synopsis: pick(SYNOPSES),
      averageScore: Math.round((6.4 + rnd() * 3.4) * 10) / 10,
      airDay: status === 'RELEASING' ? between(0, 6) : undefined,
      airTime: `${String(between(17, 26) % 24).padStart(2, '0')}:${pick(['00', '30'])}`,
    });
  }
  return list;
}

export const seedAnime: Anime[] = generateAnime(40);

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function generateCollections(anime: Anime[]): Collection[] {
  const statuses: WatchStatus[] = ['planning', 'watching', 'completed', 'paused', 'dropped'];
  // 加权：更多“看过/想看/在看”
  const weighted: WatchStatus[] = [
    'completed', 'completed', 'completed', 'watching', 'watching', 'watching',
    'planning', 'planning', 'paused', 'dropped',
  ];
  const list: Collection[] = [];
  anime.forEach((a, idx) => {
    const status = weighted[idx % weighted.length] ?? pick(statuses);
    const progress =
      status === 'completed'
        ? a.episodes
        : status === 'planning'
          ? 0
          : between(0, a.episodes - 1);
    const score = rnd() < 0.78 ? Math.round((6 + rnd() * 4) * 10) / 10 : 0;
    const tagCount = between(0, 3);
    const tags: string[] = [];
    while (tags.length < tagCount) {
      const t = pick(TAG_NAMES);
      if (!tags.includes(t)) tags.push(t);
    }
    const createdOffset = between(10, 720);
    const startedOffset = status === 'planning' ? 0 : between(2, createdOffset - 2);
    list.push({
      id: `c${idx + 1}`,
      userId: 'u_demo',
      animeId: a.id,
      status,
      score,
      progressEpisodes: progress,
      startedAt: startedOffset ? daysAgo(startedOffset) : undefined,
      completedAt: status === 'completed' ? daysAgo(between(1, startedOffset - 1 || 1)) : undefined,
      rewatchCount: status === 'completed' && rnd() < 0.2 ? 1 : 0,
      isFavorite: rnd() < 0.15,
      isPrivate: false,
      personalNotes: rnd() < 0.3 ? '个人备注：这一部节奏很舒服，推荐给同好。' : '',
      tags,
      createdAt: daysAgo(createdOffset),
      updatedAt: daysAgo(between(0, startedOffset || 1)),
    });
  });
  return list;
}

export const seedCollections: Collection[] = generateCollections(seedAnime);

function generateHistory(collections: Collection[], anime: Anime[]): WatchHistory[] {
  const byId = new Map(anime.map((a) => [a.id, a]));
  const history: WatchHistory[] = [];
  let hid = 1;
  for (const c of collections) {
    const a = byId.get(c.animeId);
    if (!a) continue;
    if (c.status === 'planning') continue;
    const eps = c.progressEpisodes;
    const startDays = c.startedAt ? Math.floor((Date.now() - new Date(c.startedAt).getTime()) / 86400000) : 60;
    const span = Math.max(1, Math.min(startDays, 200));
    for (let e = 1; e <= eps; e++) {
      const ago = Math.floor((e / Math.max(eps, 1)) * span) + between(0, 2);
      history.push({
        id: `h${hid++}`,
        userId: 'u_demo',
        animeId: c.animeId,
        episode: e,
        watchedAt: daysAgo(ago),
        durationMin: a.durationMin,
      });
    }
  }
  return history;
}

export const seedHistory: WatchHistory[] = generateHistory(seedCollections, seedAnime);

export const seedTags: CustomTag[] = TAG_NAMES.slice(0, 8).map((name, i) => ({
  id: `t${i + 1}`,
  userId: 'u_demo',
  name,
  color: TAG_COLORS[i % TAG_COLORS.length],
}));

export const seedSettings: UserSettings = {
  userId: 'u_demo',
  theme: 'aurora',
  displayName: '我的收藏',
  bio: '个人动漫收藏与追番管理 · 预览数据',
  defaultView: 'grid',
};
