import React, { useMemo } from 'react';
import { MinutesThreshold, PlayerProfile } from '../types/basketball';
import {
  computeProbabilisticArchetypes,
  computeSimilarPlayers,
  computeSkillDNA,
  getPercentileColorClass,
} from '../utils/analytics';
import { GitCompare } from 'lucide-react';

interface PlayerDnaPanelProps {
  player: PlayerProfile;
  allPlayers: PlayerProfile[];
  minMinutes: MinutesThreshold;
  onSelectPlayer: (playerId: string) => void;
  onComparePair: (playerAId: string, playerBId: string) => void;
}

const ARCHETYPE_BAR_COLORS = [
  'bg-[#F97316]',
  'bg-sky-400',
  'bg-emerald-400',
  'bg-slate-600',
];

export const PlayerDnaPanel: React.FC<PlayerDnaPanelProps> = ({
  player,
  allPlayers,
  minMinutes,
  onSelectPlayer,
  onComparePair,
}) => {
  const dna = useMemo(
    () => computeSkillDNA(player, allPlayers, minMinutes),
    [player, allPlayers, minMinutes]
  );

  const archetypes = useMemo(() => computeProbabilisticArchetypes(player), [player]);
  const topArchetypes = archetypes.slice(0, 3);
  const otherPct = Math.max(
    0,
    100 - topArchetypes.reduce((acc, item) => acc + item.pct, 0)
  );

  const comps = useMemo(
    () => computeSimilarPlayers(player, allPlayers, 3),
    [player, allPlayers]
  );

  const cx = 140;
  const cy = 138;
  const maxR = 86;

  const polygonPoints = dna.axes
    .map((axis, i) => {
      const angle = (Math.PI * 2 * i) / dna.axes.length - Math.PI / 2;
      const r = (axis.score / 100) * maxR;
      return `${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`;
    })
    .join(' ');

  const overallStyle = getPercentileColorClass(dna.overallScore);

  return (
    <div className="bg-[#121822] border border-white/8 rounded-xl p-5 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-4">
        <div>
          <h3 className="font-display text-xl font-bold tracking-wide text-slate-100">
            DNA 5-Assi, Archetipi & Profili Simili
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Profilazione quantitativa 5-Assi (coorte {minMinutes > 0 ? `≥ ${minMinutes} MIN` : 'completa'}), ruoli probabilistici e comparazioni multivariate
          </p>
        </div>

        <div className="flex items-baseline gap-2.5 font-mono-tabular">
          <span className="text-xs font-sans text-slate-400">Indice DNA</span>
          <span className={`text-2xl font-bold ${overallStyle.text}`}>{dna.overallScore}</span>
          <span className="text-xs text-slate-500">/ 99</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: 5-Axis DNA Radar */}
        <div className="lg:col-span-5 bg-[#0A0E14] border border-white/8 rounded-xl p-4 flex flex-col items-center">
          <svg
            viewBox="0 0 280 270"
            className="w-full max-w-[290px] h-auto"
            role="img"
            aria-label={`Radar DNA 5-Assi di ${player.name}`}
          >
            {[25, 50, 75, 100].map((level) => {
              const pts = dna.axes
                .map((_, i) => {
                  const angle = (Math.PI * 2 * i) / dna.axes.length - Math.PI / 2;
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

            {dna.axes.map((axis, i) => {
              const angle = (Math.PI * 2 * i) / dna.axes.length - Math.PI / 2;
              const x2 = cx + Math.cos(angle) * maxR;
              const y2 = cy + Math.sin(angle) * maxR;
              const lx = cx + Math.cos(angle) * (maxR + 25);
              const ly = cy + Math.sin(angle) * (maxR + 22);
              return (
                <g key={axis.key}>
                  <line
                    x1={cx}
                    y1={cy}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(255,255,255,0.09)"
                    strokeWidth="1"
                  />
                  <text
                    x={lx}
                    y={ly - 5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#E2E8F0"
                    fontSize="10.5"
                    fontWeight="600"
                  >
                    {axis.code}
                  </text>
                  <text
                    x={lx}
                    y={ly + 8}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#94A3B8"
                    fontSize="9.5"
                    className="font-mono"
                  >
                    {axis.score}
                  </text>
                </g>
              );
            })}

            <polygon
              points={polygonPoints}
              fill="rgba(249, 115, 22, 0.24)"
              stroke="#F97316"
              strokeWidth="2.2"
            />

            {dna.axes.map((axis, i) => {
              const angle = (Math.PI * 2 * i) / dna.axes.length - Math.PI / 2;
              const r = (axis.score / 100) * maxR;
              const px = cx + Math.cos(angle) * r;
              const py = cy + Math.sin(angle) * r;
              return (
                <circle
                  key={axis.key}
                  cx={px}
                  cy={py}
                  r="4"
                  fill="#F97316"
                  stroke="#0A0E14"
                  strokeWidth="1.5"
                />
              );
            })}
          </svg>

          <div className="w-full pt-2 border-t border-white/6 space-y-2.5">
            {dna.axes.map((axis) => {
              const style = getPercentileColorClass(axis.score);
              return (
                <div key={axis.key} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-slate-200 font-medium">
                      <span className="font-mono-tabular text-slate-400 mr-1.5">{axis.code}</span>
                      {axis.label}
                    </span>
                    <span className={`font-mono-tabular font-semibold ${style.text}`}>
                      {axis.score}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#121822] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${style.bar}`}
                      style={{ width: `${Math.max(4, axis.score)}%` }}
                    />
                  </div>
                  <div className="text-[11px] font-mono-tabular text-slate-500">{axis.detail}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Probabilistic Archetypes + Top 3 Multivariate Comps */}
        <div className="lg:col-span-7 space-y-6">
          {/* Mixed Probabilistic Archetypes */}
          <div className="bg-[#0A0E14] border border-white/8 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-white">
                Archetipi Probabilistici (Profilo Ibrido)
              </h4>
              <span className="text-[11px] text-slate-400">
                Primario: <strong className="text-orange-400">{topArchetypes[0]?.label}</strong>
              </span>
            </div>

            {/* Segmented Proportion Bar */}
            <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-[#121822]">
              {topArchetypes.map((arch, idx) => (
                <div
                  key={arch.id}
                  className={`${ARCHETYPE_BAR_COLORS[idx]} h-full transition-all`}
                  style={{ width: `${arch.pct}%` }}
                  title={`${arch.label}: ${arch.pct}%`}
                />
              ))}
              {otherPct > 0 && (
                <div
                  className={`${ARCHETYPE_BAR_COLORS[3]} h-full`}
                  style={{ width: `${otherPct}%` }}
                  title={`Altri ruoli: ${otherPct}%`}
                />
              )}
            </div>

            {/* Top 3 Role Readout */}
            <div className="divide-y divide-white/6">
              {topArchetypes.map((arch, idx) => (
                <div key={arch.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                      <span className={`w-2 h-2 rounded-sm shrink-0 ${ARCHETYPE_BAR_COLORS[idx]}`} />
                      <span className="truncate">{arch.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug pl-4">{arch.description}</p>
                  </div>
                  <span className="font-mono-tabular text-sm font-semibold text-white shrink-0">
                    {arch.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Top 3 Multivariate Comps */}
          <div className="bg-[#0A0E14] border border-white/8 rounded-xl p-4 space-y-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-white">
                Profili Statisticamente Simili (Top 3 Comps)
              </h4>
              <span className="text-[11px] text-slate-400">
                Distanza multivariata su 13 metriche + taglia
              </span>
            </div>

            {comps.length === 0 ? (
              <p className="text-xs text-slate-500">
                Dati insufficienti per calcolare comparazioni statistiche.
              </p>
            ) : (
              <div className="divide-y divide-white/6">
                {comps.map((comp) => (
                  <div
                    key={comp.player.id}
                    className="py-3 first:pt-1 last:pb-0 flex flex-wrap items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPlayer(comp.player.id)}
                      className="text-left min-w-0 flex-1 group"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-slate-100 group-hover:text-orange-400 transition-colors truncate">
                          {comp.player.name}
                        </span>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {comp.player.team} · {comp.player.position} · {comp.player.height}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Affinità chiave: <span className="text-slate-300">{comp.sharedStrength}</span>
                        {' · '}
                        <span className="font-mono-tabular text-slate-400">
                          {comp.player.pts.toFixed(1)} PTS · {comp.player.tsPct.toFixed(1)}% TS
                        </span>
                      </div>
                    </button>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right font-mono-tabular">
                        <div className="text-sm font-bold text-emerald-400">{comp.similarityPct}%</div>
                        <div className="text-[10px] text-slate-500">affinità</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onComparePair(player.id, comp.player.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#121822] hover:bg-[#192231] text-slate-200 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <GitCompare className="w-3.5 h-3.5 text-orange-400" />
                        1v1
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
