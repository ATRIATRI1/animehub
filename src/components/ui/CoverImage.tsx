import { useState } from 'react';
import type { Anime } from '../../types';
import { cn, displayTitle } from '../../lib/utils';

interface CoverImageProps {
  anime: Anime;
  /** 图片地址；默认取 anime.coverImageUrl */
  src?: string;
  /** 容器类名（尺寸/圆角由调用方控制） */
  className?: string;
  /** 是否显示底部标题浮层（默认不显示，由卡片自行覆盖） */
  showTitle?: boolean;
  /** 浮层标题文本；缺省时回退到 displayTitle(anime) */
  titleText?: string;
  /** 额外叠加层（状态角标、悬停等） */
  children?: React.ReactNode;
  rounded?: string;
}

/**
 * 真实封面图组件：
 * - 优先加载外部真实图片（AniList CDN，无防盗链）；
 * - 加载失败 / 无图时回退到确定性渐变占位（绝不把占位图当作真实海报）；
 * - 叠加原有纹理与可选标题浮层，保持与原设计一致的视觉。
 */
export function CoverImage({ anime, src, className, showTitle, titleText, children, rounded }: CoverImageProps) {
  // 仅接受 http(s) 图片地址（AniList CDN 为 https）。
  // 空串、空白、相对路径、data:/blob: 等一律视为「无有效封面」→ 直接走渐变占位，
  // 避免把无效地址丢给 <img> 触发无意义的请求和破图。
  const raw = src ?? anime.coverImageUrl;
  const url =
    typeof raw === 'string' && /^https?:\/\/\S+/i.test(raw.trim()) ? raw.trim() : undefined;
  const [failed, setFailed] = useState(false);
  const showImg = !!url && !failed;

  return (
    <div
      className={cn('relative overflow-hidden', rounded ?? '', className)}
      style={{ background: anime.coverGradient }}
    >
      {showImg && (
        <img
          src={url}
          alt={anime.titleNative}
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {/* 原有占位纹理（非第三方素材，作为图片上的暗角/质感） */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 30% 20%, rgba(255,255,255,.5), transparent 45%), radial-gradient(circle at 80% 70%, rgba(0,0,0,.35), transparent 50%)',
        }}
      />
      {showTitle && (
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
      )}
      {showTitle && (
        <div className="absolute inset-x-0 bottom-0 z-10 p-3 font-display font-extrabold leading-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,.6)]">
          {titleText || displayTitle(anime)}
        </div>
      )}
      {children}
    </div>
  );
}
