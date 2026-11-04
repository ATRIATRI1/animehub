import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Check,
  Heart,
  Minus,
  Pencil,
  CalendarClock,
  Star,
} from 'lucide-react';
import { dataAccess } from '../services/dataAccess';
import type { Anime, Collection, CustomTag } from '../types';
import { STATUS_META, SEASON_LABEL, displayTitle, GENRE_ZH, SOURCE_ZH, FORMAT_ZH, synopsisLang, type WatchStatus } from '../lib/utils';
import { Button, Card } from '../components/ui/primitives';
import { Select } from '../components/ui/Select';
import { RatingStars } from '../components/ui/RatingStars';
import { StatusBadge, TagChip } from '../components/ui/Badge';
import { PosterCard } from '../components/ui/PosterCard';
import { ProgressBar } from '../components/ui/primitives';
import { Countdown } from '../components/ui/Countdown';
import { CoverImage } from '../components/ui/CoverImage';
import { StatusPicker } from '../components/ui/StatusPicker';
import {
  routeToSourceId,
  isExternalSourceId,
  getAnimeDetail,
  getCachedRecommendations,
} from '../services/anilist';
import { findBgmForAnime, type BgmMatch } from '../services/bangumi';
import { useAuth } from '../context/AuthContext';
import { signInWithWorkBuddy } from '../services/auth';
import { CLOUD_MODE } from '../lib/env';
import { useZhTitle } from '../hooks/useCatalog';

const STATUS_OPTS = (
  ['planning', 'watching', 'completed', 'rewatching', 'paused', 'dropped'] as WatchStatus[]
).map((s) => ({ value: s, label: STATUS_META[s].label }));

