import { useState } from 'react';
import { LogIn, Loader2, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/primitives';
import { signInWithWorkBuddy } from '../services/auth';

export function Login() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    const r = await signInWithWorkBuddy();
    if (r.error) {
      setErr(r.error);
      setBusy(false);
    }
    // 成功时 SDK 会跳转到 WorkBuddy 授权页，本组件随后卸载；
    // 若未跳转（极端情况）则保持按钮可点，错误由 err 提示。
  }

  return (
    <div className="min-h-screen grid place-items-center bg-base px-4">
      <div className="card max-w-md w-full p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl grid place-items-center bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] text-accent">
          <Sparkles size={26} />
        </div>
        <h1 className="font-display font-extrabold text-3xl text-ink mt-4">AnimeHub</h1>
        <p className="text-sm text-muted mt-2">个人动漫收藏与追番管理</p>

        <Button onClick={go} disabled={busy} size="lg" className="w-full mt-7">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
          {busy ? '正在跳转…' : '使用 WorkBuddy 账号登录'}
        </Button>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}

        <p className="text-xs text-muted mt-6 leading-relaxed">
          登录后，你的收藏、评分、观看进度与标签将按账号隔离，安全保存在 WorkBuddy 云端，
          换设备也能同步。当前为正式云端环境。
        </p>
      </div>
    </div>
  );
}
