import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PlayerProfile,
  ScheduleGamesResponse,
} from '../types/basketball';
import { Calendar, Clock, RefreshCw, Star } from 'lucide-react';

interface ScheduleRecapViewProps {
  players: PlayerProfile[];
  shortlist: string[];
  onToggleShortlist: (playerId: string) => void;
  onSelectPlayer: (playerId: string) => void;
}

type DayKey = 'yesterday' | 'today' | 'tomorrow';
type GroupFilter = 'all' | 'italian' | 'draft2027' | 'shortlist';

export const ScheduleRecapView: React.FC<ScheduleRecapViewProps> = ({
  players,
  shortlist,
  onToggleShortlist,
  onSelectPlayer,
}) => {
  const [day, setDay] = useState<DayKey>('today');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [data, setData] = useState<ScheduleGamesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const playerLookup = useMemo(() => {
    const map = new Map<string, PlayerProfile>();
    for (const p of players) map.set(p.id, p);
    return map;
  }, [players]);

  const shortlistSet = useMemo(() => new Set(shortlist), [shortlist]);

  const fetchSchedule = useCallback(
    async (targetDay: DayKey, refresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/schedule/games', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            day: targetDay,
            refresh,
            players: players.map((p) => ({
              id: p.id,
              espnId: p.espnId,
              name: p.name,
              team: p.team,
              position: p.position,
              isItalian: p.isItalian,
              draftRank: p.draftRank,
            })),
          }),
        });
        if (!res.ok) throw new Error('Servizio calendario ESPN temporaneamente non raggiungibile.');
        const json = (await res.json()) as ScheduleGamesResponse;
        setData(json);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare il calendario NCAA al momento.'
        );
      } finally {
        setLoading(false);
      }
    },
    [players]
  );

  useEffect(() => {
    void fetchSchedule(day, false);
  }, [day, fetchSchedule]);

  const filteredGames = useMemo(() => {
    if (!data) return [];
    return data.games.filter((g) => {
      if (groupFilter === 'all') return true;
      if (groupFilter === 'italian') return g.monitoredPlayers.some((p) => p.isItalian);
      if (groupFilter === 'draft2027') return g.monitoredPlayers.some((p) => Boolean(p.draftRank));
      if (groupFilter === 'shortlist') return g.monitoredPlayers.some((p) => shortlistSet.has(p.id));
      return true;
    });
  }, [data, groupFilter, shortlistSet]);

  const summary = useMemo(() => {
    const playersSet = new Set<string>();
    let h2hCount = 0;
    let liveCount = 0;
    for (const g of filteredGames) {
      if (g.isHeadToHead) h2hCount++;
      if (g.state === 'in') liveCount++;
      for (const mp of g.monitoredPlayers) {
        if (
          groupFilter === 'all' ||
          (groupFilter === 'italian' && mp.isItalian) ||
          (groupFilter === 'draft2027' && Boolean(mp.draftRank)) ||
          (groupFilter === 'shortlist' && shortlistSet.has(mp.id))
        ) {
          playersSet.add(mp.id);
        }
      }
    }
    return {
      gamesCount: filteredGames.length,
      playersCount: playersSet.size,
      h2hCount,
      liveCount,
    };
  }, [filteredGames, groupFilter, shortlistSet]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-[#121822] border border-white/8 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-wide text-white leading-none">
              Calendario CET & Recap Notturno
            </h1>
            <p className="text-xs text-slate-400 mt-1.5">
              Orari convertiti in ora italiana (Europe/Rome) · filtrato esclusivamente sulle gare degli {players.length} prospetti monitorati
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8">
              {(
                [
                  { id: 'yesterday', label: 'Recap Ieri' },
                  { id: 'today', label: 'Oggi & Stanotte' },
                  { id: 'tomorrow', label: 'Domani' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDay(t.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    day === t.id ? 'bg-[#F97316] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void fetchSchedule(day, true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0A0E14] hover:bg-[#192231] text-slate-200 border border-white/10 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#F97316]' : ''}`} />
              Aggiorna
            </button>
          </div>
        </div>

        {/* Filter Bar + Slate Date */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/8">
          <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8 overflow-x-auto max-w-full">
            {(
              [
                { id: 'all', label: 'Tutti i monitorati' },
                { id: 'italian', label: 'Italiani NCAA' },
                { id: 'draft2027', label: 'Draft 2027' },
                { id: 'shortlist', label: `★ Preferiti (${shortlist.length})` },
              ] as const
            ).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGroupFilter(g.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  groupFilter === g.id ? 'bg-[#192231] text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          {data && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Calendar className="w-3.5 h-3.5 text-orange-400" />
              <span className="capitalize text-slate-200 font-medium">{data.dateLabelIt}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">{data.totalD1Games} gare D1 in programma</span>
            </div>
          )}
        </div>
      </div>

      {/* 4-Column Slate Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#121822] border border-white/8 rounded-xl p-3.5">
          <div className="text-[11px] text-slate-400">Partite Rilevanti</div>
          <div className="mt-1 font-mono-tabular text-xl font-semibold text-white">
            {loading ? '—' : summary.gamesCount}
          </div>
        </div>
        <div className="bg-[#121822] border border-white/8 rounded-xl p-3.5">
          <div className="text-[11px] text-slate-400">Prospetti Coinvolti</div>
          <div className="mt-1 font-mono-tabular text-xl font-semibold text-sky-400">
            {loading ? '—' : summary.playersCount}
          </div>
        </div>
        <div className="bg-[#121822] border border-white/8 rounded-xl p-3.5">
          <div className="text-[11px] text-slate-400">Scontri Diretti (H2H)</div>
          <div className="mt-1 font-mono-tabular text-xl font-semibold text-orange-400">
            {loading ? '—' : summary.h2hCount}
          </div>
        </div>
        <div className="bg-[#121822] border border-white/8 rounded-xl p-3.5">
          <div className="text-[11px] text-slate-400">Gare Live / Fuso Orario</div>
          <div className="mt-1 flex items-baseline justify-between font-mono-tabular">
            <span className={`text-xl font-semibold ${summary.liveCount > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
              {loading ? '—' : summary.liveCount}
            </span>
            <span className="text-xs text-slate-400">CET (Roma)</span>
          </div>
        </div>
      </div>

      {/* Content States */}
      {error && (
        <div className="bg-[#121822] border border-rose-500/30 rounded-xl p-6 text-center space-y-2">
          <p className="text-sm text-rose-300 font-medium">{error}</p>
          <button
            type="button"
            onClick={() => void fetchSchedule(day, true)}
            className="px-4 py-2 text-xs font-medium bg-[#192231] hover:bg-[#243248] text-white rounded-lg border border-white/10"
          >
            Riprova
          </button>
        </div>
      )}

      {!error && loading && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-44 bg-[#121822] border border-white/8 rounded-xl animate-pulse"
            />
          ))}
        </div>
      )}

      {!error && !loading && filteredGames.length === 0 && (
        <div className="bg-[#121822] border border-white/8 rounded-xl p-10 text-center space-y-2">
          <p className="text-sm font-medium text-slate-200">
            Nessuna partita in programma per i filtri selezionati in questa giornata.
          </p>
          <p className="text-xs text-slate-400">
            {groupFilter === 'shortlist' && shortlist.length === 0
              ? 'Aggiungi almeno un giocatore alla tua Shortlist (icona stella) dalla Watchlist o dal Dossier.'
              : 'Prova a cambiare giornata (Recap Ieri / Oggi / Domani) o seleziona "Tutti i monitorati".'}
          </p>
        </div>
      )}

      {!error && !loading && filteredGames.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredGames.map((game) => {
            const isFinished = game.state === 'post';
            const isLive = game.state === 'in';
            const visiblePlayers = game.monitoredPlayers.filter((mp) => {
              if (groupFilter === 'all') return true;
              if (groupFilter === 'italian') return mp.isItalian;
              if (groupFilter === 'draft2027') return Boolean(mp.draftRank);
              if (groupFilter === 'shortlist') return shortlistSet.has(mp.id);
              return true;
            });

            return (
              <article
                key={game.eventId}
                className="bg-[#121822] border border-white/8 rounded-xl overflow-hidden flex flex-col"
              >
                {/* Game Header Bar */}
                <div className="px-4 py-3 bg-[#0E141E] border-b border-white/8 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {isLive ? (
                      <span className="font-mono-tabular font-semibold text-emerald-400">
                        LIVE · {game.statusDetail}
                      </span>
                    ) : isFinished ? (
                      <span className="font-mono-tabular font-semibold text-slate-200">
                        {game.statusDetail} · {game.tipoffDateCet}
                      </span>
                    ) : (
                      <span className="font-mono-tabular font-semibold text-orange-400">
                        {game.tipoffCet} · {game.tipoffDateCet}
                      </span>
                    )}
                    {game.broadcast && (
                      <>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="text-slate-400">{game.broadcast}</span>
                      </>
                    )}
                  </div>

                  {game.isHeadToHead && (
                    <span className="text-[11px] font-semibold text-orange-400 tracking-wide">
                      SCONTRO DIRETTO H2H
                    </span>
                  )}
                </div>

                {/* Matchup Scoreline */}
                <div className="px-4 py-3.5 border-b border-white/6 flex items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-baseline gap-2 min-w-0">
                        {game.awayTeam.rank && (
                          <span className="font-mono-tabular text-[11px] text-orange-400 font-semibold">
                            #{game.awayTeam.rank}
                          </span>
                        )}
                        <span
                          className={`text-sm truncate ${
                            isFinished && game.awayTeam.winner
                              ? 'font-bold text-white'
                              : 'font-medium text-slate-200'
                          }`}
                        >
                          {game.awayTeam.shortName}
                        </span>
                      </div>
                      {(isLive || isFinished) && (
                        <span
                          className={`font-mono-tabular text-base ${
                            isFinished && game.awayTeam.winner
                              ? 'font-bold text-white'
                              : 'font-medium text-slate-400'
                          }`}
                        >
                          {game.awayTeam.score}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-baseline gap-2 min-w-0">
                        {game.homeTeam.rank && (
                          <span className="font-mono-tabular text-[11px] text-orange-400 font-semibold">
                            #{game.homeTeam.rank}
                          </span>
                        )}
                        <span
                          className={`text-sm truncate ${
                            isFinished && game.homeTeam.winner
                              ? 'font-bold text-white'
                              : 'font-medium text-slate-200'
                          }`}
                        >
                          {game.homeTeam.shortName}
                        </span>
                      </div>
                      {(isLive || isFinished) && (
                        <span
                          className={`font-mono-tabular text-base ${
                            isFinished && game.homeTeam.winner
                              ? 'font-bold text-white'
                              : 'font-medium text-slate-400'
                          }`}
                        >
                          {game.homeTeam.score}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Monitored Players Boxscore / Preview Rows */}
                <div className="divide-y divide-white/6 flex-1">
                  {visiblePlayers.map((mp) => {
                    const profile = playerLookup.get(mp.id);
                    const isStarred = shortlistSet.has(mp.id);
                    const box = mp.boxscore;

                    return (
                      <div
                        key={mp.id}
                        className="px-4 py-2.5 hover:bg-white/4 transition-colors flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => onToggleShortlist(mp.id)}
                            aria-label={isStarred ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
                            className="p-1 -ml-1 text-slate-500 hover:text-amber-400 transition-colors"
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                isStarred ? 'fill-amber-400 text-amber-400' : ''
                              }`}
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() => onSelectPlayer(mp.id)}
                            className="text-left min-w-0 group"
                          >
                            <div className="text-xs font-semibold text-slate-100 group-hover:text-orange-400 transition-colors truncate">
                              {mp.name}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {mp.team} · {mp.position}
                              {mp.isItalian && <span className="text-sky-400"> · ITA</span>}
                              {mp.draftRank && (
                                <span className="text-orange-400 font-mono-tabular"> · #{mp.draftRank}</span>
                              )}
                            </div>
                          </button>
                        </div>

                        {/* Boxscore for Live/Finished vs Season Avg for Upcoming */}
                        <div className="text-right font-mono-tabular text-xs shrink-0">
                          {isLive || isFinished ? (
                            box ? (
                              box.played ? (
                                <div className="space-y-0.5">
                                  <div className="text-white font-semibold">
                                    {box.pts} PTS · {box.reb} REB · {box.ast} AST
                                    <span className="text-slate-400 font-normal"> · {box.min}′</span>
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    FG {box.fg} · 3P {box.threePt} · FT {box.ft}
                                    {box.stl > 0 || box.blk > 0
                                      ? ` · ${box.stl}S/${box.blk}B`
                                      : ''}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-500">DNP / Non entrato</span>
                              )
                            ) : (
                              <span className="text-[11px] text-slate-500">Boxscore in aggiornamento</span>
                            )
                          ) : profile ? (
                            <div className="space-y-0.5">
                              <div className="text-slate-200">
                                Media: {profile.pts.toFixed(1)} PTS · {profile.reb.toFixed(1)} REB ·{' '}
                                {profile.ast.toFixed(1)} AST
                              </div>
                              <div className="text-[11px] text-slate-400">
                                TS% {profile.tsPct.toFixed(1)}% · BPM{' '}
                                {profile.bpm > 0 ? `+${profile.bpm.toFixed(1)}` : profile.bpm.toFixed(1)}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
