import { PlayerPercentiles, PlayerProfile } from '../types/basketball';
import { formatSigned } from './analytics';

function escapeCsvCell(value: string | number | undefined | null): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportWatchlistCsv(
  players: PlayerProfile[],
  percentilesMap: Record<string, PlayerPercentiles>,
  label = 'watchlist'
) {
  const headers = [
    'Giocatore',
    'College',
    'Conference',
    'Ruolo',
    'Classe',
    'Altezza',
    'Peso (lbs)',
    'Italiano',
    'Rank Draft 2027',
    'GP',
    'MIN',
    'PTS',
    'REB',
    'AST',
    'STL',
    'BLK',
    'TS%',
    'eFG%',
    'USG%',
    'ORtg',
    'DRtg',
    'BPM',
    'OBPM',
    'DBPM',
    'AST%',
    'TOV%',
    'Rim%',
    'Mid%',
    '3P%',
    '3PAr',
    'FTr',
    'On/Off Net Diff',
    'BPM Percentile',
  ];

  const rows = players.map((p) => {
    const pct = percentilesMap[p.id];
    return [
      p.name,
      p.team,
      p.conference,
      p.position,
      p.classYear,
      p.height,
      p.weight,
      p.isItalian ? 'Si' : 'No',
      p.draftRank ?? '',
      p.gp,
      p.min.toFixed(1),
      p.pts.toFixed(1),
      p.reb.toFixed(1),
      p.ast.toFixed(1),
      p.stl.toFixed(1),
      p.blk.toFixed(1),
      p.tsPct.toFixed(1),
      p.efgPct.toFixed(1),
      p.usgPct.toFixed(1),
      p.ortg.toFixed(1),
      p.drtg.toFixed(1),
      p.bpm.toFixed(1),
      p.obpm.toFixed(1),
      p.dbpm.toFixed(1),
      p.astPct.toFixed(1),
      p.tovPct.toFixed(1),
      p.rimPct.toFixed(1),
      p.midPct.toFixed(1),
      p.threePct.toFixed(1),
      p.threePAr.toFixed(1),
      p.ftr.toFixed(1),
      p.onOff.netDiff.toFixed(1),
      pct ? `${pct.bpm}°` : '',
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  // Add UTF-8 BOM for seamless Excel / Numbers Italian character support
  const csv = `\uFEFF${headers.map(escapeCsvCell).join(',')}\n${rows.join('\n')}`;
  const dateStamp = new Date().toISOString().slice(0, 10);
  triggerDownload(csv, `hoopscope-ncaa-${label}-${dateStamp}.csv`, 'text/csv;charset=utf-8;');
}

export function exportPlayerDossierReport(player: PlayerProfile, pct: PlayerPercentiles) {
  const dateStr = new Date().toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const zoneLines = player.shotZones
    .map(
      (z) =>
        `| ${z.label} | ${z.makes}/${z.attempts} | ${z.attempts > 0 ? `${z.fgPct.toFixed(1)}%` : '—'} | ${z.freqPct.toFixed(1)}% | ${z.attempts > 0 ? `${formatSigned(z.diffVsAvg)}%` : '—'} |`
    )
    .join('\n');

  const md = `# Scouting Dossier — ${player.name}
**Generato il:** ${dateStr} · **Stagione:** NCAA Division I 2026–27 (ESPN Live)
**College:** ${player.team} (${player.conference}) · **Ruolo:** ${player.roleLabel} (${player.position}) · **Classe:** ${player.classYear}
**Misure:** ${player.height} / ${player.weight} lbs${player.hometown ? ` · **Origine:** ${player.hometown}` : ''}${player.draftRank ? ` · **Big Board 2027:** #${player.draftRank}` : ''}

---

## 1. Boxscore & Metriche Avanzate (${player.gp} GP · ${player.min.toFixed(1)} MIN)
- **Medie gara:** ${player.pts.toFixed(1)} PTS · ${player.reb.toFixed(1)} REB · ${player.ast.toFixed(1)} AST · ${player.stl.toFixed(1)} STL · ${player.blk.toFixed(1)} BLK
- **Efficienza:** TS% ${player.tsPct.toFixed(1)}% (${pct.tsPct}° pct) · eFG% ${player.efgPct.toFixed(1)}% · 3PAr ${player.threePAr.toFixed(1)}% · FTr ${player.ftr.toFixed(1)}%
- **Volume & Regia:** USG% ${player.usgPct.toFixed(1)}% (${pct.usgPct}° pct) · AST% ${player.astPct.toFixed(1)}% (${pct.astPct}° pct) · TOV% ${player.tovPct.toFixed(1)}% (${pct.tovPct}° pct)
- **Impatto:** BPM ${formatSigned(player.bpm)} (${pct.bpm}° pct) · OBPM ${formatSigned(player.obpm)} · DBPM ${formatSigned(player.dbpm)} · ORtg ${player.ortg.toFixed(1)} · DRtg ${player.drtg.toFixed(1)}

## 2. Split On / Off Court
- **ON Court:** ORtg ${player.onOff.onOrtg.toFixed(1)} · DRtg ${player.onOff.onDrtg.toFixed(1)} · Net ${formatSigned(player.onOff.onNet)}
- **OFF Court:** ORtg ${player.onOff.offOrtg.toFixed(1)} · DRtg ${player.onOff.offDrtg.toFixed(1)} · Net ${formatSigned(player.onOff.offNet)}
- **Differenziale Net On/Off:** ${formatSigned(player.onOff.netDiff)} (${pct.netDiff}° pct)

## 3. Distribuzione di Tiro (${player.shotsSource === 'pbp' ? 'PBP Reale ESPN' : 'Profilo Stagionale'})
| Zona | FGM/A | FG% | Frequenza | vs Media D1 |
| --- | ---: | ---: | ---: | ---: |
${zoneLines}
`;

  const slug = player.id.replace(/[^a-z0-9-]/gi, '');
  const dateStamp = new Date().toISOString().slice(0, 10);
  triggerDownload(md, `dossier-${slug}-${dateStamp}.md`, 'text/markdown;charset=utf-8;');
}
