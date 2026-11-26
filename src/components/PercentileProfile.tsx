import React from 'react';
import { PlayerPercentiles, PlayerProfile } from '../types/basketball';
import { formatSigned, getPercentileColorClass } from '../utils/analytics';

interface PercentileProfileProps {
  player: PlayerProfile;
  allPercentiles: PlayerPercentiles;
  posPercentiles: PlayerPercentiles;
  scope: 'all' | 'position';
  minMinutes?: number;
  onScopeChange: (scope: 'all' | 'position') => void;
}

export const PercentileProfile: React.FC<PercentileProfileProps> = ({
  player,
  allPercentiles,
  posPercentiles,
  scope,
  minMinutes = 0,
  onScopeChange,
}) => {
  const pct = scope === 'all' ? allPercentiles : posPercentiles;

  const radarAxes = [
    { label: 'Scoring', value: pct.pts },
    { label: 'TS%', value: pct.tsPct },
    { label: 'Playmaking', value: pct.astPct },
    { label: 'Difesa', value: pct.dbpm },
    { label: 'Rimbalzi', value: pct.rebPct },
    { label: 'On/Off', value: pct.netDiff },
  ];

  const cx = 130;
  const cy = 126;
  const maxR = 82;

  const polygonPoints = radarAxes
    .map((axis, i) => {
      const angle = (Math.PI * 2 * i) / radarAxes.length - Math.PI / 2;
      const r = (axis.value / 100) * maxR;
      return `${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`;
    })
    .join(' ');

  const metricRows: Array<{ label: string; raw: string; percentile: number }> = [
    { label: 'Punti / gara (PTS)', raw: player.pts.toFixed(1), percentile: pct.pts },
    { label: 'True Shooting (TS%)', raw: `${player.tsPct.toFixed(1)}%`, percentile: pct.tsPct },
    { label: 'Usage Rate (USG%)', raw: `${player.usgPct.toFixed(1)}%`, percentile: pct.usgPct },
    { label: 'Box Plus/Minus (BPM)', raw: formatSigned(player.bpm), percentile: pct.bpm },
    { label: 'Offensive BPM (OBPM)', raw: formatSigned(player.obpm), percentile: pct.obpm },
    { label: 'Defensive BPM (DBPM)', raw: formatSigned(player.dbpm), percentile: pct.dbpm },
    { label: 'Offensive Rating (ORtg)', raw: player.ortg.toFixed(1), percentile: pct.ortg },
    { label: 'Defensive Rating (DRtg)', raw: player.drtg.toFixed(1), percentile: pct.drtg },
    { label: 'Assist Rate (AST%)', raw: `${player.astPct.toFixed(1)}%`, percentile: pct.astPct },
    { label: 'Controllo Palla (TOV% inv.)', raw: `${player.tovPct.toFixed(1)}%`, percentile: pct.tovPct },
    { label: 'Rim Finishing (Rim%)', raw: `${player.rimPct.toFixed(1)}%`, percentile: pct.rimPct },
    { label: 'Tiro da 3 (3P%)', raw: `${player.threePct.toFixed(1)}%`, percentile: pct.threePct },
  ];

  return (
    <div className="bg-[#121822] border border-white/8 rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-4">
        <div>
          <h3 className="font-display text-xl font-bold tracking-wide text-slate-100">
            Profilo Percentili
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Posizionamento relativo da 1° a 99° percentile ·{' '}
            {scope === 'all' ? 'intera watchlist' : `solo ruolo ${player.position}`}
            {minMinutes > 0 ? ` (coorte ≥ ${minMinutes} MIN)` : ''}
          </p>
        </div>

        <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8">
          <button
            type="button"
            onClick={() => onScopeChange('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              scope === 'all' ? 'bg-[#F97316] text-white' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Tutta la Watchlist
          </button>
          <button
            type="button"
            onClick={() => onScopeChange('position')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              scope === 'position' ? 'bg-[#F97316] text-white' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Solo Ruolo ({player.position})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* SVG 6-Axis Radar */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center bg-[#0A0E14] border border-white/8 rounded-xl p-4">
          <svg viewBox="0 0 260 252" className="w-full max-w-[260px] h-auto">
            {[25, 50, 75, 100].map((level) => {
              const pts = radarAxes
                .map((_, i) => {
                  const angle = (Math.PI * 2 * i) / radarAxes.length - Math.PI / 2;
                  const r = (level / 100) * maxR;
                  return `${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`;
                })
                .join(' ');
              return (
                <polygon
                  key={level}
                  points={pts}
                  fill="none"
                  stroke={level === 50 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}
                  strokeDasharray={level === 50 ? '3 3' : undefined}
                  strokeWidth="1"
                />
              );
            })}

            {radarAxes.map((axis, i) => {
              const angle = (Math.PI * 2 * i) / radarAxes.length - Math.PI / 2;
              const x2 = cx + Math.cos(angle) * maxR;
              const y2 = cy + Math.sin(angle) * maxR;
              const lx = cx + Math.cos(angle) * (maxR + 22);
              const ly = cy + Math.sin(angle) * (maxR + 18);
              return (
                <g key={axis.label}>
                  <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#94A3B8"
                    fontSize="10.5"
                    fontWeight="500"
                  >
                    {axis.label}
                  </text>
                </g>
              );
            })}

            <polygon
              points={polygonPoints}
              fill="rgba(249, 115, 22, 0.24)"
              stroke="#F97316"
              strokeWidth="2"
            />

            {radarAxes.map((axis, i) => {
              const angle = (Math.PI * 2 * i) / radarAxes.length - Math.PI / 2;
              const r = (axis.value / 100) * maxR;
              const px = cx + Math.cos(angle) * r;
              const py = cy + Math.sin(angle) * r;
              return <circle key={axis.label} cx={px} cy={py} r="3.5" fill="#F97316" stroke="#0A0E14" strokeWidth="1.5" />;
            })}
          </svg>
          <div className="text-[11px] text-slate-400 mt-1">
            Linea tratteggiata = 50° percentile
          </div>
        </div>

        {/* 12-Metric Percentile Bars */}
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
          {metricRows.map((m) => {
            const style = getPercentileColorClass(m.percentile);
            return (
              <div key={m.label} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-slate-300 truncate">{m.label}</span>
                  <div className="flex items-baseline gap-2 font-mono-tabular shrink-0">
                    <span className="text-white font-semibold">{m.raw}</span>
                    <span className={`${style.text} font-medium w-8 text-right`}>{m.percentile}°</span>
                  </div>
                </div>
                <div className="h-2 bg-[#0A0E14] rounded-full overflow-hidden border border-white/6">
                  <div
                    className={`h-full rounded-full ${style.bar} transition-all duration-300`}
                    style={{ width: `${Math.max(4, m.percentile)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
