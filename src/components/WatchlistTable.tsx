import React, { useMemo, useState } from 'react';
import {
  MinutesThreshold,
  PlayerPercentiles,
  PlayerProfile,
  Position,
} from '../types/basketball';
import { formatSigned, getPercentileColorClass } from '../utils/analytics';
import { exportWatchlistCsv } from '../utils/export';
import { ArrowDown, ArrowUp, Download, Search, Star } from 'lucide-react';

interface WatchlistTableProps {
  players: PlayerProfile[];
  percentilesMap: Record<string, PlayerPercentiles>;
  minMinutes: MinutesThreshold;
  onChangeMinMinutes: (val: MinutesThreshold) => void;
  shortlist: string[];
  onToggleShortlist: (playerId: string) => void;
  onSelectPlayer: (playerId: string) => void;
  globalQuery: string;
}

type GroupTab = 'all' | 'italian' | 'draft2027' | 'shortlist' | 'custom';
type ViewPreset = 'advanced' | 'onoff' | 'shooting';
type SortKey =
  | 'name'
  | 'min'
  | 'pts'
  | 'reb'
  | 'ast'
  | 'tsPct'
  | 'efgPct'
  | 'usgPct'
  | 'ortg'
  | 'drtg'
  | 'bpm'
  | 'netDiff'
  | 'onNet'
  | 'offNet'
  | 'rimPct'
  | 'midPct'
  | 'threePct'
  | 'threePAr'
  | 'ftr';

const MIN_THRESHOLDS: Array<{ value: MinutesThreshold; label: string }> = [
  { value: 0, label: 'Tutti' },
  { value: 10, label: '≥ 10 MIN' },
  { value: 18, label: '≥ 18 MIN' },
];

