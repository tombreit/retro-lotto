// Abfrage-Engine: jede Ziehung als 64-Bit-Maske (zwei Uint32-Spalten), Treffer per Popcount.
// Eine komplette Auswertung über ~5.000 Ziehungen dauert deutlich unter einer Millisekunde.

/** Anzahl gesetzter Bits einer 32-Bit-Zahl (SWAR-Popcount). */
export function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/** Zahlen 1–31 landen in `lo` (Bit 0–30), 32–63 in `hi` (Bit 0–31). */
export function maskOf(numbers) {
  let lo = 0;
  let hi = 0;
  for (const n of numbers) {
    if (n <= 31) lo |= 1 << (n - 1);
    else hi |= 1 << (n - 32);
  }
  return { lo: lo >>> 0, hi: hi >>> 0 };
}

/**
 * Baut aus den Rohdaten ([datum, zahlen][]) einen spaltenorientierten Speicher.
 * @param {object} game
 * @param {[string, number[]][]} rows chronologisch sortiert
 */
export function createStore(game, rows) {
  const size = rows.length;
  const dates = new Array(size);
  const numbers = new Array(size);
  const lo = new Uint32Array(size);
  const hi = new Uint32Array(size);
  rows.forEach(([date, nums], i) => {
    const mask = maskOf(nums);
    dates[i] = date;
    numbers[i] = nums;
    lo[i] = mask.lo;
    hi[i] = mask.hi;
  });
  return { game, size, dates, numbers, lo, hi };
}

/** Index der ersten Ziehung am oder nach `date` (binäre Suche). */
export function indexFrom(store, date) {
  let low = 0;
  let high = store.size;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (store.dates[mid] < date) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Wertet einen (auch unvollständigen) Tipp gegen alle Ziehungen aus.
 * @returns {{
 *   chosen: number, total: number,
 *   histogram: Uint32Array,          // histogram[h] = Ziehungen mit genau h Treffern
 *   matches: Map<number, number[]>,  // h → Ziehungsindizes (nur für relevante h)
 *   best: number,                    // höchste erreichte Trefferzahl
 * }}
 */
export function analyze(store, tipp) {
  const chosen = tipp.length;
  const { lo: tLo, hi: tHi } = maskOf(tipp);
  const histogram = new Uint32Array(chosen + 1);
  // Indizes merken wir uns nur dort, wo sie angezeigt werden: Gewinnränge bzw. „alle gemeinsam“.
  const listFrom = Math.min(chosen, store.game.minWinHits);
  const matches = new Map();
  for (let h = Math.max(listFrom, 1); h <= chosen; h++) matches.set(h, []);

  const { lo, hi, size } = store;
  for (let i = 0; i < size; i++) {
    const hits = popcount(lo[i] & tLo) + popcount(hi[i] & tHi);
    histogram[hits]++;
    if (hits >= listFrom && hits > 0) matches.get(hits).push(i);
  }

  let best = chosen;
  while (best > 0 && histogram[best] === 0) best--;
  return { chosen, total: size, histogram, matches, best };
}

/** Erwartete Anzahl Ziehungen mit genau `hits` Treffern bei `chosen` getippten Zahlen. */
export const expected = (store, chosen, hits) => store.size * store.game.probability(hits, chosen);
