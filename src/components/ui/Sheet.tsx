import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

// 移动端底部弹层（底部 sheet）
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ?? '弹层'}
        className="relative w-full max-w-lg glass border-t border-line rounded-t-2xl max-h-[85vh] overflow-y-auto animate-fadeUp"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 glass">
          <div className="font-bold text-ink">{title}</div>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
