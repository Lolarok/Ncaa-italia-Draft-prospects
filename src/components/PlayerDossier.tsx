import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  MinutesThreshold,
  PlayerPercentiles,
  PlayerProfile,
  ShotEvent,
  ShotGameSummary,
  ShotZoneSummary,
} from '../types/basketball';
import { formatSigned, getPercentileColorClass } from '../utils/analytics';
import { exportPlayerDossierReport } from '../utils/export';
import { PlayerDnaPanel } from './PlayerDnaPanel';
import { PercentileProfile } from './PercentileProfile';
import { OnOffPanel } from './OnOffPanel';
import { ShotChart } from './ShotChart';
import { ScoutingHub } from './ScoutingHub';
import { ArrowLeft, Download, GitCompare, Printer, Star } from 'lucide-react';

interface PlayerDossierProps {
  player: PlayerProfile;
  allPlayers: PlayerProfile[];
  allPercentiles: PlayerPercentiles;
  posPercentiles: PlayerPercentiles;
  minMinutes: MinutesThreshold;
  isShortlisted: boolean;
  onToggleShortlist: (playerId: string) => void;
  user: User | null;
  onBack: () => void;
  onSelectPlayer: (playerId: string) => void;
  onCompare: (playerId: string) => void;
  onComparePair: (playerAId: string, playerBId: string) => void;
  onSignIn: () => void;
  onNotify: (msg: string) => void;
  onLiveShotsLoaded: (
    playerId: string,
    shots: ShotEvent[],
    zones: ShotZoneSummary[],
    games: ShotGameSummary[],
    source: 'pbp' | 'model'
  ) => void;
}

type DossierSection = 'all' | 'dna' | 'percentiles' | 'onoff' | 'shotchart' | 'scouting';

