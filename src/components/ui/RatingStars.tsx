import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../lib/utils';

// 评分星级：5 颗星 = 0~10 分，每颗 2 分；支持半星（1 分步进）。
// 评分以浮点存储，允许 0~10 小数（与第三阶段云数据库 score 字段一致）。
export function RatingStars({
  score,
  onChange,
  size = 20,
  showValue = true,
}: {
  score: number;
  onChange?: (next: number) => void;
  size?: number;
  showValue?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? score; // 0-10
  const lit = Math.round(display); // 已点亮“半星数” 0-10

  function valueFromEvent(e: React.MouseEvent, i: number): number {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const leftHalf = e.clientX - rect.left < rect.width / 2;
    const full = (i + 1) * 2;
    return leftHalf ? full - 1 : full;
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((i) => {
          const fullVal = (i + 1) * 2;
          const halfVal = (i + 1) * 2 - 1;
          const frac = lit >= fullVal ? 1 : lit === halfVal ? 0.5 : 0;
          return (
            <span
              key={i}
              className="relative inline-block"
              style={{ width: size, height: size }}
            >
              <Star
                className="absolute inset-0 text-line"
                strokeWidth={2}
                style={{ width: size, height: size }}
              />
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${frac * 100}%` }}
              >
                <Star
                  className="text-pop"
                  fill="var(--pop)"
                  strokeWidth={2}
                  style={{ width: size, height: size }}
                />
              </span>
              {onChange && (
                <button
                  type="button"
                  className="absolute inset-0 cursor-pointer"
                  aria-label={`${fullVal} 分`}
                  onMouseMove={(e) => setHover(valueFromEvent(e, i))}
                  onClick={(e) => {
                    const v = valueFromEvent(e, i);
                    onChange(v === score ? 0 : v);
                  }}
                />
              )}
            </span>
          );
        })}
      </div>
      {showValue && (
        <span className="text-sm font-semibold text-ink">
          {score > 0 ? score.toFixed(1) : '未评分'}
        </span>
      )}
    </div>
  );
}
