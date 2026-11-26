import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  BigBoardDoc,
  BigBoardTierKey,
  BigBoardType,
  PlayerProfile,
} from '../types/basketball';
import { formatSigned } from '../utils/analytics';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Download,
  LogIn,
  Plus,
  RotateCcw,
  Save,
  Search,
  Users,
  X,
} from 'lucide-react';

interface BigBoardViewProps {
  players: PlayerProfile[];
  user: User | null;
  onSignIn: () => void;
  onSelectPlayer: (playerId: string) => void;
  onNotify: (msg: string) => void;
}

const TIER_KEYS: BigBoardTierKey[] = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5'];

const TIER_CONFIG: Record<
  BigBoardType,
  Array<{ key: BigBoardTierKey; label: string; sub: string; accent: string }>
> = {
  draft2027: [
    { key: 'tier1', label: 'Tier 1 · Lottery', sub: 'Top 1–14 NBA Draft 2027', accent: 'border-emerald-500/40 text-emerald-400' },
    { key: 'tier2', label: 'Tier 2 · Primo Giro', sub: 'Pick 15–30 · Rotazione NBA', accent: 'border-teal-400/40 text-teal-300' },
    { key: 'tier3', label: 'Tier 3 · Secondo Giro', sub: 'Pick 31–60 · Upside & Role', accent: 'border-orange-400/40 text-orange-300' },
    { key: 'tier4', label: 'Tier 4 · Two-Way / Exhibit 10', sub: 'Proiezione G-League / Europa', accent: 'border-sky-400/40 text-sky-300' },
    { key: 'tier5', label: 'Tier 5 · Monitor 2028', sub: 'Sviluppo pluriennale NCAA', accent: 'border-slate-500/40 text-slate-300' },
  ],
  italian: [
    { key: 'tier1', label: 'Tier 1 · Nazionale Maggiore', sub: 'Impatto immediato / Prospetti NBA', accent: 'border-emerald-500/40 text-emerald-400' },
    { key: 'tier2', label: 'Tier 2 · Rotazione Azzurra', sub: 'Protagonisti NCAA · Pronti per raduni', accent: 'border-teal-400/40 text-teal-300' },
    { key: 'tier3', label: 'Tier 3 · Core U20 / U22', sub: 'High-Major & Mid-Major in crescita', accent: 'border-orange-400/40 text-orange-300' },
    { key: 'tier4', label: 'Tier 4 · Sviluppo Division I', sub: 'Rotazione NCAA da consolidare', accent: 'border-sky-400/40 text-sky-300' },
    { key: 'tier5', label: 'Tier 5 · Monitor', sub: 'Primo anno / minutaggio limitato', accent: 'border-slate-500/40 text-slate-300' },
  ],
};

const TIER_WEIGHTS: Record<BigBoardTierKey, number> = {
  tier1: 100,
  tier2: 80,
  tier3: 60,
  tier4: 40,
  tier5: 20,
};

type TierState = Record<BigBoardTierKey, string[]>;

function buildDefaultTiers(players: PlayerProfile[], boardType: BigBoardType): TierState {
  if (boardType === 'draft2027') {
    const ranked = [...players]
      .filter((p) => Boolean(p.draftRank))
      .sort((a, b) => (a.draftRank || 999) - (b.draftRank || 999));
    return {
      tier1: ranked.slice(0, 10).map((p) => p.id),
      tier2: ranked.slice(10, 20).map((p) => p.id),
      tier3: ranked.slice(20, 30).map((p) => p.id),
      tier4: ranked.slice(30, 38).map((p) => p.id),
      tier5: ranked.slice(38, 46).map((p) => p.id),
    };
  }

  const italians = [...players]
    .filter((p) => p.isItalian || p.id === 'quinn-ellis')
    .sort((a, b) => b.pts - a.pts || b.bpm - a.bpm);
  return {
    tier1: italians.slice(0, 5).map((p) => p.id),
    tier2: italians.slice(5, 12).map((p) => p.id),
    tier3: italians.slice(12, 20).map((p) => p.id),
    tier4: italians.slice(20, 28).map((p) => p.id),
    tier5: italians.slice(28, 36).map((p) => p.id),
  };
}

