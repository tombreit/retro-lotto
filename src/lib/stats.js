// Statistik über einen Bereich von Ziehungen [from, to).

import { binomial } from '../games.js';
import { indexFrom } from './match.js';

/** Zeiträume für den Umschalter. `start` liefert das Startdatum relativ zur letzten Ziehung. */
export const PERIODS = [
  { id: 'all', label: 'Gesamt', start: () => '0000-00-00' },
  { id: '2000', label: 'Seit 2000', start: () => '2000-01-01' },
  { id: '10y', label: '10 Jahre', start: (last) => shiftYears(last, -10) },
  { id: '1y', label: '12 Monate', start: (last) => shiftYears(last, -1) },
];

function shiftYears(iso, years) {
  return `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;
}

export function rangeFor(store, periodId) {
  const period = PERIODS.find((p) => p.id === periodId) ?? PERIODS[0];
  const last = store.dates.at(-1);
  // „Seit 2000“ ergibt bei Eurojackpot (ab 2012) dasselbe wie „Gesamt“ – das ist in Ordnung.
  return { from: indexFrom(store, period.start(last)), to: store.size };
}

/**
 * Häufigkeit und „zuletzt gezogen“ je Zahl im Bereich.
 * @returns {{ number: number, count: number, lastIndex: number }[]} Index 0 = Zahl 1
 */
export function numberStats(store, { from, to }) {
  const { max } = store.game;
  const count = new Uint32Array(max + 1);
  const lastIndex = new Int32Array(max + 1).fill(-1);
  for (let i = from; i < to; i++) {
    for (const n of store.numbers[i]) {
      count[n]++;
      lastIndex[n] = i;
    }
  }
  return Array.from({ length: max }, (_, k) => ({
    number: k + 1,
    count: count[k + 1],
    lastIndex: lastIndex[k + 1],
  }));
}

/** Für jede Zahl: wie viele Ziehungen seit dem letzten Auftreten (über die gesamte Historie). */
export function currentGaps(store) {
  const { max } = store.game;
  const gaps = [];
  const seen = new Set();
  for (let i = store.size - 1; i >= 0 && seen.size < max; i--) {
    for (const n of store.numbers[i]) {
      if (seen.has(n)) continue;
      seen.add(n);
      gaps.push({ number: n, since: store.size - 1 - i, lastIndex: i });
    }
  }
  return gaps.toSorted((a, b) => b.since - a.since || a.number - b.number);
}

/** Wie oft jedes Zahlenpaar im Bereich gemeinsam gezogen wurde. */
function pairCounts(store, { from, to }) {
  const { max } = store.game;
  const counts = new Uint32Array((max + 1) * (max + 1));
  for (let i = from; i < to; i++) {
    const nums = store.numbers[i];
    for (let a = 0; a < nums.length; a++)
      for (let b = a + 1; b < nums.length; b++) {
        const [x, y] = nums[a] < nums[b] ? [nums[a], nums[b]] : [nums[b], nums[a]];
        counts[x * (max + 1) + y]++;
      }
  }
  const pairs = [];
  for (let a = 1; a <= max; a++)
    for (let b = a + 1; b <= max; b++) pairs.push({ pair: [a, b], count: counts[a * (max + 1) + b] });
  return pairs;
}

/** Wie oft ein bestimmtes Zahlenpaar in `draws` Ziehungen bei reinem Zufall gemeinsam kommt. */
export function pairExpected(game, draws) {
  return (draws * game.pick * (game.pick - 1)) / (game.max * (game.max - 1));
}

/** Die häufigsten Zahlenpaare im Bereich. */
export function topPairs(store, range, limit = 5) {
  return pairCounts(store, range)
    .toSorted((x, y) => y.count - x.count)
    .slice(0, limit);
}

/** Die am seltensten gemeinsam gezogenen Paare – alle mit dem kleinsten Wert, höchstens `limit`. */
export function rarestPairs(store, range, limit = 3) {
  const pairs = pairCounts(store, range);
  const min = Math.min(...pairs.map((p) => p.count));
  return pairs.filter((p) => p.count === min).slice(0, limit);
}

/** Kombinationen, die mehr als einmal gezogen wurden. */
export function repeatedCombinations(store) {
  const groups = Map.groupBy(store.numbers.keys(), (i) => store.numbers[i].join('-'));
  return [...groups.values()].filter((idx) => idx.length > 1);
}

/**
 * Rekorde über die gesamte Historie:
 *  streak – eine Zahl in den meisten aufeinanderfolgenden Ziehungen
 *  gap    – die längste Pause einer Zahl (Ziehungen ohne sie)
 */
export function records(store) {
  const { max } = store.game;
  const run = new Uint32Array(max + 1);
  const lastSeen = new Int32Array(max + 1).fill(-1);
  let streak = { number: 0, length: 0, end: -1 };
  let gap = { number: 0, length: 0, from: -1, to: -1 };
  for (let i = 0; i < store.size; i++) {
    const drawn = new Set(store.numbers[i]);
    for (let n = 1; n <= max; n++) {
      if (!drawn.has(n)) {
        run[n] = 0;
        continue;
      }
      run[n]++;
      if (run[n] > streak.length) streak = { number: n, length: run[n], end: i };
      const pause = i - lastSeen[n] - 1;
      if (lastSeen[n] >= 0 && pause > gap.length) gap = { number: n, length: pause, from: lastSeen[n], to: i };
      lastSeen[n] = i;
    }
  }
  return { streak, gap };
}

// ---------------------------------------------------------------- Muster ganzer Ziehungen
// Über die gesamte Historie, jeweils mit dem Wert, den reiner Zufall erwarten lässt.

/** Längste Folge direkt aufeinanderfolgender Zahlen in einer Ziehung (z. B. 12-13-14 → 3). */
export function longestRunOf(numbers) {
  const sorted = numbers.toSorted((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let k = 1; k < sorted.length; k++) {
    run = sorted[k] === sorted[k - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/** Die längste Folge selbst, aufsteigend: [2, 3, 4, 5, 6] aus 2-3-4-5-6-26. */
export function runIn(numbers, length) {
  const sorted = numbers.toSorted((a, b) => a - b);
  for (let k = length - 1; k < sorted.length; k++)
    if (sorted[k] - sorted[k - length + 1] === length - 1) return sorted.slice(k - length + 1, k + 1);
  return [];
}

/**
 * Ziehungen mit Nachbarzahlen (mindestens zwei direkt aufeinanderfolgende Zahlen wie 12 und 13).
 * `longest` sind alle Ziehungen mit der längsten Folge, chronologisch.
 */
export function neighbourDraws(store) {
  const { max, pick, combinations } = store.game;
  let count = 0;
  let longest = { length: 0, indices: [] };
  for (let i = 0; i < store.size; i++) {
    const run = longestRunOf(store.numbers[i]);
    if (run >= 2) count++;
    if (run > longest.length) longest = { length: run, indices: [i] };
    else if (run === longest.length) longest.indices.push(i);
  }
  // Ohne Nachbarn: pick Zahlen mit Abstand ≥ 2 aus max – das sind C(max − pick + 1, pick).
  const expectedShare = 1 - binomial(max - pick + 1, pick) / combinations;
  return { count, expectedShare, longest };
}

/**
 * Ziehungen, deren Zahlen alle höchstens `limit` sind (31: nur „Geburtstagszahlen“).
 * `last` ist der Index der jüngsten davon (oder `undefined`).
 */
export function drawsWithin(store, limit = 31) {
  const { pick, combinations } = store.game;
  const within = [...store.numbers.keys()].filter((i) => Math.max(...store.numbers[i]) <= limit);
  return { count: within.length, last: within.at(-1), expectedShare: binomial(limit, pick) / combinations };
}

/**
 * Dreier, die noch nie gemeinsam gezogen wurden. `examples` sind gleichmäßig über alle Treffer
 * verteilt (deterministisch, aufsteigend sortiert).
 */
export function missingTriples(store, examples = 3) {
  const { max, pick, combinations } = store.game;
  const side = max + 1;
  const seen = new Uint8Array(side * side * side);
  for (const nums of store.numbers) {
    const s = nums.toSorted((a, b) => a - b);
    for (let a = 0; a < s.length; a++)
      for (let b = a + 1; b < s.length; b++)
        for (let c = b + 1; c < s.length; c++) seen[(s[a] * side + s[b]) * side + s[c]] = 1;
  }
  const missing = [];
  for (let a = 1; a <= max; a++)
    for (let b = a + 1; b <= max; b++)
      for (let c = b + 1; c <= max; c++) if (!seen[(a * side + b) * side + c]) missing.push([a, b, c]);

  const total = binomial(max, 3);
  // Wahrscheinlichkeit, dass ein bestimmter Dreier in einer Ziehung komplett dabei ist.
  const p = binomial(max - 3, pick - 3) / combinations;
  const step = missing.length / Math.min(examples, missing.length);
  return {
    count: missing.length,
    total,
    expected: total * (1 - p) ** store.size,
    examples: Array.from({ length: Math.min(examples, missing.length) }, (_, k) => missing[Math.floor(k * step)]),
  };
}
