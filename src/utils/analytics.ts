import {
  ArchetypeShare,
  MinutesThreshold,
  OnOffSplits,
  PlayerPercentiles,
  PlayerProfile,
  Position,
  ShotEvent,
  ShotQualityEvaluation,
  ShotQualityMetrics,
  ShotQualitySplit,
  ShotQualityTier,
  ShotZoneKey,
  ShotZoneSummary,
  SimilarPlayerComp,
  SkillDnaProfile,
} from '../types/basketball';

// Deterministic PRNG (Mulberry32) so shot charts stay consistent per player
function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ZONE_METADATA: Record<ShotZoneKey, { label: string; d1AvgPct: number }> = {
  restricted: { label: 'Restricted Area', d1AvgPct: 61.5 },
  paint: { label: 'Paint (Non-RA)', d1AvgPct: 41.2 },
  midLeft: { label: 'Mid-Range Sinistra', d1AvgPct: 37.8 },
  midCenter: { label: 'Mid-Range Centro', d1AvgPct: 39.0 },
  midRight: { label: 'Mid-Range Destra', d1AvgPct: 37.8 },
  corner3Left: { label: 'Corner 3 Sinistra', d1AvgPct: 37.2 },
  corner3Right: { label: 'Corner 3 Destra', d1AvgPct: 37.2 },
  aboveBreak3: { label: 'Above the Break 3', d1AvgPct: 33.8 },
};

// Hoop center on NCAA 50ft x 47ft half court: x = 25ft, y = 5.25ft
export function classifyShotZone(x: number, y: number, isThree: boolean): ShotZoneKey {
  const dx = x - 25;
  const dy = y - 5.25;
  const dist = Math.hypot(dx, dy);

  if (isThree || dist >= 22.05 || (y <= 9.5 && (x <= 4.0 || x >= 46.0))) {
    if (y <= 11.2 && x < 25) return 'corner3Left';
    if (y <= 11.2 && x >= 25) return 'corner3Right';
    return 'aboveBreak3';
  }

  if (dist <= 4.6) return 'restricted';
  if (x >= 19 && x <= 31 && y <= 14.5) return 'paint';
  if (x < 19) return 'midLeft';
  if (x > 31) return 'midRight';
  return 'midCenter';
}

// Shot-level Expected FG% (xFG%) model calibrated on NCAA Division I spatial + play-context baselines
export function evaluateShotQuality(shot: ShotEvent): ShotQualityEvaluation {
  const dx = shot.x - 25;
  const dy = shot.y - 5.25;
  const distanceFt = Number(Math.hypot(dx, dy).toFixed(1));

  // 1. Spatial baseline (smooth distance + angle curve per NCAA D1 zone)
  let xFg = ZONE_METADATA[shot.zone].d1AvgPct;

  if (shot.zone === 'restricted') {
    // 65.8% right at the cylinder (<= 1.5ft) tapering to ~56.8% at 4.6ft
    xFg = 65.8 - Math.max(0, distanceFt - 1.4) * 2.8;
  } else if (shot.zone === 'paint') {
    // Short paint ~45.0% tapering to ~39.2% near the FT line
    xFg = 45.2 - Math.max(0, distanceFt - 5.0) * 0.65;
  } else if (shot.zone === 'midCenter') {
    // Elbow / FT extended jumpers have slightly better sightlines than baseline long 2s
    xFg = 40.2 - Math.max(0, distanceFt - 14.5) * 0.4;
  } else if (shot.zone === 'midLeft' || shot.zone === 'midRight') {
    xFg = 38.8 - Math.max(0, distanceFt - 14.0) * 0.45;
  } else if (shot.zone === 'corner3Left' || shot.zone === 'corner3Right') {
    // NCAA corner 3 (shorter 22.15ft arc & high catch-and-shoot share)
    xFg = 37.8 - Math.max(0, distanceFt - 22.5) * 0.6;
  } else {
    // Above the break 3: ~34.8% near arc, dropping sharply on deep NBA-range 3s & heaves
    if (distanceFt >= 32) {
      xFg = Math.max(7.5, 22 - (distanceFt - 32) * 1.4);
    } else {
      xFg = 34.8 - Math.max(0, distanceFt - 23.2) * 1.45;
    }
  }

  // 2. Play-by-play shot type & tactical context adjustments (when real ESPN description exists)
  const desc = (shot.description || '').toLowerCase();
  const hasPlayContext = desc.length > 0 && desc !== 'field goal attempt';
  const contextParts: string[] = [];

  if (hasPlayContext) {
    if (desc.includes('dunk') || desc.includes('alley oop')) {
      xFg = 88.5;
      contextParts.push('Schiacciata');
    } else if (desc.includes('tip') || desc.includes('putback')) {
      xFg = Math.max(xFg + 3.5, 62.0);
      contextParts.push('Tap-in');
    } else if (desc.includes('driving layup') || desc.includes('finger roll') || desc.includes('layup')) {
      xFg += 1.4;
      contextParts.push('Layup');
    } else if (desc.includes('hook') || desc.includes('floater') || desc.includes('runner')) {
      xFg += 2.2;
      contextParts.push(desc.includes('hook') ? 'Gancio' : 'Floater');
    } else if (
      desc.includes('step back') ||
      desc.includes('stepback') ||
      desc.includes('fadeaway') ||
      desc.includes('turnaround')
    ) {
      xFg -= 4.2;
      contextParts.push(desc.includes('fadeaway') ? 'Fadeaway' : 'Stepback');
    } else if (desc.includes('pullup') || desc.includes('pull-up')) {
      xFg -= 2.5;
      contextParts.push('Pull-up');
    } else if (desc.includes('three point') || desc.includes('3-pt')) {
      contextParts.push(shot.zone === 'aboveBreak3' ? 'Tripla perimetrale' : 'Tripla dall\'angolo');
    } else if (desc.includes('jumper')) {
      contextParts.push('Jumper');
    }

    if (desc.includes('assisted by')) {
      xFg += shot.isThree ? 4.6 : shot.zone === 'restricted' ? 4.2 : 3.8;
      contextParts.push('Assistito');
    }

    if (desc.includes('fastbreak') || desc.includes('fast break')) {
      xFg += shot.zone === 'restricted' ? 4.5 : 1.8;
      contextParts.push('Transizione');
    }
  }

  // Late-clock heave pressure (<= 2 seconds left on clock beyond 24ft)
  if (shot.clock && distanceFt >= 24) {
    const trimmed = shot.clock.trim();
    if (/^0:0[0-2](\.\d+)?$/.test(trimmed) || /^[0-2]\.\d+$/.test(trimmed)) {
      xFg -= 6.5;
      contextParts.push('Buzzer');
    }
  }

  const expectedFgPct = Number(Math.max(6, Math.min(94, xFg)).toFixed(1));
  const qualityTier: ShotQualityTier =
    expectedFgPct >= 50 ? 'high' : expectedFgPct >= 36 ? 'medium' : 'low';

  const fallbackLabel =
    shot.zone === 'restricted'
      ? 'Al ferro'
      : shot.zone === 'paint'
        ? 'Pitturato'
        : shot.zone === 'corner3Left' || shot.zone === 'corner3Right'
          ? 'Corner 3'
          : shot.zone === 'aboveBreak3'
            ? distanceFt >= 26
              ? '3PT Profondo'
              : '3PT Perimetro'
            : 'Mid-Range';

  return {
    expectedFgPct,
    distanceFt,
    contextLabel: contextParts.length > 0 ? contextParts.join(' · ') : fallbackLabel,
    qualityTier,
    hasPlayContext,
  };
}

