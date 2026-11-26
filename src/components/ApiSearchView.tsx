import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ApiSearchCandidate, PlayerGroup, PlayerProfile } from '../types/basketball';
import { LogIn, Plus, Search, Trash2, UserPlus } from 'lucide-react';

interface ApiSearchViewProps {
  existingPlayers: PlayerProfile[];
  customPlayers: PlayerProfile[];
  user: User | null;
  onSignIn: () => void;
  onSelectPlayer: (playerId: string) => void;
  onNotify: (msg: string) => void;
}

function slugifyId(name: string, team: string): string {
  const raw = `${name}-${team}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `api-${raw.slice(0, 80) || Date.now()}`;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Number(Math.max(min, Math.min(max, v)).toFixed(1));
}

export const ApiSearchView: React.FC<ApiSearchViewProps> = ({
  existingPlayers,
  customPlayers,
  user,
  onSignIn,
  onSelectPlayer,
  onNotify,
}) => {
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<ApiSearchCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [metaInfo, setMetaInfo] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [targetGroup, setTargetGroup] = useState<PlayerGroup>('draft2027');
  const [addingId, setAddingId] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = queryText.trim();
    if (q.length < 2) {
      setErrorMsg('Inserisci almeno 2 caratteri (nome giocatore o college NCAA).');
      return;
    }

    setSearching(true);
    setErrorMsg(null);
    setMetaInfo(null);
    try {
      const res = await fetch(`/api/ncaa/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error('Errore risposta API NCAA');
      const data = (await res.json()) as {
        results: ApiSearchCandidate[];
        seasonYear?: number;
        indexedPlayers?: number;
      };
      setResults(data.results || []);
      setMetaInfo(
        `${data.results?.length || 0} risultati trovati (ESPN Public NCAA API ${data.seasonYear || 2027} · Division I Live)`
      );
    } catch {
      setErrorMsg('Impossibile contattare le API gratuite NCAA al momento. Riprova tra qualche secondo.');
    } finally {
      setSearching(false);
    }
  }

  async function handleAddCandidate(candidate: ApiSearchCandidate) {
    if (!user) {
      onSignIn();
      return;
    }

    const playerId = slugifyId(candidate.name, candidate.team);
    const alreadyExists = existingPlayers.some(
      (p) => p.id === playerId || p.name.toLowerCase() === candidate.name.toLowerCase()
    );
    if (alreadyExists) {
      onNotify(`${candidate.name} è già presente nella watchlist.`);
      return;
    }

    setAddingId(playerId);
    const s = candidate.stats || {};
    const path = `custom_players/${playerId}`;

    try {
      await setDoc(doc(db, 'custom_players', playerId), {
        id: playerId,
        espnId: (candidate.espnId || '').slice(0, 40),
        name: candidate.name.trim().slice(0, 100),
        team: candidate.team.trim().slice(0, 100),
        conference: (candidate.conference || 'NCAA D1').trim().slice(0, 40),
        position: candidate.position,
        classYear: candidate.classYear,
        group: targetGroup,
        height: (candidate.height || '6-5').slice(0, 20),
        weight: clamp(candidate.weight || 205, 120, 360),
        gp: clamp(s.gp ?? 6, 0, 50),
        min: clamp(s.min ?? 22.0, 0, 48),
        pts: clamp(s.pts ?? 10.5, 0, 60),
        reb: clamp(s.reb ?? 4.2, 0, 30),
        ast: clamp(s.ast ?? 2.2, 0, 20),
        stl: clamp(s.stl ?? 0.9, 0, 10),
        blk: clamp(s.blk ?? 0.5, 0, 10),
        tsPct: clamp(s.tsPct ?? 56.5, 0, 100),
        efgPct: clamp(s.efgPct ?? 53.0, 0, 100),
        usgPct: clamp(s.usgPct ?? 20.5, 0, 60),
        ortg: clamp(s.ortg ?? 111.0, 40, 180),
        drtg: clamp(s.drtg ?? 99.0, 60, 160),
        bpm: clamp(s.bpm ?? 2.1, -25, 25),
        obpm: clamp(s.obpm ?? 1.2, -20, 20),
        dbpm: clamp(s.dbpm ?? 0.9, -20, 20),
        astPct: clamp(s.astPct ?? 14.5, 0, 80),
        tovPct: clamp(s.tovPct ?? 14.5, 0, 60),
        orebPct: clamp(s.orebPct ?? 5.0, 0, 40),
        drebPct: clamp(s.drebPct ?? 14.5, 0, 50),
        ftr: clamp(s.ftr ?? 31.0, 0, 150),
        threePAr: clamp(s.threePAr ?? 38.0, 0, 100),
        rimPct: clamp(s.rimPct ?? 61.0, 0, 100),
        midPct: clamp(s.midPct ?? 39.0, 0, 100),
        threePct: clamp(s.threePct ?? 35.5, 0, 100),
        addedByUid: user.uid,
        addedByName: (user.displayName || 'Scout').trim().slice(0, 80),
        visibility: 'public',
        createdAt: serverTimestamp(),
      });
      onNotify(`${candidate.name} (${candidate.team}) aggiunto alla watchlist condivisa!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setAddingId(null);
    }
  }

  async function handleRemoveCustomPlayer(playerId: string, name: string) {
    const path = `custom_players/${playerId}`;
    try {
      await deleteDoc(doc(db, 'custom_players', playerId));
      onNotify(`${name} rimosso dai giocatori aggiunti.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#121822] border border-white/8 rounded-xl p-5 space-y-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-white">
            Ricerca API Gratuite NCAA (ESPN Live 2026–27)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Cerca qualsiasi giocatore di Division I per importare statistiche live 2026–27 e aggiungerlo alla watchlist condivisa su Firestore
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Cerca per nome giocatore NCAA D1 (es. Oberti, Suigo, Sarr, Arenas...)"
              className="w-full bg-[#0A0E14] border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F97316]"
            />
          </div>

          <select
            value={targetGroup}
            onChange={(e) => setTargetGroup(e.target.value as PlayerGroup)}
            className="bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-[#F97316]"
          >
            <option value="italian">Etichetta: Italiano NCAA</option>
            <option value="draft2027">Etichetta: Prospetto Draft 2027</option>
            <option value="custom">Etichetta: Watchlist Custom</option>
          </select>

          <button
            type="submit"
            disabled={searching}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-[#F97316] hover:bg-[#EA580C] text-white rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <Search className="w-3.5 h-3.5" />
            {searching ? 'Ricerca live...' : 'Cerca D1'}
          </button>
        </form>

        {metaInfo && <p className="text-xs text-slate-400">{metaInfo}</p>}
        {errorMsg && <p className="text-xs text-rose-400">{errorMsg}</p>}
      </div>

      {/* Live API Results */}
      {results.length > 0 && (
        <div className="bg-[#121822] border border-white/8 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Risultati API Live</h2>
            {!user && (
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300"
              >
                <LogIn className="w-3.5 h-3.5" />
                Accedi con Google per importare
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-[#0E141E] text-slate-400">
                  <th className="text-left py-2.5 px-4 font-medium">Giocatore</th>
                  <th className="text-left py-2.5 px-3 font-medium">College · Conf</th>
                  <th className="text-left py-2.5 px-3 font-medium">Fonte API</th>
                  <th className="text-right py-2.5 px-3 font-medium">PTS</th>
                  <th className="text-right py-2.5 px-3 font-medium">TS%</th>
                  <th className="text-right py-2.5 px-3 font-medium">BPM</th>
                  <th className="text-right py-2.5 px-4 font-medium">Azione</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {results.map((cand, idx) => {
                  const candidateId = slugifyId(cand.name, cand.team);
                  const inRoster = existingPlayers.some(
                    (p) => p.id === candidateId || p.name.toLowerCase() === cand.name.toLowerCase()
                  );
                  return (
                    <tr key={`${candidateId}-${idx}`} className="hover:bg-white/4">
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-white">{cand.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {cand.position} · {cand.classYear} · {cand.height}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {cand.team} <span className="text-slate-500">· {cand.conference}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{cand.source}</td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-200">
                        {cand.stats?.pts !== undefined ? cand.stats.pts.toFixed(1) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-200">
                        {cand.stats?.tsPct !== undefined ? `${cand.stats.tsPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-200">
                        {cand.stats?.bpm !== undefined ? cand.stats.bpm.toFixed(1) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {inRoster ? (
                          <span className="text-emerald-400 font-medium">In Watchlist</span>
                        ) : (
                          <button
                            type="button"
                            disabled={addingId === candidateId}
                            onClick={() => handleAddCandidate(cand)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#192231] hover:bg-[#F97316] text-white border border-white/10 rounded-md transition-colors whitespace-nowrap disabled:opacity-50"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            {addingId === candidateId ? 'Salvataggio...' : 'Aggiungi'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Custom Players Saved in Cloud */}
      <div className="bg-[#121822] border border-white/8 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Giocatori Importati dalla Community ({customPlayers.length})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Sincronizzati su Firestore e integrati automaticamente nei percentili e nelle classifiche
            </p>
          </div>
        </div>

        {customPlayers.length === 0 ? (
          <div className="bg-[#0A0E14] border border-white/8 rounded-xl p-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <UserPlus className="w-5 h-5 text-slate-500" />
            <span>
              Nessun giocatore extra ancora aggiunto. Usa la ricerca sopra per importare qualsiasi atleta NCAA D1.
            </span>
          </div>
        ) : (
          <div className="divide-y divide-white/8 border-t border-white/8">
            {customPlayers.map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => onSelectPlayer(p.id)}
                  className="text-left hover:text-orange-400 transition-colors"
                >
                  <div className="text-sm font-semibold text-white">{p.name}</div>
                  <div className="text-xs text-slate-400">
                    {p.team} · {p.conference} · {p.position} · Aggiunto da {p.addedByName || 'Scout'}
                  </div>
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(p.id)}
                    className="text-xs text-slate-300 hover:text-white underline underline-offset-2"
                  >
                    Apri Dossier
                  </button>
                  {user && user.uid === p.addedByUid && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomPlayer(p.id, p.name)}
                      title="Rimuovi giocatore"
                      className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
