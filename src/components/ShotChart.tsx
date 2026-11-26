import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PlayerProfile,
  ShotEvent,
  ShotGameSummary,
  ShotQualityEvaluation,
  ShotQualityTier,
  ShotZoneKey,
  ShotZoneSummary,
} from '../types/basketball';
import {
  classifyShotZone,
  computeShotQualityMetrics,
  evaluateShotQuality,
  formatSigned,
  summarizeShotZones,
} from '../utils/analytics';
import { RefreshCw } from 'lucide-react';

interface ShotChartProps {
  player: PlayerProfile;
  onLiveShotsLoaded?: (
    playerId: string,
    shots: ShotEvent[],
    zones: ShotZoneSummary[],
    games: ShotGameSummary[],
    source: 'pbp' | 'model'
  ) => void;
}

type ChartMode = 'heatmap' | 'xfg' | 'scatter';
type OutcomeFilter = 'all' | 'made' | 'missed';
type TypeFilter = 'all' | '2pt' | '3pt';
type QualityFilter = 'all' | ShotQualityTier;

// Convert court feet (50 wide x 40 visible deep, hoop at 25, 5.25) to SVG coords (500 x 400)
const sx = (ftX: number) => ftX * 10;
const sy = (ftY: number) => ftY * 10;

function getDeltaHeatFill(deltaVsExpected: number, attempts: number): string {
  if (attempts === 0) return 'rgba(148, 163, 184, 0.05)';
  if (deltaVsExpected >= 4.0) return 'rgba(16, 185, 129, 0.42)';
  if (deltaVsExpected >= 1.0) return 'rgba(45, 212, 191, 0.28)';
  if (deltaVsExpected >= -2.5) return 'rgba(245, 158, 11, 0.22)';
  return 'rgba(239, 68, 68, 0.34)';
}

function getExpectedQualityFill(expectedFgPct: number, attempts: number): string {
  if (attempts === 0) return 'rgba(148, 163, 184, 0.05)';
  if (expectedFgPct >= 54) return 'rgba(16, 185, 129, 0.40)';
  if (expectedFgPct >= 41) return 'rgba(56, 189, 248, 0.30)';
  if (expectedFgPct >= 36) return 'rgba(245, 158, 11, 0.24)';
  return 'rgba(244, 63, 94, 0.30)';
}

function getDeltaTextClass(delta: number, attempts: number): string {
  if (attempts === 0) return 'text-slate-500';
  if (delta >= 1.5) return 'text-emerald-400';
  if (delta <= -1.5) return 'text-rose-400';
  return 'text-amber-300';
}

