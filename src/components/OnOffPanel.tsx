import React from 'react';
import { PlayerPercentiles, PlayerProfile } from '../types/basketball';
import { formatSigned, getPercentileColorClass } from '../utils/analytics';

interface OnOffPanelProps {
  player: PlayerProfile;
  percentiles?: PlayerPercentiles;
}

export const OnOffPanel: React.FC<OnOffPanelProps> = ({ player, percentiles }) => {
  const { onOff } = player;
  const offSwing = Number((onOff.onOrtg - onOff.offOrtg).toFixed(1));
  const defSwing = Number((onOff.onDrtg - onOff.offDrtg).toFixed(1)); // Lower is better
  const efgOppSwing = Number((onOff.onEfgOpp - onOff.offEfgOpp).toFixed(1)); // Lower is better
  const orebSwing = Number((onOff.onOrebPct - onOff.offOrebPct).toFixed(1));
  const paceSwing = Number((onOff.onPace - onOff.offPace).toFixed(1));

  const netPct = percentiles?.netDiff ?? 50;
  const netTier = getPercentileColorClass(netPct);

  const rows = [
    {
      label: 'Offensive Rating (pts/100)',
      onVal: onOff.onOrtg.toFixed(1),
      offVal: onOff.offOrtg.toFixed(1),
      diff: offSwing,
      isGood: offSwing >= 0,
      unit: '',
    },
    {
      label: 'Defensive Rating (pts/100)',
      onVal: onOff.onDrtg.toFixed(1),
      offVal: onOff.offDrtg.toFixed(1),
      diff: defSwing,
      isGood: defSwing <= 0,
      unit: '',
    },
    {
      label: 'Net Rating di Squadra',
      onVal: formatSigned(onOff.onNet),
      offVal: formatSigned(onOff.offNet),
      diff: onOff.netDiff,
      isGood: onOff.netDiff >= 0,
      unit: '',
    },
    {
      label: 'eFG% Concessa agli Avversari',
      onVal: `${onOff.onEfgOpp.toFixed(1)}%`,
      offVal: `${onOff.offEfgOpp.toFixed(1)}%`,
      diff: efgOppSwing,
      isGood: efgOppSwing <= 0,
      unit: '%',
    },
    {
      label: 'Rimbalzi Offensivi Squadra (OREB%)',
      onVal: `${onOff.onOrebPct.toFixed(1)}%`,
      offVal: `${onOff.offOrebPct.toFixed(1)}%`,
      diff: orebSwing,
      isGood: orebSwing >= 0,
      unit: '%',
    },
    {
      label: 'Ritmo (Possessi / 40 min)',
      onVal: onOff.onPace.toFixed(1),
      offVal: onOff.offPace.toFixed(1),
      diff: paceSwing,
      isGood: null,
      unit: '',
    },
  ];

  const summaryText =
    onOff.netDiff >= 6
      ? `Impatto netto di fascia élite (${formatSigned(onOff.netDiff)} su 100 possessi): la squadra migliora sensibilmente sia la fluidità offensiva sia la tenuta difensiva con ${player.name} sul parquet.`
      : onOff.netDiff >= 2
        ? `Contributo positivo costante (${formatSigned(onOff.netDiff)} Net On/Off): i quintetti con ${player.name} mantengono un margine superiore rispetto alle rotazioni dalla panchina.`
        : `Impatto On/Off equilibrato (${formatSigned(onOff.netDiff)}): profilo ancora in fase di consolidamento nei quintetti ad alta intensità.`;

  return (
    <div className="bg-[#121822] border border-white/8 rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 pb-4">
        <div>
          <h3 className="font-display text-xl font-bold tracking-wide text-slate-100">
            Impatto On / Off Court
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Rendimento di {player.team} su 100 possessi con il giocatore in campo vs in panchina
          </p>
        </div>

        <div className="flex items-center gap-5 font-mono-tabular">
          <div className="text-right">
            <div className="text-xs font-sans text-slate-400">Net On/Off</div>
            <div
              className={`text-xl font-semibold ${
                onOff.netDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {formatSigned(onOff.netDiff)}
            </div>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="text-right">
            <div className="text-xs font-sans text-slate-400">Percentile</div>
            <div className={`text-base font-semibold ${netTier.text}`}>
              {netPct}° <span className="text-xs font-sans font-normal text-slate-400">· {netTier.tierLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3-Column Headline Splits */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0A0E14] border border-white/8 rounded-lg p-3.5">
          <div className="text-xs text-slate-400">In Campo (On Court)</div>
          <div className="mt-1.5 flex items-baseline justify-between font-mono-tabular">
            <span className="text-lg font-semibold text-white">{formatSigned(onOff.onNet)}</span>
            <span className="text-xs text-slate-400">
              {onOff.onOrtg.toFixed(1)} Off · {onOff.onDrtg.toFixed(1)} Def
            </span>
          </div>
        </div>

        <div className="bg-[#0A0E14] border border-white/8 rounded-lg p-3.5">
          <div className="text-xs text-slate-400">In Panchina (Off Court)</div>
          <div className="mt-1.5 flex items-baseline justify-between font-mono-tabular">
            <span className="text-lg font-semibold text-slate-300">{formatSigned(onOff.offNet)}</span>
            <span className="text-xs text-slate-400">
              {onOff.offOrtg.toFixed(1)} Off · {onOff.offDrtg.toFixed(1)} Def
            </span>
          </div>
        </div>

        <div className="bg-[#0A0E14] border border-white/8 rounded-lg p-3.5">
          <div className="text-xs text-slate-400">Differenziale Off / Def</div>
          <div className="mt-1.5 flex items-baseline justify-between font-mono-tabular text-sm">
            <span className={offSwing >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
              Off {formatSigned(offSwing)}
            </span>
            <span className={defSwing <= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
              Def {formatSigned(defSwing)}
            </span>
          </div>
        </div>
      </div>

      {/* Detailed On/Off Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="text-left py-2 pr-3 font-medium">Metrica di Squadra</th>
              <th className="text-right py-2 px-3 font-medium">On Court</th>
              <th className="text-right py-2 px-3 font-medium">Off Court</th>
              <th className="text-right py-2 px-3 font-medium">Diff (On - Off)</th>
              <th className="text-left py-2 pl-3 font-medium w-40 hidden sm:table-cell">Swing Visivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/6 font-mono-tabular">
            {rows.map((row) => {
              const magnitudePct = Math.min(100, Math.abs(row.diff) * 7.5);
              const colorClass =
                row.isGood === null
                  ? 'text-slate-300'
                  : row.isGood
                    ? 'text-emerald-400'
                    : 'text-rose-400';
              const barColor =
                row.isGood === null
                  ? 'bg-slate-400'
                  : row.isGood
                    ? 'bg-emerald-500'
                    : 'bg-rose-500';
              return (
                <tr key={row.label} className="hover:bg-white/4 transition-colors">
                  <td className="py-2.5 pr-3 font-sans text-slate-200">{row.label}</td>
                  <td className="py-2.5 px-3 text-right text-white font-medium">{row.onVal}</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">{row.offVal}</td>
                  <td className={`py-2.5 px-3 text-right font-semibold ${colorClass}`}>
                    {formatSigned(row.diff)}
                    {row.unit}
                  </td>
                  <td className="py-2.5 pl-3 hidden sm:table-cell">
                    <div className="relative h-2 bg-[#0A0E14] rounded-full overflow-hidden border border-white/6">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${Math.max(8, magnitudePct)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">{summaryText}</p>
    </div>
  );
};
