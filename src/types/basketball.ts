export type PlayerGroup = 'italian' | 'draft2027' | 'custom';
export type Position = 'G' | 'F' | 'C';
export type ClassYear = 'Fr' | 'So' | 'Jr' | 'Sr';

export type ScoutGrade =
  | 'Lottery'
  | 'Primo Giro'
  | 'Secondo Giro'
  | 'Two-Way / Monitor'
  | 'Da Valutare';

export type NoteTag =
  | 'Difesa P&R'
  | 'Tiro'
  | 'Shot Creation'
  | 'Playmaking'
  | 'Atletismo'
  | 'Rim Finishing'
  | 'IQ / Lettura'
  | 'Motor'
  | 'Proiezione NBA'
  | 'Fisico';

export type VideoCategory =
  | 'Full Game'
  | 'Highlights'
  | 'Difesa'
  | 'Half-Court'
  | 'Tiro'
  | 'Possessi';

export const NOTE_TAGS: NoteTag[] = [
  'Difesa P&R',
  'Tiro',
  'Shot Creation',
  'Playmaking',
  'Atletismo',
  'Rim Finishing',
  'IQ / Lettura',
  'Motor',
  'Proiezione NBA',
  'Fisico',
];

export const SCOUT_GRADES: ScoutGrade[] = [
  'Lottery',
  'Primo Giro',
  'Secondo Giro',
  'Two-Way / Monitor',
  'Da Valutare',
];

export const VIDEO_CATEGORIES: VideoCategory[] = [
  'Full Game',
  'Highlights',
  'Difesa',
  'Half-Court',
  'Tiro',
  'Possessi',
];

export interface OnOffSplits {
  onOrtg: number;
  offOrtg: number;
  onDrtg: number;
  offDrtg: number;
  onNet: number;
  offNet: number;
  netDiff: number;
  onEfgOpp: number;
  offEfgOpp: number;
  onOrebPct: number;
  offOrebPct: number;
  onPace: number;
  offPace: number;
}

export type ShotZoneKey =
  | 'restricted'
  | 'paint'
  | 'midLeft'
  | 'midCenter'
  | 'midRight'
  | 'corner3Left'
  | 'corner3Right'
  | 'aboveBreak3';

export interface ShotEvent {
  id: string;
  x: number; // 0 to 50 feet (left sideline to right sideline)
  y: number; // 0 to 47 feet (baseline to half court)
  made: boolean;
  isThree: boolean;
  zone: ShotZoneKey;
  description?: string;
  gameId?: string;
  gameLabel?: string;
  gameDate?: string;
  period?: string;
  clock?: string;
}

export interface ShotGameSummary {
  id: string;
  label: string;
  date: string;
  result: string;
  makes: number;
  attempts: number;
}

export interface ShotZoneSummary {
  zone: ShotZoneKey;
  label: string;
  makes: number;
  attempts: number;
  fgPct: number;
  expectedFgPct: number;
  deltaVsExpected: number;
  freqPct: number;
  d1AvgPct: number;
  diffVsAvg: number;
}

export type ShotQualityTier = 'high' | 'medium' | 'low';

export interface ShotQualityEvaluation {
  expectedFgPct: number;
  distanceFt: number;
  contextLabel: string;
  qualityTier: ShotQualityTier;
  hasPlayContext: boolean;
}

export interface PlayerProfile {
  id: string;
  espnId?: string;
  name: string;
  team: string;
  conference: string;
  position: Position;
  roleLabel: string;
  classYear: ClassYear;
  group: PlayerGroup;
  isItalian: boolean;
  draftRank?: number;
  height: string;
  weight: number;
  wingspan?: string;
  hometown?: string;
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
  onOff: OnOffSplits;
  shots: ShotEvent[];
  shotZones: ShotZoneSummary[];
  shotGames?: ShotGameSummary[];
  shotsSource?: 'pbp' | 'model';
  dataSource: 'live' | 'baseline';
  liveSeasonYear?: number;
  addedByUid?: string;
  addedByName?: string;
}