export const ShotChart: React.FC<ShotChartProps> = ({ player, onLiveShotsLoaded }) => {
  const [mode, setMode] = useState<ChartMode>('heatmap');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('all');
  const [selectedGameId, setSelectedGameId] = useState<string>('all');
  const [hoveredZone, setHoveredZone] = useState<ShotZoneKey | null>(null);
  const [hoveredShotId, setHoveredShotId] = useState<string | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const attemptedAutoIds = useRef<Set<string>>(new Set());

  // Reset per-game filter when switching players
  useEffect(() => {
    setSelectedGameId('all');
    setHoveredZone(null);
    setHoveredShotId(null);
    setLiveStatus(null);
  }, [player.id]);

  // Auto-load full-season real ESPN Play-by-Play shots when opening player
  useEffect(() => {
    if (!player.espnId || player.shotsSource === 'pbp') return;
    if (attemptedAutoIds.current.has(player.id)) return;
    attemptedAutoIds.current.add(player.id);

    let cancelled = false;
    async function autoLoad() {
      setLoadingLive(true);
      try {
        const res = await fetch(`/api/espn/player/${encodeURIComponent(player.espnId!)}/shots`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          shots: Array<{
            x: number;
            y: number;
            made: boolean;
            isThree: boolean;
            description?: string;
            gameId?: string;
            gameLabel?: string;
            gameDate?: string;
            period?: string;
            clock?: string;
          }>;
          games?: ShotGameSummary[];
          gamesScanned: number;
        };
        if (cancelled) return;

        if (data.shots && data.shots.length > 0) {
          const mapped: ShotEvent[] = data.shots.map((s, idx) => ({
            id: `${player.id}-espn-${idx}`,
            x: s.x,
            y: s.y,
            made: s.made,
            isThree: s.isThree,
            zone: classifyShotZone(s.x, s.y, s.isThree),
            description: s.description,
            gameId: s.gameId,
            gameLabel: s.gameLabel,
            gameDate: s.gameDate,
            period: s.period,
            clock: s.clock,
          }));
          const zones = summarizeShotZones(mapped);
          onLiveShotsLoaded?.(player.id, mapped, zones, data.games || [], 'pbp');
          setLiveStatus(
            `PBP Reale ESPN caricato: ${mapped.length} tiri su ${data.games?.length || data.gamesScanned} gare 2026–27 (xFG% calibrato su distanza, angolo e tipologia di conclusione).`
          );
        } else {
          setLiveStatus(
            'Coordinate PBP ESPN non ancora disponibili; xFG% calcolato sui volumi spaziali stagionali.'
          );
        }
      } catch {
        // Non-blocking fallback to baseline model
      } finally {
        if (!cancelled) setLoadingLive(false);
      }
    }

    void autoLoad();
    return () => {
      cancelled = true;
    };
  }, [player.id, player.espnId, player.shotsSource, onLiveShotsLoaded]);

  async function handleManualRefreshPbp() {
    if (!player.espnId) {
      setLiveStatus('ID ESPN non collegato per questo giocatore; xFG% calcolato sui volumi spaziali di zona.');
      return;
    }
    setLoadingLive(true);
    setLiveStatus(null);
    try {
      const res = await fetch(`/api/espn/player/${encodeURIComponent(player.espnId)}/shots?refresh=1`);
      if (!res.ok) throw new Error('Errore risposta ESPN');
      const data = (await res.json()) as {
        shots: Array<{
          x: number;
          y: number;
          made: boolean;
          isThree: boolean;
          description?: string;
          gameId?: string;
          gameLabel?: string;
          gameDate?: string;
          period?: string;
          clock?: string;
        }>;
        games?: ShotGameSummary[];
        gamesScanned: number;
      };
      if (data.shots && data.shots.length > 0) {
        const mapped: ShotEvent[] = data.shots.map((s, idx) => ({
          id: `${player.id}-espn-${idx}`,
          x: s.x,
          y: s.y,
          made: s.made,
          isThree: s.isThree,
          zone: classifyShotZone(s.x, s.y, s.isThree),
          description: s.description,
          gameId: s.gameId,
          gameLabel: s.gameLabel,
          gameDate: s.gameDate,
          period: s.period,
          clock: s.clock,
        }));
        const zones = summarizeShotZones(mapped);
        onLiveShotsLoaded?.(player.id, mapped, zones, data.games || [], 'pbp');
        setSelectedGameId('all');
        setLiveStatus(
          `Aggiornati ${mapped.length} tiri PBP reali da ${data.games?.length || data.gamesScanned} gare ESPN 2026–27.`
        );
      } else {
        setLiveStatus('Nessun tiro dal campo PBP trovato su ESPN per la stagione corrente.');
      }
    } catch {
      setLiveStatus('Endpoint play-by-play ESPN non disponibile al momento.');
    } finally {
      setLoadingLive(false);
    }
  }

  const gameScopedShots = useMemo(() => {
    if (selectedGameId === 'all') return player.shots;
    return player.shots.filter((s) => s.gameId === selectedGameId);
  }, [player.shots, selectedGameId]);

  const evaluatedShots = useMemo(
    () =>
      gameScopedShots.map((shot) => ({
        shot,
        quality: evaluateShotQuality(shot),
      })),
    [gameScopedShots]
  );

  const activeZones = useMemo(() => {
    if (selectedGameId === 'all' && player.shots.length === 0) return player.shotZones;
    return summarizeShotZones(gameScopedShots);
  }, [selectedGameId, player.shotZones, player.shots.length, gameScopedShots]);

  const filteredEvaluatedShots = useMemo(() => {
    return evaluatedShots.filter(({ shot, quality }) => {
      if (outcomeFilter === 'made' && !shot.made) return false;
      if (outcomeFilter === 'missed' && shot.made) return false;
      if (typeFilter === '3pt' && !shot.isThree) return false;
      if (typeFilter === '2pt' && shot.isThree) return false;
      if (qualityFilter !== 'all' && quality.qualityTier !== qualityFilter) return false;
      return true;
    });
  }, [evaluatedShots, outcomeFilter, typeFilter, qualityFilter]);

  const zoneMap = useMemo(() => {
    const map: Record<ShotZoneKey, ShotZoneSummary> = {} as Record<ShotZoneKey, ShotZoneSummary>;
    for (const z of activeZones) {
      map[z.zone] = z;
    }
    return map;
  }, [activeZones]);

  const hoveredShotEntry: { shot: ShotEvent; quality: ShotQualityEvaluation } | null = useMemo(() => {
    if (!hoveredShotId) return null;
    return filteredEvaluatedShots.find((e) => e.shot.id === hoveredShotId) || null;
  }, [hoveredShotId, filteredEvaluatedShots]);

  const activeZone = hoveredZone ? zoneMap[hoveredZone] : null;
  const totalMade = useMemo(() => gameScopedShots.filter((s) => s.made).length, [gameScopedShots]);
  const totalAtt = gameScopedShots.length;
  const fgPctScoped = totalAtt > 0 ? ((totalMade / totalAtt) * 100).toFixed(1) : '0.0';
  const shotQuality = useMemo(
    () => computeShotQualityMetrics(activeZones, gameScopedShots),
    [activeZones, gameScopedShots]
  );

  const hasGames = Boolean(player.shotGames && player.shotGames.length > 0);

  const getZoneFill = (z: ShotZoneSummary | undefined) => {
    if (!z) return 'rgba(148, 163, 184, 0.05)';
    return mode === 'xfg'
      ? getExpectedQualityFill(z.expectedFgPct, z.attempts)
      : getDeltaHeatFill(z.deltaVsExpected, z.attempts);
  };

  const qualityTierRows = [
    {
      key: 'high' as const,
      label: 'Alta qualità (xFG ≥ 50%)',
      barColor: 'bg-emerald-400',
      split: shotQuality.qualityTiers.high,
    },
    {
      key: 'medium' as const,
      label: 'Media qualità (36–49%)',
      barColor: 'bg-sky-400',
      split: shotQuality.qualityTiers.medium,
    },
    {
      key: 'low' as const,
      label: 'Difficili (xFG < 36%)',
      barColor: 'bg-amber-400',
      split: shotQuality.qualityTiers.low,
    },
  ];

  return (
    <div className="bg-[#121822] border border-white/8 rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-bold tracking-wide text-slate-100">
              Mappa di Tiro NCAA & Expected FG% (xFG%)
            </h3>
            <span
              className={`text-xs font-medium ${
                player.shotsSource === 'pbp' ? 'text-emerald-400' : 'text-slate-400'
              }`}
            >
              {loadingLive
                ? '· Caricamento PBP ESPN...'
                : player.shotsSource === 'pbp'
                  ? `· PBP Reale ESPN (${player.shotGames?.length || 0} gare)`
                  : '· Distribuzione Spaziale Stagionale'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 font-mono-tabular">
            {totalMade}/{totalAtt} FG ({fgPctScoped}%) · xFG%{' '}
            {shotQuality.attempts > 0 ? `${shotQuality.expectedFgPct.toFixed(1)}%` : '—'} · Δ{' '}
            {shotQuality.attempts > 0 ? `${formatSigned(shotQuality.shotMakingDelta)}%` : '—'} ·{' '}
            {shotQuality.usesShotLevelContext
              ? 'Modello spaziale + contesto PBP (dunk, layup, assistiti, pull-up)'
              : 'Modello spaziale NCAA D1 per distanza e angolo'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasGames && (
            <select
              value={selectedGameId}
              onChange={(e) => {
                setSelectedGameId(e.target.value);
                setHoveredShotId(null);
              }}
              aria-label="Filtra per partita"
              className="bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#F97316] max-w-[235px]"
            >
              <option value="all">
                Tutte le gare ({player.shotGames!.length} · {player.shots.length} FG)
              </option>
              {player.shotGames!.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label} {g.date ? `(${g.date})` : ''} · {g.makes}/{g.attempts} FG
                  {g.result ? ` · ${g.result}` : ''}
                </option>
              ))}
            </select>
          )}

          <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8">
            <button
              type="button"
              onClick={() => setMode('heatmap')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'heatmap'
                  ? 'bg-[#F97316] text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              FG% vs xFG%
            </button>
            <button
              type="button"
              onClick={() => setMode('xfg')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'xfg'
                  ? 'bg-[#F97316] text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Qualità xFG%
            </button>
            <button
              type="button"
              onClick={() => setMode('scatter')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'scatter'
                  ? 'bg-[#F97316] text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Punti Make/Miss
            </button>
          </div>

          {player.espnId && (
            <button
              type="button"
              onClick={handleManualRefreshPbp}
              disabled={loadingLive}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#192231] hover:bg-[#223047] text-slate-200 border border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingLive ? 'animate-spin text-[#F97316]' : ''}`} />
              Aggiorna PBP
            </button>
          )}
        </div>
      </div>

      {/* Integrated Shot Quality (Actual vs Expected) KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#0A0E14] border border-white/8 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">FG% Reale vs xFG% Atteso</div>
          <div className="mt-1 flex items-baseline justify-between gap-2 font-mono-tabular">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-semibold text-white">
                {shotQuality.attempts > 0 ? `${shotQuality.actualFgPct.toFixed(1)}%` : '—'}
              </span>
              <span className="text-xs text-slate-500">vs</span>
              <span className="text-sm font-semibold text-sky-300">
                {shotQuality.attempts > 0 ? `${shotQuality.expectedFgPct.toFixed(1)}%` : '—'}
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              {shotQuality.makes}/{shotQuality.attempts}
            </span>
          </div>
        </div>

        <div className="bg-[#0A0E14] border border-white/8 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Δ Shot Making (FG − xFG)</div>
          <div className="mt-1 flex items-baseline justify-between gap-2 font-mono-tabular">
            <span
              className={`text-base font-semibold ${getDeltaTextClass(
                shotQuality.shotMakingDelta,
                shotQuality.attempts
              )}`}
            >
              {shotQuality.attempts > 0 ? `${formatSigned(shotQuality.shotMakingDelta)}%` : '—'}
            </span>
            <span className="text-[11px] text-slate-400 font-sans">
              {shotQuality.attempts === 0
                ? 'N/D'
                : shotQuality.shotMakingDelta >= 1.5
                  ? 'Sopra atteso'
                  : shotQuality.shotMakingDelta <= -1.5
                    ? 'Sotto atteso'
                    : 'In linea'}
            </span>
          </div>
        </div>

        <div className="bg-[#0A0E14] border border-white/8 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">eFG% vs xeFG% · Punti/Tiro</div>
          <div className="mt-1 flex items-baseline justify-between gap-2 font-mono-tabular">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-semibold text-white">
                {shotQuality.attempts > 0 ? `${shotQuality.actualEfgPct.toFixed(1)}%` : '—'}
              </span>
              <span className="text-xs text-slate-500">vs</span>
              <span className="text-sm font-semibold text-sky-300">
                {shotQuality.attempts > 0 ? `${shotQuality.expectedEfgPct.toFixed(1)}%` : '—'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              {shotQuality.attempts > 0
                ? `${shotQuality.actualPps.toFixed(2)}/${shotQuality.expectedPps.toFixed(2)}`
                : '—'}
            </span>
          </div>
        </div>

        <div className="bg-[#0A0E14] border border-white/8 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Selezione Tiri (Rim + 3P)</div>
          <div className="mt-1 flex items-baseline justify-between gap-2 font-mono-tabular">
            <span className="text-base font-semibold text-orange-300">
              {shotQuality.attempts > 0 ? `${shotQuality.rimPlusThreeFreq.toFixed(1)}%` : '—'}
            </span>
            <span className="text-[11px] text-slate-400">
              Rim {shotQuality.rimFreq.toFixed(0)}% · 3P {shotQuality.threeFreq.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {liveStatus && (
        <div className="text-xs text-slate-300 bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-2">
          {liveStatus}
        </div>
      )}

      {mode === 'scatter' && (
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8">
            {(['all', 'made', 'missed'] as OutcomeFilter[]).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setOutcomeFilter(opt)}
                className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  outcomeFilter === opt
                    ? 'bg-[#192231] text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt === 'all' ? 'Tutti' : opt === 'made' ? 'Segnati' : 'Sbagliati'}
              </button>
            ))}
          </div>

          <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8">
            {(['all', '2pt', '3pt'] as TypeFilter[]).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setTypeFilter(opt)}
                className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  typeFilter === opt
                    ? 'bg-[#192231] text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt === 'all' ? '2PT + 3PT' : opt === '2pt' ? 'Solo 2PT' : 'Solo 3PT'}
              </button>
            ))}
          </div>

          <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8">
            {(
              [
                { id: 'all', label: 'Tutte xFG' },
                { id: 'high', label: 'Alta ≥50%' },
                { id: 'medium', label: 'Media' },
                { id: 'low', label: 'Difficili <36%' },
              ] as Array<{ id: QualityFilter; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setQualityFilter(opt.id)}
                className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  qualityFilter === opt.id
                    ? 'bg-[#192231] text-sky-300 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3 text-slate-400 font-mono-tabular">
            <span>{filteredEvaluatedShots.length} tiri</span>
            <span className="inline-flex items-center gap-1.5 font-sans">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Segnato
            </span>
            <span className="inline-flex items-center gap-1.5 font-sans">
              <span className="text-rose-400 font-bold leading-none">×</span> Sbagliato
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* SVG NCAA Half Court */}
        <div className="xl:col-span-6 space-y-3">
          <div className="relative bg-[#0A0E14] border border-white/10 rounded-xl overflow-hidden p-3">
            <svg
              viewBox="0 0 500 385"
              className="w-full h-auto block select-none"
              role="img"
              aria-label={`Mappa di tiro e xFG% di ${player.name}`}
            >
              {/* Court Parquet Base */}
              <rect x="0" y="0" width="500" height="385" fill="#0E141E" />

              {/* Heatmap Interactive Zones (both FG vs xFG and xFG Quality modes) */}
              {(mode === 'heatmap' || mode === 'xfg') && (
                <g>
                  <path
                    d="M 0 110 L 34 110 A 221 221 0 0 0 466 110 L 500 110 L 500 385 L 0 385 Z"
                    fill={getZoneFill(zoneMap.aboveBreak3)}
                    stroke={hoveredZone === 'aboveBreak3' ? '#F97316' : 'rgba(255,255,255,0.08)'}
                    strokeWidth={hoveredZone === 'aboveBreak3' ? 2.5 : 1}
                    className="cursor-pointer transition-opacity"
                    onMouseEnter={() => setHoveredZone('aboveBreak3')}
                    onMouseLeave={() => setHoveredZone(null)}
                  />
                  <rect
                    x="0"
                    y="0"
                    width="34"
                    height="110"
                    fill={getZoneFill(zoneMap.corner3Left)}
                    stroke={hoveredZone === 'corner3Left' ? '#F97316' : 'rgba(255,255,255,0.08)'}
                    strokeWidth={hoveredZone === 'corner3Left' ? 2.5 : 1}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredZone('corner3Left')}
                    onMouseLeave={() => setHoveredZone(null)}
                  />
                  <rect
                    x="466"
                    y="0"
                    width="34"
                    height="110"
                    fill={getZoneFill(zoneMap.corner3Right)}
                    stroke={hoveredZone === 'corner3Right' ? '#F97316' : 'rgba(255,255,255,0.08)'}
                    strokeWidth={hoveredZone === 'corner3Right' ? 2.5 : 1}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredZone('corner3Right')}
                    onMouseLeave={() => setHoveredZone(null)}
                  />
                  <path
                    d="M 34 0 L 190 0 L 190 190 L 155 245 A 221 221 0 0 1 34 110 Z"
                    fill={getZoneFill(zoneMap.midLeft)}
                    stroke={hoveredZone === 'midLeft' ? '#F97316' : 'rgba(255,255,255,0.08)'}
                    strokeWidth={hoveredZone === 'midLeft' ? 2.5 : 1}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredZone('midLeft')}
                    onMouseLeave={() => setHoveredZone(null)}
                  />
                  <path
                    d="M 310 0 L 466 0 L 466 110 A 221 221 0 0 1 345 245 L 310 190 Z"
                    fill={getZoneFill(zoneMap.midRight)}
                    stroke={hoveredZone === 'midRight' ? '#F97316' : 'rgba(255,255,255,0.08)'}
                    strokeWidth={hoveredZone === 'midRight' ? 2.5 : 1}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredZone('midRight')}
                    onMouseLeave={() => setHoveredZone(null)}
                  />
                  <path
                    d="M 190 190 L 310 190 L 345 245 A 221 221 0 0 1 155 245 Z"
                    fill={getZoneFill(zoneMap.midCenter)}
                    stroke={hoveredZone === 'midCenter' ? '#F97316' : 'rgba(255,255,255,0.08)'}
                    strokeWidth={hoveredZone === 'midCenter' ? 2.5 : 1}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredZone('midCenter')}
                    onMouseLeave={() => setHoveredZone(null)}
                  />
                  <rect
                    x="190"
                    y="0"
                    width="120"
                    height="190"
                    fill={getZoneFill(zoneMap.paint)}
                    stroke={hoveredZone === 'paint' ? '#F97316' : 'rgba(255,255,255,0.12)'}
                    strokeWidth={hoveredZone === 'paint' ? 2.5 : 1}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredZone('paint')}
                    onMouseLeave={() => setHoveredZone(null)}
                  />
                  <circle
                    cx="250"
                    cy="52.5"
                    r="42"
                    fill={getZoneFill(zoneMap.restricted)}
                    stroke={hoveredZone === 'restricted' ? '#F97316' : 'rgba(255,255,255,0.2)'}
                    strokeWidth={hoveredZone === 'restricted' ? 2.5 : 1.2}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredZone('restricted')}
                    onMouseLeave={() => setHoveredZone(null)}
                  />
                </g>
              )}

              {/* Regulation NCAA Court Lines */}
              <g fill="none" stroke="rgba(226, 232, 240, 0.28)" strokeWidth="1.6" pointerEvents="none">
                <rect x="1" y="1" width="498" height="383" />
                <rect x="190" y="0" width="120" height="190" />
                <circle cx="250" cy="190" r="60" />
                <path d="M 210 52.5 A 40 40 0 0 0 290 52.5" />
                <line x1="34" y1="0" x2="34" y2="108" />
                <line x1="466" y1="0" x2="466" y2="108" />
                <path d="M 34 108 A 221 221 0 0 0 466 108" />
                <line x1="220" y1="40" x2="280" y2="40" stroke="rgba(248, 250, 252, 0.65)" strokeWidth="2.4" />
                <circle cx="250" cy="52.5" r="8" stroke="#F97316" strokeWidth="2.2" />
              </g>

              {/* Heatmap Percentage Labels (Actual FG% + xFG%) */}
              {(mode === 'heatmap' || mode === 'xfg') && (
                <g
                  pointerEvents="none"
                  className="font-mono"
                  textAnchor="middle"
                  fill="#F8FAFC"
                  fontSize="11"
                  fontWeight="600"
                >
                  {[
                    { key: 'restricted' as ShotZoneKey, x: 250, y: 74 },
                    { key: 'paint' as ShotZoneKey, x: 250, y: 142 },
                    { key: 'midLeft' as ShotZoneKey, x: 116, y: 126 },
                    { key: 'midCenter' as ShotZoneKey, x: 250, y: 224 },
                    { key: 'midRight' as ShotZoneKey, x: 384, y: 126 },
                    { key: 'corner3Left' as ShotZoneKey, x: 17, y: 56 },
                    { key: 'corner3Right' as ShotZoneKey, x: 483, y: 56 },
                    { key: 'aboveBreak3' as ShotZoneKey, x: 250, y: 314 },
                  ].map((lbl) => {
                    const z = zoneMap[lbl.key];
                    if (!z || z.attempts === 0) return null;
                    const isCorner = lbl.key.startsWith('corner');

                    if (mode === 'xfg') {
                      return (
                        <g key={lbl.key}>
                          <text
                            x={lbl.x}
                            y={lbl.y}
                            fontSize={isCorner ? '9.5' : '12'}
                            fill="#7DD3FC"
                          >
                            {z.expectedFgPct.toFixed(0)}%
                          </text>
                          <text x={lbl.x} y={lbl.y + 12} fontSize="8.5" fill="#CBD5E1" fontWeight="400">
                            {isCorner ? `${z.freqPct.toFixed(0)}%` : `xFG · ${z.freqPct.toFixed(0)}%`}
                          </text>
                        </g>
                      );
                    }

                    return (
                      <g key={lbl.key}>
                        <text x={lbl.x} y={lbl.y} fontSize={isCorner ? '9.5' : '12'}>
                          {z.fgPct.toFixed(0)}%
                        </text>
                        <text
                          x={lbl.x}
                          y={lbl.y + 11.5}
                          fontSize={isCorner ? '7.5' : '8.5'}
                          fill="#7DD3FC"
                          fontWeight="500"
                        >
                          {isCorner ? `x${z.expectedFgPct.toFixed(0)}` : `xFG ${z.expectedFgPct.toFixed(0)}%`}
                        </text>
                        {!isCorner && (
                          <text x={lbl.x} y={lbl.y + 22} fontSize="8" fill="#CBD5E1" fontWeight="400">
                            {z.makes}/{z.attempts}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Scatter Make/Miss Dots with Shot-Level xFG% Hover Inspector */}
              {mode === 'scatter' && (
                <g>
                  {filteredEvaluatedShots.map(({ shot, quality }) => {
                    const cx = sx(shot.x);
                    const cy = sy(shot.y);
                    const isHovered = hoveredShotId === shot.id;
                    const tooltip = [
                      shot.made ? 'Segnato' : 'Sbagliato',
                      shot.isThree ? '3PT' : '2PT',
                      `xFG ${quality.expectedFgPct.toFixed(1)}%`,
                      `${quality.distanceFt.toFixed(1)} ft`,
                      quality.contextLabel,
                      shot.gameLabel,
                      shot.period && shot.clock ? `${shot.period} ${shot.clock}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ');

                    if (shot.made) {
                      return (
                        <g
                          key={shot.id}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredShotId(shot.id)}
                          onMouseLeave={() => setHoveredShotId(null)}
                        >
                          {isHovered && (
                            <circle
                              cx={cx}
                              cy={cy}
                              r="9"
                              fill="none"
                              stroke="#F97316"
                              strokeWidth="1.8"
                            />
                          )}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isHovered ? '6' : '4.8'}
                            fill="rgba(16, 185, 129, 0.9)"
                            stroke={isHovered ? '#FFFFFF' : '#064E3B'}
                            strokeWidth={isHovered ? '1.5' : '1'}
                          >
                            <title>{tooltip}</title>
                          </circle>
                        </g>
                      );
                    }
                    return (
                      <g
                        key={shot.id}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredShotId(shot.id)}
                        onMouseLeave={() => setHoveredShotId(null)}
                      >
                        {isHovered && (
                          <circle
                            cx={cx}
                            cy={cy}
                            r="9"
                            fill="none"
                            stroke="#F97316"
                            strokeWidth="1.8"
                          />
                        )}
                        <circle cx={cx} cy={cy} r="7" fill="transparent" />
                        <g
                          stroke={isHovered ? '#FDA4AF' : 'rgba(244, 63, 94, 0.85)'}
                          strokeWidth={isHovered ? '2.2' : '1.7'}
                        >
                          <line x1={cx - 3.5} y1={cy - 3.5} x2={cx + 3.5} y2={cy + 3.5} />
                          <line x1={cx + 3.5} y1={cy - 3.5} x2={cx - 3.5} y2={cy + 3.5} />
                          <title>{tooltip}</title>
                        </g>
                      </g>
                    );
                  })}
                </g>
              )}
            </svg>
          </div>

          {/* Interactive Hover Readout / Legend */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs px-1 min-h-[24px]">
            {mode === 'scatter' && hoveredShotEntry ? (
              <div className="flex flex-wrap items-center gap-2.5 text-slate-200 font-mono-tabular">
                <span
                  className={`font-sans font-semibold ${
                    hoveredShotEntry.shot.made ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {hoveredShotEntry.shot.made ? 'Segnato' : 'Sbagliato'}
                </span>
                <span className="text-slate-500">·</span>
                <span className="font-sans text-white">
                  {zoneMap[hoveredShotEntry.shot.zone]?.label || hoveredShotEntry.shot.zone}
                </span>
                <span className="text-slate-500">·</span>
                <span className="text-sky-300 font-semibold">
                  xFG {hoveredShotEntry.quality.expectedFgPct.toFixed(1)}%
                </span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-300">{hoveredShotEntry.quality.distanceFt.toFixed(1)} ft</span>
                <span className="text-slate-500">·</span>
                <span className="font-sans text-slate-300">{hoveredShotEntry.quality.contextLabel}</span>
                {hoveredShotEntry.shot.gameLabel && (
                  <>
                    <span className="text-slate-500">·</span>
                    <span className="font-sans text-slate-400">{hoveredShotEntry.shot.gameLabel}</span>
                  </>
                )}
              </div>
            ) : activeZone && mode !== 'scatter' ? (
              <div className="flex flex-wrap items-center gap-2.5 text-slate-200 font-mono-tabular">
                <span className="font-sans font-semibold text-white">{activeZone.label}</span>
                <span className="text-slate-500">·</span>
                <span>
                  FG {activeZone.makes}/{activeZone.attempts} ({activeZone.fgPct.toFixed(1)}%)
                </span>
                <span className="text-slate-500">·</span>
                <span className="text-sky-300">xFG {activeZone.expectedFgPct.toFixed(1)}%</span>
                <span className="text-slate-500">·</span>
                <span className={`font-medium ${getDeltaTextClass(activeZone.deltaVsExpected, activeZone.attempts)}`}>
                  Δ {formatSigned(activeZone.deltaVsExpected)}%
                </span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-400">Freq {activeZone.freqPct.toFixed(1)}%</span>
              </div>
            ) : mode === 'xfg' ? (
              <div className="flex flex-wrap items-center gap-3.5 text-slate-400">
                <span>Mappa qualità attesa (xFG%)</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60" /> Alta ≥54%
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sky-400/50" /> Buona 41–53%
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/45" /> Media 36–40%
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/50" /> Bassa &lt;36%
                </span>
              </div>
            ) : mode === 'scatter' ? (
              <div className="text-slate-400">
                Passa su un singolo tiro per leggere distanza, contesto tattico e probabilità attesa xFG%
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3.5 text-slate-400">
                <span>Colore zona: FG% reale vs xFG% atteso</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60" /> Sopra atteso
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/45" /> In linea
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/55" /> Sotto atteso
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 8-Zone Efficiency Table (Actual FG% vs Expected xFG%) + Quality Tier Breakdown */}
        <div className="xl:col-span-6 space-y-5">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="text-left py-2 pr-2 font-medium">Zona</th>
                  <th className="text-right py-2 px-1.5 font-medium">FGM/A</th>
                  <th className="text-right py-2 px-1.5 font-medium">FG%</th>
                  <th className="text-right py-2 px-1.5 font-medium text-sky-300">xFG%</th>
                  <th className="text-right py-2 px-1.5 font-medium">Δ xFG</th>
                  <th className="text-right py-2 pl-1.5 font-medium">Freq</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6 font-mono-tabular">
                {activeZones.map((z) => {
                  const isActive = hoveredZone === z.zone;
                  return (
                    <tr
                      key={z.zone}
                      onMouseEnter={() => setHoveredZone(z.zone)}
                      onMouseLeave={() => setHoveredZone(null)}
                      className={`transition-colors cursor-default ${
                        isActive ? 'bg-white/6' : 'hover:bg-white/4'
                      }`}
                    >
                      <td className="py-2 pr-2 font-sans text-slate-200 font-medium whitespace-nowrap">
                        {z.label}
                      </td>
                      <td className="py-2 px-1.5 text-right text-slate-300">
                        {z.makes}/{z.attempts}
                      </td>
                      <td className="py-2 px-1.5 text-right text-white font-medium">
                        {z.attempts > 0 ? `${z.fgPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-2 px-1.5 text-right text-sky-300">
                        {z.attempts > 0 ? `${z.expectedFgPct.toFixed(1)}%` : `${z.d1AvgPct.toFixed(1)}%`}
                      </td>
                      <td
                        className={`py-2 px-1.5 text-right font-medium ${getDeltaTextClass(
                          z.deltaVsExpected,
                          z.attempts
                        )}`}
                      >
                        {z.attempts > 0 ? `${formatSigned(z.deltaVsExpected)}%` : '—'}
                      </td>
                      <td className="py-2 pl-1.5 text-right text-slate-400">{z.freqPct.toFixed(0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-white/15 font-mono-tabular text-xs">
                <tr className="text-slate-300">
                  <td className="py-2 pr-2 font-sans font-medium text-slate-300">Totale 2PT</td>
                  <td className="py-2 px-1.5 text-right">
                    {shotQuality.twoPt.makes}/{shotQuality.twoPt.attempts}
                  </td>
                  <td className="py-2 px-1.5 text-right text-white">
                    {shotQuality.twoPt.attempts > 0 ? `${shotQuality.twoPt.fgPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2 px-1.5 text-right text-sky-300">
                    {shotQuality.twoPt.attempts > 0 ? `${shotQuality.twoPt.xFgPct.toFixed(1)}%` : '—'}
                  </td>
                  <td
                    className={`py-2 px-1.5 text-right font-medium ${getDeltaTextClass(
                      shotQuality.twoPt.delta,
                      shotQuality.twoPt.attempts
                    )}`}
                  >
                    {shotQuality.twoPt.attempts > 0 ? `${formatSigned(shotQuality.twoPt.delta)}%` : '—'}
                  </td>
                  <td className="py-2 pl-1.5 text-right text-slate-400">
                    {shotQuality.twoPt.freqPct.toFixed(0)}%
                  </td>
                </tr>
                <tr className="text-slate-300 border-t border-white/6">
                  <td className="py-2 pr-2 font-sans font-medium text-slate-300">Totale 3PT</td>
                  <td className="py-2 px-1.5 text-right">
                    {shotQuality.threePt.makes}/{shotQuality.threePt.attempts}
                  </td>
                  <td className="py-2 px-1.5 text-right text-white">
                    {shotQuality.threePt.attempts > 0 ? `${shotQuality.threePt.fgPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2 px-1.5 text-right text-sky-300">
                    {shotQuality.threePt.attempts > 0 ? `${shotQuality.threePt.xFgPct.toFixed(1)}%` : '—'}
                  </td>
                  <td
                    className={`py-2 px-1.5 text-right font-medium ${getDeltaTextClass(
                      shotQuality.threePt.delta,
                      shotQuality.threePt.attempts
                    )}`}
                  >
                    {shotQuality.threePt.attempts > 0 ? `${formatSigned(shotQuality.threePt.delta)}%` : '—'}
                  </td>
                  <td className="py-2 pl-1.5 text-right text-slate-400">
                    {shotQuality.threePt.freqPct.toFixed(0)}%
                  </td>
                </tr>
                <tr className="bg-white/4 text-white font-semibold border-t border-white/12">
                  <td className="py-2.5 pr-2 font-sans">Totale Campo</td>
                  <td className="py-2.5 px-1.5 text-right">
                    {shotQuality.makes}/{shotQuality.attempts}
                  </td>
                  <td className="py-2.5 px-1.5 text-right">
                    {shotQuality.attempts > 0 ? `${shotQuality.actualFgPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2.5 px-1.5 text-right text-sky-300">
                    {shotQuality.attempts > 0 ? `${shotQuality.expectedFgPct.toFixed(1)}%` : '—'}
                  </td>
                  <td
                    className={`py-2.5 px-1.5 text-right ${getDeltaTextClass(
                      shotQuality.shotMakingDelta,
                      shotQuality.attempts
                    )}`}
                  >
                    {shotQuality.attempts > 0 ? `${formatSigned(shotQuality.shotMakingDelta)}%` : '—'}
                  </td>
                  <td className="py-2.5 pl-1.5 text-right text-slate-300">
                    {shotQuality.attempts > 0 ? '100%' : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Shot Quality Distribution Breakdown (High / Medium / Tough Looks) */}
          <div className="border-t border-white/8 pt-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-200">
                Rendimento per Qualità della Conclusione
              </span>
              <span className="text-[11px] text-slate-400">FG% reale vs xFG% atteso</span>
            </div>

            <div className="space-y-2.5">
              {qualityTierRows.map((row) => {
                const { split } = row;
                return (
                  <div key={row.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-300">{row.label}</span>
                      <div className="flex items-center gap-2 font-mono-tabular">
                        <span className="text-slate-400">
                          {split.makes}/{split.attempts} ({split.freqPct.toFixed(0)}%)
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="text-white font-medium">
                          {split.attempts > 0 ? `${split.fgPct.toFixed(1)}%` : '—'}
                        </span>
                        <span className="text-sky-300">
                          vs {split.attempts > 0 ? `${split.xFgPct.toFixed(1)}%` : '—'}
                        </span>
                        <span
                          className={`w-12 text-right font-medium ${getDeltaTextClass(
                            split.delta,
                            split.attempts
                          )}`}
                        >
                          {split.attempts > 0 ? `${formatSigned(split.delta)}%` : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-[#0A0E14] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${row.barColor} transition-all duration-300`}
                        style={{ width: `${Math.min(100, split.freqPct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
