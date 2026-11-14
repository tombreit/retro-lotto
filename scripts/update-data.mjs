#!/usr/bin/env node
// Aktualisiert data/lotto.json und data/eurojackpot.json aus mehreren unabhängigen Quellen.
//
//   node scripts/update-data.mjs              inkrementelles Update (Standard, auch im Build)
//   node scripts/update-data.mjs --backfill   Eurojackpot-Historie seit 2012 komplett neu laden
//
// Netzwerkfehler einzelner Quellen sind nur Warnungen – dann wird mit dem committeten
// Snapshot weitergearbeitet. Widersprechen sich Quellen, bricht das Skript mit Exit-Code 1 ab.

import { appendFile } from 'node:fs/promises';
import { GAMES } from '../src/games.js';
import { todayBerlin } from './lib/dates.mjs';
import { mergeDraws } from './lib/merge.mjs';
import { readSnapshot, writeSnapshot } from './lib/snapshot.mjs';
import { findGaps } from './lib/validate.mjs';
import { eestiLoto } from './sources/eestiloto.mjs';
import { ejArchive } from './sources/ej-archive.mjs';
import { lottoArchive } from './sources/lotto-archive.mjs';
import { lottoDe } from './sources/lotto-de.mjs';
import { lottozahlenonline } from './sources/lottozahlenonline.mjs';

const backfill = process.argv.includes('--backfill');
const today = todayBerlin();
const warnings = [];
const fmt = new Intl.NumberFormat('de-DE');

const log = (...args) => console.log(...args);
const warn = (message) => {
  warnings.push(message);
  console.warn(`  ⚠ ${message}`);
};

/** Führt eine Quelle aus; Fehler werden zur Warnung, die Quelle liefert dann nichts. */
async function attempt(label, fn) {
  const started = performance.now();
  try {
    const result = await fn();
    log(`  ✓ ${label}: ${fmt.format(result.draws.length)} Ziehungen (${Math.round(performance.now() - started)} ms)`);
    return result;
  } catch (error) {
    warn(`${label} nicht erreichbar – ${error.message}`);
    return null;
  }
}

async function sourcesFor(game, snapshot) {
  const known = new Set(snapshot.map((d) => d.date));
  if (game.id === 'lotto') {
    return [
      await attempt('LottoNumberArchive', lottoArchive),
      await attempt('lottozahlenonline.de', () => lottozahlenonline({ today })),
      await attempt('lotto.de', () => lottoDe('lotto')),
    ];
  }
  const sources = [];
  if (backfill) {
    const years = Array.from({ length: Number(today.slice(0, 4)) - 2011 }, (_, i) => 2012 + i);
    log(`  … lade Eurojackpot-Archiv ${years[0]}–${years.at(-1)} (${years.length} Seiten)`);
    sources.push(await attempt('eurojackpot-zahlen.eu', () => ejArchive({ years, today })));
  }
  sources.push(
    await attempt('Eesti Loto', () => eestiLoto({ known: backfill ? new Set() : known, all: backfill })),
    await attempt('lotto.de', () => lottoDe('eurojackpot')),
  );
  return sources;
}

async function updateGame(game) {
  log(`\n▸ ${game.name}`);
  const snapshot = backfill && game.id === 'eurojackpot' ? [] : await readSnapshot(game.id);
  if (snapshot.length === 0 && game.id === 'eurojackpot' && !backfill)
    warn('Kein Eurojackpot-Snapshot vorhanden – einmalig `npm run data:backfill` ausführen.');

  const sources = (await sourcesFor(game, snapshot)).filter(Boolean);
  let result = mergeDraws(game, snapshot, sources, { today });

  // Notfall: Lücken bei Eurojackpot über das HTML-Archiv der betroffenen Jahre schließen.
  let gaps = findGaps(game, result.draws);
  if (game.id === 'eurojackpot' && gaps.length > 0 && !backfill && snapshot.length > 0) {
    const years = [...new Set(gaps.map((d) => Number(d.slice(0, 4))))];
    log(`  … ${gaps.length} Lücke(n), frage eurojackpot-zahlen.eu (${years.join(', ')})`);
    const extra = await attempt('eurojackpot-zahlen.eu', () => ejArchive({ years, today }));
    if (extra) {
      result = mergeDraws(game, snapshot, [...sources, extra], { today });
      gaps = findGaps(game, result.draws);
    }
  }

  for (const message of result.rejected) warn(`verworfen: ${message}`);
  if (result.conflicts.length > 0) {
    for (const message of result.conflicts) console.error(`  ✗ Widerspruch ${message}`);
    throw new Error(`${game.name}: ${result.conflicts.length} widersprüchliche Ziehung(en) – Daten bleiben unverändert.`);
  }
  if (gaps.length > 0) warn(`${gaps.length} erwartete Ziehung(en) fehlen: ${gaps.slice(-10).join(', ')}`);

  // Eurojackpot nummeriert seine Ziehungen offiziell durch – der Abstand zur eigenen Zählung
  // muss für jede nummerierte Ziehung exakt game.drawNumberOffset betragen.
  const numbered = sources.flatMap((s) => s.numbered ?? []);
  if (numbered.length > 0) {
    const index = new Map(result.draws.map((d, i) => [d.date, i + 1]));
    const off = numbered.filter((n) => index.get(n.date) + game.drawNumberOffset !== n.number);
    if (off.length > 0) {
      const n = off[0];
      const message = `Ziehung ${n.date} ist offiziell Nr. ${n.number}, lokal Nr. ${index.get(n.date)} + ${game.drawNumberOffset} – Ziehung fehlt oder ist doppelt`;
      if (backfill) throw new Error(message);
      warn(message);
    } else log(`  ✓ Zählung passt zu ${numbered.length} offiziellen Ziehungsnummern (bis Nr. ${numbered[0].number})`);
  }

  const changed = backfill || result.added.length > 0;
  if (changed) await writeSnapshot(game.id, result.draws);

  const first = result.draws[0]?.date ?? '–';
  const last = result.draws.at(-1)?.date ?? '–';
  log(`  = ${fmt.format(result.draws.length)} Ziehungen (${first} … ${last}), neu: ${result.added.length}`);
  for (const d of result.added.slice(-5)) log(`    + ${d.date}  ${d.numbers.join(' ')}  [${d.from.join(', ')}]`);
  return { game, total: result.draws.length, last, added: result.added.length, changed };
}

const results = [];
try {
  for (const game of Object.values(GAMES)) results.push(await updateGame(game));
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  process.exitCode = 1;
}

if (process.env.GITHUB_STEP_SUMMARY && results.length > 0) {
  const rows = results.map((r) => `| ${r.game.name} | ${fmt.format(r.total)} | ${r.last} | ${r.added} |`);
  const lines = ['### Ziehungsdaten', '', '| Spiel | Ziehungen | Letzte | Neu |', '|---|---:|---|---:|', ...rows];
  if (warnings.length > 0) lines.push('', ...warnings.map((w) => `- ⚠ ${w}`));
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}
if (process.env.GITHUB_OUTPUT && results.length > 0) {
  const changed = results.some((r) => r.changed);
  const latest = results.map((r) => r.last).toSorted().at(-1);
  await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\nlatest=${latest}\n`);
}
