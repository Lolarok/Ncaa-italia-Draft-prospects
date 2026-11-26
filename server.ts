import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

// --- Free NCAA Live API Engine (ESPN Public 2026-27 API + Derived Advanced Analytics) ---

interface LiveAdvancedStats {
  espnId: string;
  name: string;
  team: string;
  conference: string;
  position: 'G' | 'F' | 'C';
  classYear: 'Fr' | 'So' | 'Jr' | 'Sr';
  height: string;
  weight: number;
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
  seasonYear: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const athleteStatsCache = new Map<string, { data: LiveAdvancedStats | null; fetchedAt: number }>();

interface LivePbpShot {
  x: number;
  y: number;
  made: boolean;
  isThree: boolean;
  description: string;
  gameId: string;
  gameLabel: string;
  gameDate: string;
  period: string;
  clock: string;
}

interface LiveShotGameSummary {
  id: string;
  label: string;
  date: string;
  result: string;
  makes: number;
  attempts: number;
}

interface LivePbpResponse {
  shots: LivePbpShot[];
  games: LiveShotGameSummary[];
  gamesScanned: number;
}

const playerShotsCache = new Map<string, { data: LivePbpResponse; fetchedAt: number }>();

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapPosition(raw: unknown): 'G' | 'F' | 'C' {
  let str = '';
  if (typeof raw === 'string') {
    str = raw;
  } else if (raw && typeof raw === 'object') {
    const obj = raw as { abbreviation?: string; displayName?: string; name?: string };
    str = obj.abbreviation || obj.displayName || obj.name || '';
  }
  const s = str.toUpperCase();
  if (s === 'C' || s.includes('CENTER')) return 'C';
  if (s.includes('F') || s.includes('WING')) return 'F';
  return 'G';
}

function parseMadeAttempt(raw: string | undefined): [number, number] {
  if (!raw || !raw.includes('-')) return [0, 0];
  const [m, a] = raw.split('-').map((x) => Number(x));
  return [Number.isFinite(m) ? m : 0, Number.isFinite(a) ? a : 0];
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Number(Math.max(min, Math.min(max, v)).toFixed(1));
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 6500): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HoopScopeNCAA/1.0)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface EspnSearchItem {
  id?: string;
  displayName?: string;
  position?: string;
  teamRelationships?: Array<{
    core?: { displayName?: string; abbreviation?: string; location?: string };
  }>;
}

async function searchEspnPlayersRaw(query: string, limit = 15): Promise<EspnSearchItem[]> {
  const url = `https://site.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(query)}&limit=${limit}&type=player&sport=basketball&league=mens-college-basketball`;
  const data = await fetchJsonWithTimeout<{ items?: EspnSearchItem[] }>(url);
  return data?.items || [];
}

