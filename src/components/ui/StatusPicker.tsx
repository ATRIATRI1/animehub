import { useEffect } from 'react';
import { X, Check } from 'lucide-react';
import type { WatchStatus } from '../../types';
import { STATUS_META } from '../../lib/utils';
import { cn } from '../../lib/utils';

// 加入清单时的「观看状态选择」弹窗（居中 modal，桌面/移动端通用）。
// 提供 6 种状态：想看 / 在看 / 看过 / 再看 / 搁置 / 弃番。
// 用户选择后由父组件确认添加；支持 Esc / 点击遮罩关闭。
const STATUS_ORDER: WatchStatus[] = [
  'planning',
  'watching',
  'completed',
  'rewatching',
  'paused',
  'dropped',
];

// 每种状态的补充说明（用于弹窗内的辅助文案）
const STATUS_HINT: Record<WatchStatus, string> = {
  planning: '加入待观看列表',
  watching: '加入首页「我的在看」',
  completed: '标记为已看完',
  rewatching: '重新观看，进度重新记录并保留原历史',
  paused: '保留进度，不出现在首页「在看」',
  dropped: '保留记录，不再显示为追番中',
};

interface StatusPickerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (status: WatchStatus) => void;
  /** 当前已选状态（已加入时用于高亮，可选） */
  current?: WatchStatus;
  title?: string;
}

export function StatusPicker({ open, onClose, onConfirm, current, title }: StatusPickerProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ?? '选择观看状态'}
        className="relative w-full max-w-md glass border border-line rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,.4)] overflow-hidden animate-fadeUp"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div>
            <div className="font-bold text-ink">{title ?? '选择观看状态'}</div>
            <div className="text-xs text-muted mt-0.5">添加后可随时在详情页修改</div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="关闭">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 grid grid-cols-1 gap-2 max-h-[60vh] overflow-y-auto">
          {STATUS_ORDER.map((s) => {
            const m = STATUS_META[s];
            const active = current === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onConfirm(s)}
                className={cn(
                  'group flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition',
                  active
                    ? 'border-transparent'
                    : 'border-line hover:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]',
                )}
                style={{
                  background: active
                    ? `color-mix(in srgb, ${m.colorVar} 18%, transparent)`
                    : 'var(--bg-surface)',
                }}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: m.colorVar }}
                />
                <span className="flex-1 min-w-0">
                  <span className="font-semibold text-ink text-sm">{m.label}</span>
                  <span className="block text-xs text-muted mt-0.5">{STATUS_HINT[s]}</span>
                </span>
                {active && <Check size={16} style={{ color: m.colorVar }} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
