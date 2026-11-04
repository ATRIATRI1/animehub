import { useEffect, useState } from 'react';
import { nextAiringTime } from '../../lib/utils';

// 动态倒计时：根据播出星期与当前时间实时计算，不写死季度/日期。
export function Countdown({
  airDay,
  airTime,
  compact = false,
}: {
  airDay: number;
  airTime?: string;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const target = nextAiringTime(airDay, airTime);
  let diff = Math.max(0, target.getTime() - now);
  const d = Math.floor(diff / 86400000);
  diff %= 86400000;
  const h = Math.floor(diff / 3600000);
  diff %= 3600000;
  const m = Math.floor(diff / 60000);
  diff %= 60000;
  const s = Math.floor(diff / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (compact) {
    return (
      <span className="font-semibold text-accent2">
        {d > 0 ? `${d}天 ` : ''}
        {pad(h)}:{pad(m)}:{pad(s)}
      </span>
    );
  }
  return (
    <span className="font-mono text-sm font-semibold text-accent2 tabular-nums">
      {d > 0 && <span className="text-ink">{d}天 </span>}
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}