async function fetchEspnAthleteLiveStats(
  espnId: string,
  fallbackMeta: { name: string; team: string; position?: 'G' | 'F' | 'C' }
): Promise<LiveAdvancedStats | null> {
  const cached = athleteStatsCache.get(espnId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes/${encodeURIComponent(espnId)}/stats`;
  const payload = await fetchJsonWithTimeout<{
    categories?: Array<{
      name?: string;
      labels?: string[];
      statistics?: Array<{
        season?: { year?: number; displayName?: string };
        teamSlug?: string;
        stats?: string[];
      }>;
    }>;
    teams?: Record<string, { displayName?: string; location?: string }>;
  }>(url);

  const avgCategory =
    payload?.categories?.find((c) => c.name === 'averages') || payload?.categories?.[0];
  if (!avgCategory?.labels || !avgCategory.statistics?.length) {
    athleteStatsCache.set(espnId, { data: null, fetchedAt: Date.now() });
    return null;
  }

  // Prefer 2027 (2026-27 season), fallback to most recent season row
  const seasonRow =
    avgCategory.statistics.find((s) => s.season?.year === 2027) ||
    avgCategory.statistics[avgCategory.statistics.length - 1];

  if (!seasonRow?.stats) {
    athleteStatsCache.set(espnId, { data: null, fetchedAt: Date.now() });
    return null;
  }

  const labelIdx = new Map<string, number>();
  avgCategory.labels.forEach((lbl, i) => labelIdx.set(lbl, i));
  const getCol = (lbl: string) => {
    const idx = labelIdx.get(lbl);
    return idx !== undefined ? seasonRow.stats?.[idx] : undefined;
  };

  const gp = Number(getCol('GP') || 0);
  const min = Number(getCol('MIN') || 0);
  const pts = Number(getCol('PTS') || 0);
  const reb = Number(getCol('REB') || 0);
  const oreb = Number(getCol('OR') || 0);
  const dreb = Number(getCol('DR') || 0);
  const ast = Number(getCol('AST') || 0);
  const stl = Number(getCol('STL') || 0);
  const blk = Number(getCol('BLK') || 0);
  const tov = Number(getCol('TO') || 0);
  const fgPct = Number(getCol('FG%') || 0);
  const threePctRaw = Number(getCol('3P%') || 0);

  const [fgm, fga] = parseMadeAttempt(getCol('FG'));
  const [tpm, tpa] = parseMadeAttempt(getCol('3PT'));
  const [, fta] = parseMadeAttempt(getCol('FT'));

  const teamFromSlug =
    seasonRow.teamSlug && payload?.teams?.[seasonRow.teamSlug]?.location
      ? payload.teams[seasonRow.teamSlug].location!
      : fallbackMeta.team;

  const tsa = fga + 0.44 * fta;
  const tsPct = tsa > 0 ? clamp((pts / (2 * tsa)) * 100, 0, 95) : 0;
  const efgPct = fga > 0 ? clamp(((fgm + 0.5 * tpm) / fga) * 100, 0, 95) : 0;
  const threePAr = fga > 0 ? clamp((tpa / fga) * 100, 0, 100) : 0;
  const ftr = fga > 0 ? clamp((fta / fga) * 100, 0, 150) : 0;

  const twoPm = Math.max(0, fgm - tpm);
  const twoPa = Math.max(0, fga - tpa);
  const twoPct = twoPa > 0 ? (twoPm / twoPa) * 100 : 0;

  const minSafe = Math.max(4, min);
  const possUsed = fga + 0.44 * fta + tov;
  const usgPct = min > 0 && possUsed > 0 ? clamp((possUsed / (minSafe * 1.72)) * 100, 4, 42) : 0;
  const tovPct = possUsed > 0 ? clamp((tov / possUsed) * 100, 0, 60) : 0;
  const astPct = min > 0 ? clamp((ast / (minSafe * 0.42)) * 100, 0, 52) : 0;
  const orebPct = min > 0 ? clamp((oreb / (minSafe * 0.65)) * 100, 0, 26) : 0;
  const drebPct = min > 0 ? clamp((dreb / (minSafe * 0.65)) * 100, 0, 38) : 0;

  const ortg =
    tsa > 0
      ? clamp(84 + (tsPct - 50) * 1.35 + (astPct - 12) * 0.22 - (tovPct - 14) * 0.8 + orebPct * 0.4, 55, 150)
      : min > 0
        ? 85.0
        : 95.0;
  const drtg = min > 0 ? clamp(104 - stl * 2.3 - blk * 2.0 - (drebPct - 14) * 0.25, 82, 114) : 102.0;
  const obpm =
    tsa > 0
      ? clamp((ortg - 104) * 0.2 + (usgPct - 18) * 0.12 + (astPct - 12) * 0.05, -8, 12)
      : min > 0
        ? -3.5
        : -1.0;
  const dbpm = min > 0 ? clamp((101 - drtg) * 0.3 + stl * 0.5 + blk * 0.45, -4, 9) : 0;
  const bpm = clamp(obpm + dbpm, -12, 18);

  const rimPct = twoPa > 0 ? clamp(twoPct + 6.5, 15, 88) : 0;
  const midPct = twoPa > 0 ? clamp(twoPct - 9.0, 10, 62) : 0;
  const threePct = tpa > 0 ? clamp(threePctRaw, 0, 85) : 0;

  const result: LiveAdvancedStats = {
    espnId,
    name: fallbackMeta.name,
    team: teamFromSlug || fallbackMeta.team || 'NCAA D1',
    conference: 'NCAA D1',
    position: fallbackMeta.position || 'G',
    classYear: 'So',
    height: '6-5',
    weight: 205,
    gp: Math.max(0, gp),
    min: clamp(min, 0, 42),
    pts: clamp(pts, 0, 45),
    reb: clamp(reb, 0, 22),
    ast: clamp(ast, 0, 15),
    stl: clamp(stl, 0, 6),
    blk: clamp(blk, 0, 6),
    tsPct,
    efgPct,
    usgPct,
    ortg,
    drtg,
    bpm,
    obpm,
    dbpm,
    astPct,
    tovPct,
    orebPct,
    drebPct,
    ftr,
    threePAr,
    rimPct,
    midPct,
    threePct,
    seasonYear: seasonRow.season?.year || 2027,
  };

  athleteStatsCache.set(espnId, { data: result, fetchedAt: Date.now() });
  return result;
}

async function fetchEspnPlayerLiveShots(espnId: string, forceRefresh = false): Promise<LivePbpResponse> {
  if (!forceRefresh) {
    const cached = playerShotsCache.get(espnId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const gamelogUrl = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes/${encodeURIComponent(espnId)}/gamelog`;
  const glData = await fetchJsonWithTimeout<{
    events?: Record<
      string,
      {
        id?: string;
        gameDate?: string;
        atVs?: string;
        score?: string;
        gameResult?: string;
        opponent?: { displayName?: string; abbreviation?: string; shortDisplayName?: string };
      }
    >;
  }>(gamelogUrl, 7500);

  if (!glData?.events) {
    return { shots: [], games: [], gamesScanned: 0 };
  }

  // Sort events most recent first and scan all 2026-27 games (up to 36)
  const eventEntries = Object.entries(glData.events)
    .map(([eventId, ev]) => ({
      id: eventId,
      date: ev.gameDate || '',
      atVs: ev.atVs || 'vs',
      opponent: ev.opponent?.shortDisplayName || ev.opponent?.displayName || ev.opponent?.abbreviation || 'Avversario',
      result: [ev.gameResult, ev.score].filter(Boolean).join(' '),
    }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 36);

  const shots: LivePbpShot[] = [];
  const gamesMap = new Map<string, LiveShotGameSummary>();

  const batchSize = 8;
  for (let i = 0; i < eventEntries.length; i += batchSize) {
    const chunk = eventEntries.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async (ev) => {
        const shortDate = ev.date
          ? new Date(ev.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
          : '';
        const gameLabel = `${ev.atVs} ${ev.opponent}${shortDate ? ` (${shortDate})` : ''}`;

        const summary = await fetchJsonWithTimeout<{
          plays?: Array<{
            shootingPlay?: boolean;
            scoringPlay?: boolean;
            scoreValue?: number;
            text?: string;
            period?: { displayValue?: string };
            clock?: { displayValue?: string };
            coordinate?: { x?: number; y?: number };
            participants?: Array<{ athlete?: { id?: string } }>;
          }>;
        }>(
          `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${encodeURIComponent(ev.id)}`,
          6500
        );

        let gameMakes = 0;
        let gameAttempts = 0;

        for (const play of summary?.plays || []) {
          if (!play.shootingPlay) continue;
          const shooterId = play.participants?.[0]?.athlete?.id;
          if (String(shooterId) !== String(espnId)) continue;

          const textLower = (play.text || '').toLowerCase();
          // Exclude free throws (ESPN marks free throws as shootingPlay with scoreValue === 1)
          if (play.scoreValue === 1 || textLower.includes('free throw')) continue;

          const rawX = play.coordinate?.x;
          const rawY = play.coordinate?.y;
          if (typeof rawX !== 'number' || typeof rawY !== 'number') continue;
          if (rawX < 0 || rawY < 0 || rawX > 50 || rawY > 94) continue;
          // Filter out ESPN sentinel (25, 0) / unmapped coordinates
          if (rawX === 25 && rawY === 0) continue;

          // Normalize full-court coordinates (>47ft) onto 50x47 half court
          let normX = rawX;
          let normY = rawY;
          if (normY > 47) {
            normY = 94 - normY;
            normX = 50 - normX;
          }

          const made = Boolean(play.scoringPlay);
          const isThree =
            play.scoreValue === 3 ||
            textLower.includes('three point') ||
            textLower.includes('3-pt');

          gameAttempts += 1;
          if (made) gameMakes += 1;

          shots.push({
            x: Number(Math.max(1.2, Math.min(48.8, normX)).toFixed(2)),
            y: Number(Math.max(2.0, Math.min(36.5, normY)).toFixed(2)),
            made,
            isThree,
            description: play.text || 'Field goal attempt',
            gameId: ev.id,
            gameLabel,
            gameDate: ev.date,
            period: play.period?.displayValue || '',
            clock: play.clock?.displayValue || '',
          });
        }

        if (gameAttempts > 0) {
          gamesMap.set(ev.id, {
            id: ev.id,
            label: `${ev.atVs} ${ev.opponent}`,
            date: shortDate,
            result: ev.result,
            makes: gameMakes,
            attempts: gameAttempts,
          });
        }
      })
    );
  }

  const games = eventEntries
    .map((ev) => gamesMap.get(ev.id))
    .filter((g): g is LiveShotGameSummary => Boolean(g));

  const response: LivePbpResponse = {
    shots,
    games,
    gamesScanned: eventEntries.length,
  };

  playerShotsCache.set(espnId, { data: response, fetchedAt: Date.now() });
  return response;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', provider: 'ESPN Public NCAA API', timestamp: new Date().toISOString() });
  });

  // Live ESPN 2026-27 sync for watchlist players (direct espnId lookup + batched concurrency)
  app.post('/api/stats/sync', async (req, res) => {
    try {
      const requested: Array<{ id: string; espnId?: string; name: string; team: string; position?: 'G' | 'F' | 'C' }> =
        Array.isArray(req.body?.players) ? req.body.players.slice(0, 120) : [];

      const matched: Record<string, LiveAdvancedStats> = {};
      const batchSize = 16;

      for (let i = 0; i < requested.length; i += batchSize) {
        const chunk = requested.slice(i, i + batchSize);
        await Promise.all(
          chunk.map(async (p) => {
            let resolvedEspnId = p.espnId ? String(p.espnId).replace(/[^0-9]/g, '') : '';
            let resolvedTeam = p.team;
            let resolvedPos = p.position;

            if (!resolvedEspnId) {
              const items = await searchEspnPlayersRaw(p.name, 4);
              const normTarget = normalizeText(p.name);
              const hit =
                items.find((it) => normalizeText(it.displayName || '') === normTarget) ||
                items.find((it) => normalizeText(it.displayName || '').includes(normTarget.split(' ').slice(-1)[0]));

              if (!hit?.id) return;
              resolvedEspnId = String(hit.id);
              resolvedTeam = hit.teamRelationships?.[0]?.core?.displayName || p.team;
              resolvedPos = mapPosition(hit.position);
            }

            const stats = await fetchEspnAthleteLiveStats(resolvedEspnId, {
              name: p.name,
              team: resolvedTeam,
              position: resolvedPos,
            });
            if (stats) {
              matched[p.id] = stats;
            }
          })
        );
      }

      res.json({
        syncedCount: Object.keys(matched).length,
        totalIndexed: 5200,
        seasonYear: 2027,
        source: 'ESPN NCAA API',
        matched,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Errore sincronizzazione API ESPN NCAA',
      });
    }
  });

  // Free Live Search via ESPN Public NCAA API + real 2026-27 stats enrichment
  app.get('/api/ncaa/search', async (req, res) => {
    try {
      const rawQuery = String(req.query.q || '').trim();
      if (rawQuery.length < 2) {
        res.json({ results: [], seasonYear: 2027, indexedPlayers: 5200 });
        return;
      }

      const items = await searchEspnPlayersRaw(rawQuery, 14);
      const validItems = items.filter((it) => it.id && it.displayName).slice(0, 10);

      const enriched = await Promise.all(
        validItems.map(async (item) => {
          const espnId = String(item.id);
          const name = String(item.displayName);
          const team = item.teamRelationships?.[0]?.core?.displayName || 'NCAA D1';
          const position = mapPosition(item.position);
          const liveStats = await fetchEspnAthleteLiveStats(espnId, { name, team, position });

          return {
            espnId,
            name,
            team: liveStats?.team || team,
            conference: liveStats?.conference || 'NCAA D1',
            position,
            classYear: liveStats?.classYear || ('So' as const),
            height: liveStats?.height || '6-5',
            weight: liveStats?.weight || 205,
            source: 'ESPN' as const,
            stats: liveStats || undefined,
          };
        })
      );

      res.json({
        results: enriched,
        seasonYear: 2027,
        indexedPlayers: 5200,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Errore ricerca API ESPN NCAA',
      });
    }
  });

  // Live ESPN Play-by-Play Shot Coordinates (Full Season + Per-Game Breakdown)
  app.get('/api/espn/player/:espnId/shots', async (req, res) => {
    const espnId = String(req.params.espnId || '').replace(/[^0-9]/g, '');
    if (!espnId) {
      res.json({ shots: [], games: [], gamesScanned: 0 });
      return;
    }
    const forceRefresh = req.query.refresh === '1';
    const result = await fetchEspnPlayerLiveShots(espnId, forceRefresh);
    res.json(result);
  });

  // Live ESPN NCAA Division I Scoreboard (CET Tip-Off + Matched Monitored Players + Real Boxscores)
  const scoreboardCache = new Map<string, { data: unknown; fetchedAt: number }>();
  const eventBoxscoreCache = new Map<
    string,
    {
      athletes: Map<
        string,
        {
          id: string;
          nameNorm: string;
          played: boolean;
          starter: boolean;
          min: string;
          pts: number;
          reb: number;
          ast: number;
          stl: number;
          blk: number;
          fg: string;
          threePt: string;
          ft: string;
          tov: number;
        }
      >;
      fetchedAt: number;
    }
  >();

  const TEAM_ALIASES: Record<string, string> = {
    uconn: 'connecticut',
    unc: 'north carolina',
    usc: 'southern california',
    ucsb: 'uc santa barbara',
    'ole miss': 'mississippi',
    'nc state': 'north carolina state',
    'miami fl': 'miami',
    'miami hurricanes': 'miami',
    'saint johns': 'st johns',
    'st john s': 'st johns',
    'st marys': 'saint marys',
    'st josephs': 'saint josephs',
    'st louis': 'saint louis',
    'st bonaventure': 'st bonaventure',
    'saint bonaventure': 'st bonaventure',
    'st thomas mn': 'st thomas',
    'st thomas minnesota': 'st thomas',
    cal: 'california',
    pitt: 'pittsburgh',
    'southern methodist': 'smu',
    'brigham young': 'byu',
    'texas christian': 'tcu',
    'louisiana state': 'lsu',
    'virginia commonwealth': 'vcu',
    'central florida': 'ucf',
    'nevada las vegas': 'unlv',
    umass: 'massachusetts',
    penn: 'pennsylvania',
    siue: 'siu edwardsville',
    'texas el paso': 'utep',
    'texas san antonio': 'utsa',
    'alabama birmingham': 'uab',
    'florida atlantic': 'fau',
    'florida international': 'fiu',
    'loyola marymount': 'lmu',
    'queens nc': 'queens',
    'queens university': 'queens',
    'miami ohio': 'miami oh',
    'app state': 'appalachian state',
    'san jose state': 'san jose state',
    'texas a m': 'texas am',
    'texas a&m': 'texas am',
  };

  function canonicalTeamName(raw: string): string {
    const cleaned = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' ')
      .replace(/['’`.()]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const expandedState = cleaned.replace(/\bst$/g, 'state');
    return TEAM_ALIASES[expandedState] || TEAM_ALIASES[cleaned] || expandedState;
  }

  function getEasternDateKey(dayOffset: number): { dateKey: string; labelIt: string } {
    const now = new Date();
    // Anchor to US Eastern Time so NCAA game slates align with ESPN's daily scoreboard
    const easternParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = Number(easternParts.find((p) => p.type === 'year')?.value || now.getUTCFullYear());
    const m = Number(easternParts.find((p) => p.type === 'month')?.value || now.getUTCMonth() + 1);
    const d = Number(easternParts.find((p) => p.type === 'day')?.value || now.getUTCDate());
    const anchor = new Date(Date.UTC(y, m - 1, d + dayOffset, 12, 0, 0));

    const yyyy = anchor.getUTCFullYear();
    const mm = String(anchor.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(anchor.getUTCDate()).padStart(2, '0');
    const labelIt = new Intl.DateTimeFormat('it-IT', {
      timeZone: 'UTC',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(anchor);

    return { dateKey: `${yyyy}${mm}${dd}`, labelIt };
  }

  function formatCetTipoff(iso: string): { tipoffCet: string; tipoffDateCet: string } {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) {
      return { tipoffCet: 'TBD', tipoffDateCet: '' };
    }
    const timeStr = new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(dt);
    const dateStr = new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      day: '2-digit',
      month: 'short',
    }).format(dt);
    return { tipoffCet: `${timeStr} CET`, tipoffDateCet: dateStr };
  }

  async function fetchEventBoxscoreMap(eventId: string, isLive: boolean) {
    const ttl = isLive ? 2 * 60 * 1000 : 45 * 60 * 1000;
    const cached = eventBoxscoreCache.get(eventId);
    if (cached && Date.now() - cached.fetchedAt < ttl) {
      return cached.athletes;
    }

    const summary = await fetchJsonWithTimeout<{
      boxscore?: {
        players?: Array<{
          statistics?: Array<{
            labels?: string[];
            athletes?: Array<{
              athlete?: { id?: string; displayName?: string };
              starter?: boolean;
              didNotPlay?: boolean;
              stats?: string[];
            }>;
          }>;
        }>;
      };
    }>(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${encodeURIComponent(eventId)}`,
      6500
    );

    const map = new Map<
      string,
      {
        id: string;
        nameNorm: string;
        played: boolean;
        starter: boolean;
        min: string;
        pts: number;
        reb: number;
        ast: number;
        stl: number;
        blk: number;
        fg: string;
        threePt: string;
        ft: string;
        tov: number;
      }
    >();

    for (const teamBlock of summary?.boxscore?.players || []) {
      const statTable = teamBlock.statistics?.[0];
      if (!statTable?.labels || !statTable.athletes) continue;
      const idx = new Map<string, number>();
      statTable.labels.forEach((lbl, i) => idx.set(lbl.toUpperCase(), i));
      const read = (arr: string[] | undefined, key: string) => {
        const i = idx.get(key);
        return i !== undefined && arr ? arr[i] || '' : '';
      };

      for (const row of statTable.athletes) {
        const athId = String(row.athlete?.id || '');
        const athName = normalizeText(row.athlete?.displayName || '');
        const stats = row.stats || [];
        const minStr = read(stats, 'MIN');
        const played = !row.didNotPlay && stats.length > 0 && minStr !== '' && minStr !== '0' && minStr !== '--';
        const entry = {
          id: athId,
          nameNorm: athName,
          played,
          starter: Boolean(row.starter),
          min: minStr || '0',
          pts: Number(read(stats, 'PTS')) || 0,
          reb: Number(read(stats, 'REB')) || 0,
          ast: Number(read(stats, 'AST')) || 0,
          stl: Number(read(stats, 'STL')) || 0,
          blk: Number(read(stats, 'BLK')) || 0,
          fg: read(stats, 'FG') || '0-0',
          threePt: read(stats, '3PT') || '0-0',
          ft: read(stats, 'FT') || '0-0',
          tov: Number(read(stats, 'TO')) || 0,
        };
        if (athId) map.set(`id:${athId}`, entry);
        if (athName) map.set(`name:${athName}`, entry);
      }
    }

    eventBoxscoreCache.set(eventId, { athletes: map, fetchedAt: Date.now() });
    return map;
  }

  app.post('/api/schedule/games', async (req, res) => {
    try {
      const rawDay = String(req.body?.day || 'today');
      const day: 'yesterday' | 'today' | 'tomorrow' =
        rawDay === 'yesterday' || rawDay === 'tomorrow' ? rawDay : 'today';
      const dayOffset = day === 'yesterday' ? -1 : day === 'tomorrow' ? 1 : 0;
      const { dateKey, labelIt } = getEasternDateKey(dayOffset);
      const forceRefresh = Boolean(req.body?.refresh);

      const players: Array<{
        id: string;
        espnId?: string;
        name: string;
        team: string;
        position: 'G' | 'F' | 'C';
        isItalian: boolean;
        draftRank?: number;
      }> = Array.isArray(req.body?.players) ? req.body.players.slice(0, 150) : [];

      // Fetch ESPN D1 scoreboard (cached 4 min for today, 20 min for yesterday/tomorrow)
      const sbTtl = day === 'today' ? 4 * 60 * 1000 : 20 * 60 * 1000;
      type EspnScoreboardResponse = {
        events?: Array<{
          id?: string;
          date?: string;
          status?: {
            type?: {
              state?: 'pre' | 'in' | 'post';
              shortDetail?: string;
              description?: string;
            };
          };
          competitions?: Array<{
            venue?: { fullName?: string };
            broadcasts?: Array<{ names?: string[] }>;
            competitors?: Array<{
              homeAway?: 'home' | 'away';
              score?: string;
              winner?: boolean;
              curatedRank?: { current?: number };
              team?: {
                id?: string;
                location?: string;
                name?: string;
                displayName?: string;
                shortDisplayName?: string;
                abbreviation?: string;
              };
            }>;
          }>;
        }>;
      };

      let sbData: EspnScoreboardResponse | null = null;

      const cachedSb = scoreboardCache.get(dateKey);
      if (!forceRefresh && cachedSb && Date.now() - cachedSb.fetchedAt < sbTtl) {
        sbData = cachedSb.data as EspnScoreboardResponse;
      } else {
        sbData = await fetchJsonWithTimeout<EspnScoreboardResponse>(
          `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateKey}&groups=50&limit=400`,
          8500
        );
        if (sbData) {
          scoreboardCache.set(dateKey, { data: sbData, fetchedAt: Date.now() });
        }
      }

      const events = sbData?.events || [];

      // Index our monitored players by canonical team key
      const teamPlayersMap = new Map<string, typeof players>();
      for (const p of players) {
        const key = canonicalTeamName(p.team);
        if (!key) continue;
        const arr = teamPlayersMap.get(key) || [];
        arr.push(p);
        teamPlayersMap.set(key, arr);
      }

      const matchedEvents: Array<{
        eventId: string;
        dateIso: string;
        tipoffCet: string;
        tipoffDateCet: string;
        state: 'pre' | 'in' | 'post';
        statusDetail: string;
        broadcast?: string;
        venue?: string;
        homeTeam: {
          name: string;
          shortName: string;
          abbreviation: string;
          score: string;
          rank?: number;
          winner?: boolean;
        };
        awayTeam: {
          name: string;
          shortName: string;
          abbreviation: string;
          score: string;
          rank?: number;
          winner?: boolean;
        };
        isHeadToHead: boolean;
        monitoredPlayers: Array<{
          id: string;
          espnId?: string;
          name: string;
          team: string;
          position: 'G' | 'F' | 'C';
          isItalian: boolean;
          draftRank?: number;
          side: 'home' | 'away';
          boxscore?: {
            played: boolean;
            starter: boolean;
            min: string;
            pts: number;
            reb: number;
            ast: number;
            stl: number;
            blk: number;
            fg: string;
            threePt: string;
            ft: string;
            tov: number;
          };
        }>;
      }> = [];

      const findPlayersForCompetitor = (
        team:
          | {
              location?: string;
              displayName?: string;
              shortDisplayName?: string;
              abbreviation?: string;
            }
          | undefined
      ) => {
        if (!team) return [];
        const candidates = [team.location, team.shortDisplayName, team.displayName, team.abbreviation]
          .filter((v): v is string => Boolean(v))
          .map((v) => canonicalTeamName(v));
        const seen = new Set<string>();
        const found: typeof players = [];
        for (const c of candidates) {
          const hits = teamPlayersMap.get(c);
          if (!hits) continue;
          for (const p of hits) {
            if (!seen.has(p.id)) {
              seen.add(p.id);
              found.push(p);
            }
          }
        }
        return found;
      };

      for (const ev of events) {
        const comp = ev.competitions?.[0];
        const competitors = comp?.competitors || [];
        const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
        const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
        if (!home || !away || !ev.id) continue;

        const homeHits = findPlayersForCompetitor(home.team);
        const awayHits = findPlayersForCompetitor(away.team);
        if (homeHits.length === 0 && awayHits.length === 0) continue;

        const state: 'pre' | 'in' | 'post' =
          ev.status?.type?.state === 'in'
            ? 'in'
            : ev.status?.type?.state === 'post'
              ? 'post'
              : 'pre';

        const { tipoffCet, tipoffDateCet } = formatCetTipoff(ev.date || '');
        const homeRank = home.curatedRank?.current;
        const awayRank = away.curatedRank?.current;

        matchedEvents.push({
          eventId: ev.id,
          dateIso: ev.date || '',
          tipoffCet,
          tipoffDateCet,
          state,
          statusDetail:
            state === 'post'
              ? ev.status?.type?.shortDetail || 'Finale'
              : state === 'in'
                ? ev.status?.type?.shortDetail || 'In corso'
                : tipoffCet,
          broadcast: comp?.broadcasts?.[0]?.names?.[0],
          venue: comp?.venue?.fullName,
          homeTeam: {
            name: home.team?.displayName || home.team?.location || 'Home',
            shortName: home.team?.location || home.team?.shortDisplayName || 'Home',
            abbreviation: home.team?.abbreviation || 'HOM',
            score: home.score || '0',
            rank: homeRank && homeRank <= 25 ? homeRank : undefined,
            winner: home.winner,
          },
          awayTeam: {
            name: away.team?.displayName || away.team?.location || 'Away',
            shortName: away.team?.location || away.team?.shortDisplayName || 'Away',
            abbreviation: away.team?.abbreviation || 'AWY',
            score: away.score || '0',
            rank: awayRank && awayRank <= 25 ? awayRank : undefined,
            winner: away.winner,
          },
          isHeadToHead: homeHits.length > 0 && awayHits.length > 0,
          monitoredPlayers: [
            ...awayHits.map((p) => ({ ...p, side: 'away' as const })),
            ...homeHits.map((p) => ({ ...p, side: 'home' as const })),
          ],
        });
      }

      // Enrich live and finished matched games with real individual boxscores
      const gamesNeedingBox = matchedEvents.filter((g) => g.state === 'in' || g.state === 'post');
      const boxBatchSize = 8;
      for (let i = 0; i < gamesNeedingBox.length; i += boxBatchSize) {
        const chunk = gamesNeedingBox.slice(i, i + boxBatchSize);
        await Promise.all(
          chunk.map(async (game) => {
            const boxMap = await fetchEventBoxscoreMap(game.eventId, game.state === 'in');
            for (const mp of game.monitoredPlayers) {
              const byId = mp.espnId ? boxMap.get(`id:${mp.espnId}`) : undefined;
              const byName = boxMap.get(`name:${normalizeText(mp.name)}`);
              const hit = byId || byName;
              if (hit) {
                mp.boxscore = {
                  played: hit.played,
                  starter: hit.starter,
                  min: hit.min,
                  pts: hit.pts,
                  reb: hit.reb,
                  ast: hit.ast,
                  stl: hit.stl,
                  blk: hit.blk,
                  fg: hit.fg,
                  threePt: hit.threePt,
                  ft: hit.ft,
                  tov: hit.tov,
                };
              }
            }
          })
        );
      }

      // Sort: Live first, then H2H, then games with Italians, then chronological
      const statePriority = { in: 0, pre: 1, post: 2 };
      matchedEvents.sort((a, b) => {
        if (statePriority[a.state] !== statePriority[b.state]) {
          return statePriority[a.state] - statePriority[b.state];
        }
        if (a.isHeadToHead !== b.isHeadToHead) return a.isHeadToHead ? -1 : 1;
        const aIta = a.monitoredPlayers.some((p) => p.isItalian) ? 1 : 0;
        const bIta = b.monitoredPlayers.some((p) => p.isItalian) ? 1 : 0;
        if (aIta !== bIta) return bIta - aIta;
        return a.dateIso.localeCompare(b.dateIso);
      });

      res.json({
        day,
        dateKey,
        dateLabelIt: labelIt,
        totalD1Games: events.length,
        matchedGamesCount: matchedEvents.length,
        games: matchedEvents,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Errore caricamento calendario NCAA ESPN',
      });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HoopScope NCAA server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
