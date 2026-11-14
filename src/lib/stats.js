// Statistik über einen Bereich von Ziehungen [from, to).

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

/** Die häufigsten Zahlenpaare im Bereich. */
export function topPairs(store, { from, to }, limit = 5) {
  const { max } = store.game;
  const counts = new Uint32Array((max + 1) * (max + 1));
  for (let i = from; i < to; i++) {
    const nums = store.numbers[i];
    for (let a = 0; a < nums.length; a++)
      for (let b = a + 1; b < nums.length; b++) counts[nums[a] * (max + 1) + nums[b]]++;
  }
  const pairs = [];
  for (let a = 1; a <= max; a++)
    for (let b = a + 1; b <= max; b++) pairs.push({ pair: [a, b], count: counts[a * (max + 1) + b] });
  return pairs.toSorted((x, y) => y.count - x.count).slice(0, limit);
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
