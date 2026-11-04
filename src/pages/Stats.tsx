import { useEffect, useState, type ReactNode } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import { BarChart3, Film, CheckCircle2, Clock, Star, Tv } from 'lucide-react';
import { dataAccess } from '../services/dataAccess';
import { useReload } from '../hooks/useReload';
import type { StatsResult } from '../types';
import { useThemeColors } from '../hooks/useThemeColors';
import { Card, EmptyState } from '../components/ui/primitives';
import { StatCard } from '../components/common/StatCard';
import { formatNumber, formatMinutes } from '../lib/utils';

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="font-bold text-ink mb-4">{title}</h3>
      <div style={{ width: '100%', height: 260 }}>{children}</div>
    </Card>
  );
}

export function Stats() {
  const reload = useReload();
  const [stats, setStats] = useState<StatsResult | null>(null);
  const palette = useThemeColors();

  useEffect(() => {
    let alive = true;
    dataAccess.getStats().then((s) => {
      if (alive) setStats(s);
    });
    return () => {
      alive = false;
    };
  }, [reload]);

  if (!stats) return null;

  if (stats.collectionTotal === 0) {
    return (
      <div>
        <h1 className="font-display font-extrabold text-2xl text-ink mb-4">个人统计</h1>
        <Card>
          <EmptyState
            icon={<BarChart3 size={28} />}
            title="还没有统计数据"
            description="当你在收藏库中加入作品并设置观看状态后，这里会自动生成统计图表。"
          />
        </Card>
      </div>
    );
  }

  const tooltipStyle = {
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: 12,
    color: palette.text,
    fontSize: 12,
  };

  const statusData = stats.statusDistribution.filter((d) => d.value > 0);
  const genreTop = stats.genreDistribution.slice(0, 8);

  return (
    <div>
      <h1 className="font-display font-extrabold text-2xl text-ink">个人统计</h1>
      <p className="text-sm text-muted mt-1">基于你的收藏与观看历史（预览数据）。</p>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mt-5">
        <StatCard label="收藏总数" value={formatNumber(stats.collectionTotal)} icon={<Film size={16} />} gradient />
        <StatCard label="完成数量" value={formatNumber(stats.completedCount)} icon={<CheckCircle2 size={16} />} />
        <StatCard label="总观看集数" value={formatNumber(stats.totalEpisodesWatched)} icon={<Tv size={16} />} />
        <StatCard label="观看时长" value={formatMinutes(stats.totalWatchMinutes)} icon={<Clock size={16} />} />
        <StatCard label="正在追番" value={formatNumber(stats.watchingCount)} icon={<BarChart3 size={16} />} />
        <StatCard label="平均评分" value={stats.averageScore.toFixed(1)} icon={<Star size={16} />} />
      </div>

      {/* 图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        <ChartCard title="观看状态分布">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
              >
                {statusData.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: palette.text2 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="评分分布">
          <ResponsiveContainer>
            <BarChart data={stats.scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.border} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: palette.text2 }} stroke={palette.border} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: palette.text2 }} stroke={palette.border} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: palette.border }} />
              <Bar dataKey="count" fill={palette.accent} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="类型分布（Top 8）">
          <ResponsiveContainer>
            <BarChart data={genreTop} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.border} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: palette.text2 }} stroke={palette.border} />
              <YAxis
                type="category"
                dataKey="name"
                width={56}
                tick={{ fontSize: 11, fill: palette.text2 }}
                stroke={palette.border}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: palette.border }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {genreTop.map((_, i) => (
                  <Cell key={i} fill={palette.series[i % palette.series.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="年度观看趋势">
          <ResponsiveContainer>
            <AreaChart data={stats.yearlyTrend}>
              <defs>
                <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={palette.accent} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={palette.accent} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.border} vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: palette.text2 }} stroke={palette.border} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: palette.text2 }} stroke={palette.border} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: palette.border }} />
              <Area
                type="monotone"
                dataKey="episodes"
                stroke={palette.accent}
                strokeWidth={2}
                fill="url(#trend)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* 标签统计 */}
      <Card className="mt-5 p-5">
        <h3 className="font-bold text-ink mb-4">标签统计</h3>
        {stats.tagStats.length === 0 ? (
          <div className="text-sm text-muted">还没有使用个人标签。</div>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {stats.tagStats.map((t) => (
              <span
                key={t.name}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-elevated border border-line text-sm text-ink"
              >
                {t.name}
                <span className="text-xs font-bold text-accent">{t.value}</span>
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
