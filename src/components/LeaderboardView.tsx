import React, { useMemo, useState } from 'react';
import {
  MinutesThreshold,
  PlayerPercentiles,
  PlayerProfile,
  Position,
} from '../types/basketball';
import { formatSigned, getPercentileColorClass } from '../utils/analytics';
import { BarChart3, Crosshair, Star } from 'lucide-react';

interface LeaderboardViewProps {
  players: PlayerProfile[];
  percentilesMap: Record<string, PlayerPercentiles>;
  minMinutes: MinutesThreshold;
  onChangeMinMinutes: (val: MinutesThreshold) => void;
  shortlist: string[];
  onToggleShortlist: (playerId: string) => void;
  onSelectPlayer: (playerId: string) => void;
}

type LeaderboardMetricKey =
  | 'bpm'
  | 'netDiff'
  | 'tsPct'
  | 'pts'
  | 'usgPct'
  | 'obpm'
  | 'dbpm'
  | 'ortg'
  | 'astPct'
  | 'tovPct'
  | 'threePAr'
  | 'rimPct'
  | 'threePct';

interface MetricDef {
  key: LeaderboardMetricKey;
  label: string;
  description: string;
  getValue: (p: PlayerProfile) => number;
  format: (v: number) => string;
  pctKey?: keyof PlayerPercentiles;
  invert?: boolean;
}

const METRICS: MetricDef[] = [
  {
    key: 'bpm',
    label: 'BPM',
    description: 'Box Plus/Minus complessivo su 100 possessi',
    getValue: (p) => p.bpm,
    format: (v) => formatSigned(v),
    pctKey: 'bpm',
  },
  {
    key: 'netDiff',
    label: 'Net On/Off',
    description: 'Differenziale Net Rating squadra in campo vs panchina',
    getValue: (p) => p.onOff.netDiff,
    format: (v) => formatSigned(v),
    pctKey: 'netDiff',
  },
  {
    key: 'tsPct',
    label: 'TS%',
    description: 'True Shooting Percentage (efficienza tiro complessiva)',
    getValue: (p) => p.tsPct,
    format: (v) => `${v.toFixed(1)}%`,
    pctKey: 'tsPct',
  },
  {
    key: 'pts',
    label: 'PTS',
    description: 'Punti segnati di media a partita',
    getValue: (p) => p.pts,
    format: (v) => v.toFixed(1),
    pctKey: 'pts',
  },
  {
    key: 'usgPct',
    label: 'USG%',
    description: 'Percentuale di possessi finalizzati dal giocatore',
    getValue: (p) => p.usgPct,
    format: (v) => `${v.toFixed(1)}%`,
    pctKey: 'usgPct',
  },
  {
    key: 'obpm',
    label: 'OBPM',
    description: 'Impatto offensivo stimato su 100 possessi',
    getValue: (p) => p.obpm,
    format: (v) => formatSigned(v),
    pctKey: 'obpm',
  },
  {
    key: 'dbpm',
    label: 'DBPM',
    description: 'Impatto difensivo stimato su 100 possessi',
    getValue: (p) => p.dbpm,
    format: (v) => formatSigned(v),
    pctKey: 'dbpm',
  },
  {
    key: 'ortg',
    label: 'ORtg',
    description: 'Punti prodotti per 100 possessi individuali',
    getValue: (p) => p.ortg,
    format: (v) => v.toFixed(1),
    pctKey: 'ortg',
  },
  {
    key: 'astPct',
    label: 'AST%',
    description: 'Percentuale canestri di squadra assistiti',
    getValue: (p) => p.astPct,
    format: (v) => `${v.toFixed(1)}%`,
    pctKey: 'astPct',
  },
  {
    key: 'tovPct',
    label: 'TOV%',
    description: 'Percentuale possessi persi (più basso è meglio)',
    getValue: (p) => p.tovPct,
    format: (v) => `${v.toFixed(1)}%`,
    pctKey: 'tovPct',
    invert: true,
  },
  {
    key: 'threePAr',
    label: '3PAr',
    description: 'Frequenza tentativi da 3 punti sul totale dal campo',
    getValue: (p) => p.threePAr,
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    key: 'rimPct',
    label: 'Rim%',
    description: 'Percentuale di realizzazione al ferro',
    getValue: (p) => p.rimPct,
    format: (v) => `${v.toFixed(1)}%`,
    pctKey: 'rimPct',
  },
  {
    key: 'threePct',
    label: '3P%',
    description: 'Percentuale di realizzazione da tre punti',
    getValue: (p) => p.threePct,
    format: (v) => `${v.toFixed(1)}%`,
    pctKey: 'threePct',
  },
];

