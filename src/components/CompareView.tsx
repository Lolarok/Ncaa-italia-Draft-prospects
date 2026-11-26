import React, { useMemo } from 'react';
import { MinutesThreshold, PlayerPercentiles, PlayerProfile } from '../types/basketball';
import {
  computeProbabilisticArchetypes,
  computeShotQualityMetrics,
  computeSkillDNA,
  formatSigned,
} from '../utils/analytics';

interface CompareViewProps {
  players: PlayerProfile[];
  percentilesMap: Record<string, PlayerPercentiles>;
  minMinutes: MinutesThreshold;
  playerAId: string;
  playerBId: string;
  onChangeA: (id: string) => void;
  onChangeB: (id: string) => void;
  onOpenPlayer: (id: string) => void;
}

export const CompareView: React.FC<CompareViewProps> = ({
  players,
  minMinutes,
  playerAId,
  playerBId,
  onChangeA,
  onChangeB,
  onOpenPlayer,
}) => {
  const playerA = players.find((p) => p.id === playerAId) || players[0];
  const playerB = players.find((p) => p.id === playerBId) || players[1] || players[0];

  const dnaA = useMemo(
    () => (playerA ? computeSkillDNA(playerA, players, minMinutes) : null),
    [playerA, players, minMinutes]
  );
  const dnaB = useMemo(
    () => (playerB ? computeSkillDNA(playerB, players, minMinutes) : null),
    [playerB, players, minMinutes]
  );

  const archA = useMemo(
    () => (playerA ? computeProbabilisticArchetypes(playerA)[0] : null),
    [playerA]
  );
  const archB = useMemo(
    () => (playerB ? computeProbabilisticArchetypes(playerB)[0] : null),
    [playerB]
  );

  const sqA = useMemo(
    () => (playerA ? computeShotQualityMetrics(playerA.shotZones, playerA.shots) : null),
    [playerA]
  );
  const sqB = useMemo(
    () => (playerB ? computeShotQualityMetrics(playerB.shotZones, playerB.shots) : null),
    [playerB]
  );

  if (!playerA || !playerB || !dnaA || !dnaB || !sqA || !sqB) return null;

  const radarAxes = dnaA.axes.map((ax, i) => ({
    code: ax.code,
    label: ax.label,
    a: ax.score,
    b: dnaB.axes[i]?.score ?? 50,
  }));

  const cx = 140;
  const cy = 138;
  const maxR = 86;

  const pointsFor = (key: 'a' | 'b') =>
    radarAxes
      .map((axis, i) => {
        const angle = (Math.PI * 2 * i) / radarAxes.length - Math.PI / 2;
        const r = (axis[key] / 100) * maxR;
        return `${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`;
      })
      .join(' ');

  const compareRows: Array<{
    label: string;
    valA: number;
    valB: number;
    format: (v: number) => string;
    lowerIsBetter?: boolean;
  }> = [
    { label: 'Indice DNA 5-Assi', valA: dnaA.overallScore, valB: dnaB.overallScore, format: (v) => `${v}/99` },
    { label: 'Punti / gara (PTS)', valA: playerA.pts, valB: playerB.pts, format: (v) => v.toFixed(1) },
    { label: 'Rimbalzi / gara (REB)', valA: playerA.reb, valB: playerB.reb, format: (v) => v.toFixed(1) },
    { label: 'Assist / gara (AST)', valA: playerA.ast, valB: playerB.ast, format: (v) => v.toFixed(1) },
    { label: 'True Shooting (TS%)', valA: playerA.tsPct, valB: playerB.tsPct, format: (v) => `${v.toFixed(1)}%` },
    { label: 'Effective FG (eFG%)', valA: playerA.efgPct, valB: playerB.efgPct, format: (v) => `${v.toFixed(1)}%` },
    { label: 'Shot Quality (xFG%)', valA: sqA.expectedFgPct, valB: sqB.expectedFgPct, format: (v) => `${v.toFixed(1)}%` },
    { label: 'Expected eFG% (xeFG%)', valA: sqA.expectedEfgPct, valB: sqB.expectedEfgPct, format: (v) => `${v.toFixed(1)}%` },
    { label: 'Δ Shot Making (FG − xFG)', valA: sqA.shotMakingDelta, valB: sqB.shotMakingDelta, format: (v) => `${formatSigned(v)}%` },
    { label: 'Rim + 3P Freq (Moreyball)', valA: sqA.rimPlusThreeFreq, valB: sqB.rimPlusThreeFreq, format: (v) => `${v.toFixed(1)}%` },
    { label: 'Usage Rate (USG%)', valA: playerA.usgPct, valB: playerB.usgPct, format: (v) => `${v.toFixed(1)}%` },
    { label: 'Box Plus/Minus (BPM)', valA: playerA.bpm, valB: playerB.bpm, format: (v) => formatSigned(v) },
    { label: 'Offensive BPM (OBPM)', valA: playerA.obpm, valB: playerB.obpm, format: (v) => formatSigned(v) },
    { label: 'Defensive BPM (DBPM)', valA: playerA.dbpm, valB: playerB.dbpm, format: (v) => formatSigned(v) },
    { label: 'Offensive Rating (ORtg)', valA: playerA.ortg, valB: playerB.ortg, format: (v) => v.toFixed(1) },
    {
      label: 'Defensive Rating (DRtg)',
      valA: playerA.drtg,
      valB: playerB.drtg,
      format: (v) => v.toFixed(1),
      lowerIsBetter: true,
    },
    { label: 'Net On / Off', valA: playerA.onOff.netDiff, valB: playerB.onOff.netDiff, format: (v) => formatSigned(v) },
    { label: 'Rim Finishing (Rim%)', valA: playerA.rimPct, valB: playerB.rimPct, format: (v) => `${v.toFixed(1)}%` },
    { label: 'Tiro da 3 (3P%)', valA: playerA.threePct, valB: playerB.threePct, format: (v) => `${v.toFixed(1)}%` },
    {
      label: 'Turnover Rate (TOV%)',
      valA: playerA.tovPct,
      valB: playerB.tovPct,
      format: (v) => `${v.toFixed(1)}%`,
      lowerIsBetter: true,
    },
  ];

  const sortedOptions = [...players].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div className="bg-[#121822] border border-white/8 rounded-xl p-5 space-y-5">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-white">
            Confronto 1v1 Prospetti
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Sovrapponi Radar DNA 5-Assi, archetipi primari, Shot Quality xFG% e metriche avanzate
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0A0E14] border border-orange-500/35 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-orange-400 font-semibold">Giocatore A</span>
              <button
                type="button"
                onClick={() => onOpenPlayer(playerA.id)}
                className="text-slate-400 hover:text-white underline underline-offset-2"
              >
                Apri scheda
              </button>
            </div>
            <select
              value={playerA.id}
              onChange={(e) => onChangeA(e.target.value)}
              className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F97316]"
            >
              {sortedOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.team} ({p.position})
                </option>
              ))}
            </select>
            <div className="text-xs text-slate-400">
              {playerA.team} · {playerA.conference} · {playerA.roleLabel} · {playerA.height}
            </div>
            {archA && (
              <div className="text-[11px] text-orange-300 font-medium">
                Archetipo: {archA.label} ({archA.pct}%)
              </div>
            )}
          </div>

          <div className="bg-[#0A0E14] border border-sky-500/35 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-sky-400 font-semibold">Giocatore B</span>
              <button
                type="button"
                onClick={() => onOpenPlayer(playerB.id)}
                className="text-slate-400 hover:text-white underline underline-offset-2"
              >
                Apri scheda
              </button>
            </div>
            <select
              value={playerB.id}
              onChange={(e) => onChangeB(e.target.value)}
              className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-400"
            >
              {sortedOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.team} ({p.position})
                </option>
              ))}
            </select>
            <div className="text-xs text-slate-400">
              {playerB.team} · {playerB.conference} · {playerB.roleLabel} · {playerB.height}
            </div>
            {archB && (
              <div className="text-[11px] text-sky-300 font-medium">
                Archetipo: {archB.label} ({archB.pct}%)
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Dual Overlay 5-Axis DNA Radar */}
        <div className="lg:col-span-5 bg-[#121822] border border-white/8 rounded-xl p-5 flex flex-col items-center space-y-4">
          <div className="w-full flex items-center justify-between text-xs border-b border-white/8 pb-3">
            <span className="text-orange-400 font-semibold truncate">{playerA.name}</span>
            <span className="text-slate-500 font-mono">DNA 5-Assi</span>
            <span className="text-sky-400 font-semibold truncate">{playerB.name}</span>
          </div>

          <svg viewBox="0 0 280 270" className="w-full max-w-[300px] h-auto">
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
                  stroke={level === 50 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)'}
                  strokeDasharray={level === 50 ? '3 3' : undefined}
                  strokeWidth="1"
                />
              );
            })}

            {radarAxes.map((axis, i) => {
              const angle = (Math.PI * 2 * i) / radarAxes.length - Math.PI / 2;
              const x2 = cx + Math.cos(angle) * maxR;
              const y2 = cy + Math.sin(angle) * maxR;
              const lx = cx + Math.cos(angle) * (maxR + 25);
              const ly = cy + Math.sin(angle) * (maxR + 22);
              return (
                <g key={axis.code}>
                  <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#CBD5E1"
                    fontSize="10.5"
                    fontWeight="600"
                  >
                    {axis.code}
                  </text>
                </g>
              );
            })}

            <polygon points={pointsFor('a')} fill="rgba(249, 115, 22, 0.22)" stroke="#F97316" strokeWidth="2.2" />
            <polygon points={pointsFor('b')} fill="rgba(56, 189, 248, 0.2)" stroke="#38BDF8" strokeWidth="2.2" />
          </svg>

          {/* 5-Axis Numeric Breakdown */}
          <div className="w-full divide-y divide-white/6 border-t border-white/8 pt-2 text-xs">
            {radarAxes.map((ax) => {
              const diff = ax.a - ax.b;
              return (
                <div key={ax.code} className="py-2 flex items-center justify-between gap-2 font-mono-tabular">
                  <span className={`w-10 text-left font-semibold ${ax.a >= ax.b ? 'text-orange-400' : 'text-slate-400'}`}>
                    {ax.a}
                  </span>
                  <div className="flex-1 text-center font-sans text-slate-300">
                    <span className="font-mono text-slate-500 mr-1.5">{ax.code}</span>
                    {ax.label}
                  </div>
                  <span className="text-[11px] text-slate-500 w-10 text-center">
                    {diff === 0 ? '=' : diff > 0 ? `+${diff}` : `${diff}`}
                  </span>
                  <span className={`w-10 text-right font-semibold ${ax.b >= ax.a ? 'text-sky-400' : 'text-slate-400'}`}>
                    {ax.b}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Comparison Table */}
        <div className="lg:col-span-7 bg-[#121822] border border-white/8 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-[#0E141E] text-slate-400">
                <th className="text-right py-3 px-4 font-semibold text-orange-400 w-28">
                  {playerA.name.split(' ').slice(-1)[0]}
                </th>
                <th className="text-center py-3 px-3 font-medium">Metrica</th>
                <th className="text-left py-3 px-4 font-semibold text-sky-400 w-28">
                  {playerB.name.split(' ').slice(-1)[0]}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6 font-mono-tabular">
              {compareRows.map((r) => {
                const aWins = r.lowerIsBetter ? r.valA < r.valB : r.valA > r.valB;
                const bWins = r.lowerIsBetter ? r.valB < r.valA : r.valB > r.valA;
                return (
                  <tr key={r.label} className="hover:bg-white/4">
                    <td
                      className={`py-2.5 px-4 text-right ${
                        aWins ? 'text-emerald-400 font-semibold' : 'text-slate-300'
                      }`}
                    >
                      {r.format(r.valA)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-sans text-slate-300">{r.label}</td>
                    <td
                      className={`py-2.5 px-4 text-left ${
                        bWins ? 'text-emerald-400 font-semibold' : 'text-slate-300'
                      }`}
                    >
                      {r.format(r.valB)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