export interface PlayerPercentiles {
  pts: number;
  tsPct: number;
  usgPct: number;
  bpm: number;
  obpm: number;
  dbpm: number;
  astPct: number;
  tovPct: number; // Inverted: lower TOV% = higher percentile
  rebPct: number;
  rimPct: number;
  threePct: number;
  netDiff: number;
  ortg: number;
  drtg: number; // Inverted: lower DRtg = higher percentile
}

export interface ScoutingNote {
  id: string;
  playerId: string;
  authorUid: string;
  authorName: string;
  title: string;
  content: string;
  tags: NoteTag[];
  grade: ScoutGrade;
  visibility: 'public';
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ScoutingVideo {
  id: string;
  playerId: string;
  authorUid: string;
  authorName: string;
  title: string;
  url: string;
  category: VideoCategory;
  timestampLabel: string;
  notes: string;
  visibility: 'public';
  createdAt: Date | null;
}

export type BigBoardType = 'draft2027' | 'italian';
export type BigBoardTierKey = 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5';

export interface BigBoardDoc {
  id: string;
  ownerUid: string;
  ownerName: string;
  boardType: BigBoardType;
  title: string;
  tier1: string[];
  tier2: string[];
  tier3: string[];
  tier4: string[];
  tier5: string[];
  visibility: 'public';
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ApiSearchCandidate {
  espnId: string;
  name: string;
  team: string;
  conference: string;
  position: Position;
  classYear: ClassYear;
  height: string;
  weight: number;
  source: 'BartTorvik' | 'ESPN';
  stats?: {
    gp?: number;
    min?: number;
    pts?: number;
    reb?: number;
    ast?: number;
    stl?: number;
    blk?: number;
    tsPct?: number;
    efgPct?: number;
    usgPct?: number;
    ortg?: number;
    drtg?: number;
    bpm?: number;
    obpm?: number;
    dbpm?: number;
    astPct?: number;
    tovPct?: number;
    orebPct?: number;
    drebPct?: number;
    ftr?: number;
    threePAr?: number;
    rimPct?: number;
    midPct?: number;
    threePct?: number;
  };
}

export type MinutesThreshold = 0 | 10 | 18;

export type SkillDnaAxisKey = 'scoring' | 'playmaking' | 'shooting' | 'interior' | 'defense';

export interface SkillDnaAxis {
  key: SkillDnaAxisKey;
  code: string;
  label: string;
  score: number; // 1–99
  detail: string;
}

export interface SkillDnaProfile {
  axes: SkillDnaAxis[];
  overallScore: number;
}

export interface ArchetypeShare {
  id: string;
  label: string;
  shortLabel: string;
  pct: number;
  description: string;
}

export interface SimilarPlayerComp {
  player: PlayerProfile;
  similarityPct: number;
  sharedStrength: string;
}

export interface ShotQualitySplit {
  makes: number;
  attempts: number;
  fgPct: number;
  xFgPct: number;
  delta: number;
  freqPct: number;
}

export interface ShotQualityMetrics {
  actualFgPct: number;
  expectedFgPct: number;
  shotMakingDelta: number;
  actualEfgPct: number;
  expectedEfgPct: number;
  efgDelta: number;
  actualPps: number;
  expectedPps: number;
  rimPlusThreeFreq: number;
  rimFreq: number;
  threeFreq: number;
  midFreq: number;
  attempts: number;
  makes: number;
  twoPt: ShotQualitySplit;
  threePt: ShotQualitySplit;
  qualityTiers: {
    high: ShotQualitySplit;
    medium: ShotQualitySplit;
    low: ShotQualitySplit;
  };
  usesShotLevelContext: boolean;
}

export interface SchedulePlayerBoxscore {
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

export interface ScheduleMonitoredPlayer {
  id: string;
  espnId?: string;
  name: string;
  team: string;
  position: Position;
  isItalian: boolean;
  draftRank?: number;
  side: 'home' | 'away';
  boxscore?: SchedulePlayerBoxscore;
}

export interface ScheduleGameItem {
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
  monitoredPlayers: ScheduleMonitoredPlayer[];
}

export interface ScheduleGamesResponse {
  day: 'yesterday' | 'today' | 'tomorrow';
  dateKey: string;
  dateLabelIt: string;
  totalD1Games: number;
  matchedGamesCount: number;
  games: ScheduleGameItem[];
}