export function summarizeShotZones(shots: ShotEvent[]): ShotZoneSummary[] {
  const counts: Record<ShotZoneKey, { makes: number; attempts: number; expectedMakes: number }> = {
    restricted: { makes: 0, attempts: 0, expectedMakes: 0 },
    paint: { makes: 0, attempts: 0, expectedMakes: 0 },
    midLeft: { makes: 0, attempts: 0, expectedMakes: 0 },
    midCenter: { makes: 0, attempts: 0, expectedMakes: 0 },
    midRight: { makes: 0, attempts: 0, expectedMakes: 0 },
    corner3Left: { makes: 0, attempts: 0, expectedMakes: 0 },
    corner3Right: { makes: 0, attempts: 0, expectedMakes: 0 },
    aboveBreak3: { makes: 0, attempts: 0, expectedMakes: 0 },
  };

  for (const s of shots) {
    const evalQ = evaluateShotQuality(s);
    counts[s.zone].attempts += 1;
    counts[s.zone].expectedMakes += evalQ.expectedFgPct / 100;
    if (s.made) counts[s.zone].makes += 1;
  }

  const total = Math.max(1, shots.length);
  return (Object.keys(ZONE_METADATA) as ShotZoneKey[]).map((zone) => {
    const { makes, attempts, expectedMakes } = counts[zone];
    const meta = ZONE_METADATA[zone];
    const fgPct = attempts > 0 ? Number(((makes / attempts) * 100).toFixed(1)) : 0;
    const expectedFgPct =
      attempts > 0 ? Number(((expectedMakes / attempts) * 100).toFixed(1)) : meta.d1AvgPct;
    const freqPct = Number(((attempts / total) * 100).toFixed(1));
    const diffVsAvg = attempts > 0 ? Number((fgPct - meta.d1AvgPct).toFixed(1)) : 0;
    const deltaVsExpected = attempts > 0 ? Number((fgPct - expectedFgPct).toFixed(1)) : 0;
    return {
      zone,
      label: meta.label,
      makes,
      attempts,
      fgPct,
      expectedFgPct,
      deltaVsExpected,
      freqPct,
      d1AvgPct: meta.d1AvgPct,
      diffVsAvg,
    };
  });
}

export function buildOnOffSplits(input: {
  id: string;
  ortg: number;
  drtg: number;
  obpm: number;
  dbpm: number;
  bpm: number;
  usgPct: number;
  orebPct: number;
  position: Position;
}): OnOffSplits {
  const rng = createRng(hashString(`${input.id}-onoff`));
  const noise = (rng() - 0.5) * 1.4;

  // Team offensive rating while player is on court vs off court
  const onOrtg = Number((103.5 + input.obpm * 2.15 + (input.ortg - 106) * 0.25 + noise).toFixed(1));
  const offOrtg = Number((onOrtg - (input.obpm * 1.45 + (input.usgPct - 18) * 0.12) + (rng() - 0.5) * 1.2).toFixed(1));

  // Team defensive rating (lower is better)
  const onDrtg = Number((102.0 - input.dbpm * 2.05 + (input.drtg - 100) * 0.25 - noise * 0.6).toFixed(1));
  const offDrtg = Number((onDrtg + input.dbpm * 1.35 + (rng() - 0.5) * 1.1).toFixed(1));

  const onNet = Number((onOrtg - onDrtg).toFixed(1));
  const offNet = Number((offOrtg - offDrtg).toFixed(1));
  const netDiff = Number((onNet - offNet).toFixed(1));

  const onEfgOpp = Number((49.2 - input.dbpm * 0.65 + (rng() - 0.5) * 0.8).toFixed(1));
  const offEfgOpp = Number((onEfgOpp + input.dbpm * 0.52 + (rng() - 0.5) * 0.6).toFixed(1));

  const posOrebBoost = input.position === 'C' ? 2.4 : input.position === 'F' ? 1.1 : -0.4;
  const onOrebPct = Number((28.2 + (input.orebPct - 5.5) * 0.55 + posOrebBoost).toFixed(1));
  const offOrebPct = Number((onOrebPct - (input.orebPct - 5.2) * 0.42 - posOrebBoost * 0.5).toFixed(1));

  const basePace = input.position === 'G' ? 69.8 : input.position === 'F' ? 68.7 : 67.4;
  const onPace = Number((basePace + (rng() - 0.5) * 3.0).toFixed(1));
  const offPace = Number((onPace + (rng() - 0.5) * 2.4).toFixed(1));

  return {
    onOrtg,
    offOrtg,
    onDrtg,
    offDrtg,
    onNet,
    offNet,
    netDiff,
    onEfgOpp,
    offEfgOpp,
    onOrebPct,
    offOrebPct,
    onPace,
    offPace,
  };
}

