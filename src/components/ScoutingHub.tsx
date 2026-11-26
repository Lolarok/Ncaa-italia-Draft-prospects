import React, { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  NOTE_TAGS,
  NoteTag,
  PlayerProfile,
  SCOUT_GRADES,
  ScoutGrade,
  ScoutingNote,
  ScoutingVideo,
  VIDEO_CATEGORIES,
  VideoCategory,
} from '../types/basketball';
import { getYouTubeEmbedUrl } from '../utils/analytics';
import { ExternalLink, FileText, Film, LogIn, Pencil, Play, Plus, Trash2 } from 'lucide-react';

interface ScoutingHubProps {
  player: PlayerProfile;
  user: User | null;
  onSignIn: () => void;
  onNotify: (msg: string) => void;
}

function makeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

export const ScoutingHub: React.FC<ScoutingHubProps> = ({ player, user, onSignIn, onNotify }) => {
  const [activeTab, setActiveTab] = useState<'notes' | 'videos'>('notes');
  const [notes, setNotes] = useState<ScoutingNote[]>([]);
  const [videos, setVideos] = useState<ScoutingVideo[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(true);

  // Create Note form state
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteGrade, setNoteGrade] = useState<ScoutGrade>('Primo Giro');
  const [selectedTags, setSelectedTags] = useState<NoteTag[]>(['Proiezione NBA']);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [submittingNote, setSubmittingNote] = useState(false);

  // Inline Edit Note state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteTitle, setEditNoteTitle] = useState('');
  const [editNoteContent, setEditNoteContent] = useState('');
  const [editNoteGrade, setEditNoteGrade] = useState<ScoutGrade>('Primo Giro');
  const [editNoteTags, setEditNoteTags] = useState<NoteTag[]>([]);
  const [editNoteError, setEditNoteError] = useState<string | null>(null);
  const [savingEditNote, setSavingEditNote] = useState(false);

  // Create Video form state
  const [showVideoForm, setShowVideoForm] = useState(false);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoCategory, setVideoCategory] = useState<VideoCategory>('Highlights');
  const [videoTimestamp, setVideoTimestamp] = useState('');
  const [videoNotes, setVideoNotes] = useState('');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [submittingVideo, setSubmittingVideo] = useState(false);
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);

  // Inline Edit Video state
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [editVideoTitle, setEditVideoTitle] = useState('');
  const [editVideoUrl, setEditVideoUrl] = useState('');
  const [editVideoCategory, setEditVideoCategory] = useState<VideoCategory>('Highlights');
  const [editVideoTimestamp, setEditVideoTimestamp] = useState('');
  const [editVideoNotes, setEditVideoNotes] = useState('');
  const [editVideoError, setEditVideoError] = useState<string | null>(null);
  const [savingEditVideo, setSavingEditVideo] = useState(false);

  useEffect(() => {
    setEditingNoteId(null);
    setEditingVideoId(null);
    setLoadingNotes(true);
    const notesPath = 'scouting_notes';
    const notesQuery = query(
      collection(db, notesPath),
      where('visibility', '==', 'public'),
      where('playerId', '==', player.id)
    );

    const unsubNotes = onSnapshot(
      notesQuery,
      (snap) => {
        const items: ScoutingNote[] = snap.docs
          .map((d) => {
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
              visibility: 'public' as const,
              createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
              updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
            };
          })
          .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
        setNotes(items);
        setLoadingNotes(false);
      },
      (err) => {
        setLoadingNotes(false);
        handleFirestoreError(err, OperationType.LIST, notesPath);
      }
    );

    setLoadingVideos(true);
    const videosPath = 'scouting_videos';
    const videosQuery = query(
      collection(db, videosPath),
      where('visibility', '==', 'public'),
      where('playerId', '==', player.id)
    );

    const unsubVideos = onSnapshot(
      videosQuery,
      (snap) => {
        const items: ScoutingVideo[] = snap.docs
          .map((d) => {
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
              visibility: 'public' as const,
              createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
            };
          })
          .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
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
  }, [player.id]);

  function toggleTag(tag: NoteTag) {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= 5) return prev;
      return [...prev, tag];
    });
  }

  function toggleEditTag(tag: NoteTag) {
    setEditNoteTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= 5) return prev;
      return [...prev, tag];
    });
  }

  function startEditingNote(note: ScoutingNote) {
    setEditingNoteId(note.id);
    setEditNoteTitle(note.title);
    setEditNoteContent(note.content);
    setEditNoteGrade(note.grade);
    setEditNoteTags(note.tags);
    setEditNoteError(null);
  }

  async function handleUpdateNote(e: React.FormEvent, noteId: string) {
    e.preventDefault();
    if (!user) return;
    const cleanTitle = editNoteTitle.trim().slice(0, 120);
    const cleanContent = editNoteContent.trim().slice(0, 2000);
    if (cleanTitle.length < 2) {
      setEditNoteError('Inserisci un titolo di almeno 2 caratteri.');
      return;
    }
    if (cleanContent.length < 5) {
      setEditNoteError('Inserisci una nota tecnica di almeno 5 caratteri.');
      return;
    }

    setEditNoteError(null);
    setSavingEditNote(true);
    const path = `scouting_notes/${noteId}`;
    try {
      await updateDoc(doc(db, 'scouting_notes', noteId), {
        title: cleanTitle,
        content: cleanContent,
        tags: editNoteTags.slice(0, 5),
        grade: editNoteGrade,
        updatedAt: serverTimestamp(),
      });
      setEditingNoteId(null);
      onNotify('Nota di scouting aggiornata.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setSavingEditNote(false);
    }
  }

  async function handleSaveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      onSignIn();
      return;
    }

    const cleanTitle = noteTitle.trim().slice(0, 120);
    const cleanContent = noteContent.trim().slice(0, 2000);
    if (cleanTitle.length < 2) {
      setNoteError('Inserisci un titolo di almeno 2 caratteri.');
      return;
    }
    if (cleanContent.length < 5) {
      setNoteError('Inserisci una nota tecnica di almeno 5 caratteri.');
      return;
    }

    setNoteError(null);
    setSubmittingNote(true);
    const noteId = makeDocId('note');
    const path = `scouting_notes/${noteId}`;

    try {
      await setDoc(doc(db, 'scouting_notes', noteId), {
        playerId: player.id,
        authorUid: user.uid,
        authorName: (user.displayName || 'Scout').trim().slice(0, 80),
        title: cleanTitle,
        content: cleanContent,
        tags: selectedTags.slice(0, 5),
        grade: noteGrade,
        visibility: 'public',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNoteTitle('');
      setNoteContent('');
      setSelectedTags(['Proiezione NBA']);
      setShowNoteForm(false);
      onNotify('Nota di scouting salvata nel cloud condiviso.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setSubmittingNote(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    const path = `scouting_notes/${noteId}`;
    try {
      await deleteDoc(doc(db, 'scouting_notes', noteId));
      if (editingNoteId === noteId) setEditingNoteId(null);
      onNotify('Nota rimossa.');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }

  function startEditingVideo(vid: ScoutingVideo) {
    setEditingVideoId(vid.id);
    setEditVideoTitle(vid.title);
    setEditVideoUrl(vid.url);
    setEditVideoCategory(vid.category);
    setEditVideoTimestamp(vid.timestampLabel);
    setEditVideoNotes(vid.notes);
    setEditVideoError(null);
  }

  async function handleUpdateVideo(e: React.FormEvent, videoId: string) {
    e.preventDefault();
    if (!user) return;
    const cleanTitle = editVideoTitle.trim().slice(0, 120);
    const cleanUrl = editVideoUrl.trim().slice(0, 500);
    const cleanTs = editVideoTimestamp.trim().slice(0, 20);
    const cleanNotes = editVideoNotes.trim().slice(0, 600);

    if (cleanTitle.length < 2) {
      setEditVideoError('Inserisci un titolo per la clip (min 2 caratteri).');
      return;
    }
    if (!cleanUrl.startsWith('https://') || cleanUrl.length < 10) {
      setEditVideoError('Inserisci un link valido che inizi con https://.');
      return;
    }

    setEditVideoError(null);
    setSavingEditVideo(true);
    const path = `scouting_videos/${videoId}`;
    try {
      await updateDoc(doc(db, 'scouting_videos', videoId), {
        title: cleanTitle,
        url: cleanUrl,
        category: editVideoCategory,
        timestampLabel: cleanTs,
        notes: cleanNotes,
      });
      setEditingVideoId(null);
      onNotify('Clip video aggiornata.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setSavingEditVideo(false);
    }
  }

  async function handleSaveVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      onSignIn();
      return;
    }

    const cleanTitle = videoTitle.trim().slice(0, 120);
    const cleanUrl = videoUrl.trim().slice(0, 500);
    const cleanTs = videoTimestamp.trim().slice(0, 20);
    const cleanNotes = videoNotes.trim().slice(0, 600);

    if (cleanTitle.length < 2) {
      setVideoError('Inserisci un titolo per la clip (min 2 caratteri).');
      return;
    }
    if (!cleanUrl.startsWith('https://') || cleanUrl.length < 10) {
      setVideoError('Inserisci un link valido che inizi con https:// (es. YouTube, Hudl, X, Vimeo).');
      return;
    }

    setVideoError(null);
    setSubmittingVideo(true);
    const videoId = makeDocId('vid');
    const path = `scouting_videos/${videoId}`;

    try {
      await setDoc(doc(db, 'scouting_videos', videoId), {
        playerId: player.id,
        authorUid: user.uid,
        authorName: (user.displayName || 'Scout').trim().slice(0, 80),
        title: cleanTitle,
        url: cleanUrl,
        category: videoCategory,
        timestampLabel: cleanTs,
        notes: cleanNotes,
        visibility: 'public',
        createdAt: serverTimestamp(),
      });
      setVideoTitle('');
      setVideoUrl('');
      setVideoTimestamp('');
      setVideoNotes('');
      setShowVideoForm(false);
      onNotify('Video salvato nella sala scouting.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setSubmittingVideo(false);
    }
  }

  async function handleDeleteVideo(videoId: string) {
    const path = `scouting_videos/${videoId}`;
    try {
      await deleteDoc(doc(db, 'scouting_videos', videoId));
      if (editingVideoId === videoId) setEditingVideoId(null);
      onNotify('Clip video eliminata.');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }

  return (
    <div className="bg-[#121822] border border-white/8 rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-4">
        <div>
          <h3 className="font-display text-xl font-bold tracking-wide text-slate-100">
            Sala Scouting — Note & Video Collaborativi
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Archivio condiviso sincronizzato su Firebase per {player.name}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex bg-[#0A0E14] p-1 rounded-lg border border-white/8">
            <button
              type="button"
              onClick={() => setActiveTab('notes')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'notes' ? 'bg-[#F97316] text-white' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Note ({notes.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('videos')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'videos' ? 'bg-[#F97316] text-white' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              Video ({videos.length})
            </button>
          </div>

          {user ? (
            <button
              type="button"
              onClick={() => {
                if (activeTab === 'notes') setShowNoteForm((v) => !v);
                else setShowVideoForm((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#192231] hover:bg-[#233146] text-white border border-white/10 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              {activeTab === 'notes' ? 'Nuova Nota' : 'Aggiungi Video'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#F97316] hover:bg-[#EA580C] text-white rounded-lg transition-colors whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5" />
              Accedi con Google per scrivere
            </button>
          )}
        </div>
      </div>

      {/* NOTES TAB */}
      {activeTab === 'notes' && (
        <div className="space-y-4">
          {showNoteForm && user && (
            <form
              onSubmit={handleSaveNote}
              className="bg-[#0A0E14] border border-white/10 rounded-xl p-4 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5">Titolo osservazione</label>
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    maxLength={120}
                    placeholder="Es. Lettura del pick & roll centrale contro drop coverage"
                    className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F97316]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Proiezione / Fascia</label>
                  <select
                    value={noteGrade}
                    onChange={(e) => setNoteGrade(e.target.value as ScoutGrade)}
                    className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F97316]"
                  >
                    {SCOUT_GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <span>Tag tecnici (max 5)</span>
                  <span className="font-mono-tabular">{selectedTags.length}/5</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {NOTE_TAGS.map((tag) => {
                    const active = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-[#F97316]/20 border-[#F97316] text-orange-200'
                            : 'bg-[#121822] border-white/10 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Analisi tecnica (punti di forza, aree di crescita, contesto)
                </label>
                <textarea
                  rows={4}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  maxLength={2000}
                  placeholder="Annota dettagli su meccanica di tiro, footwork difensivo, decision making, tenuta fisica..."
                  className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F97316]"
                />
              </div>

              {noteError && <p className="text-xs text-rose-400">{noteError}</p>}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNoteForm(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={submittingNote}
                  className="px-4 py-2 text-xs font-medium bg-[#F97316] hover:bg-[#EA580C] text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {submittingNote ? 'Salvataggio...' : 'Pubblica Nota'}
                </button>
              </div>
            </form>
          )}

          {loadingNotes ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 bg-[#0A0E14] border border-white/6 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : notes.length === 0 ? (
            <div className="bg-[#0A0E14] border border-white/8 rounded-xl p-8 text-center space-y-3">
              <p className="text-sm text-slate-300">
                Nessuna nota di scouting ancora pubblicata per {player.name}.
              </p>
              <p className="text-xs text-slate-500">
                Le note aggiunte vengono salvate su Firestore e condivise con tutti gli osservatori.
              </p>
              <button
                type="button"
                onClick={() => (user ? setShowNoteForm(true) : onSignIn())}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#F97316] hover:bg-[#EA580C] text-white rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {user ? 'Scrivi la prima nota' : 'Accedi con Google per scrivere'}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/8 border-t border-b border-white/8">
              {notes.map((note) => {
                const isEditing = editingNoteId === note.id;
                const isEdited =
                  note.createdAt &&
                  note.updatedAt &&
                  note.updatedAt.getTime() - note.createdAt.getTime() > 5000;

                if (isEditing) {
                  return (
                    <form
                      key={note.id}
                      onSubmit={(e) => void handleUpdateNote(e, note.id)}
                      className="py-4 bg-[#0A0E14] border border-orange-500/35 rounded-xl p-4 my-3 space-y-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                          <label className="block text-xs text-slate-400 mb-1">Titolo osservazione</label>
                          <input
                            type="text"
                            value={editNoteTitle}
                            onChange={(e) => setEditNoteTitle(e.target.value)}
                            maxLength={120}
                            className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F97316]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Proiezione / Fascia</label>
                          <select
                            value={editNoteGrade}
                            onChange={(e) => setEditNoteGrade(e.target.value as ScoutGrade)}
                            className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F97316]"
                          >
                            {SCOUT_GRADES.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                          <span>Tag tecnici (max 5)</span>
                          <span className="font-mono-tabular">{editNoteTags.length}/5</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {NOTE_TAGS.map((tag) => {
                            const active = editNoteTags.includes(tag);
                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => toggleEditTag(tag)}
                                className={`px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap ${
                                  active
                                    ? 'bg-[#F97316]/20 border-[#F97316] text-orange-200'
                                    : 'bg-[#121822] border-white/10 text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Analisi tecnica</label>
                        <textarea
                          rows={4}
                          value={editNoteContent}
                          onChange={(e) => setEditNoteContent(e.target.value)}
                          maxLength={2000}
                          className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F97316]"
                        />
                      </div>

                      {editNoteError && <p className="text-xs text-rose-400">{editNoteError}</p>}

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingNoteId(null)}
                          className="px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                        >
                          Annulla
                        </button>
                        <button
                          type="submit"
                          disabled={savingEditNote}
                          className="px-4 py-1.5 text-xs font-medium bg-[#F97316] hover:bg-[#EA580C] text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          {savingEditNote ? 'Salvataggio...' : 'Salva modifiche'}
                        </button>
                      </div>
                    </form>
                  );
                }

                return (
                  <article key={note.id} className="py-4 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-semibold text-white">{note.title}</h4>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span className="text-slate-300 font-medium">{note.authorName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-orange-400 font-medium">{note.grade}</span>
                          {note.createdAt && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-tabular">
                                {note.createdAt.toLocaleDateString('it-IT', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            </>
                          )}
                          {isEdited && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-slate-500">modificata</span>
                            </>
                          )}
                        </div>
                      </div>

                      {user && user.uid === note.authorUid && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditingNote(note)}
                            title="Modifica nota"
                            className="p-1.5 text-slate-500 hover:text-orange-400 transition-colors rounded-md"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(note.id)}
                            title="Elimina nota"
                            className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors rounded-md"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{note.content}</p>

                    {note.tags.length > 0 && (
                      <div className="text-xs text-slate-400 pt-1">
                        {note.tags.join(' · ')}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIDEOS TAB */}
      {activeTab === 'videos' && (
        <div className="space-y-4">
          {showVideoForm && user && (
            <form
              onSubmit={handleSaveVideo}
              className="bg-[#0A0E14] border border-white/10 rounded-xl p-4 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5">Titolo clip o partita</label>
                  <input
                    type="text"
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    maxLength={120}
                    placeholder="Es. vs Kansas — Tutte le difese sul perimetro e transizioni"
                    className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F97316]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Categoria</label>
                  <select
                    value={videoCategory}
                    onChange={(e) => setVideoCategory(e.target.value as VideoCategory)}
                    className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F97316]"
                  >
                    {VIDEO_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Link video HTTPS (YouTube embedded automatico, Hudl, Vimeo, X)
                  </label>
                  <input
                    type="url"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    maxLength={500}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F97316]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Timestamp (opzionale)</label>
                  <input
                    type="text"
                    value={videoTimestamp}
                    onChange={(e) => setVideoTimestamp(e.target.value)}
                    maxLength={20}
                    placeholder="Es. 1:24"
                    className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F97316]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Nota tattica (opzionale)</label>
                <textarea
                  rows={2}
                  value={videoNotes}
                  onChange={(e) => setVideoNotes(e.target.value)}
                  maxLength={600}
                  placeholder="Cosa osservare in questa sequenza..."
                  className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F97316]"
                />
              </div>

              {videoError && <p className="text-xs text-rose-400">{videoError}</p>}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVideoForm(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={submittingVideo}
                  className="px-4 py-2 text-xs font-medium bg-[#F97316] hover:bg-[#EA580C] text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {submittingVideo ? 'Salvataggio...' : 'Salva Video'}
                </button>
              </div>
            </form>
          )}

          {loadingVideos ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 bg-[#0A0E14] border border-white/6 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="bg-[#0A0E14] border border-white/8 rounded-xl p-8 text-center space-y-3">
              <p className="text-sm text-slate-300">
                Nessuna clip video collegata ancora per {player.name}.
              </p>
              <p className="text-xs text-slate-500">
                Puoi incollare link YouTube (riproducibili direttamente qui con timestamp), Hudl o X.
              </p>
              <button
                type="button"
                onClick={() => (user ? setShowVideoForm(true) : onSignIn())}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#F97316] hover:bg-[#EA580C] text-white rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {user ? 'Aggiungi primo video' : 'Accedi con Google per aggiungere'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {videos.map((vid) => {
                const embedUrl = getYouTubeEmbedUrl(vid.url, vid.timestampLabel);
                const isExpanded = expandedVideoId === vid.id;
                const isEditing = editingVideoId === vid.id;

                if (isEditing) {
                  return (
                    <form
                      key={vid.id}
                      onSubmit={(e) => void handleUpdateVideo(e, vid.id)}
                      className="bg-[#0A0E14] border border-orange-500/35 rounded-xl p-4 space-y-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                          <label className="block text-xs text-slate-400 mb-1">Titolo clip o partita</label>
                          <input
                            type="text"
                            value={editVideoTitle}
                            onChange={(e) => setEditVideoTitle(e.target.value)}
                            maxLength={120}
                            className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F97316]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Categoria</label>
                          <select
                            value={editVideoCategory}
                            onChange={(e) => setEditVideoCategory(e.target.value as VideoCategory)}
                            className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F97316]"
                          >
                            {VIDEO_CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                          <label className="block text-xs text-slate-400 mb-1">Link video HTTPS</label>
                          <input
                            type="url"
                            value={editVideoUrl}
                            onChange={(e) => setEditVideoUrl(e.target.value)}
                            maxLength={500}
                            className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F97316]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Timestamp</label>
                          <input
                            type="text"
                            value={editVideoTimestamp}
                            onChange={(e) => setEditVideoTimestamp(e.target.value)}
                            maxLength={20}
                            className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-[#F97316]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Nota tattica</label>
                        <textarea
                          rows={2}
                          value={editVideoNotes}
                          onChange={(e) => setEditVideoNotes(e.target.value)}
                          maxLength={600}
                          className="w-full bg-[#121822] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F97316]"
                        />
                      </div>

                      {editVideoError && <p className="text-xs text-rose-400">{editVideoError}</p>}

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingVideoId(null)}
                          className="px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                        >
                          Annulla
                        </button>
                        <button
                          type="submit"
                          disabled={savingEditVideo}
                          className="px-4 py-1.5 text-xs font-medium bg-[#F97316] hover:bg-[#EA580C] text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          {savingEditVideo ? 'Salvataggio...' : 'Salva modifiche'}
                        </button>
                      </div>
                    </form>
                  );
                }

                return (
                  <div
                    key={vid.id}
                    className="bg-[#0A0E14] border border-white/8 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-white">{vid.title}</h4>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="text-orange-400 font-medium">{vid.category}</span>
                          {vid.timestampLabel && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-tabular text-slate-200">@ {vid.timestampLabel}</span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span>{vid.authorName}</span>
                          {vid.createdAt && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-tabular">
                                {vid.createdAt.toLocaleDateString('it-IT', {
                                  day: '2-digit',
                                  month: 'short',
                                })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
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
                          Apri Link
                        </a>
                        {user && user.uid === vid.authorUid && (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditingVideo(vid)}
                              title="Modifica video"
                              className="p-1.5 text-slate-500 hover:text-orange-400 transition-colors rounded-md"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteVideo(vid.id)}
                              title="Elimina video"
                              className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors rounded-md"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
