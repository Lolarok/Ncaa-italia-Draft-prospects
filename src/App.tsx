import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { INITIAL_ROSTER } from './data/rosterData';
import {
  MinutesThreshold,
  PlayerGroup,
  PlayerProfile,
  Position,
  ShotEvent,
  ShotGameSummary,
  ShotZoneSummary,
} from './types/basketball';
import { buildOnOffSplits, buildShotProfile, computePercentilesMap } from './utils/analytics';
import { WatchlistTable } from './components/WatchlistTable';
import { PlayerDossier } from './components/PlayerDossier';
import { LeaderboardView } from './components/LeaderboardView';
import { CompareView } from './components/CompareView';
import { ApiSearchView } from './components/ApiSearchView';
import { ScoutingFeedView } from './components/ScoutingFeedView';
import { BigBoardView } from './components/BigBoardView';
import { ScheduleRecapView } from './components/ScheduleRecapView';
import {
  BarChart3,
  CalendarDays,
  GitCompare,
  LayoutGrid,
  ListOrdered,
  LogIn,
  LogOut,
  Menu,
  MessageSquareText,
  RefreshCw,
  Search,
  UserPlus,
  X,
} from 'lucide-react';

type ActiveRoute =
  | 'watchlist'
  | 'schedule'
  | 'leaderboard'
  | 'bigboard'
  | 'feed'
  | 'compare'
  | 'api-search'
  | 'dossier';

const GUEST_SHORTLIST_KEY = 'hoopscope_guest_shortlist_v1';