export function buildShotProfile(input: {
  id: string;
  position: Position;
  pts: number;
  gp: number;
  rimPct: number;
  midPct: number;
  threePct: number;
  threePAr: number;
}): { shots: ShotEvent[]; shotZones: ShotZoneSummary[] } {
  const rng = createRng(hashString(`${input.id}-shots`));
  const hasAnyShotData = input.pts > 0 || input.rimPct > 0 || input.threePct > 0 || input.threePAr > 0;
  if (!hasAnyShotData || input.gp === 0) {
    return {
      shots: [],
      shotZones: summarizeShotZones([]),
    };
  }

  const estimatedAttempts = Math.round(input.pts * Math.max(1, input.gp) * 0.85);
  const totalShots = Math.max(4, Math.min(110, estimatedAttempts || 4));

  const threeShare = Math.max(0, Math.min(0.85, input.threePAr / 100));
  const twoShare = 1 - threeShare;
  const rimRatio = input.position === 'C' ? 0.72 : input.position === 'F' ? 0.62 : 0.54;
  const rimShare = twoShare * rimRatio;
  const paintShare = twoShare * (1 - rimRatio) * 0.45;
  const midShare = twoShare - rimShare - paintShare;

  const zoneWeights: Array<{ zone: ShotZoneKey; weight: number; pct: number; isThree: boolean }> = [
    { zone: 'restricted', weight: rimShare, pct: input.rimPct, isThree: false },
    { zone: 'paint', weight: paintShare, pct: Math.max(0, input.rimPct - 14), isThree: false },
    { zone: 'midLeft', weight: midShare * 0.34, pct: input.midPct, isThree: false },
    { zone: 'midCenter', weight: midShare * 0.32, pct: input.midPct > 0 ? Math.min(60, input.midPct + 2) : 0, isThree: false },
    { zone: 'midRight', weight: midShare * 0.34, pct: Math.max(0, input.midPct - 1), isThree: false },
    { zone: 'corner3Left', weight: threeShare * 0.17, pct: input.threePct > 0 ? Math.min(60, input.threePct + 2.5) : 0, isThree: true },
    { zone: 'corner3Right', weight: threeShare * 0.17, pct: input.threePct > 0 ? Math.min(60, input.threePct + 2.0) : 0, isThree: true },
    { zone: 'aboveBreak3', weight: threeShare * 0.66, pct: Math.max(0, input.threePct - 0.5), isThree: true },
  ];

  const shots: ShotEvent[] = [];
  let shotIndex = 0;

  for (const zw of zoneWeights) {
    const count = Math.round(totalShots * zw.weight);
    if (count <= 0) continue;
    const exactMakes = Math.round((count * zw.pct) / 100);

    for (let i = 0; i < count; i++) {
      const made = i < exactMakes;
      let x = 25;
      let y = 6;

      if (zw.zone === 'restricted') {
        const angle = rng() * Math.PI * 1.4 - Math.PI * 0.2;
        const r = 0.7 + rng() * 3.5;
        x = 25 + Math.cos(angle) * r;
        y = 5.25 + Math.max(-1.0, Math.sin(angle) * r);
      } else if (zw.zone === 'paint') {
        x = 19.6 + rng() * 10.8;
        y = 8.2 + rng() * 6.0;
      } else if (zw.zone === 'midLeft') {
        x = 7.5 + rng() * 10.8;
        y = 6.5 + rng() * 12.0;
      } else if (zw.zone === 'midCenter') {
        x = 18.0 + rng() * 14.0;
        y = 14.8 + rng() * 6.0;
      } else if (zw.zone === 'midRight') {
        x = 31.7 + rng() * 10.8;
        y = 6.5 + rng() * 12.0;
      } else if (zw.zone === 'corner3Left') {
        x = 1.6 + rng() * 1.6;
        y = 4.2 + rng() * 5.6;
      } else if (zw.zone === 'corner3Right') {
        x = 46.8 + rng() * 1.6;
        y = 4.2 + rng() * 5.6;
      } else {
        // Above the break 3 arc (radius 22.8 to 26.5 ft from (25, 5.25))
        const theta = 0.24 * Math.PI + rng() * 0.52 * Math.PI;
        const radius = 22.7 + rng() * 3.4;
        x = 25 + Math.cos(theta) * radius;
        y = 5.25 + Math.sin(theta) * radius;
      }

      shots.push({
        id: `${input.id}-s-${shotIndex++}`,
        x: Number(Math.max(1.2, Math.min(48.8, x)).toFixed(2)),
        y: Number(Math.max(2.0, Math.min(35.5, y)).toFixed(2)),
        made,
        isThree: zw.isThree,
        zone: zw.zone,
      });
    }
  }

  return {
    shots,
    shotZones: summarizeShotZones(shots),
  };
}