export const PlayerDossier: React.FC<PlayerDossierProps> = ({
  player,
  allPlayers,
  allPercentiles,
  posPercentiles,
  minMinutes,
  isShortlisted,
  onToggleShortlist,
  user,
  onBack,
  onSelectPlayer,
  onCompare,
  onComparePair,
  onSignIn,
  onNotify,
  onLiveShotsLoaded,
}) => {
  const [section, setSection] = useState<DossierSection>('all');
  const [percentileScope, setPercentileScope] = useState<'all' | 'position'>('all');

  const activePct = percentileScope === 'all' ? allPercentiles : posPercentiles;
  const bpmStyle = getPercentileColorClass(activePct.bpm);

  const kpis = [
    {
      label: 'Media Gara',
      primary: `${player.pts.toFixed(1)} PTS`,
      sub: `${player.reb.toFixed(1)} REB · ${player.ast.toFixed(1)} AST · ${player.min.toFixed(1)} MIN`,
      accent: 'text-white',
    },
    {
      label: 'Efficienza Tiro',
      primary: `${player.tsPct.toFixed(1)}% TS`,
      sub: `eFG% ${player.efgPct.toFixed(1)}% · 3PAr ${player.threePAr.toFixed(0)}%`,
      accent: getPercentileColorClass(activePct.tsPct).text,
    },
    {
      label: 'Volume & Regia',
      primary: `${player.usgPct.toFixed(1)}% USG`,
      sub: `AST% ${player.astPct.toFixed(1)}% · TOV% ${player.tovPct.toFixed(1)}%`,
      accent: 'text-slate-100',
    },
    {
      label: 'Box Plus/Minus',
      primary: formatSigned(player.bpm),
      sub: `OBPM ${formatSigned(player.obpm)} · DBPM ${formatSigned(player.dbpm)}`,
      accent: bpmStyle.text,
    },
    {
      label: 'Rating Individuali',
      primary: `${player.ortg.toFixed(1)} ORtg`,
      sub: `DRtg ${player.drtg.toFixed(1)} · FTr ${player.ftr.toFixed(0)}%`,
      accent: 'text-slate-100',
    },
    {
      label: 'Impatto On / Off',
      primary: `${formatSigned(player.onOff.netDiff)} Net`,
      sub: `On ${formatSigned(player.onOff.onNet)} · Off ${formatSigned(player.onOff.offNet)}`,
      accent: player.onOff.netDiff >= 0 ? 'text-emerald-400' : 'text-rose-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Dossier Header */}
      <div className="bg-[#121822] border border-white/8 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            Torna alla Watchlist
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleShortlist(player.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                isShortlisted
                  ? 'bg-amber-400/15 border-amber-400/45 text-amber-300'
                  : 'bg-[#0A0E14] hover:bg-[#192231] text-slate-200 border-white/10'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${isShortlisted ? 'fill-amber-400 text-amber-400' : ''}`} />
              {isShortlisted ? 'In Shortlist' : 'Shortlist'}
            </button>
            <button
              type="button"
              onClick={() => exportPlayerDossierReport(player, activePct)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0A0E14] hover:bg-[#192231] text-slate-200 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Report (.md)
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0A0E14] hover:bg-[#192231] text-slate-200 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Stampa / PDF
            </button>
            <button
              type="button"
              onClick={() => onCompare(player.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-[#192231] hover:bg-[#233146] text-slate-100 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
            >
              <GitCompare className="w-3.5 h-3.5" />
              Confronta 1v1
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              {player.isItalian && <span className="text-sky-400 font-semibold">Colonia Italiana NCAA</span>}
              {player.isItalian && player.draftRank && <span aria-hidden="true">·</span>}
              {player.draftRank && (
                <span className="text-orange-400 font-semibold font-mono-tabular">
                  Big Board Draft 2027 #{player.draftRank}
                </span>
              )}
              {!player.isItalian && !player.draftRank && <span>Giocatore Aggiunto da API</span>}
              <span aria-hidden="true">·</span>
              <span>
                {player.dataSource === 'live'
                  ? `Dati Live ESPN NCAA ${player.liveSeasonYear || 2027}`
                  : 'Profilo Stagione 2026–27'}
              </span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white leading-none">
              {player.name}
            </h1>

            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300 pt-1">
              <span className="font-semibold text-white">{player.team}</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span>{player.conference}</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span>{player.roleLabel}</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span>{player.classYear}</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                {player.height} / {player.weight} lbs
              </span>
              {player.wingspan && (
                <>
                  <span className="text-slate-500" aria-hidden="true">·</span>
                  <span className="font-mono-tabular">WS {player.wingspan}</span>
                </>
              )}
              {player.hometown && (
                <>
                  <span className="text-slate-500" aria-hidden="true">·</span>
                  <span className="text-slate-400">{player.hometown}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-6 font-mono-tabular border-t sm:border-t-0 border-white/8 pt-4 sm:pt-0">
            <div>
              <div className="text-[11px] font-sans text-slate-400">Gare (GP)</div>
              <div className="text-2xl font-semibold text-white">{player.gp}</div>
            </div>
            <div className="h-9 w-px bg-white/10" />
            <div>
              <div className="text-[11px] font-sans text-slate-400">BPM Percentile</div>
              <div className={`text-2xl font-semibold ${bpmStyle.text}`}>{activePct.bpm}°</div>
            </div>
            <div className="h-9 w-px bg-white/10" />
            <div>
              <div className="text-[11px] font-sans text-slate-400">Difesa (STL / BLK)</div>
              <div className="text-lg font-semibold text-slate-200">
                {player.stl.toFixed(1)} / {player.blk.toFixed(1)}
              </div>
            </div>
          </div>
        </div>

        {/* 6-Tile Headline KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 pt-2">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="bg-[#0A0E14] border border-white/8 rounded-lg p-3 space-y-1">
              <div className="text-[11px] text-slate-400">{kpi.label}</div>
              <div className={`font-mono-tabular text-base font-semibold ${kpi.accent}`}>{kpi.primary}</div>
              <div className="font-mono-tabular text-[11px] text-slate-400 truncate">{kpi.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Section Switcher */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            { id: 'all', label: 'Dossier Completo' },
            { id: 'dna', label: 'DNA & Comps' },
            { id: 'percentiles', label: 'Percentili' },
            { id: 'onoff', label: 'On / Off Court' },
            { id: 'shotchart', label: 'Mappa di Tiro & xFG%' },
            { id: 'scouting', label: 'Note & Video' },
          ] as Array<{ id: DossierSection; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSection(tab.id)}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              section === tab.id
                ? 'bg-[#F97316] border-[#F97316] text-white'
                : 'bg-[#121822] border-white/8 text-slate-300 hover:text-white hover:border-white/20'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(section === 'all' || section === 'dna') && (
        <PlayerDnaPanel
          player={player}
          allPlayers={allPlayers}
          minMinutes={minMinutes}
          onSelectPlayer={onSelectPlayer}
          onComparePair={onComparePair}
        />
      )}

      {(section === 'all' || section === 'percentiles') && (
        <PercentileProfile
          player={player}
          allPercentiles={allPercentiles}
          posPercentiles={posPercentiles}
          scope={percentileScope}
          minMinutes={minMinutes}
          onScopeChange={setPercentileScope}
        />
      )}

      {(section === 'all' || section === 'onoff') && (
        <OnOffPanel player={player} percentiles={activePct} />
      )}

      {(section === 'all' || section === 'shotchart') && (
        <ShotChart player={player} onLiveShotsLoaded={onLiveShotsLoaded} />
      )}

      {(section === 'all' || section === 'scouting') && (
        <ScoutingHub player={player} user={user} onSignIn={onSignIn} onNotify={onNotify} />
      )}
    </div>
  );
};