export function AnimeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canPersonal = !CLOUD_MODE || !!user;
  const [anime, setAnime] = useState<Anime | undefined>();
  const [recs, setRecs] = useState<Anime[]>([]);
  const [col, setCol] = useState<Collection | null>(null);
  const [tags, setTags] = useState<CustomTag[]>([]);
  const [notes, setNotes] = useState('');
  // Bangumi 中文元数据源（同源代理，匹配不可靠时为 null → 回退 AniList）
  const [bgm, setBgm] = useState<BgmMatch | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  // 加入清单时的状态选择弹窗
  const [pickerOpen, setPickerOpen] = useState(false);
  // Bangumi 数据集中文标题（主中文来源，覆盖 ~94%）；ID 未映射时按日文原名精确兜底
  const zh = useZhTitle(anime?.anilistId, anime?.titleNative);

  // 简介语言优先级：Bangumi 中文 > 识别为中文 > 识别为日文 > 英文。
  // AniList description 为单一字段、语言不固定，需据实标注语言并回退，绝不把英文冒充中文。
  const synopsisInfo = useMemo(() => {
    const syn = anime?.synopsis ?? '';
    const lang = synopsisLang(syn);
    const hasBgm = !!bgm?.summary;
    const zhText = hasBgm ? (bgm!.summary as string) : lang === 'zh' ? syn : null;
    const jaText = lang === 'ja' ? syn : null;
    const enText = lang === 'en' ? syn : null;
    const primary =
      zhText
        ? { tag: '中文简介', text: zhText, isCn: hasBgm }
        : jaText
          ? { tag: '日文简介', text: jaText, isCn: false }
          : enText
            ? { tag: '英文简介', text: enText, isCn: false }
            : null;
    // 有 Bangumi 中文时，可切换查看 AniList 原文（通常为英文），避免丢失英文资料
    const secondary = hasBgm && syn ? { tag: '原文简介', text: syn, isCn: false as boolean } : null;
    const shown = primary ? (showOriginal && secondary ? secondary : primary) : null;
    return { shown, secondary, hasBgm };
  }, [anime?.synopsis, bgm, showOriginal]);

  useEffect(() => {
    if (!id) return;
    const sourceId = routeToSourceId(id);
    let alive = true;
    (async () => {
      try {
        let a: Anime | undefined;
        let recommendations: Anime[] = [];
        if (isExternalSourceId(sourceId)) {
          const anilistId = Number(sourceId.split(':')[1]);
          const res = await getAnimeDetail(anilistId);
          a = res.anime;
          recommendations = res.recommendations;
        } else {
          a = await dataAccess.getAnimeById(sourceId);
        }
        // 个人数据（收藏/标签）仅在可访问时加载：避免匿名用户触发云端写入被 RLS 拦截
        const [c, t] = canPersonal
          ? await Promise.all([
              dataAccess.getCollectionByAnime(sourceId),
              dataAccess.getCustomTags(),
            ])
          : [undefined, []];
        if (!alive) return;
        setAnime(a);
        setRecs(recommendations);
        setCol(c ?? null);
        setTags(t);
        setNotes(c?.personalNotes ?? '');
      } catch (e) {
        if (alive) setAnime(undefined);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, canPersonal]);

  // 作品加载后异步补充 Bangumi 中文元数据（译名/简介/封面）；失败静默回退，不阻塞渲染
  useEffect(() => {
    if (!anime) return;
    let alive = true;
    setBgm(null);
    setShowOriginal(false);
    findBgmForAnime(anime)
      .then((m) => {
        if (alive) setBgm(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [anime]);

  if (!anime) {
    return (
      <div className="py-20 text-center text-muted">
        未找到该作品。
        <div className="mt-4">
          <Link to="/search">
            <Button variant="ghost">去动漫库</Button>
          </Link>
        </div>
      </div>
    );
  }

  async function save(patch: Parameters<typeof dataAccess.upsertCollection>[0]) {
    const res = await dataAccess.upsertCollection(patch);
    setCol(res);
  }

  // 匿名用户点击收藏类操作 → 跳转登录
  function requireLoginThen(fn: () => void) {
    if (CLOUD_MODE && !user) {
      signInWithWorkBuddy();
      return;
    }
    fn();
  }

  const episodes = anime.episodes;
  const progress = col?.progressEpisodes ?? 0;
  const inList = !!col;

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-4"
      >
        <ArrowLeft size={16} /> 返回
      </button>

      {/* 横幅（真实背景图，失败回退渐变） */}
      <CoverImage
        anime={anime}
        src={anime.bannerImageUrl}
        className="h-40 sm:h-56 rounded-2xl"
      />

      <div className="flex flex-col sm:flex-row gap-5 -mt-20 sm:-mt-24 relative px-1">
        {/* 海报 */}
        <CoverImage
          anime={anime}
          className="w-36 sm:w-48 shrink-0 rounded-2xl border border-line shadow-card aspect-[3/4]"
        />

        {/* 主信息 */}
        <div className="flex-1 min-w-0 pt-2 sm:pt-24">
          {/* 主标题优先级：Bangumi 数据集中文 > 实时 Bangumi name_cn > 内建中文 > displayTitle */}
          {(() => {
            const main = zh || bgm?.nameCn || displayTitle(anime);
            return (
              <>
                <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-ink leading-tight">
                  {main}
                </h1>
                {anime.titleNative && anime.titleNative !== main && (
                  <div className="text-sm text-muted mt-1">{anime.titleNative}</div>
                )}
                {anime.titleRomaji && anime.titleRomaji !== main && anime.titleRomaji !== anime.titleNative && (
                  <div className="text-xs text-muted">{anime.titleRomaji}</div>
                )}
                {anime.titleEnglish && anime.titleEnglish !== main && anime.titleEnglish !== anime.titleNative && (
                  <div className="text-xs text-muted">{anime.titleEnglish}</div>
                )}
              </>
            );
          })()}

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs font-semibold px-2 py-1 rounded-md bg-elevated border border-line text-ink">
              {FORMAT_ZH[anime.format] ?? anime.format}
            </span>
            {anime.averageScore != null && anime.averageScore > 0 && (
              <span className="text-xs font-semibold text-muted">
                ★ {anime.averageScore.toFixed(1)} 社区评分
              </span>
            )}
            {anime.episodes > 0 && (
              <span className="text-xs font-semibold text-muted">{anime.episodes} 集</span>
            )}
            {anime.durationMin > 0 && (
              <span className="text-xs font-semibold text-muted">{anime.durationMin} 分钟/集</span>
            )}
          </div>

          {/* 操作 */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {!inList ? (
              <Button onClick={() => requireLoginThen(() => setPickerOpen(true))}>
                <Plus size={16} /> 加入清单
              </Button>
            ) : (
              <>
                <StatusBadge status={col!.status} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => save({ animeId: anime!.id, isFavorite: !col!.isFavorite })}
                >
                  <Heart size={15} className={col!.isFavorite ? 'text-pop fill-pop' : ''} />
                  {col!.isFavorite ? '已收藏' : '收藏'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 信息网格（仅展示可获得字段，缺失不显示虚假数据） */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-6">
        {anime.status && (
          <InfoCell k="完结状态" v={anime.status === 'FINISHED' ? '已完结' : anime.status === 'RELEASING' ? '连载中' : '未播出'} />
        )}
        {anime.seasonYear && anime.season && (
          <InfoCell k="季度" v={`${anime.seasonYear} ${SEASON_LABEL[anime.season]}`} />
        )}
        {anime.studios.length > 0 && <InfoCell k="制作公司" v={anime.studios.join('、')} />}
        {anime.source && <InfoCell k="原作" v={SOURCE_ZH[anime.source] ?? anime.source} />}
        {anime.averageScore != null ? (
          <InfoCell k="社区评分" v={`${anime.averageScore.toFixed(1)} / 10`} />
        ) : (
          <InfoCell k="社区评分" v="暂无评分" />
        )}
      </div>

      {/* 简介 + 类型 */}
      <Card className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-ink">简介</h3>
          {synopsisInfo.secondary && (
            <button
              onClick={() => setShowOriginal((v) => !v)}
              className="text-xs font-semibold text-accent hover:underline"
            >
              {showOriginal ? '查看中文' : '查看原文'}
            </button>
          )}
        </div>
        {synopsisInfo.shown ? (
          <>
            <span className="inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded bg-elevated text-accent mb-1.5">
              {synopsisInfo.shown.tag}
            </span>
            <p className="text-sm text-muted leading-relaxed whitespace-pre-line">
              {synopsisInfo.shown.text}
            </p>
            {synopsisInfo.shown.isCn && synopsisInfo.hasBgm && (
              <div className="text-[11px] text-muted mt-2">中文简介由 Bangumi 提供</div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">暂无简介。</p>
        )}
        {anime.genres.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {anime.genres.map((g) => (
              <span
                key={g}
                className="text-xs font-semibold px-2.5 py-1 rounded-full bg-elevated border border-line text-accent"
              >
                {GENRE_ZH[g] ?? g}
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* 我的追踪面板 */}
      {inList && (
        <Card className="mt-5">
          <div className="flex items-center gap-2 mb-4">
            <Pencil size={16} className="text-accent" />
            <h3 className="font-bold text-ink">我的追踪</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <Field label="观看状态">
                <Select
                  value={col!.status}
                  options={STATUS_OPTS}
                  onChange={(v) => save({ animeId: anime!.id, status: v as WatchStatus })}
                />
              </Field>

              <Field label={`观看进度（${progress} / ${episodes}）`}>
                <div className="flex items-center gap-3">
                  <Button
                    variant="soft"
                    size="sm"
                    aria-label="减少进度"
                    onClick={() => save({ animeId: anime!.id, progressEpisodes: Math.max(0, progress - 1) })}
                  >
                    <Minus size={14} />
                  </Button>
                  <div className="flex-1">
                    <ProgressBar value={progress} max={episodes} />
                  </div>
                  <Button
                    variant="soft"
                    size="sm"
                    aria-label="增加进度"
                    onClick={() => save({ animeId: anime!.id, progressEpisodes: Math.min(episodes, progress + 1) })}
                  >
                    <Plus size={14} />
                  </Button>
                </div>
              </Field>

              <Field label="我的评分">
                <RatingStars score={col!.score} onChange={(s) => save({ animeId: anime!.id, score: s })} />
              </Field>
            </div>

            <div className="space-y-4">
              <Field label="个人标签">
                <div className="flex flex-wrap gap-1.5">
                  {col!.tags.length === 0 && (
                    <span className="text-xs text-muted">还没有标签，点击下方添加</span>
                  )}
                  {col!.tags.map((t) => (
                    <TagChip
                      key={t}
                      label={t}
                      active
                      onRemove={() => save({ animeId: anime!.id, tags: col!.tags.filter((x) => x !== t) })}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags
                    .filter((t) => !col!.tags.includes(t.name))
                    .map((t) => (
                      <TagChip
                        key={t.id}
                        label={t.name}
                        color={t.color}
                        onClick={() => save({ animeId: anime!.id, tags: [...col!.tags, t.name] })}
                      />
                    ))}
                </div>
              </Field>

              <Field label="备注">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => save({ animeId: anime!.id, personalNotes: notes })}
                  rows={3}
                  placeholder="写下你的观后感…"
                  className="w-full bg-surface border border-line rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-accent resize-none"
                />
              </Field>
            </div>
          </div>

          {(col!.status === 'watching' || col!.status === 'planning') && progress < episodes && (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-line bg-elevated p-3">
              <CalendarClock size={18} className="text-accent2" />
              <div className="text-sm text-ink">
                下一集：第 <b>{progress + 1}</b> 集
                {anime.airDay !== undefined && (
                  <span className="text-muted">
                    {' '}· 距下次更新 <Countdown airDay={anime.airDay} airTime={anime.airTime} compact />
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 同类推荐（来自 AniList 实时推荐） */}
      {recs.length > 0 && (
        <div className="mt-7">
          <h2 className="font-display font-bold text-lg text-ink mb-3">同类推荐</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
            {recs.map((a, i) => (
              <PosterCard key={a.id} anime={a} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* 加入清单：观看状态选择弹窗 */}
      <StatusPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={async (status) => {
          setPickerOpen(false);
          // 「再看」：重开一轮，进度归零 + 再看次数递增，保留原观看历史
          const patch: Parameters<typeof dataAccess.upsertCollection>[0] = { animeId: anime!.id, status };
          if (status === 'rewatching') {
            patch.progressEpisodes = 0;
            patch.rewatchCount = (col?.rewatchCount ?? 0) + 1;
          }
          await save(patch);
        }}
      />
    </div>
  );
}

function InfoCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="text-xs text-muted">{k}</div>
      <div className="font-semibold text-ink mt-1 text-sm">{v}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted mb-2">{label}</div>
      {children}
    </div>
  );
}
