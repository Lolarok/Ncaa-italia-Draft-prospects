import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  NoteTag,
  PlayerProfile,
  ScoutGrade,
  ScoutingNote,
  ScoutingVideo,
  VideoCategory,
} from '../types/basketball';
import { getYouTubeEmbedUrl } from '../utils/analytics';
import { ExternalLink, FileText, Film, Play, Search } from 'lucide-react';

interface ScoutingFeedViewProps {
  players: PlayerProfile[];
  onSelectPlayer: (playerId: string) => void;
}

type FeedTypeFilter = 'all' | 'notes' | 'videos';
type FeedGroupFilter = 'all' | 'italian' | 'draft2027';

type FeedEntry =
  | { kind: 'note'; id: string; createdAt: Date | null; data: ScoutingNote }
  | { kind: 'video'; id: string; createdAt: Date | null; data: ScoutingVideo };

export const ScoutingFeedView: React.FC<ScoutingFeedViewProps> = ({ players, onSelectPlayer }) => {
  const [notes, setNotes] = useState<ScoutingNote[]>([]);
  const [videos, setVideos] = useState<ScoutingVideo[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(true);

  const [typeFilter, setTypeFilter] = useState<FeedTypeFilter>('all');
  const [groupFilter, setGroupFilter] = useState<FeedGroupFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);

  const playerMap = useMemo(() => {
    const map = new Map<string, PlayerProfile>();
    for (const p of players) map.set(p.id, p);
    return map;
  }, [players]);

  useEffect(() => {
    const notesPath = 'scouting_notes';
    const unsubNotes = onSnapshot(
      query(collection(db, notesPath), where('visibility', '==', 'public')),
      (snap) => {
        const items: ScoutingNote[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            playerId: String(data.playerId || ''),
            authorUid: String(data.authorUid || ''),
            authorName: String(data.authorName || 'Scout'),
            title: String(data.title || ''),
            content: String(data.content || ''),
            tags: Array.isArray(data.tags) ? (data.tags as NoteTag[]) : [],
            grade: (data.grade as ScoutGrade) || 'Da Valutare',
            visibility: 'public',
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
          };
        });
        setNotes(items);
        setLoadingNotes(false);
      },
      (err) => {
        setLoadingNotes(false);
        handleFirestoreError(err, OperationType.LIST, notesPath);
      }
    );

    const videosPath = 'scouting_videos';
    const unsubVideos = onSnapshot(
      query(collection(db, videosPath), where('visibility', '==', 'public')),
      (snap) => {
        const items: ScoutingVideo[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            playerId: String(data.playerId || ''),
            authorUid: String(data.authorUid || ''),
            authorName: String(data.authorName || 'Scout'),
            title: String(data.title || ''),
            url: String(data.url || ''),
            category: (data.category as VideoCategory) || 'Highlights',
            timestampLabel: String(data.timestampLabel || ''),
            notes: String(data.notes || ''),
            visibility: 'public',
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
          };
        });
        setVideos(items);
        setLoadingVideos(false);
      },
      (err) => {
        setLoadingVideos(false);
        handleFirestoreError(err, OperationType.LIST, videosPath);
      }
    );

    return () => {
      unsubNotes();
      unsubVideos();
    };
  }, []);

  const unifiedFeed = useMemo(() => {
    const entries: FeedEntry[] = [];
    if (typeFilter === 'all' || typeFilter === 'notes') {
      for (const n of notes) {
        entries.push({ kind: 'note', id: `n-${n.id}`, createdAt: n.createdAt, data: n });
      }
    }
    if (typeFilter === 'all' || typeFilter === 'videos') {
      for (const v of videos) {
        entries.push({ kind: 'video', id: `v-${v.id}`, createdAt: v.createdAt, data: v });
      }
    }

    const q = searchQuery.trim().toLowerCase();

    return entries
      .filter((entry) => {
        const player = playerMap.get(entry.data.playerId);
        if (groupFilter === 'italian' && !player?.isItalian) return false;
        if (groupFilter === 'draft2027' && !player?.draftRank) return false;

        if (q) {
          const playerHay = player ? `${player.name} ${player.team} ${player.conference}` : entry.data.playerId;
          const entryHay =
            entry.kind === 'note'
              ? `${entry.data.title} ${entry.data.content} ${entry.data.authorName} ${entry.data.grade} ${entry.data.tags.join(' ')}`
              : `${entry.data.title} ${entry.data.notes} ${entry.data.authorName} ${entry.data.category}`;
          if (!`${playerHay} ${entryHay}`.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }, [notes, videos, typeFilter, groupFilter, searchQuery, playerMap]);

  const loading = loadingNotes || loadingVideos;

  return (
    <div className="space-y-6">
      <div className="bg-[#121822] border border-white/8 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wide text-white">
              Feed Scouting Community
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Ultime note tecniche e clip video caricate dagli osservatori su tutta la watchlist 2026–27
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono-tabular text-slate-400">
            <span>
              <strong className="text-white">{notes.length}</strong> Note
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-white">{videos.length}</strong> Video
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8">
            {(
              [
                { id: 'all', label: 'Tutto' },
                { id: 'notes', label: 'Solo Note' },
                { id: 'videos', label: 'Solo Video' },
              ] as Array<{ id: FeedTypeFilter; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTypeFilter(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  typeFilter === opt.id ? 'bg-[#F97316] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8">
            {(
              [
                { id: 'all', label: 'Tutti i Gruppi' },
                { id: 'italian', label: 'Italiani D1' },
                { id: 'draft2027', label: 'Draft 2027' },
              ] as Array<{ id: FeedGroupFilter; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setGroupFilter(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  groupFilter === opt.id ? 'bg-[#192231] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtra per giocatore, scout, tag o parola chiave..."
              className="w-full bg-[#0A0E14] border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F97316]"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-[#121822] border border-white/8 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : unifiedFeed.length === 0 ? (
        <div className="bg-[#121822] border border-white/8 rounded-xl p-10 text-center space-y-2">
          <p className="text-sm text-slate-200 font-medium">
            Nessun contributo trovato con i filtri selezionati.
          </p>
          <p className="text-xs text-slate-400">
            Apri la scheda di qualsiasi giocatore dalla Watchlist per pubblicare la prima nota tecnica o allegare una clip YouTube.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {unifiedFeed.map((entry) => {
            const player = playerMap.get(entry.data.playerId);
            const dateText = entry.createdAt
              ? entry.createdAt.toLocaleDateString('it-IT', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : 'Recente';

            if (entry.kind === 'note') {
              const note = entry.data;
              return (
                <article
                  key={entry.id}
                  className="bg-[#121822] border border-white/8 rounded-xl p-5 space-y-3 hover:border-white/15 transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="inline-flex items-center gap-1 text-sky-400 font-medium">
                          <FileText className="w-3.5 h-3.5" />
                          Nota Scouting
                        </span>
                        <span aria-hidden="true">·</span>
                        {player ? (
                          <button
                            type="button"
                            onClick={() => onSelectPlayer(player.id)}
                            className="font-semibold text-white hover:text-[#F97316] transition-colors"
                          >
                            {player.name} ({player.team})
                          </button>
                        ) : (
                          <span className="text-slate-300">{note.playerId}</span>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="text-orange-400 font-medium">{note.grade}</span>
                      </div>
                      <h2 className="text-base font-semibold text-white">{note.title}</h2>
                    </div>

                    <div className="text-right text-xs text-slate-400 shrink-0">
                      <div className="text-slate-300 font-medium">{note.authorName}</div>
                      <div className="font-mono-tabular text-[11px]">{dateText}</div>
                    </div>
                  </div>

                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{note.content}</p>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-white/6 text-xs">
                    <span className="text-slate-400">{note.tags.join(' · ')}</span>
                    {player && (
                      <button
                        type="button"
                        onClick={() => onSelectPlayer(player.id)}
                        className="text-orange-400 hover:text-orange-300 font-medium"
                      >
                        Apri Dossier →
                      </button>
                    )}
                  </div>
                </article>
              );
            }

            const vid = entry.data;
            const embedUrl = getYouTubeEmbedUrl(vid.url, vid.timestampLabel);
            const isExpanded = expandedVideoId === vid.id;

            return (
              <article
                key={entry.id}
                className="bg-[#121822] border border-white/8 rounded-xl p-5 space-y-3 hover:border-white/15 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1 text-orange-400 font-medium">
                        <Film className="w-3.5 h-3.5" />
                        Clip Video · {vid.category}
                      </span>
                      <span aria-hidden="true">·</span>
                      {player ? (
                        <button
                          type="button"
                          onClick={() => onSelectPlayer(player.id)}
                          className="font-semibold text-white hover:text-[#F97316] transition-colors"
                        >
                          {player.name} ({player.team})
                        </button>
                      ) : (
                        <span className="text-slate-300">{vid.playerId}</span>
                      )}
                      {vid.timestampLabel && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular text-slate-200">@ {vid.timestampLabel}</span>
                        </>
                      )}
                    </div>
                    <h2 className="text-base font-semibold text-white">{vid.title}</h2>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {embedUrl && (
                      <button
                        type="button"
                        onClick={() => setExpandedVideoId(isExpanded ? null : vid.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#192231] hover:bg-[#243248] text-white border border-white/10 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5" />
                        {isExpanded ? 'Chiudi Player' : 'Guarda qui'}
                      </button>
                    )}
                    <a
                      href={vid.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white border border-white/10 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Apri
                    </a>
                  </div>
                </div>

                {vid.notes && <p className="text-xs text-slate-300 leading-relaxed">{vid.notes}</p>}

                {embedUrl && isExpanded && (
                  <div className="aspect-video w-full rounded-lg overflow-hidden border border-white/10 bg-black">
                    <iframe
                      src={embedUrl}
                      title={vid.title}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-white/6 text-xs text-slate-400">
                  <span>
                    Caricato da <strong className="text-slate-200">{vid.authorName}</strong> ·{' '}
                    <span className="font-mono-tabular">{dateText}</span>
                  </span>
                  {player && (
                    <button
                      type="button"
                      onClick={() => onSelectPlayer(player.id)}
                      className="text-orange-400 hover:text-orange-300 font-medium"
                    >
                      Apri Dossier →
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
