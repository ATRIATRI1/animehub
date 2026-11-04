import { useEffect, useRef, useState } from 'react';
import { Moon, Sun, Download, RotateCcw, Upload, User, Palette, Database, FileJson, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { dataAccess } from '../services/dataAccess';
import type { ExportBundle } from '../services/dataAccess';
import { useTheme } from '../context/ThemeContext';
import type { UserSettings, WatchStatus } from '../types';
import { seedAnime } from '../data/mockData';
import { STATUS_META } from '../lib/utils';
import { Card, Button, Input, DemoBanner, Switch } from '../components/ui/primitives';
import { Segmented } from '../components/ui/primitives';

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function csvEscape(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const titleToId = new Map<string, string>();
seedAnime.forEach((a) => {
  titleToId.set(a.titleNative, a.id);
  titleToId.set(a.titleRomaji, a.id);
  if (a.titleEnglish) titleToId.set(a.titleEnglish, a.id);
});
const labelToStatus = new Map<string, WatchStatus>(
  (Object.keys(STATUS_META) as WatchStatus[]).map((k) => [STATUS_META[k].label, k]),
);

interface ImportPreview {
  kind: 'json' | 'csv';
  collections: number;
  history: number;
  tags: number;
  bundle: Partial<ExportBundle>;
}

export function Settings() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dataAccess.getSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  function patch(p: Partial<UserSettings>) {
    dataAccess.updateSettings(p).then((s) => {
      setSettings(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  function changeTheme(t: 'aurora' | 'sakura') {
    setTheme(t);
    patch({ theme: t });
  }

  function exportJson() {
    setBusy(true);
    dataAccess
      .exportData()
      .then((bundle) => {
        download(`animehub-backup-${todayStamp()}.json`, JSON.stringify(bundle, null, 2), 'application/json');
        setMsg('已导出 JSON 备份（含收藏、观看历史、标签与设置）');
      })
      .finally(() => setBusy(false));
  }

  async function exportCsv() {
    const cols = await dataAccess.getCollections();
    const header = ['标题', '状态', '评分', '进度', '总集数', '收藏', '标签', '备注'];
    const lines = [header.map(csvEscape).join(',')];
    cols.forEach((c) => {
      lines.push(
        [
          c.anime.titleNative,
          STATUS_META[c.status].label,
          c.score,
          c.progressEpisodes,
          c.anime.episodes,
          c.isFavorite ? '是' : '否',
          c.tags.join('|'),
          c.personalNotes,
        ]
          .map(csvEscape)
          .join(','),
      );
    });
    download(`animehub-collections-${todayStamp()}.csv`, '﻿' + lines.join('\n'), 'text/csv;charset=utf-8');
    setMsg('已导出 CSV（收藏清单）');
  }

  async function onPickJson(file: File) {
    setErr(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Partial<ExportBundle>;
      if (!data || typeof data !== 'object' || !Array.isArray(data.collections)) {
        throw new Error('文件格式不正确：缺少 collections 数组');
      }
      const valid = (data.collections ?? []).filter((c) => titleToId.has(c.animeId) || seedAnime.some((a) => a.id === c.animeId));
      setImportPreview({
        kind: 'json',
        collections: valid.length,
        history: (data.history ?? []).length,
        tags: (data.tags ?? []).length,
        bundle: data,
      });
    } catch (e) {
      setErr((e as Error).message || '解析失败');
    }
  }

  async function onPickCsv(file: File) {
    setErr(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text).slice(1); // 跳过表头
      const collections = [];
      for (const r of rows) {
        if (!r[0]) continue;
        const id = titleToId.get(r[0].trim());
        if (!id) continue;
        const rawStatus = (r[1] ?? '').trim();
        const status: WatchStatus = labelToStatus.get(rawStatus) ?? (rawStatus as WatchStatus);
        collections.push({
          id: `imp_${id}`,
          userId: 'import',
          animeId: id,
          status,
          score: Number(r[2]) || 0,
          progressEpisodes: Number(r[3]) || 0,
          isFavorite: (r[5] ?? '').includes('是'),
          isPrivate: false,
          personalNotes: r[7] ?? '',
          tags: (r[6] ?? '').split('|').map((s: string) => s.trim()).filter(Boolean),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      if (!collections.length) throw new Error('未在 CSV 中匹配到已知作品');
      setImportPreview({
        kind: 'csv',
        collections: collections.length,
        history: 0,
        tags: 0,
        bundle: { collections: collections as any },
      });
    } catch (e) {
      setErr((e as Error).message || '解析失败');
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await dataAccess.importData(importPreview.bundle);
      setMsg(`导入完成：收藏 ${r.collections} 部、历史 ${r.history} 条、标签 ${r.tags} 个`);
      setImportPreview(null);
      dataAccess.getSettings().then(setSettings);
    } catch (e) {
      setErr((e as Error).message || '导入失败');
    } finally {
      setBusy(false);
    }
  }

  function resetDemo() {
    if (confirm('确定要清空当前账号的云端数据吗？所有收藏、观看历史与标签将被删除（不可恢复）。')) {
      dataAccess.resetDemoData().then(() => {
        dataAccess.getSettings().then(setSettings);
        setMsg('已清空当前账号数据');
      });
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display font-extrabold text-2xl text-ink">个人设置</h1>
      <p className="text-sm text-muted mt-1 mb-4">
        WorkBuddy 云端账号 · 主题、资料与数据均按账号隔离保存在云端。
      </p>
      <div className="mb-5">
        <DemoBanner />
      </div>

      {msg && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-line bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3.5 py-2 text-sm text-ink">
          <CheckCircle2 size={16} className="text-accent" /> {msg}
        </div>
      )}

      {/* 外观 */}
      <Card className="p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Palette size={16} className="text-accent" />
          <h3 className="font-bold text-ink">外观</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-ink text-sm">主题</div>
            <div className="text-xs text-muted mt-0.5">Aurora 极光暗色 / Sakura 樱色亮色</div>
          </div>
          <Segmented
            value={theme}
            onChange={(v) => changeTheme(v as 'aurora' | 'sakura')}
            options={[
              { value: 'aurora', label: <span className="flex items-center gap-1.5"><Moon size={14} /> Aurora</span> },
              { value: 'sakura', label: <span className="flex items-center gap-1.5"><Sun size={14} /> Sakura</span> },
            ]}
          />
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-line">
          <div>
            <div className="font-semibold text-ink text-sm">默认视图</div>
            <div className="text-xs text-muted mt-0.5">收藏库默认以网格或列表展示</div>
          </div>
          <Segmented
            value={settings.defaultView}
            onChange={(v) => patch({ defaultView: v as 'grid' | 'list' })}
            options={[
              { value: 'grid', label: '网格' },
              { value: 'list', label: '列表' },
            ]}
          />
        </div>
      </Card>

      {/* 个人资料 */}
      <Card className="p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <User size={16} className="text-accent" />
          <h3 className="font-bold text-ink">个人资料</h3>
        </div>
        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold text-muted mb-2">昵称</div>
            <Input
              value={settings.displayName}
              onChange={(e) => setSettings({ ...settings, displayName: e.target.value })}
              onBlur={() => patch({ displayName: settings.displayName })}
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-muted mb-2">个性签名</div>
            <Input
              value={settings.bio}
              onChange={(e) => setSettings({ ...settings, bio: e.target.value })}
              onBlur={() => patch({ bio: settings.bio })}
            />
          </div>
        </div>
        {saved && <div className="text-xs text-watch mt-3 font-semibold">已保存 ✓</div>}
      </Card>

      {/* 数据管理 */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database size={16} className="text-accent" />
          <h3 className="font-bold text-ink">数据管理</h3>
        </div>
        <p className="text-xs text-muted mb-4">
          数据已保存在 WorkBuddy 云端（按账号隔离）。可导出为 JSON 完整备份或 CSV 收藏清单，再导入恢复；导入会与现有数据合并，不会静默覆盖。
        </p>

        <div className="flex flex-wrap gap-2.5">
          <Button variant="ghost" onClick={exportJson} disabled={busy}>
            <FileJson size={16} /> 导出备份 (JSON)
          </Button>
          <Button variant="ghost" onClick={exportCsv} disabled={busy}>
            <FileSpreadsheet size={16} /> 导出收藏 (CSV)
          </Button>
          <Button variant="ghost" onClick={() => jsonInput.current?.click()} disabled={busy}>
            <Upload size={16} /> 导入 JSON
          </Button>
          <Button variant="ghost" onClick={() => csvInput.current?.click()} disabled={busy}>
            <Upload size={16} /> 导入 CSV
          </Button>
          <Button variant="soft" onClick={resetDemo} disabled={busy}>
            <RotateCcw size={16} /> 清空云端数据
          </Button>
        </div>

        <input
          ref={jsonInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickJson(f);
            e.target.value = '';
          }}
        />
        <input
          ref={csvInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickCsv(f);
            e.target.value = '';
          }}
        />

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}

        {importPreview && (
          <div className="mt-4 rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] p-4">
            <div className="text-sm font-semibold text-ink">导入预览（{importPreview.kind.toUpperCase()}）</div>
            <div className="text-xs text-muted mt-1">
              将导入：收藏 <b className="text-ink">{importPreview.collections}</b> 部
              {importPreview.kind === 'json' && (
                <>
                  {' '}· 观看历史 <b className="text-ink">{importPreview.history}</b> 条
                  {' '}· 标签 <b className="text-ink">{importPreview.tags}</b> 个
                </>
              )}
            </div>
            <p className="text-xs text-muted mt-2">导入会与现有数据合并（按作品去重），不会静默覆盖已有收藏。</p>
            <div className="flex gap-2.5 mt-3">
              <Button onClick={confirmImport} disabled={busy}>
                <CheckCircle2 size={16} /> {busy ? '导入中…' : '确认导入'}
              </Button>
              <Button variant="ghost" onClick={() => setImportPreview(null)} disabled={busy}>
                取消
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // skip
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