const RANKABLE_METRICS = METRICS.filter((m) => Boolean(m.pctKey));

const SCATTER_PRESETS: Array<{
  id: string;
  label: string;
  xKey: LeaderboardMetricKey;
  yKey: LeaderboardMetricKey;
  quadTopRight: string;
  quadTopLeft: string;
  quadBottomRight: string;
  quadBottomLeft: string;
}> = [
  {
    id: 'efficiency-volume',
    label: 'Volume vs Efficienza',
    xKey: 'usgPct',
    yKey: 'tsPct',
    quadTopRight: 'Alto Volume · Alta Efficienza',
    quadTopLeft: 'Basso Volume · Alta Efficienza',
    quadBottomRight: 'Alto Volume · Efficienza Bassa',
    quadBottomLeft: 'Ruolo Complementare',
  },
  {
    id: 'two-way',
    label: 'Impatto 2-Way (OBPM / DBPM)',
    xKey: 'obpm',
    yKey: 'dbpm',
    quadTopRight: 'Two-Way Élite',
    quadTopLeft: 'Specialista Difensivo',
    quadBottomRight: 'Motore Offensivo',
    quadBottomLeft: 'In Sviluppo',
  },
  {
    id: 'shooting-profile',
    label: 'Profilo Tiro da 3',
    xKey: 'threePAr',
    yKey: 'threePct',
    quadTopRight: 'Sniper Alto Volume',
    quadTopLeft: 'Tiratore Selettivo',
    quadBottomRight: 'Volume Alto · % da Stabilizzare',
    quadBottomLeft: 'Gioco Interno / Slasher',
  },
  {
    id: 'playmaking',
    label: 'Regia vs Palle Perse',
    xKey: 'astPct',
    yKey: 'tovPct',
    quadTopRight: 'Alto AST% · Rischio Alto',
    quadTopLeft: 'Basso AST% · TOV Elevati',
    quadBottomRight: 'Regia Pulita (Alto AST · Basso TOV)',
    quadBottomLeft: 'Basso Coinvolgimento Palla',
  },
];