export const WatchlistTable: React.FC<WatchlistTableProps> = ({
  players,
  percentilesMap,
  minMinutes,
  onChangeMinMinutes,
  shortlist,
  onToggleShortlist,
  onSelectPlayer,
  globalQuery,
}) => {
  const [groupTab, setGroupTab] = useState<GroupTab>('all');
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');
  const [confFilter, setConfFilter] = useState<string>('ALL');
  const [preset, setPreset] = useState<ViewPreset>('advanced');
  const [localSearch, setLocalSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('bpm');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const shortlistSet = useMemo(() => new Set(shortlist), [shortlist]);

  const conferences = useMemo(() => {
    const set = new Set(players.map((p) => p.conference));
    return Array.from(set).sort();
  }, [players]);

  const counts = useMemo(() => {
    return {
      all: players.length,
      italian: players.filter((p) => p.isItalian).length,
      draft2027: players.filter((p) => Boolean(p.draftRank)).length,
      shortlist: players.filter((p) => shortlistSet.has(p.id)).length,
      custom: players.filter((p) => p.group === 'custom' || Boolean(p.addedByUid)).length,
    };
  }, [players, shortlistSet]);

  const filtered = useMemo(() => {
    const q = (localSearch || globalQuery).trim().toLowerCase();
    return players.filter((p) => {
      if (p.min < minMinutes) return false;
      if (groupTab === 'italian' && !p.isItalian) return false;
      if (groupTab === 'draft2027' && !p.draftRank) return false;
      if (groupTab === 'shortlist' && !shortlistSet.has(p.id)) return false;
      if (groupTab === 'custom' && !p.addedByUid) return false;
      if (posFilter !== 'ALL' && p.position !== posFilter) return false;
      if (confFilter !== 'ALL' && p.conference !== confFilter) return false;
      if (q) {
        const hay = `${p.name} ${p.team} ${p.conference} ${p.roleLabel} ${p.hometown || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [players, minMinutes, groupTab, posFilter, confFilter, localSearch, globalQuery, shortlistSet]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const getVal = (p: PlayerProfile): number | string => {
        switch (sortKey) {
          case 'name':
            return p.name;
          case 'netDiff':
            return p.onOff.netDiff;
          case 'onNet':
            return p.onOff.onNet;
          case 'offNet':
            return p.onOff.offNet;
          default:
            return p[sortKey];
        }
      };
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const diff = Number(va) - Number(vb);
      return sortDir === 'asc' ? diff : -diff;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const leaders = useMemo(() => {
    if (filtered.length === 0) return null;
    const byBpm = [...filtered].sort((a, b) => b.bpm - a.bpm)[0];
    const byOnOff = [...filtered].sort((a, b) => b.onOff.netDiff - a.onOff.netDiff)[0];
    const byTs = [...filtered].sort((a, b) => b.tsPct - a.tsPct)[0];
    const avgBpm = filtered.reduce((acc, p) => acc + p.bpm, 0) / filtered.length;
    return { byBpm, byOnOff, byTs, avgBpm };
  }, [filtered]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'drtg' ? 'asc' : 'desc');
    }
  }

  function renderSortHeader(label: string, key: SortKey, align: 'left' | 'right' = 'right') {
    const active = sortKey === key;
    return (
      <th
        key={key}
        onClick={() => handleSort(key)}
        className={`py-2.5 px-2.5 font-medium cursor-pointer select-none whitespace-nowrap transition-colors ${
          align === 'left' ? 'text-left' : 'text-right'
        } ${active ? 'text-orange-400' : 'text-slate-400 hover:text-slate-200'}`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active &&
            (sortDir === 'desc' ? (
              <ArrowDown className="w-3 h-3" />
            ) : (
              <ArrowUp className="w-3 h-3" />
            ))}
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header & Summary Strip */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-wide text-white leading-none">
              Watchlist NCAA 2026–27
            </h1>
            <p className="text-xs text-slate-400 mt-1.5">
              {counts.italian} italiani in Division I · {counts.draft2027} prospetti Big Board Draft 2027 · clicca un giocatore per percentili, On/Off, shot chart e note
            </p>
          </div>

          <div className="inline-flex bg-[#121822] p-1 rounded-lg border border-white/8">
            {(
              [
                { id: 'advanced', label: 'Avanzate' },
                { id: 'onoff', label: 'On / Off' },
                { id: 'shooting', label: 'Tiro & Zone' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPreset(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  preset === tab.id ? 'bg-[#F97316] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4-Column Quick Leaders Strip */}
        {leaders && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="bg-[#121822] border border-white/8 rounded-xl p-3.5">
              <div className="text-[11px] text-slate-400">Giocatori Filtrati</div>
              <div className="mt-1 flex items-baseline justify-between font-mono-tabular">
                <span className="text-xl font-semibold text-white">{filtered.length}</span>
                <span className="text-xs text-slate-400">Media BPM {formatSigned(leaders.avgBpm)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelectPlayer(leaders.byBpm.id)}
              className="text-left bg-[#121822] hover:bg-[#17202E] border border-white/8 rounded-xl p-3.5 transition-colors"
            >
              <div className="text-[11px] text-slate-400">Leader BPM</div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-white truncate">{leaders.byBpm.name}</span>
                <span className="font-mono-tabular text-sm font-semibold text-emerald-400 shrink-0">
                  {formatSigned(leaders.byBpm.bpm)}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onSelectPlayer(leaders.byOnOff.id)}
              className="text-left bg-[#121822] hover:bg-[#17202E] border border-white/8 rounded-xl p-3.5 transition-colors"
            >
              <div className="text-[11px] text-slate-400">Leader Net On/Off</div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-white truncate">{leaders.byOnOff.name}</span>
                <span className="font-mono-tabular text-sm font-semibold text-emerald-400 shrink-0">
                  {formatSigned(leaders.byOnOff.onOff.netDiff)}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onSelectPlayer(leaders.byTs.id)}
              className="text-left bg-[#121822] hover:bg-[#17202E] border border-white/8 rounded-xl p-3.5 transition-colors"
            >
              <div className="text-[11px] text-slate-400">Leader True Shooting (TS%)</div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-white truncate">{leaders.byTs.name}</span>
                <span className="font-mono-tabular text-sm font-semibold text-emerald-400 shrink-0">
                  {leaders.byTs.tsPct.toFixed(1)}%
                </span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-[#121822] border border-white/8 rounded-xl p-3.5 flex flex-wrap items-center gap-3">
        <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8 overflow-x-auto max-w-full">
          {(
            [
              { id: 'all' as GroupTab, label: `Tutti (${counts.all})` },
              { id: 'italian' as GroupTab, label: `Italiani (${counts.italian})` },
              { id: 'draft2027' as GroupTab, label: `Draft 2027 (${counts.draft2027})` },
              { id: 'shortlist' as GroupTab, label: `★ Preferiti (${counts.shortlist})` },
              ...(counts.custom > 0 ? [{ id: 'custom' as GroupTab, label: `Aggiunti (${counts.custom})` }] : []),
            ]
          ).map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroupTab(g.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                groupTab === g.id ? 'bg-[#192231] text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8">
          {MIN_THRESHOLDS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onChangeMinMinutes(t.value)}
              className={`px-2.5 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap ${
                minMinutes === t.value
                  ? 'bg-[#192231] text-orange-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
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
                posFilter === pos ? 'bg-[#192231] text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {pos === 'ALL' ? 'Ruoli' : pos}
            </button>
          ))}
        </div>

        <select
          value={confFilter}
          onChange={(e) => setConfFilter(e.target.value)}
          aria-label="Filtra per conference"
          className="bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#F97316]"
        >
          <option value="ALL">Tutte le Conference</option>
          {conferences.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Filtra nome, college o città..."
            className="w-full bg-[#0A0E14] border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F97316]"
          />
        </div>

        <button
          type="button"
          onClick={() => exportWatchlistCsv(sorted, percentilesMap, groupTab)}
          disabled={sorted.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0A0E14] hover:bg-[#192231] text-slate-200 border border-white/10 rounded-lg transition-colors whitespace-nowrap disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" />
          Esporta CSV
        </button>
      </div>

      {/* High-Density Data Table */}
      <div className="bg-[#121822] border border-white/8 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-[#0E141E]">
                <th className="py-2.5 pl-3 pr-1 w-8 font-medium" aria-label="Preferiti" />
                {renderSortHeader('Giocatore', 'name', 'left')}
                <th className="py-2.5 px-2.5 text-left font-medium text-slate-400 whitespace-nowrap">
                  College · Conf
                </th>
                {preset === 'advanced' && (
                  <>
                    {renderSortHeader('MIN', 'min')}
                    {renderSortHeader('PTS', 'pts')}
                    {renderSortHeader('REB', 'reb')}
                    {renderSortHeader('AST', 'ast')}
                    {renderSortHeader('TS%', 'tsPct')}
                    {renderSortHeader('USG%', 'usgPct')}
                    {renderSortHeader('ORtg', 'ortg')}
                    {renderSortHeader('DRtg', 'drtg')}
                    {renderSortHeader('BPM', 'bpm')}
                    <th className="py-2.5 px-3 text-right font-medium text-slate-400 whitespace-nowrap">
                      BPM Pct
                    </th>
                  </>
                )}
                {preset === 'onoff' && (
                  <>
                    {renderSortHeader('MIN', 'min')}
                    <th className="py-2.5 px-2.5 text-right font-medium text-slate-400 whitespace-nowrap">On ORtg</th>
                    <th className="py-2.5 px-2.5 text-right font-medium text-slate-400 whitespace-nowrap">Off ORtg</th>
                    <th className="py-2.5 px-2.5 text-right font-medium text-slate-400 whitespace-nowrap">On DRtg</th>
                    <th className="py-2.5 px-2.5 text-right font-medium text-slate-400 whitespace-nowrap">Off DRtg</th>
                    {renderSortHeader('On Net', 'onNet')}
                    {renderSortHeader('Off Net', 'offNet')}
                    {renderSortHeader('Net On/Off', 'netDiff')}
                    <th className="py-2.5 px-3 text-right font-medium text-slate-400 whitespace-nowrap">
                      On/Off Pct
                    </th>
                  </>
                )}
                {preset === 'shooting' && (
                  <>
                    {renderSortHeader('PTS', 'pts')}
                    {renderSortHeader('eFG%', 'efgPct')}
                    {renderSortHeader('TS%', 'tsPct')}
                    {renderSortHeader('Rim%', 'rimPct')}
                    {renderSortHeader('Mid%', 'midPct')}
                    {renderSortHeader('3P%', 'threePct')}
                    {renderSortHeader('3PAr', 'threePAr')}
                    {renderSortHeader('FTr', 'ftr')}
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-10 text-center text-slate-400">
                    {groupTab === 'shortlist' && shortlist.length === 0
                      ? 'La tua Shortlist è vuota: clicca la stella accanto a un giocatore per aggiungerlo.'
                      : 'Nessun giocatore corrisponde ai filtri o alla soglia minuti selezionati.'}
                  </td>
                </tr>
              ) : (
                sorted.map((p) => {
                  const pct = percentilesMap[p.id];
                  const bpmStyle = getPercentileColorClass(pct?.bpm ?? 50);
                  const onOffStyle = getPercentileColorClass(pct?.netDiff ?? 50);
                  const tsStyle = getPercentileColorClass(pct?.tsPct ?? 50);
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
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-100">{p.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {p.position} · {p.classYear} · {p.height}
                          {p.isItalian && <span className="text-sky-400"> · ITA</span>}
                          {p.draftRank && <span className="text-orange-400 font-mono-tabular"> · #{p.draftRank}</span>}
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 whitespace-nowrap text-slate-300">
                        {p.team} <span className="text-slate-500">· {p.conference}</span>
                      </td>

                      {preset === 'advanced' && (
                        <>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-400">
                            {p.min.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular font-semibold text-white">
                            {p.pts.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-300">
                            {p.reb.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-300">
                            {p.ast.toFixed(1)}
                          </td>
                          <td className={`py-2.5 px-2.5 text-right font-mono-tabular font-medium ${tsStyle.text}`}>
                            {p.tsPct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-300">
                            {p.usgPct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-300">
                            {p.ortg.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-400">
                            {p.drtg.toFixed(1)}
                          </td>
                          <td className={`py-2.5 px-2.5 text-right font-mono-tabular font-semibold ${bpmStyle.text}`}>
                            {formatSigned(p.bpm)}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <div className="w-12 h-1.5 bg-[#0A0E14] rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${bpmStyle.bar}`}
                                  style={{ width: `${pct?.bpm ?? 50}%` }}
                                />
                              </div>
                              <span className={`font-mono-tabular w-7 text-right ${bpmStyle.text}`}>
                                {pct?.bpm ?? 50}°
                              </span>
                            </div>
                          </td>
                        </>
                      )}

                      {preset === 'onoff' && (
                        <>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-400">
                            {p.min.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-200">
                            {p.onOff.onOrtg.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-400">
                            {p.onOff.offOrtg.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-200">
                            {p.onOff.onDrtg.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-400">
                            {p.onOff.offDrtg.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-200">
                            {formatSigned(p.onOff.onNet)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-400">
                            {formatSigned(p.onOff.offNet)}
                          </td>
                          <td
                            className={`py-2.5 px-2.5 text-right font-mono-tabular font-semibold ${
                              p.onOff.netDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {formatSigned(p.onOff.netDiff)}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <div className="w-12 h-1.5 bg-[#0A0E14] rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${onOffStyle.bar}`}
                                  style={{ width: `${pct?.netDiff ?? 50}%` }}
                                />
                              </div>
                              <span className={`font-mono-tabular w-7 text-right ${onOffStyle.text}`}>
                                {pct?.netDiff ?? 50}°
                              </span>
                            </div>
                          </td>
                        </>
                      )}

                      {preset === 'shooting' && (
                        <>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular font-semibold text-white">
                            {p.pts.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-200">
                            {p.efgPct.toFixed(1)}%
                          </td>
                          <td className={`py-2.5 px-2.5 text-right font-mono-tabular font-medium ${tsStyle.text}`}>
                            {p.tsPct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-200">
                            {p.rimPct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-300">
                            {p.midPct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-200">
                            {p.threePct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-400">
                            {p.threePAr.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-400">
                            {p.ftr.toFixed(1)}%
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