function readGuestShortlist(): string[] {
  try {
    const raw = localStorage.getItem(GUEST_SHORTLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{2,128}$/.test(v))
      .slice(0, 50);
  } catch {
    return [];
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [baseRoster, setBaseRoster] = useState<PlayerProfile[]>(INITIAL_ROSTER);
  const [customPlayers, setCustomPlayers] = useState<PlayerProfile[]>([]);
  const [activeRoute, setActiveRoute] = useState<ActiveRoute>('watchlist');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('dame-sarr');
  const [compareAId, setCompareAId] = useState<string>('dame-sarr');
  const [compareBId, setCompareBId] = useState<string>('tyran-stokes');
  const [minMinutes, setMinMinutes] = useState<MinutesThreshold>(0);
  const [shortlist, setShortlist] = useState<string[]>(() => readGuestShortlist());

  const [globalQuery, setGlobalQuery] = useState('');
  const [showQuickJump, setShowQuickJump] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [syncingLive, setSyncingLive] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  // Silent background ESPN 2026-27 refresh on initial load
  useEffect(() => {
    void handleSyncLiveApis(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Firebase Auth listener + private user profile & shortlist real-time sync
  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      setUser(currentUser);
      setAuthReady(true);

      if (currentUser && currentUser.emailVerified) {
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            const guestList = readGuestShortlist();
            await setDoc(userRef, {
              uid: currentUser.uid,
              displayName: (currentUser.displayName || 'Scout').trim().slice(0, 80),
              shortlist: guestList,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch {
          // Non-blocking profile bootstrap
        }

        unsubUserDoc = onSnapshot(
          userRef,
          (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              if (Array.isArray(data.shortlist)) {
                const clean = data.shortlist
                  .filter(
                    (v: unknown): v is string =>
                      typeof v === 'string' && /^[a-zA-Z0-9_-]{2,128}$/.test(v)
                  )
                  .slice(0, 50);
                setShortlist(clean);
              }
            }
          },
          () => {
            // Non-blocking private profile listener
          }
        );
      } else {
        setShortlist(readGuestShortlist());
      }
    });

    return () => {
      if (unsubUserDoc) unsubUserDoc();
      unsubAuth();
    };
  }, []);

  // Firestore real-time listener for shared custom players
  useEffect(() => {
    const path = 'custom_players';
    const q = query(collection(db, path), where('visibility', '==', 'public'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const loaded: PlayerProfile[] = snap.docs.map((d) => {
          const data = d.data();
          const pos = (['G', 'F', 'C'].includes(data.position) ? data.position : 'G') as Position;
          const grp = (['italian', 'draft2027', 'custom'].includes(data.group)
            ? data.group
            : 'custom') as PlayerGroup;
          const ortg = Number(data.ortg || 110);
          const drtg = Number(data.drtg || 99);
          const obpm = Number(data.obpm || 1.2);
          const dbpm = Number(data.dbpm || 0.8);
          const bpm = Number(data.bpm ?? obpm + dbpm);
          const usgPct = Number(data.usgPct || 20);
          const orebPct = Number(data.orebPct || 5);
          const pts = Number(data.pts || 10);
          const gp = Number(data.gp || 6);
          const rimPct = Number(data.rimPct || 61);
          const midPct = Number(data.midPct || 39);
          const threePct = Number(data.threePct || 35);
          const threePAr = Number(data.threePAr || 38);

          const onOff = buildOnOffSplits({
            id: d.id,
            ortg,
            drtg,
            obpm,
            dbpm,
            bpm,
            usgPct,
            orebPct,
            position: pos,
          });
          const { shots, shotZones } = buildShotProfile({
            id: d.id,
            position: pos,
            pts,
            gp,
            rimPct,
            midPct,
            threePct,
            threePAr,
          });

          return {
            id: d.id,
            espnId: String(data.espnId || ''),
            name: String(data.name || 'Giocatore NCAA'),
            team: String(data.team || 'NCAA D1'),
            conference: String(data.conference || 'D1'),
            position: pos,
            roleLabel: pos === 'C' ? 'Center' : pos === 'F' ? 'Forward' : 'Guard',
            classYear: data.classYear || 'So',
            group: grp,
            isItalian: grp === 'italian',
            draftRank: grp === 'draft2027' ? 61 : undefined,
            height: String(data.height || '6-5'),
            weight: Number(data.weight || 205),
            gp,
            min: Number(data.min || 22),
            pts,
            reb: Number(data.reb || 4),
            ast: Number(data.ast || 2),
            stl: Number(data.stl || 0.8),
            blk: Number(data.blk || 0.4),
            tsPct: Number(data.tsPct || 56),
            efgPct: Number(data.efgPct || 53),
            usgPct,
            ortg,
            drtg,
            bpm,
            obpm,
            dbpm,
            astPct: Number(data.astPct || 14),
            tovPct: Number(data.tovPct || 14),
            orebPct,
            drebPct: Number(data.drebPct || 14),
            ftr: Number(data.ftr || 30),
            threePAr,
            rimPct,
            midPct,
            threePct,
            onOff,
            shots,
            shotZones,
            dataSource: 'live',
            addedByUid: String(data.addedByUid || ''),
            addedByName: String(data.addedByName || 'Scout'),
          };
        });
        setCustomPlayers(loaded);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, []);

  const allPlayers = useMemo(() => {
    const existingIds = new Set(baseRoster.map((p) => p.id));
    const uniqueCustom = customPlayers.filter((cp) => !existingIds.has(cp.id));
    return [...baseRoster, ...uniqueCustom];
  }, [baseRoster, customPlayers]);

  const allPercentilesMap = useMemo(
    () => computePercentilesMap(allPlayers, 'all', minMinutes),
    [allPlayers, minMinutes]
  );
  const posPercentilesMap = useMemo(
    () => computePercentilesMap(allPlayers, 'position', minMinutes),
    [allPlayers, minMinutes]
  );

  const selectedPlayer = useMemo(
    () => allPlayers.find((p) => p.id === selectedPlayerId) || allPlayers[0],
    [allPlayers, selectedPlayerId]
  );

  const quickJumpMatches = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return allPlayers
      .filter((p) => `${p.name} ${p.team} ${p.conference}`.toLowerCase().includes(q))
      .slice(0, 7);
  }, [allPlayers, globalQuery]);

  async function handleSignIn() {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Accesso Google completato: ora puoi aggiungere note, video e giocatori.');
    } catch (error) {
      console.error('Auth error:', error);
      showToast('Accesso annullato o bloccato dal browser.');
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      showToast('Disconnesso dall’account Google.');
    } catch {
      showToast('Errore durante la disconnessione.');
    }
  }

  async function handleSyncLiveApis(silent = false) {
    setSyncingLive(true);
    if (!silent) setSyncSummary(null);
    try {
      const res = await fetch('/api/stats/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          players: baseRoster.map((p) => ({
            id: p.id,
            espnId: p.espnId,
            name: p.name,
            team: p.team,
            position: p.position,
          })),
        }),
      });
      if (!res.ok) throw new Error('Errore proxy API');
      const data = (await res.json()) as {
        syncedCount: number;
        totalIndexed: number;
        seasonYear: number;
        matched: Record<
          string,
          {
            espnId?: string;
            gp: number;
            min: number;
            pts: number;
            reb: number;
            ast: number;
            stl: number;
            blk: number;
            tsPct: number;
            efgPct: number;
            usgPct: number;
            ortg: number;
            drtg: number;
            bpm: number;
            obpm: number;
            dbpm: number;
            astPct: number;
            tovPct: number;
            orebPct: number;
            drebPct: number;
            ftr: number;
            threePAr: number;
            rimPct: number;
            midPct: number;
            threePct: number;
            team: string;
            conference: string;
          }
        >;
        message?: string;
      };

      if (data.syncedCount > 0 && data.matched) {
        setBaseRoster((prev) =>
          prev.map((p) => {
            const live = data.matched[p.id];
            if (!live) return p;
            const onOff = buildOnOffSplits({
              id: p.id,
              ortg: live.ortg,
              drtg: live.drtg,
              obpm: live.obpm,
              dbpm: live.dbpm,
              bpm: live.bpm,
              usgPct: live.usgPct,
              orebPct: live.orebPct,
              position: p.position,
            });
            const keepRealPbp = p.shotsSource === 'pbp' && p.shots.length > 0;
            const { shots, shotZones } = keepRealPbp
              ? { shots: p.shots, shotZones: p.shotZones }
              : buildShotProfile({
                  id: p.id,
                  position: p.position,
                  pts: live.pts ?? p.pts,
                  gp: live.gp ?? p.gp,
                  rimPct: live.rimPct ?? p.rimPct,
                  midPct: live.midPct ?? p.midPct,
                  threePct: live.threePct ?? p.threePct,
                  threePAr: live.threePAr ?? p.threePAr,
                });
            return {
              ...p,
              espnId: live.espnId || p.espnId,
              gp: live.gp ?? p.gp,
              min: live.min ?? p.min,
              pts: live.pts ?? p.pts,
              reb: live.reb ?? p.reb,
              ast: live.ast ?? p.ast,
              stl: live.stl ?? p.stl,
              blk: live.blk ?? p.blk,
              tsPct: live.tsPct ?? p.tsPct,
              efgPct: live.efgPct ?? p.efgPct,
              usgPct: live.usgPct ?? p.usgPct,
              ortg: live.ortg ?? p.ortg,
              drtg: live.drtg ?? p.drtg,
              bpm: live.bpm ?? p.bpm,
              obpm: live.obpm ?? p.obpm,
              dbpm: live.dbpm ?? p.dbpm,
              astPct: live.astPct ?? p.astPct,
              tovPct: live.tovPct ?? p.tovPct,
              orebPct: live.orebPct ?? p.orebPct,
              drebPct: live.drebPct ?? p.drebPct,
              ftr: live.ftr ?? p.ftr,
              threePAr: live.threePAr ?? p.threePAr,
              rimPct: live.rimPct ?? p.rimPct,
              midPct: live.midPct ?? p.midPct,
              threePct: live.threePct ?? p.threePct,
              onOff,
              shots,
              shotZones,
              dataSource: 'live',
              liveSeasonYear: data.seasonYear,
            };
          })
        );
        const msg = `Aggiornati ${data.syncedCount} profili con statistiche live ESPN NCAA ${data.seasonYear}.`;
        setSyncSummary(msg);
        if (!silent) showToast(msg);
      } else if (!silent) {
        const msg =
          data.message ||
          'Nessun nuovo boxscore trovato al momento sulle API pubbliche; mantenuto dataset 2026–27.';
        setSyncSummary(msg);
        showToast(msg);
      }
    } catch {
      if (!silent) showToast('Sincronizzazione API live temporaneamente non disponibile.');
    } finally {
      setSyncingLive(false);
    }
  }

  function handleOpenPlayer(playerId: string) {
    setSelectedPlayerId(playerId);
    setActiveRoute('dossier');
    setShowQuickJump(false);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleCompareFromDossier(playerId: string) {
    setCompareAId(playerId);
    if (compareBId === playerId) {
      const alt = allPlayers.find((p) => p.id !== playerId);
      if (alt) setCompareBId(alt.id);
    }
    setActiveRoute('compare');
  }

  function handleComparePair(playerAId: string, playerBId: string) {
    setCompareAId(playerAId);
    setCompareBId(playerBId);
    setActiveRoute('compare');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleToggleShortlist(playerId: string) {
    if (!/^[a-zA-Z0-9_-]{2,128}$/.test(playerId)) return;
    const exists = shortlist.includes(playerId);
    if (!exists && shortlist.length >= 50) {
      showToast('Limite massimo raggiunto: 50 giocatori nella Shortlist.');
      return;
    }

    const next = exists
      ? shortlist.filter((id) => id !== playerId)
      : [playerId, ...shortlist].slice(0, 50);

    setShortlist(next);

    if (user && user.emailVerified) {
      const userRef = doc(db, 'users', user.uid);
      const path = `users/${user.uid}`;
      try {
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          await updateDoc(userRef, {
            shortlist: next,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(userRef, {
            uid: user.uid,
            displayName: (user.displayName || 'Scout').trim().slice(0, 80),
            shortlist: next,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    } else {
      try {
        localStorage.setItem(GUEST_SHORTLIST_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
    }
  }

  const handleLiveShotsLoaded = useCallback(
    (
      playerId: string,
      shots: ShotEvent[],
      shotZones: ShotZoneSummary[],
      shotGames: ShotGameSummary[],
      shotsSource: 'pbp' | 'model'
    ) => {
      setBaseRoster((prev) =>
        prev.map((p) =>
          p.id === playerId ? { ...p, shots, shotZones, shotGames, shotsSource } : p
        )
      );
      setCustomPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId ? { ...p, shots, shotZones, shotGames, shotsSource } : p
        )
      );
    },
    []
  );

  const navItems: Array<{ id: Exclude<ActiveRoute, 'dossier'>; label: string; icon: React.ReactNode }> = [
    { id: 'watchlist', label: 'Watchlist & Dati', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'schedule', label: 'Calendario & Recap', icon: <CalendarDays className="w-4 h-4" /> },
    { id: 'leaderboard', label: 'Leaderboard & Scatter', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'bigboard', label: 'Big Board & Tier', icon: <ListOrdered className="w-4 h-4" /> },
    { id: 'feed', label: 'Feed Scouting', icon: <MessageSquareText className="w-4 h-4" /> },
    { id: 'compare', label: 'Confronto 1v1', icon: <GitCompare className="w-4 h-4" /> },
    { id: 'api-search', label: 'Cerca & Aggiungi API', icon: <UserPlus className="w-4 h-4" /> },
  ];

  const breadcrumbLabel =
    activeRoute === 'watchlist'
      ? 'Watchlist'
      : activeRoute === 'schedule'
        ? 'Calendario CET & Recap'
        : activeRoute === 'leaderboard'
          ? 'Leaderboard & Scatter 2D'
          : activeRoute === 'bigboard'
            ? 'Big Board & Tier'
            : activeRoute === 'feed'
              ? 'Feed Scouting Community'
              : activeRoute === 'compare'
                ? 'Confronto 1v1'
                : activeRoute === 'api-search'
                  ? 'Ricerca API NCAA'
                  : selectedPlayer?.name || 'Scheda Giocatore';

  const italianCount = allPlayers.filter((p) => p.isItalian).length;
  const draftCount = allPlayers.filter((p) => Boolean(p.draftRank)).length;

  return (
    <div className="min-h-screen bg-[#0A0E14] text-[#F1F5F9] flex">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-[#0E141E] border-r border-white/8 sticky top-0 h-screen">
        <div className="px-5 h-16 flex items-center border-b border-white/8">
          <button
            type="button"
            onClick={() => setActiveRoute('watchlist')}
            className="font-display text-2xl font-bold tracking-wide text-white whitespace-nowrap"
          >
            HoopScope <span className="text-[#F97316]">NCAA</span>
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = activeRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveRoute(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#192231] text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/4'
                }`}
              >
                <span className={active ? 'text-[#F97316]' : 'text-slate-500'}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/8 space-y-3">
          <div className="text-xs text-slate-400 space-y-1">
            <div className="flex justify-between font-mono-tabular">
              <span>Italiani D1</span>
              <span className="text-sky-400 font-semibold">{italianCount}</span>
            </div>
            <div className="flex justify-between font-mono-tabular">
              <span>Prospetti Draft 2027</span>
              <span className="text-orange-400 font-semibold">{draftCount}</span>
            </div>
            <div className="flex justify-between font-mono-tabular">
              <span>Totale Monitorati</span>
              <span className="text-white font-semibold">{allPlayers.length}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleSyncLiveApis(false)}
            disabled={syncingLive}
            className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium bg-[#121822] hover:bg-[#192231] text-slate-200 border border-white/10 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingLive ? 'animate-spin text-[#F97316]' : ''}`} />
            {syncingLive ? 'Sincronizzazione...' : 'Sincronizza API Live'}
          </button>

          {syncSummary && (
            <p className="text-[11px] text-slate-400 leading-snug">{syncSummary}</p>
          )}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/70" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 max-w-[85vw] bg-[#0E141E] border-r border-white/10 h-full flex flex-col z-10">
            <div className="px-5 h-16 flex items-center justify-between border-b border-white/8">
              <span className="font-display text-2xl font-bold tracking-wide text-white">
                HoopScope <span className="text-[#F97316]">NCAA</span>
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const active = activeRoute === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveRoute(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      active ? 'bg-[#192231] text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className={active ? 'text-[#F97316]' : 'text-slate-500'}>{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-white/8">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void handleSyncLiveApis(false);
                }}
                disabled={syncingLive}
                className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium bg-[#121822] text-slate-200 border border-white/10 rounded-lg"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingLive ? 'animate-spin' : ''}`} />
                Sincronizza API Live
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar (3-Zone SaaS Contract) */}
        <header className="h-16 bg-[#0A0E14]/95 backdrop-blur border-b border-white/8 sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between gap-6">
          {/* Zone 1: Mobile Menu + Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Apri menu"
              className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <button
                type="button"
                onClick={() => setActiveRoute('watchlist')}
                className="text-slate-400 hover:text-white transition-colors whitespace-nowrap hidden sm:inline"
              >
                Stagione 2026–27
              </button>
              <span className="text-slate-600 hidden sm:inline">/</span>
              <span className="font-semibold text-white truncate">{breadcrumbLabel}</span>
            </div>
          </div>

          {/* Zone 2: Global Quick Search */}
          <div className="relative flex-1 max-w-md hidden md:block">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={globalQuery}
              onFocus={() => setShowQuickJump(true)}
              onBlur={() => setTimeout(() => setShowQuickJump(false), 180)}
              onChange={(e) => {
                setGlobalQuery(e.target.value);
                setShowQuickJump(true);
              }}
              placeholder="Cerca rapidamente un giocatore (es. Sarr, Stokes, Suigo)..."
              className="w-full bg-[#121822] border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F97316]"
            />

            {showQuickJump && quickJumpMatches.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 bg-[#121822] border border-white/12 rounded-xl shadow-2xl overflow-hidden z-40">
                {quickJumpMatches.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={() => handleOpenPlayer(p.id)}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-white/6 flex items-center justify-between gap-3 border-b border-white/6 last:border-b-0"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">{p.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {p.team} · {p.conference} · {p.position}
                      </div>
                    </div>
                    <span className="font-mono-tabular text-xs text-emerald-400 font-medium">
                      {p.pts.toFixed(1)} PTS
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Zone 3: Account Action */}
          <div className="flex items-center gap-3 shrink-0">
            {!authReady ? (
              <div className="w-24 h-8 bg-[#121822] rounded-lg animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-300 hidden sm:inline truncate max-w-[140px]">
                  {user.displayName || 'Scout'}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#121822] border border-white/10 rounded-lg transition-colors whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Esci
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#F97316] hover:bg-[#EA580C] text-white rounded-lg transition-colors whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5" />
                Accedi Google
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {activeRoute === 'watchlist' && (
            <WatchlistTable
              players={allPlayers}
              percentilesMap={allPercentilesMap}
              minMinutes={minMinutes}
              onChangeMinMinutes={setMinMinutes}
              shortlist={shortlist}
              onToggleShortlist={(id) => void handleToggleShortlist(id)}
              onSelectPlayer={handleOpenPlayer}
              globalQuery={globalQuery}
            />
          )}

          {activeRoute === 'schedule' && (
            <ScheduleRecapView
              players={allPlayers}
              shortlist={shortlist}
              onToggleShortlist={(id) => void handleToggleShortlist(id)}
              onSelectPlayer={handleOpenPlayer}
            />
          )}

          {activeRoute === 'leaderboard' && (
            <LeaderboardView
              players={allPlayers}
              percentilesMap={allPercentilesMap}
              minMinutes={minMinutes}
              onChangeMinMinutes={setMinMinutes}
              shortlist={shortlist}
              onToggleShortlist={(id) => void handleToggleShortlist(id)}
              onSelectPlayer={handleOpenPlayer}
            />
          )}

          {activeRoute === 'bigboard' && (
            <BigBoardView
              players={allPlayers}
              user={user}
              onSignIn={handleSignIn}
              onSelectPlayer={handleOpenPlayer}
              onNotify={showToast}
            />
          )}

          {activeRoute === 'feed' && (
            <ScoutingFeedView players={allPlayers} onSelectPlayer={handleOpenPlayer} />
          )}

          {activeRoute === 'compare' && (
            <CompareView
              players={allPlayers}
              percentilesMap={allPercentilesMap}
              minMinutes={minMinutes}
              playerAId={compareAId}
              playerBId={compareBId}
              onChangeA={setCompareAId}
              onChangeB={setCompareBId}
              onOpenPlayer={handleOpenPlayer}
            />
          )}

          {activeRoute === 'api-search' && (
            <ApiSearchView
              existingPlayers={allPlayers}
              customPlayers={customPlayers}
              user={user}
              onSignIn={handleSignIn}
              onSelectPlayer={handleOpenPlayer}
              onNotify={showToast}
            />
          )}

          {activeRoute === 'dossier' && selectedPlayer && (
            <PlayerDossier
              player={selectedPlayer}
              allPlayers={allPlayers}
              allPercentiles={allPercentilesMap[selectedPlayer.id]}
              posPercentiles={posPercentilesMap[selectedPlayer.id]}
              minMinutes={minMinutes}
              isShortlisted={shortlist.includes(selectedPlayer.id)}
              onToggleShortlist={(id) => void handleToggleShortlist(id)}
              user={user}
              onBack={() => setActiveRoute('watchlist')}
              onSelectPlayer={handleOpenPlayer}
              onCompare={handleCompareFromDossier}
              onComparePair={handleComparePair}
              onSignIn={handleSignIn}
              onNotify={showToast}
              onLiveShotsLoaded={handleLiveShotsLoaded}
            />
          )}
        </main>
      </div>

      {/* Non-intrusive Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 max-w-sm bg-[#192231] border border-white/15 text-slate-100 text-xs px-4 py-3 rounded-xl shadow-2xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