function calcRankPercentile(value: number, sortedValues: number[], invert = false): number {
  if (sortedValues.length <= 1) return 50;
  let less = 0;
  let equal = 0;
  for (const v of sortedValues) {
    if (v < value) less++;
    else if (v === value) equal++;
  }
  const raw = ((less + equal * 0.5) / sortedValues.length) * 100;
  const adjusted = invert ? 100 - raw : raw;
  return Math.max(1, Math.min(99, Math.round(adjusted)));
}

export function computePercentilesMap(
  players: PlayerProfile[],
  scope: 'all' | 'position' = 'all',
  minMinutes: MinutesThreshold = 0
): Record<string, PlayerPercentiles> {
  const result: Record<string, PlayerPercentiles> = {};
  const groups: Array<{ members: PlayerProfile[]; reference: PlayerProfile[] }> =
    scope === 'all'
      ? [
          {
            members: players,
            reference:
              players.filter((p) => p.min >= minMinutes).length >= 3
                ? players.filter((p) => p.min >= minMinutes)
                : players,
          },
        ]
      : (['G', 'F', 'C'] as Position[]).map((pos) => {
          const members = players.filter((p) => p.position === pos);
          const qualified = members.filter((p) => p.min >= minMinutes);
          return {
            members,
            reference: qualified.length >= 3 ? qualified : members,
          };
        });

  for (const { members, reference } of groups) {
    if (members.length === 0 || reference.length === 0) continue;
    const sorted = {
      pts: [...reference.map((p) => p.pts)].sort((a, b) => a - b),
      tsPct: [...reference.map((p) => p.tsPct)].sort((a, b) => a - b),
      usgPct: [...reference.map((p) => p.usgPct)].sort((a, b) => a - b),
      bpm: [...reference.map((p) => p.bpm)].sort((a, b) => a - b),
      obpm: [...reference.map((p) => p.obpm)].sort((a, b) => a - b),
      dbpm: [...reference.map((p) => p.dbpm)].sort((a, b) => a - b),
      astPct: [...reference.map((p) => p.astPct)].sort((a, b) => a - b),
      tovPct: [...reference.map((p) => p.tovPct)].sort((a, b) => a - b),
      rebPct: [...reference.map((p) => p.orebPct + p.drebPct)].sort((a, b) => a - b),
      rimPct: [...reference.map((p) => p.rimPct)].sort((a, b) => a - b),
      threePct: [...reference.map((p) => p.threePct)].sort((a, b) => a - b),
      netDiff: [...reference.map((p) => p.onOff.netDiff)].sort((a, b) => a - b),
      ortg: [...reference.map((p) => p.ortg)].sort((a, b) => a - b),
      drtg: [...reference.map((p) => p.drtg)].sort((a, b) => a - b),
    };

    for (const p of members) {
      result[p.id] = {
        pts: calcRankPercentile(p.pts, sorted.pts),
        tsPct: calcRankPercentile(p.tsPct, sorted.tsPct),
        usgPct: calcRankPercentile(p.usgPct, sorted.usgPct),
        bpm: calcRankPercentile(p.bpm, sorted.bpm),
        obpm: calcRankPercentile(p.obpm, sorted.obpm),
        dbpm: calcRankPercentile(p.dbpm, sorted.dbpm),
        astPct: calcRankPercentile(p.astPct, sorted.astPct),
        tovPct: calcRankPercentile(p.tovPct, sorted.tovPct, true),
        rebPct: calcRankPercentile(p.orebPct + p.drebPct, sorted.rebPct),
        rimPct: calcRankPercentile(p.rimPct, sorted.rimPct),
        threePct: calcRankPercentile(p.threePct, sorted.threePct),
        netDiff: calcRankPercentile(p.onOff.netDiff, sorted.netDiff),
        ortg: calcRankPercentile(p.ortg, sorted.ortg),
        drtg: calcRankPercentile(p.drtg, sorted.drtg, true),
      };
    }
  }

  return result;
}

export function getPercentileColorClass(percentile: number): {
  bar: string;
  text: string;
  tierLabel: string;
} {
  if (percentile >= 85) {
    return { bar: 'bg-emerald-500', text: 'text-emerald-400', tierLabel: 'Élite' };
  }
  if (percentile >= 65) {
    return { bar: 'bg-teal-400', text: 'text-teal-300', tierLabel: 'Sopra media' };
  }
  if (percentile >= 40) {
    return { bar: 'bg-amber-400', text: 'text-amber-300', tierLabel: 'Nella media' };
  }
  return { bar: 'bg-rose-500', text: 'text-rose-400', tierLabel: 'Sotto media' };
}

export function parseTimestampToSeconds(label: string): number {
  const clean = label.trim();
  if (!clean) return 0;
  if (/^\d+$/.test(clean)) return Number(clean);
  const parts = clean.split(':').map((n) => Number(n));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function getYouTubeEmbedUrl(url: string, timestampLabel = ''): string | null {
  try {
    const parsed = new URL(url);
    let videoId = '';
    if (parsed.hostname.includes('youtu.be')) {
      videoId = parsed.pathname.replace('/', '').split('/')[0];
    } else if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/shorts/')) {
        videoId = parsed.pathname.split('/')[2] || '';
      } else if (parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.split('/')[2] || '';
      } else {
        videoId = parsed.searchParams.get('v') || '';
      }
    }

    if (!videoId || !/^[a-zA-Z0-9_-]{6,15}$/.test(videoId)) return null;
    const startSec =
      parseTimestampToSeconds(timestampLabel) || Number(parsed.searchParams.get('t')?.replace('s', '') || 0);
    return startSec > 0
      ? `https://www.youtube.com/embed/${videoId}?start=${startSec}`
      : `https://www.youtube.com/embed/${videoId}`;
  } catch {
    return null;
  }
}