const MIN_THRESHOLDS: Array<{ value: MinutesThreshold; label: string }> = [
  { value: 0, label: 'Tutti' },
  { value: 10, label: '≥ 10 MIN' },
  { value: 18, label: '≥ 18 MIN' },
];

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  players,
  percentilesMap,
  minMinutes,
  onChangeMinMinutes,
  shortlist,
  onToggleShortlist,
  onSelectPlayer,
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'scatter'>('table');
  const [selectedMetric, setSelectedMetric] = useState<LeaderboardMetricKey>('bpm');
  const [groupFilter, setGroupFilter] = useState<'all' | 'italian' | 'draft2027' | 'shortlist'>('all');
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');

  // Scatter plot state
  const [xAxisKey, setXAxisKey] = useState<LeaderboardMetricKey>('usgPct');
  const [yAxisKey, setYAxisKey] = useState<LeaderboardMetricKey>('tsPct');
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null);

  const shortlistSet = useMemo(() => new Set(shortlist), [shortlist]);
  const metricDef = METRICS.find((m) => m.key === selectedMetric) || METRICS[0];
  const xMetric = METRICS.find((m) => m.key === xAxisKey) || METRICS[4];
  const yMetric = METRICS.find((m) => m.key === yAxisKey) || METRICS[2];

  const activePreset = SCATTER_PRESETS.find(
    (pr) => pr.xKey === xAxisKey && pr.yKey === yAxisKey
  );

  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      if (p.min < minMinutes) return false;
      if (groupFilter === 'italian' && !p.isItalian) return false;
      if (groupFilter === 'draft2027' && !p.draftRank) return false;
      if (groupFilter === 'shortlist' && !shortlistSet.has(p.id)) return false;
      if (posFilter !== 'ALL' && p.position !== posFilter) return false;
      return true;
    });
  }, [players, minMinutes, groupFilter, posFilter, shortlistSet]);

  const rankedPlayers = useMemo(() => {
    return [...filteredPlayers].sort((a, b) => {
      const diff = metricDef.getValue(b) - metricDef.getValue(a);
      return metricDef.invert ? -diff : diff;
    });
  }, [filteredPlayers, metricDef]);

  // Scatter plot geometry (SVG 780 x 430)
  const scatterData = useMemo(() => {
    const padL = 62;
    const padR = 28;
    const padT = 28;
    const padB = 48;
    const width = 780;
    const height = 430;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    if (filteredPlayers.length === 0) {
      return {
        width,
        height,
        padL,
        padR,
        padT,
        padB,
        plotW,
        plotH,
        xMin: 0,
        xMax: 100,
        yMin: 0,
        yMax: 100,
        meanX: 50,
        meanY: 50,
        meanPxX: padL + plotW / 2,
        meanPxY: padT + plotH / 2,
        points: [] as Array<{
          player: PlayerProfile;
          xVal: number;
          yVal: number;
          cx: number;
          cy: number;
          isShortlisted: boolean;
        }>,
      };
    }

    const xs = filteredPlayers.map((p) => xMetric.getValue(p));
    const ys = filteredPlayers.map((p) => yMetric.getValue(p));
    const rawXMin = Math.min(...xs);
    const rawXMax = Math.max(...xs);
    const rawYMin = Math.min(...ys);
    const rawYMax = Math.max(...ys);

    const xSpan = Math.max(1, rawXMax - rawXMin);
    const ySpan = Math.max(1, rawYMax - rawYMin);
    const xMin = rawXMin - xSpan * 0.08;
    const xMax = rawXMax + xSpan * 0.08;
    const yMin = rawYMin - ySpan * 0.08;
    const yMax = rawYMax + ySpan * 0.08;

    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;

    const toPxX = (v: number) => padL + ((v - xMin) / (xMax - xMin)) * plotW;
    const toPxY = (v: number) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

    const points = filteredPlayers.map((p) => {
      const xVal = xMetric.getValue(p);
      const yVal = yMetric.getValue(p);
      return {
        player: p,
        xVal,
        yVal,
        cx: toPxX(xVal),
        cy: toPxY(yVal),
        isShortlisted: shortlistSet.has(p.id),
      };
    });

    return {
      width,
      height,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      xMin,
      xMax,
      yMin,
      yMax,
      meanX,
      meanY,
      meanPxX: toPxX(meanX),
      meanPxY: toPxY(meanY),
      points,
    };
  }, [filteredPlayers, xMetric, yMetric, shortlistSet]);

  const hoveredPoint = useMemo(
    () => scatterData.points.find((pt) => pt.player.id === hoveredPlayerId) || null,
    [scatterData.points, hoveredPlayerId]
  );

  // Label top standout dots in scatter without clutter
  const labeledIds = useMemo(() => {
    const ids = new Set<string>();
    const pts = scatterData.points;
    if (pts.length === 0) return ids;
    const byCombined = [...pts].sort(
      (a, b) =>
        (b.xVal - scatterData.meanX) / Math.max(1, scatterData.xMax - scatterData.xMin) +
        (b.yVal - scatterData.meanY) / Math.max(1, scatterData.yMax - scatterData.yMin) -
        ((a.xVal - scatterData.meanX) / Math.max(1, scatterData.xMax - scatterData.xMin) +
          (a.yVal - scatterData.meanY) / Math.max(1, scatterData.yMax - scatterData.yMin))
    );
    byCombined.slice(0, 6).forEach((pt) => ids.add(pt.player.id));
    pts.filter((pt) => pt.isShortlisted).slice(0, 5).forEach((pt) => ids.add(pt.player.id));
    return ids;
  }, [scatterData]);

  return (
    <div className="space-y-6">
      <div className="bg-[#121822] border border-white/8 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wide text-white">
              {viewMode === 'table' ? 'Leaderboard Percentili' : 'Scatter Plot 2D Scouting'}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {viewMode === 'table'
                ? `${metricDef.description} · ${filteredPlayers.length} giocatori idonei`
                : `Mappa a quadranti ${xMetric.label} vs ${yMetric.label} · clicca un punto per aprire il Dossier`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle: Classifica vs Scatter 2D */}
            <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  viewMode === 'table' ? 'bg-[#F97316] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Classifica
              </button>
              <button
                type="button"
                onClick={() => setViewMode('scatter')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  viewMode === 'scatter' ? 'bg-[#F97316] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                Scatter 2D
              </button>
            </div>

            {/* Minutes Threshold Selector (Anti-Noise) */}
            <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8">
              {MIN_THRESHOLDS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => onChangeMinMinutes(t.value)}
                  className={`px-2.5 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap ${
                    minMinutes === t.value
                      ? 'bg-[#192231] text-orange-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Group + Position Filter Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8 overflow-x-auto max-w-full">
              {(
                [
                  { id: 'all', label: 'Tutti' },
                  { id: 'italian', label: 'Italiani' },
                  { id: 'draft2027', label: 'Draft 2027' },
                  { id: 'shortlist', label: `★ Preferiti (${shortlist.length})` },
                ] as const
              ).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGroupFilter(g.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    groupFilter === g.id ? 'bg-[#192231] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8">
              {(['ALL', 'G', 'F', 'C'] as const).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setPosFilter(pos)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    posFilter === pos ? 'bg-[#192231] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {pos === 'ALL' ? 'Ruoli' : pos}
                </button>
              ))}
            </div>
          </div>

          <span className="text-xs font-mono-tabular text-slate-400">
            Coorte percentili: {minMinutes > 0 ? `≥ ${minMinutes} MIN` : 'tutti i minuti'} ·{' '}
            <strong className="text-slate-200">{filteredPlayers.length}</strong> visualizzati
          </span>
        </div>

        {/* Mode-Specific Controls */}
        {viewMode === 'table' ? (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {RANKABLE_METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setSelectedMetric(m.key)}
                className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  selectedMetric === m.key
                    ? 'bg-[#F97316]/15 border-[#F97316] text-orange-300'
                    : 'bg-[#0A0E14] border-white/8 text-slate-400 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/8">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {SCATTER_PRESETS.map((pr) => {
                const isActive = pr.xKey === xAxisKey && pr.yKey === yAxisKey;
                return (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => {
                      setXAxisKey(pr.xKey);
                      setYAxisKey(pr.yKey);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-[#F97316]/15 border-[#F97316] text-orange-300'
                        : 'bg-[#0A0E14] border-white/8 text-slate-400 hover:text-white'
                    }`}
                  >
                    {pr.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <label className="text-slate-400">Asse X</label>
              <select
                value={xAxisKey}
                onChange={(e) => setXAxisKey(e.target.value as LeaderboardMetricKey)}
                className="bg-[#0A0E14] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#F97316]"
              >
                {METRICS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
              <label className="text-slate-400 ml-1">Asse Y</label>
              <select
                value={yAxisKey}
                onChange={(e) => setYAxisKey(e.target.value as LeaderboardMetricKey)}
                className="bg-[#0A0E14] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#F97316]"
              >
                {METRICS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* MODE 1: RANKED TABLE */}
      {viewMode === 'table' && (
        <div className="bg-[#121822] border border-white/8 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-[#0E141E] text-slate-400">
                  <th className="py-3 pl-3 pr-1 w-8 font-medium" aria-label="Preferiti" />
                  <th className="text-right py-3 px-2 w-10 font-medium">#</th>
                  <th className="text-left py-3 px-3 font-medium">Giocatore</th>
                  <th className="text-left py-3 px-3 font-medium">College · Conf</th>
                  <th className="text-right py-3 px-3 font-medium">MIN</th>
                  <th className="text-right py-3 px-3 font-medium text-white">{metricDef.label}</th>
                  <th className="text-left py-3 px-4 font-medium w-64">Percentile Coorte</th>
                  <th className="text-right py-3 px-3 font-medium">Fascia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {rankedPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      Nessun giocatore soddisfa la soglia minuti o i filtri selezionati.
                    </td>
                  </tr>
                ) : (
                  rankedPlayers.map((p, idx) => {
                    const rawVal = metricDef.getValue(p);
                    const pctKey = metricDef.pctKey || 'bpm';
                    const pctVal = percentilesMap[p.id]?.[pctKey] ?? 50;
                    const style = getPercentileColorClass(pctVal);
                    const isStarred = shortlistSet.has(p.id);

                    return (
                      <tr
                        key={p.id}
                        onClick={() => onSelectPlayer(p.id)}
                        className="hover:bg-white/5 cursor-pointer transition-colors"
                      >
                        <td
                          className="py-2.5 pl-3 pr-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleShortlist(p.id);
                          }}
                        >
                          <button
                            type="button"
                            aria-label={isStarred ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
                            className="p-1 text-slate-500 hover:text-amber-400 transition-colors"
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                isStarred ? 'fill-amber-400 text-amber-400' : ''
                              }`}
                            />
                          </button>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono-tabular text-slate-500">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-100 hover:text-orange-400 transition-colors">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {p.position} · {p.classYear}
                            {p.isItalian ? ' · ITA' : ''}
                            {p.draftRank ? ` · #${p.draftRank}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          {p.team} <span className="text-slate-500">· {p.conference}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-400">
                          {p.min.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-sm font-semibold text-white">
                          {metricDef.format(rawVal)}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-[#0A0E14] rounded-full overflow-hidden border border-white/6">
                              <div
                                className={`h-full rounded-full ${style.bar}`}
                                style={{ width: `${Math.max(4, pctVal)}%` }}
                              />
                            </div>
                            <span className={`font-mono-tabular font-semibold w-8 text-right ${style.text}`}>
                              {pctVal}°
                            </span>
                          </div>
                        </td>
                        <td className={`py-2.5 px-3 text-right font-medium ${style.text}`}>
                          {style.tierLabel}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODE 2: INTERACTIVE 2D QUADRANT SCATTER PLOT */}
      {viewMode === 'scatter' && (
        <div className="bg-[#121822] border border-white/8 rounded-xl p-5 space-y-4">
          {filteredPlayers.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Nessun giocatore soddisfa la soglia minuti o i filtri selezionati.
            </div>
          ) : (
            <>
              <div className="relative bg-[#0A0E14] border border-white/8 rounded-xl p-3 overflow-x-auto">
                <svg
                  viewBox={`0 0 ${scatterData.width} ${scatterData.height}`}
                  className="w-full min-w-[600px] h-auto select-none"
                  role="img"
                  aria-label={`Scatter plot ${xMetric.label} vs ${yMetric.label}`}
                >
                  {/* Plot Background */}
                  <rect
                    x={scatterData.padL}
                    y={scatterData.padT}
                    width={scatterData.plotW}
                    height={scatterData.plotH}
                    fill="#0E141E"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="1"
                  />

                  {/* Subtle Grid Ticks (4 steps) */}
                  {[0.25, 0.5, 0.75].map((frac) => {
                    const gx = scatterData.padL + scatterData.plotW * frac;
                    const gy = scatterData.padT + scatterData.plotH * frac;
                    return (
                      <g key={frac} stroke="rgba(255,255,255,0.04)" strokeWidth="1">
                        <line
                          x1={gx}
                          y1={scatterData.padT}
                          x2={gx}
                          y2={scatterData.padT + scatterData.plotH}
                        />
                        <line
                          x1={scatterData.padL}
                          y1={gy}
                          x2={scatterData.padL + scatterData.plotW}
                          y2={gy}
                        />
                      </g>
                    );
                  })}

                  {/* Cohort Mean Crosshairs */}
                  <line
                    x1={scatterData.meanPxX}
                    y1={scatterData.padT}
                    x2={scatterData.meanPxX}
                    y2={scatterData.padT + scatterData.plotH}
                    stroke="rgba(248, 250, 252, 0.28)"
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                  />
                  <line
                    x1={scatterData.padL}
                    y1={scatterData.meanPxY}
                    x2={scatterData.padL + scatterData.plotW}
                    y2={scatterData.meanPxY}
                    stroke="rgba(248, 250, 252, 0.28)"
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                  />

                  {/* Quadrant Corner Labels */}
                  {activePreset && (
                    <g fill="rgba(148, 163, 184, 0.55)" fontSize="10" fontWeight="500">
                      <text
                        x={scatterData.padL + scatterData.plotW - 8}
                        y={scatterData.padT + 16}
                        textAnchor="end"
                      >
                        {activePreset.quadTopRight}
                      </text>
                      <text x={scatterData.padL + 8} y={scatterData.padT + 16} textAnchor="start">
                        {activePreset.quadTopLeft}
                      </text>
                      <text
                        x={scatterData.padL + scatterData.plotW - 8}
                        y={scatterData.padT + scatterData.plotH - 8}
                        textAnchor="end"
                      >
                        {activePreset.quadBottomRight}
                      </text>
                      <text
                        x={scatterData.padL + 8}
                        y={scatterData.padT + scatterData.plotH - 8}
                        textAnchor="start"
                      >
                        {activePreset.quadBottomLeft}
                      </text>
                    </g>
                  )}

                  {/* Axis Numeric Labels */}
                  {[0, 0.5, 1].map((frac) => {
                    const xVal = scatterData.xMin + (scatterData.xMax - scatterData.xMin) * frac;
                    const yVal = scatterData.yMax - (scatterData.yMax - scatterData.yMin) * frac;
                    const pxX = scatterData.padL + scatterData.plotW * frac;
                    const pxY = scatterData.padT + scatterData.plotH * frac;
                    return (
                      <g key={frac} fill="#94A3B8" fontSize="10" className="font-mono">
                        <text x={pxX} y={scatterData.padT + scatterData.plotH + 16} textAnchor="middle">
                          {xMetric.format(xVal)}
                        </text>
                        <text
                          x={scatterData.padL - 8}
                          y={pxY + 3}
                          textAnchor="end"
                        >
                          {yMetric.format(yVal)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Axis Titles */}
                  <text
                    x={scatterData.padL + scatterData.plotW / 2}
                    y={scatterData.height - 8}
                    textAnchor="middle"
                    fill="#CBD5E1"
                    fontSize="11.5"
                    fontWeight="600"
                  >
                    {xMetric.label} (Media: {xMetric.format(scatterData.meanX)})
                  </text>
                  <text
                    x={16}
                    y={scatterData.padT + scatterData.plotH / 2}
                    textAnchor="middle"
                    fill="#CBD5E1"
                    fontSize="11.5"
                    fontWeight="600"
                    transform={`rotate(-90 16 ${scatterData.padT + scatterData.plotH / 2})`}
                  >
                    {yMetric.label} (Media: {yMetric.format(scatterData.meanY)})
                  </text>

                  {/* Player Points */}
                  {scatterData.points.map((pt) => {
                    const isHovered = hoveredPlayerId === pt.player.id;
                    const fill = pt.player.isItalian
                      ? '#38BDF8'
                      : pt.player.draftRank
                        ? '#F97316'
                        : '#A855F7';
                    const lastName = pt.player.name.split(' ').slice(-1)[0];
                    const showLabel = isHovered || labeledIds.has(pt.player.id);

                    return (
                      <g
                        key={pt.player.id}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredPlayerId(pt.player.id)}
                        onMouseLeave={() => setHoveredPlayerId(null)}
                        onClick={() => onSelectPlayer(pt.player.id)}
                      >
                        {pt.isShortlisted && (
                          <circle
                            cx={pt.cx}
                            cy={pt.cy}
                            r={isHovered ? 10 : 8}
                            fill="none"
                            stroke="#FBBF24"
                            strokeWidth="1.6"
                          />
                        )}
                        <circle
                          cx={pt.cx}
                          cy={pt.cy}
                          r={isHovered ? 6.8 : 4.8}
                          fill={fill}
                          fillOpacity={isHovered ? 1 : 0.85}
                          stroke={isHovered ? '#FFFFFF' : '#0A0E14'}
                          strokeWidth={isHovered ? 2 : 1.2}
                        />
                        {showLabel && (
                          <text
                            x={pt.cx}
                            y={pt.cy - 9}
                            textAnchor="middle"
                            fill={isHovered ? '#FFFFFF' : '#CBD5E1'}
                            fontSize={isHovered ? '11' : '9.5'}
                            fontWeight={isHovered ? '700' : '500'}
                            pointerEvents="none"
                          >
                            {lastName}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Footer Readout & Legend */}
              <div className="flex flex-wrap items-center justify-between gap-4 text-xs px-1">
                {hoveredPoint ? (
                  <div className="flex flex-wrap items-center gap-3 text-slate-200">
                    <span className="font-semibold text-white">{hoveredPoint.player.name}</span>
                    <span className="text-slate-400">
                      {hoveredPoint.player.team} · {hoveredPoint.player.position} ·{' '}
                      {hoveredPoint.player.min.toFixed(1)} MIN
                    </span>
                    <span className="font-mono-tabular text-orange-300">
                      {xMetric.label}: {xMetric.format(hoveredPoint.xVal)}
                    </span>
                    <span className="font-mono-tabular text-emerald-300">
                      {yMetric.label}: {yMetric.format(hoveredPoint.yVal)}
                    </span>
                    <span className="text-slate-500">· Clicca per aprire il Dossier</span>
                  </div>
                ) : (
                  <div className="text-slate-400">
                    Passa su un punto per ispezionare il giocatore · linee tratteggiate = media della coorte attiva
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4 text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> Italiani
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#F97316] inline-block" /> Draft 2027
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full border-2 border-amber-400 inline-block" /> Shortlist
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