export const BigBoardView: React.FC<BigBoardViewProps> = ({
  players,
  user,
  onSignIn,
  onSelectPlayer,
  onNotify,
}) => {
  const [boardType, setBoardType] = useState<BigBoardType>('draft2027');
  const [viewMode, setViewMode] = useState<'mine' | 'consensus'>('mine');
  const [allBoards, setAllBoards] = useState<BigBoardDoc[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(true);

  const [tiers, setTiers] = useState<TierState>(() => buildDefaultTiers(players, 'draft2027'));
  const [boardTitle, setBoardTitle] = useState('La Mia Big Board Draft 2027');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  const [addSearch, setAddSearch] = useState('');
  const [addTargetTier, setAddTargetTier] = useState<BigBoardTierKey>('tier2');
  const [dragInfo, setDragInfo] = useState<{ playerId: string; fromTier: BigBoardTierKey } | null>(null);
  const [inspectBoardId, setInspectBoardId] = useState<string>('consensus');

  const playerMap = useMemo(() => {
    const map = new Map<string, PlayerProfile>();
    for (const p of players) map.set(p.id, p);
    return map;
  }, [players]);

  // Real-time listener for all public Big Boards on Firestore
  useEffect(() => {
    const path = 'big_boards';
    const q = query(collection(db, path), where('visibility', '==', 'public'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs: BigBoardDoc[] = snap.docs.map((d) => {
          const data = d.data();
          const sanitizeList = (v: unknown) =>
            Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 25) : [];
          return {
            id: d.id,
            ownerUid: String(data.ownerUid || ''),
            ownerName: String(data.ownerName || 'Scout'),
            boardType: data.boardType === 'italian' ? 'italian' : 'draft2027',
            title: String(data.title || 'Big Board'),
            tier1: sanitizeList(data.tier1),
            tier2: sanitizeList(data.tier2),
            tier3: sanitizeList(data.tier3),
            tier4: sanitizeList(data.tier4),
            tier5: sanitizeList(data.tier5),
            visibility: 'public',
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
          };
        });
        setAllBoards(docs);
        setLoadingBoards(false);
      },
      (err) => {
        setLoadingBoards(false);
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, []);

  const boardsForType = useMemo(
    () =>
      allBoards
        .filter((b) => b.boardType === boardType)
        .sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0)),
    [allBoards, boardType]
  );

  const mySavedBoard = useMemo(() => {
    if (!user) return null;
    return boardsForType.find((b) => b.ownerUid === user.uid) || null;
  }, [boardsForType, user]);

  // Sync editor state when switching boardType or loading user's saved board
  useEffect(() => {
    setInspectBoardId('consensus');
    if (mySavedBoard) {
      setTiers({
        tier1: mySavedBoard.tier1,
        tier2: mySavedBoard.tier2,
        tier3: mySavedBoard.tier3,
        tier4: mySavedBoard.tier4,
        tier5: mySavedBoard.tier5,
      });
      setBoardTitle(mySavedBoard.title);
      setHasUnsavedChanges(false);
    } else {
      setTiers(buildDefaultTiers(players, boardType));
      setBoardTitle(
        boardType === 'draft2027' ? 'La Mia Big Board Draft 2027' : 'Il Mio Ranking Italiani NCAA'
      );
      setHasUnsavedChanges(false);
    }
  }, [boardType, mySavedBoard?.id, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const assignedIds = useMemo(() => {
    const set = new Set<string>();
    for (const k of TIER_KEYS) {
      for (const id of tiers[k]) set.add(id);
    }
    return set;
  }, [tiers]);

  const availableToAdd = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    return players
      .filter((p) => !assignedIds.has(p.id))
      .filter((p) => {
        if (!q) return boardType === 'italian' ? p.isItalian : true;
        return `${p.name} ${p.team} ${p.conference} ${p.position}`.toLowerCase().includes(q);
      })
      .slice(0, 12);
  }, [players, assignedIds, addSearch, boardType]);

  function moveWithinTier(tierKey: BigBoardTierKey, index: number, delta: -1 | 1) {
    setTiers((prev) => {
      const list = [...prev[tierKey]];
      const target = index + delta;
      if (target < 0 || target >= list.length) return prev;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...prev, [tierKey]: list };
    });
    setHasUnsavedChanges(true);
  }

  function moveAcrossTier(playerId: string, fromTier: BigBoardTierKey, toTier: BigBoardTierKey) {
    if (fromTier === toTier) return;
    setTiers((prev) => {
      if (prev[toTier].length >= 25) {
        onNotify('Ogni tier può contenere al massimo 25 giocatori.');
        return prev;
      }
      return {
        ...prev,
        [fromTier]: prev[fromTier].filter((id) => id !== playerId),
        [toTier]: [...prev[toTier].filter((id) => id !== playerId), playerId],
      };
    });
    setHasUnsavedChanges(true);
  }

  function removeFromTier(tierKey: BigBoardTierKey, playerId: string) {
    setTiers((prev) => ({
      ...prev,
      [tierKey]: prev[tierKey].filter((id) => id !== playerId),
    }));
    setHasUnsavedChanges(true);
  }

  function addPlayerToTier(playerId: string, targetTier: BigBoardTierKey) {
    if (tiers[targetTier].length >= 25) {
      onNotify('Limite di 25 giocatori raggiunto per questo tier.');
      return;
    }
    setTiers((prev) => ({
      ...prev,
      [targetTier]: [...prev[targetTier], playerId],
    }));
    setHasUnsavedChanges(true);
  }

  function handleResetDefault() {
    setTiers(buildDefaultTiers(players, boardType));
    setHasUnsavedChanges(true);
    onNotify('Board ripristinata all’ordine predefinito (ricorda di salvare).');
  }

  async function handleSaveBoard() {
    if (!user) {
      onSignIn();
      return;
    }
    const cleanTitle = boardTitle.trim().slice(0, 100);
    if (cleanTitle.length < 2) {
      onNotify('Inserisci un titolo di almeno 2 caratteri per la Big Board.');
      return;
    }

    const boardId = `${user.uid}_${boardType}`;
    const path = `big_boards/${boardId}`;
    const cleanOwnerName = (user.displayName || 'Scout').trim().slice(0, 80);

    // Guarantee valid regex IDs and max 25 per tier per firebase-blueprint.json
    const cleanTier = (arr: string[]) =>
      arr
        .filter((id) => /^[a-zA-Z0-9_-]{2,128}$/.test(id))
        .slice(0, 25);

    setSaving(true);
    try {
      if (mySavedBoard) {
        await updateDoc(doc(db, 'big_boards', boardId), {
          ownerName: cleanOwnerName,
          title: cleanTitle,
          tier1: cleanTier(tiers.tier1),
          tier2: cleanTier(tiers.tier2),
          tier3: cleanTier(tiers.tier3),
          tier4: cleanTier(tiers.tier4),
          tier5: cleanTier(tiers.tier5),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'big_boards', boardId), {
          ownerUid: user.uid,
          ownerName: cleanOwnerName,
          boardType,
          title: cleanTitle,
          tier1: cleanTier(tiers.tier1),
          tier2: cleanTier(tiers.tier2),
          tier3: cleanTier(tiers.tier3),
          tier4: cleanTier(tiers.tier4),
          tier5: cleanTier(tiers.tier5),
          visibility: 'public',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setHasUnsavedChanges(false);
      onNotify('Big Board salvata e pubblicata nel Consenso Community!');
    } catch (err) {
      handleFirestoreError(err, mySavedBoard ? OperationType.UPDATE : OperationType.CREATE, path);
    } finally {
      setSaving(false);
    }
  }

  function handleExportBoardCsv() {
    const cfg = TIER_CONFIG[boardType];
    const rows: string[] = ['Rank,Tier,Giocatore,College,Ruolo,PTS,REB,AST,TS%,BPM'];
    let rank = 1;
    for (const t of cfg) {
      for (const id of tiers[t.key]) {
        const p = playerMap.get(id);
        if (!p) continue;
        rows.push(
          [
            rank++,
            `"${t.label}"`,
            `"${p.name}"`,
            `"${p.team}"`,
            p.position,
            p.pts.toFixed(1),
            p.reb.toFixed(1),
            p.ast.toFixed(1),
            p.tsPct.toFixed(1),
            p.bpm.toFixed(1),
          ].join(',')
        );
      }
    }
    const blob = new Blob([`\uFEFF${rows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hoopscope-bigboard-${boardType}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Compute Community Consensus across all public boards of current boardType
  const consensusRanking = useMemo(() => {
    if (boardsForType.length === 0) return [];
    const acc = new Map<
      string,
      { scoreSum: number; votes: number; tierSum: number; bestTier: number }
    >();

    for (const board of boardsForType) {
      TIER_KEYS.forEach((tierKey, tierIdx) => {
        const list = board[tierKey];
        list.forEach((pid, posIdx) => {
          const base = TIER_WEIGHTS[tierKey];
          const posBonus = Math.max(0, 15 - posIdx * 1.1);
          const cur = acc.get(pid) || { scoreSum: 0, votes: 0, tierSum: 0, bestTier: 5 };
          cur.scoreSum += base + posBonus;
          cur.votes += 1;
          cur.tierSum += tierIdx + 1;
          cur.bestTier = Math.min(cur.bestTier, tierIdx + 1);
          acc.set(pid, cur);
        });
      });
    }

    return Array.from(acc.entries())
      .map(([playerId, stats]) => ({
        playerId,
        player: playerMap.get(playerId),
        avgScore: stats.scoreSum / boardsForType.length,
        avgWhenRanked: stats.scoreSum / stats.votes,
        avgTier: stats.tierSum / stats.votes,
        votes: stats.votes,
        coveragePct: Math.round((stats.votes / boardsForType.length) * 100),
      }))
      .filter((x) => Boolean(x.player))
      .sort((a, b) => b.avgScore - a.avgScore);
  }, [boardsForType, playerMap]);

  const activeTiersConfig = TIER_CONFIG[boardType];
  const inspectedBoard =
    inspectBoardId !== 'consensus'
      ? boardsForType.find((b) => b.id === inspectBoardId) || null
      : null;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-[#121822] border border-white/8 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wide text-white">
              Big Board & Tier List
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Costruisci la tua board personale con drag & drop, salvala su Firestore e confrontala con il consenso della community
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8">
              <button
                type="button"
                onClick={() => setBoardType('draft2027')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  boardType === 'draft2027' ? 'bg-[#F97316] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Draft 2027
              </button>
              <button
                type="button"
                onClick={() => setBoardType('italian')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  boardType === 'italian' ? 'bg-[#F97316] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Ranking Italiani
              </button>
            </div>

            <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8">
              <button
                type="button"
                onClick={() => setViewMode('mine')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  viewMode === 'mine' ? 'bg-[#192231] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                La Mia Board
              </button>
              <button
                type="button"
                onClick={() => setViewMode('consensus')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  viewMode === 'consensus' ? 'bg-[#192231] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Consenso ({boardsForType.length})
              </button>
            </div>
          </div>
        </div>

        {viewMode === 'mine' && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/8">
            <input
              type="text"
              value={boardTitle}
              onChange={(e) => {
                setBoardTitle(e.target.value);
                setHasUnsavedChanges(true);
              }}
              maxLength={100}
              className="flex-1 min-w-[220px] max-w-md bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-2 text-sm font-medium text-white focus:outline-none focus:border-[#F97316]"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportBoardCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#0A0E14] hover:bg-[#192231] text-slate-200 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Esporta CSV
              </button>

              <button
                type="button"
                onClick={handleResetDefault}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#0A0E14] hover:bg-[#192231] text-slate-300 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>

              {user ? (
                <button
                  type="button"
                  onClick={handleSaveBoard}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#F97316] hover:bg-[#EA580C] text-white rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving
                    ? 'Salvataggio...'
                    : hasUnsavedChanges
                      ? 'Salva Board su Cloud'
                      : mySavedBoard
                        ? 'Salvata su Cloud'
                        : 'Pubblica su Cloud'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#F97316] hover:bg-[#EA580C] text-white rounded-lg transition-colors whitespace-nowrap"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Accedi Google per salvare
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MY BOARD BUILDER */}
      {viewMode === 'mine' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* 5 Tiers Column */}
          <div className="xl:col-span-8 space-y-4">
            {activeTiersConfig.map((tierMeta, tierIdx) => {
              const ids = tiers[tierMeta.key];
              return (
                <section
                  key={tierMeta.key}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragInfo) {
                      moveAcrossTier(dragInfo.playerId, dragInfo.fromTier, tierMeta.key);
                      setDragInfo(null);
                    }
                  }}
                  className={`bg-[#121822] border rounded-xl p-4 space-y-3 transition-colors ${
                    dragInfo && dragInfo.fromTier !== tierMeta.key
                      ? 'border-[#F97316]/60 bg-[#151D2B]'
                      : 'border-white/8'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-white/8 pb-2.5">
                    <div>
                      <h2 className={`font-display text-lg font-bold tracking-wide ${tierMeta.accent.split(' ')[1]}`}>
                        {tierMeta.label}
                      </h2>
                      <p className="text-[11px] text-slate-400">{tierMeta.sub}</p>
                    </div>
                    <span className="font-mono-tabular text-xs text-slate-400">{ids.length}/25</span>
                  </div>

                  {ids.length === 0 ? (
                    <div className="py-5 text-center text-xs text-slate-500 border border-dashed border-white/10 rounded-lg">
                      Trascina qui un giocatore o aggiungilo dal pannello laterale
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {ids.map((pid, idx) => {
                        const p = playerMap.get(pid);
                        if (!p) return null;
                        return (
                          <div
                            key={pid}
                            draggable
                            onDragStart={() => setDragInfo({ playerId: pid, fromTier: tierMeta.key })}
                            onDragEnd={() => setDragInfo(null)}
                            className="flex items-center justify-between gap-3 bg-[#0A0E14] border border-white/8 hover:border-white/20 rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="font-mono-tabular text-xs text-slate-500 w-5 text-right shrink-0">
                                {idx + 1}.
                              </span>
                              <button
                                type="button"
                                onClick={() => onSelectPlayer(p.id)}
                                className="text-left min-w-0 hover:text-[#F97316] transition-colors"
                              >
                                <div className="text-sm font-semibold text-white truncate">{p.name}</div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {p.team} · {p.position} · {p.classYear} · {p.height}
                                </div>
                              </button>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <div className="hidden sm:flex items-center gap-3 font-mono-tabular text-xs text-slate-300">
                                <span>{p.pts.toFixed(1)} PTS</span>
                                <span className="text-slate-500">·</span>
                                <span className={p.bpm >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                  {formatSigned(p.bpm)} BPM
                                </span>
                              </div>

                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => moveWithinTier(tierMeta.key, idx, -1)}
                                  disabled={idx === 0}
                                  title="Sposta su nel tier"
                                  className="p-1 text-slate-400 hover:text-white disabled:opacity-25"
                                >
                                  <ChevronUp className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveWithinTier(tierMeta.key, idx, 1)}
                                  disabled={idx === ids.length - 1}
                                  title="Sposta giù nel tier"
                                  className="p-1 text-slate-400 hover:text-white disabled:opacity-25"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                                {tierIdx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => moveAcrossTier(pid, tierMeta.key, TIER_KEYS[tierIdx - 1])}
                                    title="Promuovi al tier superiore"
                                    className="p-1 text-emerald-400/80 hover:text-emerald-300"
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {tierIdx < TIER_KEYS.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => moveAcrossTier(pid, tierMeta.key, TIER_KEYS[tierIdx + 1])}
                                    title="Sposta al tier inferiore"
                                    className="p-1 text-amber-400/80 hover:text-amber-300"
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeFromTier(tierMeta.key, pid)}
                                  title="Rimuovi dalla board"
                                  className="p-1 text-slate-500 hover:text-rose-400"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {/* Right Add-Player Drawer */}
          <aside className="xl:col-span-4 bg-[#121822] border border-white/8 rounded-xl p-4 space-y-4 xl:sticky xl:top-20">
            <div>
              <h3 className="text-sm font-semibold text-white">Aggiungi alla Board</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Inserisci altri giocatori dalla watchlist ({assignedIds.size} già in board)
              </p>
            </div>

            <div className="space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="Cerca nome o college..."
                  className="w-full bg-[#0A0E14] border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F97316]"
                />
              </div>

              <select
                value={addTargetTier}
                onChange={(e) => setAddTargetTier(e.target.value as BigBoardTierKey)}
                className="w-full bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-[#F97316]"
              >
                {activeTiersConfig.map((t) => (
                  <option key={t.key} value={t.key}>
                    Destinazione: {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="divide-y divide-white/6 max-h-[460px] overflow-y-auto">
              {availableToAdd.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Nessun altro giocatore corrispondente alla ricerca.
                </p>
              ) : (
                availableToAdd.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{p.name}</div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {p.team} · {p.pts.toFixed(1)} PTS · {formatSigned(p.bpm)} BPM
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addPlayerToTier(p.id, addTargetTier)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-[#192231] hover:bg-[#F97316] text-white rounded-md transition-colors shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                      Aggiungi
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}

      {/* COMMUNITY CONSENSUS VIEW */}
      {viewMode === 'consensus' && (
        <div className="space-y-4">
          {loadingBoards ? (
            <div className="h-48 bg-[#121822] border border-white/8 rounded-xl animate-pulse" />
          ) : boardsForType.length === 0 ? (
            <div className="bg-[#121822] border border-white/8 rounded-xl p-10 text-center space-y-3">
              <p className="text-sm text-slate-200 font-medium">
                Nessuna Big Board pubblicata ancora per questa categoria.
              </p>
              <p className="text-xs text-slate-400">
                Passa su &ldquo;La Mia Board&rdquo;, personalizza i tuoi tier e salva su cloud per inaugurare il Consenso Community.
              </p>
              <button
                type="button"
                onClick={() => setViewMode('mine')}
                className="px-4 py-2 text-xs font-semibold bg-[#F97316] hover:bg-[#EA580C] text-white rounded-lg"
              >
                Crea la prima Big Board
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#121822] border border-white/8 rounded-xl p-4">
                <div className="text-xs text-slate-300">
                  Calcolato su <strong className="text-white">{boardsForType.length}</strong> board pubblicate su Firestore
                </div>
                <select
                  value={inspectBoardId}
                  onChange={(e) => setInspectBoardId(e.target.value)}
                  className="bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#F97316]"
                >
                  <option value="consensus">Vista: Consenso Aggregato Community</option>
                  {boardsForType.map((b) => (
                    <option key={b.id} value={b.id}>
                      Board di {b.ownerName} — {b.title}
                    </option>
                  ))}
                </select>
              </div>

              {inspectedBoard ? (
                <div className="space-y-4">
                  {activeTiersConfig.map((tierMeta) => {
                    const ids = inspectedBoard[tierMeta.key];
                    if (ids.length === 0) return null;
                    return (
                      <div key={tierMeta.key} className="bg-[#121822] border border-white/8 rounded-xl p-4 space-y-2">
                        <h3 className={`font-display text-lg font-bold ${tierMeta.accent.split(' ')[1]}`}>
                          {tierMeta.label} ({ids.length})
                        </h3>
                        <div className="divide-y divide-white/6">
                          {ids.map((pid, idx) => {
                            const p = playerMap.get(pid);
                            if (!p) return null;
                            return (
                              <div key={pid} className="py-2 flex items-center justify-between text-xs">
                                <button
                                  type="button"
                                  onClick={() => onSelectPlayer(p.id)}
                                  className="flex items-center gap-3 text-left hover:text-[#F97316]"
                                >
                                  <span className="font-mono-tabular text-slate-500 w-5">{idx + 1}.</span>
                                  <span className="font-semibold text-white">{p.name}</span>
                                  <span className="text-slate-400">
                                    {p.team} · {p.position}
                                  </span>
                                </button>
                                <span className="font-mono-tabular text-slate-300">
                                  {p.pts.toFixed(1)} PTS · {formatSigned(p.bpm)} BPM
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-[#121822] border border-white/8 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10 bg-[#0E141E] text-slate-400">
                          <th className="text-left py-3 px-4 font-medium">Rank</th>
                          <th className="text-left py-3 px-3 font-medium">Giocatore</th>
                          <th className="text-right py-3 px-3 font-medium">Tier Medio</th>
                          <th className="text-right py-3 px-3 font-medium">Presenza</th>
                          <th className="text-right py-3 px-3 font-medium">Score</th>
                          <th className="text-right py-3 px-3 font-medium">PTS</th>
                          <th className="text-right py-3 px-4 font-medium">BPM</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/6 font-mono-tabular">
                        {consensusRanking.map((row, idx) => {
                          const p = row.player!;
                          return (
                            <tr
                              key={row.playerId}
                              onClick={() => onSelectPlayer(p.id)}
                              className="hover:bg-white/4 cursor-pointer transition-colors"
                            >
                              <td className="py-2.5 px-4 text-orange-400 font-semibold">#{idx + 1}</td>
                              <td className="py-2.5 px-3 font-sans">
                                <div className="font-semibold text-white">{p.name}</div>
                                <div className="text-[11px] text-slate-400">
                                  {p.team} · {p.conference} · {p.position}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-200">
                                T{row.avgTier.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-300">
                                {row.votes}/{boardsForType.length} ({row.coveragePct}%)
                              </td>
                              <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold">
                                {row.avgScore.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-200">{p.pts.toFixed(1)}</td>
                              <td
                                className={`py-2.5 px-4 text-right font-medium ${
                                  p.bpm >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {formatSigned(p.bpm)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