export function formatSigned(val: number, decimals = 1): string {
  const fixed = val.toFixed(decimals);
  return val > 0 ? `+${fixed}` : fixed;
}

export function parseHeightToInches(height: string): number {
  const match = height.trim().match(/^(\d+)[\s'-]+(\d+)/);
  if (match) {
    const ft = Number(match[1]);
    const inch = Number(match[2]);
    if (Number.isFinite(ft) && Number.isFinite(inch)) {
      return ft * 12 + inch;
    }
  }
  return 78; // 6-6 fallback
}

// 5-Axis Skill DNA (Cerebro-inspired deterministic rating 1–99 against active cohort)
export function computeSkillDNA(
  player: PlayerProfile,
  allPlayers: PlayerProfile[],
  minMinutes: MinutesThreshold = 0
): SkillDnaProfile {
  const qualified = allPlayers.filter((p) => p.min >= minMinutes);
  const ref = qualified.length >= 5 ? qualified : allPlayers;

  const scoringRaw = (p: PlayerProfile) =>
    p.pts * 1.45 + p.usgPct * 0.45 + (p.tsPct > 0 ? (p.tsPct - 50) * 0.65 : -8) + p.ftr * 0.08;
  const playmakingRaw = (p: PlayerProfile) =>
    p.astPct * 1.25 + p.ast * 3.2 - Math.max(0, p.tovPct - 12) * 0.55;
  const shootingRaw = (p: PlayerProfile) => {
    const threeWeight = Math.min(1, p.threePAr / 35);
    return p.threePct * (0.65 + 0.55 * threeWeight) + p.threePAr * 0.35 + p.efgPct * 0.25;
  };
  const interiorRaw = (p: PlayerProfile) =>
    p.rimPct * 0.55 + p.orebPct * 2.1 + p.drebPct * 1.35 + p.reb * 1.9;
  const defenseRaw = (p: PlayerProfile) =>
    p.dbpm * 4.5 + p.stl * 4.2 + p.blk * 4.0 + (105 - p.drtg) * 0.9;

  const sortedScoring = ref.map(scoringRaw).sort((a, b) => a - b);
  const sortedPlaymaking = ref.map(playmakingRaw).sort((a, b) => a - b);
  const sortedShooting = ref.map(shootingRaw).sort((a, b) => a - b);
  const sortedInterior = ref.map(interiorRaw).sort((a, b) => a - b);
  const sortedDefense = ref.map(defenseRaw).sort((a, b) => a - b);

  const scoring = calcRankPercentile(scoringRaw(player), sortedScoring);
  const playmaking = calcRankPercentile(playmakingRaw(player), sortedPlaymaking);
  const shooting = calcRankPercentile(shootingRaw(player), sortedShooting);
  const interior = calcRankPercentile(interiorRaw(player), sortedInterior);
  const defense = calcRankPercentile(defenseRaw(player), sortedDefense);

  const overallScore = Math.round(
    scoring * 0.24 + playmaking * 0.18 + shooting * 0.2 + interior * 0.18 + defense * 0.2
  );

  return {
    overallScore,
    axes: [
      {
        key: 'scoring',
        code: 'PSP',
        label: 'Scoring',
        score: scoring,
        detail: `${player.pts.toFixed(1)} PTS · ${player.usgPct.toFixed(1)}% USG · ${player.tsPct.toFixed(1)}% TS`,
      },
      {
        key: 'playmaking',
        code: 'FGP',
        label: 'Playmaking',
        score: playmaking,
        detail: `${player.ast.toFixed(1)} AST · ${player.astPct.toFixed(1)}% AST% · ${player.tovPct.toFixed(1)}% TOV%`,
      },
      {
        key: 'shooting',
        code: '3PE',
        label: 'Shooting',
        score: shooting,
        detail: `${player.threePct.toFixed(1)}% 3P · ${player.threePAr.toFixed(0)}% 3PAr`,
      },
      {
        key: 'interior',
        code: 'INT',
        label: 'Interior & Glass',
        score: interior,
        detail: `${player.rimPct.toFixed(1)}% Rim · ${player.reb.toFixed(1)} REB`,
      },
      {
        key: 'defense',
        code: 'DSI',
        label: 'Defense',
        score: defense,
        detail: `${formatSigned(player.dbpm)} DBPM · ${player.stl.toFixed(1)} STL · ${player.blk.toFixed(1)} BLK`,
      },
    ],
  };
}

// Probabilistic Mixed Archetypes (sum to 100% — captures hybrid basketball roles)
export function computeProbabilisticArchetypes(player: PlayerProfile): ArchetypeShare[] {
  const h = parseHeightToInches(player.height); // e.g. 75 = 6-3, 79 = 6-7, 83 = 6-11
  const isBig = h >= 81 || player.position === 'C';
  const isWing = h >= 77 && h <= 81;
  const isGuard = h <= 78 || player.position === 'G';

  const rawScores: Array<{
    id: string;
    label: string;
    shortLabel: string;
    description: string;
    logit: number;
  }> = [
    {
      id: 'primary-creator',
      label: 'Primary Creator',
      shortLabel: 'Creator',
      description: 'Gestione P&R, alto volume di possessi e creazione per sé e per i compagni.',
      logit:
        (isGuard ? 1.1 : isWing ? 0.35 : -1.2) +
        (player.usgPct - 20) * 0.14 +
        (player.astPct - 16) * 0.14 +
        (player.pts - 10) * 0.08,
    },
    {
      id: 'rim-slasher',
      label: 'Rim-Pressuring Slasher',
      shortLabel: 'Slasher',
      description: 'Attacco verticale del ferro, falli subiti (FTr) e finalizzazione nel pitturato.',
      logit:
        (isBig ? -0.4 : 0.7) +
        (player.ftr - 30) * 0.06 +
        (player.rimPct - 58) * 0.09 +
        (player.usgPct - 18) * 0.08 -
        Math.max(0, player.threePAr - 42) * 0.05,
    },
    {
      id: 'perimeter-sniper',
      label: 'Perimeter Sniper / 3&D',
      shortLabel: 'Sniper / 3&D',
      description: 'Spaziatura perimetrale ad alta frequenza da 3 punti e difesa sugli esterni.',
      logit:
        (isBig ? -1.0 : 0.7) +
        (player.threePAr - 34) * 0.085 +
        (player.threePct - 33) * 0.12 +
        (player.stl - 0.8) * 0.45 -
        Math.max(0, player.usgPct - 26) * 0.06,
    },
    {
      id: 'two-way-wing',
      label: 'Versatile Two-Way Wing',
      shortLabel: 'Two-Way Wing',
      description: 'Ala duttile su più ruoli con equilibrio tra difesa, rimbalzo e tiro piazzato.',
      logit:
        (isWing ? 1.25 : 0.15) +
        (player.dbpm - 0.5) * 0.45 +
        (player.drebPct - 14) * 0.07 +
        (player.threePct - 32) * 0.05 +
        (player.stl + player.blk - 1.2) * 0.4,
    },
    {
      id: 'stretch-playmaking-big',
      label: 'Stretch / Playmaking Big',
      shortLabel: 'Stretch Big',
      description: 'Lungo moderno capace di aprire il campo da 3 punti o rifinire dal gomito.',
      logit:
        (h >= 80 ? 1.1 : -1.5) +
        (player.threePAr - 20) * 0.075 +
        (player.threePct - 30) * 0.07 +
        (player.astPct - 10) * 0.08 +
        (player.reb - 4.5) * 0.14,
    },
    {
      id: 'rim-anchor',
      label: 'Rim-Protecting Anchor',
      shortLabel: 'Rim Anchor',
      description: 'Protezione del ferro, controllo dei tabelloni e finalizzazione ad alta efficienza.',
      logit:
        (h >= 81 ? 1.4 : h >= 79 ? 0.2 : -2.2) +
        (player.blk - 0.9) * 1.05 +
        (player.orebPct - 7) * 0.18 +
        (player.drebPct - 18) * 0.1 +
        (player.rimPct - 60) * 0.06 -
        Math.max(0, player.threePAr - 28) * 0.06,
    },
  ];

  // Temperature-calibrated softmax
  const temperature = 1.65;
  const maxLogit = Math.max(...rawScores.map((r) => r.logit));
  const exps = rawScores.map((r) => Math.exp((r.logit - maxLogit) / temperature));
  const sumExp = exps.reduce((acc, v) => acc + v, 0) || 1;

  const shares = rawScores
    .map((r, i) => ({
      id: r.id,
      label: r.label,
      shortLabel: r.shortLabel,
      description: r.description,
      rawPct: (exps[i] / sumExp) * 100,
    }))
    .sort((a, b) => b.rawPct - a.rawPct);

  // Clean integer percentages summing strictly to 100
  const rounded = shares.map((s) => Math.max(1, Math.round(s.rawPct)));
  const diff = 100 - rounded.reduce((a, b) => a + b, 0);
  rounded[0] = Math.max(1, rounded[0] + diff);

  return shares.map((s, idx) => ({
    id: s.id,
    label: s.label,
    shortLabel: s.shortLabel,
    pct: rounded[idx],
    description: s.description,
  }));
}

// Multivariate Player Comps (Top N statistically closest prospects in the monitored pool)
export function computeSimilarPlayers(
  target: PlayerProfile,
  pool: PlayerProfile[],
  topN = 3
): SimilarPlayerComp[] {
  const candidates = pool.filter((p) => p.id !== target.id && (p.gp > 0 || p.min > 0));
  if (candidates.length === 0) return [];

  const featureDefs: Array<{
    key: string;
    label: string;
    weight: number;
    get: (p: PlayerProfile) => number;
  }> = [
    { key: 'height', label: 'Taglia fisica', weight: 1.55, get: (p) => parseHeightToInches(p.height) },
    { key: 'usg', label: 'Volume offensivo (USG%)', weight: 1.15, get: (p) => p.usgPct },
    { key: 'ast', label: 'Creazione e regia (AST%)', weight: 1.25, get: (p) => p.astPct },
    { key: 'tov', label: 'Gestione possesso', weight: 0.65, get: (p) => p.tovPct },
    { key: 'threePAr', label: 'Frequenza tiro da 3', weight: 1.3, get: (p) => p.threePAr },
    { key: 'threePct', label: 'Efficienza perimetrale (3P%)', weight: 1.0, get: (p) => p.threePct },
    { key: 'ftr', label: 'Pressione al ferro (FTr)', weight: 0.9, get: (p) => p.ftr },
    { key: 'rimPct', label: 'Finalizzazione al ferro', weight: 0.85, get: (p) => p.rimPct },
    { key: 'oreb', label: 'Presenza a rimbalzo offensivo', weight: 1.0, get: (p) => p.orebPct },
    { key: 'dreb', label: 'Controllo rimbalzi difensivi', weight: 1.0, get: (p) => p.drebPct },
    { key: 'stl', label: 'Attività sulle linee di passaggio', weight: 0.8, get: (p) => p.stl },
    { key: 'blk', label: 'Protezione del ferro (BLK)', weight: 1.15, get: (p) => p.blk },
    { key: 'ts', label: 'Efficienza di tiro (TS%)', weight: 0.85, get: (p) => p.tsPct },
  ];

  // Mean & std across full pool for z-score standardization
  const stats = featureDefs.map((f) => {
    const vals = pool.map(f.get);
    const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
    const variance =
      vals.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / Math.max(1, vals.length);
    const std = Math.sqrt(variance) || 1;
    return { ...f, mean, std };
  });

  const targetZ = stats.map((s) => (s.get(target) - s.mean) / s.std);

  const scored = candidates.map((cand) => {
    let weightedSqDist = 0;
    let totalWeight = 0;
    let bestSharedLabel = 'Profilo statistico affine';
    let bestSharedScore = -Infinity;

    stats.forEach((s, idx) => {
      const candZ = (s.get(cand) - s.mean) / s.std;
      const diff = targetZ[idx] - candZ;
      weightedSqDist += s.weight * diff * diff;
      totalWeight += s.weight;

      // Identify most distinctive shared strength (both elevated & close to each other)
      const sharedElevation = (targetZ[idx] + candZ) * 0.5 - Math.abs(diff) * 0.9;
      if (sharedElevation > bestSharedScore) {
        bestSharedScore = sharedElevation;
        bestSharedLabel = s.label;
      }
    });

    const rmsDist = Math.sqrt(weightedSqDist / Math.max(1, totalWeight));
    const similarityPct = Math.max(42, Math.min(98, Math.round(100 * Math.exp(-rmsDist * 0.52))));

    return {
      player: cand,
      similarityPct,
      sharedStrength: bestSharedLabel,
    };
  });

  return scored.sort((a, b) => b.similarityPct - a.similarityPct).slice(0, topN);
}

function buildSplit(
  makes: number,
  attempts: number,
  expectedMakes: number,
  totalAttempts: number
): ShotQualitySplit {
  if (attempts === 0) {
    return { makes: 0, attempts: 0, fgPct: 0, xFgPct: 0, delta: 0, freqPct: 0 };
  }
  const fgPct = Number(((makes / attempts) * 100).toFixed(1));
  const xFgPct = Number(((expectedMakes / attempts) * 100).toFixed(1));
  const delta = Number((fgPct - xFgPct).toFixed(1));
  const freqPct = Number(((attempts / Math.max(1, totalAttempts)) * 100).toFixed(1));
  return { makes, attempts, fgPct, xFgPct, delta, freqPct };
}

// Shot Quality Engine (shot-level xFG%, xeFG%, xPPS, 2PT/3PT & Quality Tier splits)
export function computeShotQualityMetrics(
  shotZones: ShotZoneSummary[],
  shots?: ShotEvent[]
): ShotQualityMetrics {
  const emptySplit: ShotQualitySplit = {
    makes: 0,
    attempts: 0,
    fgPct: 0,
    xFgPct: 0,
    delta: 0,
    freqPct: 0,
  };

  if (shots && shots.length > 0) {
    let makes = 0;
    let expectedMakes = 0;
    let twoMakes = 0;
    let twoAtt = 0;
    let twoExpMakes = 0;
    let threeMakes = 0;
    let threeAtt = 0;
    let threeExpMakes = 0;
    let rimAttempts = 0;
    let midAttempts = 0;
    let usesShotLevelContext = false;

    const buckets: Record<ShotQualityTier, { makes: number; attempts: number; expMakes: number }> = {
      high: { makes: 0, attempts: 0, expMakes: 0 },
      medium: { makes: 0, attempts: 0, expMakes: 0 },
      low: { makes: 0, attempts: 0, expMakes: 0 },
    };

    for (const s of shots) {
      const q = evaluateShotQuality(s);
      const p = q.expectedFgPct / 100;
      if (q.hasPlayContext) usesShotLevelContext = true;

      expectedMakes += p;
      if (s.made) makes += 1;

      if (s.isThree) {
        threeAtt += 1;
        threeExpMakes += p;
        if (s.made) threeMakes += 1;
      } else {
        twoAtt += 1;
        twoExpMakes += p;
        if (s.made) twoMakes += 1;
      }

      if (s.zone === 'restricted') {
        rimAttempts += 1;
      } else if (!s.isThree) {
        midAttempts += 1;
      }

      buckets[q.qualityTier].attempts += 1;
      buckets[q.qualityTier].expMakes += p;
      if (s.made) buckets[q.qualityTier].makes += 1;
    }

    const attempts = shots.length;
    const actualFgPct = Number(((makes / attempts) * 100).toFixed(1));
    const expectedFgPct = Number(((expectedMakes / attempts) * 100).toFixed(1));
    const shotMakingDelta = Number((actualFgPct - expectedFgPct).toFixed(1));

    const actualEfgPct = Number((((makes + 0.5 * threeMakes) / attempts) * 100).toFixed(1));
    const expectedEfgPct = Number((((expectedMakes + 0.5 * threeExpMakes) / attempts) * 100).toFixed(1));
    const efgDelta = Number((actualEfgPct - expectedEfgPct).toFixed(1));

    const actualPps = Number(((twoMakes * 2 + threeMakes * 3) / attempts).toFixed(2));
    const expectedPps = Number(((twoExpMakes * 2 + threeExpMakes * 3) / attempts).toFixed(2));

    const rimFreq = Number(((rimAttempts / attempts) * 100).toFixed(1));
    const threeFreq = Number(((threeAtt / attempts) * 100).toFixed(1));
    const midFreq = Number(((midAttempts / attempts) * 100).toFixed(1));
    const rimPlusThreeFreq = Number((((rimAttempts + threeAtt) / attempts) * 100).toFixed(1));

    return {
      actualFgPct,
      expectedFgPct,
      shotMakingDelta,
      actualEfgPct,
      expectedEfgPct,
      efgDelta,
      actualPps,
      expectedPps,
      rimPlusThreeFreq,
      rimFreq,
      threeFreq,
      midFreq,
      attempts,
      makes,
      twoPt: buildSplit(twoMakes, twoAtt, twoExpMakes, attempts),
      threePt: buildSplit(threeMakes, threeAtt, threeExpMakes, attempts),
      qualityTiers: {
        high: buildSplit(buckets.high.makes, buckets.high.attempts, buckets.high.expMakes, attempts),
        medium: buildSplit(
          buckets.medium.makes,
          buckets.medium.attempts,
          buckets.medium.expMakes,
          attempts
        ),
        low: buildSplit(buckets.low.makes, buckets.low.attempts, buckets.low.expMakes, attempts),
      },
      usesShotLevelContext,
    };
  }

  // Fallback from pre-aggregated zones
  let attempts = 0;
  let makes = 0;
  let expectedMakes = 0;
  let twoMakes = 0;
  let twoAtt = 0;
  let twoExpMakes = 0;
  let threeMakes = 0;
  let threeAtt = 0;
  let threeExpMakes = 0;
  let rimAttempts = 0;
  let midAttempts = 0;

  const buckets: Record<ShotQualityTier, { makes: number; attempts: number; expMakes: number }> = {
    high: { makes: 0, attempts: 0, expMakes: 0 },
    medium: { makes: 0, attempts: 0, expMakes: 0 },
    low: { makes: 0, attempts: 0, expMakes: 0 },
  };

  for (const z of shotZones) {
    const zoneExpPct = z.expectedFgPct || z.d1AvgPct;
    const zExpMakes = z.attempts * (zoneExpPct / 100);
    attempts += z.attempts;
    makes += z.makes;
    expectedMakes += zExpMakes;

    const isThreeZone =
      z.zone === 'corner3Left' || z.zone === 'corner3Right' || z.zone === 'aboveBreak3';
    if (isThreeZone) {
      threeAtt += z.attempts;
      threeMakes += z.makes;
      threeExpMakes += zExpMakes;
    } else {
      twoAtt += z.attempts;
      twoMakes += z.makes;
      twoExpMakes += zExpMakes;
      if (z.zone === 'restricted') {
        rimAttempts += z.attempts;
      } else {
        midAttempts += z.attempts;
      }
    }

    const tier: ShotQualityTier =
      zoneExpPct >= 50 ? 'high' : zoneExpPct >= 36 ? 'medium' : 'low';
    buckets[tier].attempts += z.attempts;
    buckets[tier].makes += z.makes;
    buckets[tier].expMakes += zExpMakes;
  }

  if (attempts === 0) {
    return {
      actualFgPct: 0,
      expectedFgPct: 0,
      shotMakingDelta: 0,
      actualEfgPct: 0,
      expectedEfgPct: 0,
      efgDelta: 0,
      actualPps: 0,
      expectedPps: 0,
      rimPlusThreeFreq: 0,
      rimFreq: 0,
      threeFreq: 0,
      midFreq: 0,
      attempts: 0,
      makes: 0,
      twoPt: emptySplit,
      threePt: emptySplit,
      qualityTiers: {
        high: emptySplit,
        medium: emptySplit,
        low: emptySplit,
      },
      usesShotLevelContext: false,
    };
  }

  const actualFgPct = Number(((makes / attempts) * 100).toFixed(1));
  const expectedFgPct = Number(((expectedMakes / attempts) * 100).toFixed(1));
  const shotMakingDelta = Number((actualFgPct - expectedFgPct).toFixed(1));
  const actualEfgPct = Number((((makes + 0.5 * threeMakes) / attempts) * 100).toFixed(1));
  const expectedEfgPct = Number((((expectedMakes + 0.5 * threeExpMakes) / attempts) * 100).toFixed(1));
  const efgDelta = Number((actualEfgPct - expectedEfgPct).toFixed(1));
  const actualPps = Number(((twoMakes * 2 + threeMakes * 3) / attempts).toFixed(2));
  const expectedPps = Number(((twoExpMakes * 2 + threeExpMakes * 3) / attempts).toFixed(2));
  const rimFreq = Number(((rimAttempts / attempts) * 100).toFixed(1));
  const threeFreq = Number(((threeAtt / attempts) * 100).toFixed(1));
  const midFreq = Number(((midAttempts / attempts) * 100).toFixed(1));
  const rimPlusThreeFreq = Number((((rimAttempts + threeAtt) / attempts) * 100).toFixed(1));

  return {
    actualFgPct,
    expectedFgPct,
    shotMakingDelta,
    actualEfgPct,
    expectedEfgPct,
    efgDelta,
    actualPps,
    expectedPps,
    rimPlusThreeFreq,
    rimFreq,
    threeFreq,
    midFreq,
    attempts,
    makes,
    twoPt: buildSplit(twoMakes, twoAtt, twoExpMakes, attempts),
    threePt: buildSplit(threeMakes, threeAtt, threeExpMakes, attempts),
    qualityTiers: {
      high: buildSplit(buckets.high.makes, buckets.high.attempts, buckets.high.expMakes, attempts),
      medium: buildSplit(
        buckets.medium.makes,
        buckets.medium.attempts,
        buckets.medium.expMakes,
        attempts
      ),
      low: buildSplit(buckets.low.makes, buckets.low.attempts, buckets.low.expMakes, attempts),
    },
    usesShotLevelContext: false,
  };
}

