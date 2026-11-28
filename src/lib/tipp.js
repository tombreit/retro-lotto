// Tipp-Zustand: Normalisierung, Quicktipp, URL-Hash und lokale Ablage.

import { GAMES } from '../games.js';

export const VIEWS = ['pruefen', 'spielen', 'statistik', 'jackpots'];

// Ein Tipp besteht aus festen Plätzen: eine Zahl oder `null` für eine Lücke. Jede Zahl bleibt an
// dem Platz, an dem sie eingegeben wurde; wird sie entfernt, bleibt die Lücke stehen, und die
// nächste Zahl füllt die erste freie Stelle. Für die Auswertung zählen nur die Zahlen.

/**
 * Bereinigt Plätze: Ungültiges und Doppeltes wird zur Lücke, höchstens `pick` Plätze,
 * Lücken am Ende fallen weg.
 * @returns {(number | null)[]}
 */
export function normalizeTipp(game, slots) {
  const seen = new Set();
  const result = slots.slice(0, game.pick).map((n) => {
    if (!Number.isInteger(n) || n < 1 || n > game.max || seen.has(n)) return null;
    seen.add(n);
    return n;
  });
  while (result.length && result.at(-1) === null) result.pop();
  return result;
}

/** Die Zahlen eines Tipps ohne Lücken, in Platzreihenfolge. */
export const numbersOf = (slots) => slots.filter((n) => n !== null);

/** Index des ersten freien Platzes oder -1, wenn der Tipp voll ist. */
export function freeSlot(game, slots) {
  const gap = slots.indexOf(null);
  if (gap >= 0) return gap;
  return slots.length < game.pick ? slots.length : -1;
}

/** Setzt Zahlen nacheinander in die ersten freien Plätze. */
export function addNumbers(game, slots, numbers) {
  const result = [...slots];
  for (const n of numbers) {
    const index = freeSlot(game, result);
    if (index < 0) break;
    result[index] = n;
  }
  return normalizeTipp(game, result);
}

/** Entfernt eine Zahl; ihr Platz bleibt als Lücke stehen. */
export function removeNumber(game, slots, number) {
  return normalizeTipp(game, slots.map((n) => (n === number ? null : n)));
}

/**
 * Welche Zahl die Rücktaste entfernt: die nächste links vom freien Platz, an dem die Eingabe steht –
 * wie links vom Cursor in einem Textfeld. Gibt es dort keine, die letzte überhaupt.
 */
export function backspaceTarget(game, slots) {
  const entry = freeSlot(game, slots);
  const before = slots.findLastIndex((n, i) => n !== null && (entry < 0 || i < entry));
  const index = before >= 0 ? before : slots.findLastIndex((n) => n !== null);
  return index >= 0 ? slots[index] : null;
}

/**
 * Füllt alle freien Plätze mit kryptografisch zufälligen Zahlen. Vorhandene Zahlen bleiben an
 * ihrem Platz, die neuen kommen der Reihe nach aufsteigend in die Lücken.
 */
export function quickTipp(game, keep = []) {
  const kept = normalizeTipp(game, keep);
  const chosen = new Set(numbersOf(kept));
  const buffer = new Uint32Array(1);
  // Verwerfen statt Modulo-Bias: nur Werte unterhalb eines Vielfachen von max zulassen.
  const limit = Math.floor(2 ** 32 / game.max) * game.max;
  const fresh = [];
  while (chosen.size < game.pick) {
    crypto.getRandomValues(buffer);
    if (buffer[0] >= limit) continue;
    const n = (buffer[0] % game.max) + 1;
    if (chosen.has(n)) continue;
    chosen.add(n);
    fresh.push(n);
  }
  return addNumbers(game, kept, fresh.toSorted((a, b) => a - b));
}

/**
 * Zerlegt Tastatureingaben in Zahlen. Alles außer Ziffern trennt. Eine Zahl ist fertig, sobald ein
 * Trennzeichen folgt, sie zwei Ziffern hat oder keine weitere Ziffer mehr passt (bei 1–49: 5 bis 9).
 * So genügt auf dem Ziffernblock meist das bloße Tippen; nur „1“ bis „4“ warten auf ein Komma.
 * Ein unfertiger Rest bleibt stehen – außer bei `final` (Enter, Feld verlassen, Einfügen).
 * @returns {{ numbers: number[], invalid: number[], rest: string }}
 */
export function parseEntry(text, max, { final = false } = {}) {
  const tokens = text.match(/\d+/g) ?? [];
  const last = tokens.at(-1);
  const pending = !final && /\d$/.test(text) && last.length < 2 && Number(last) * 10 <= max;
  const rest = pending ? tokens.pop() : '';
  const values = tokens.map(Number);
  const valid = (n) => n >= 1 && n <= max;
  return { numbers: values.filter(valid), invalid: values.filter((n) => !valid(n)), rest };
}

/**
 * Hash-Format: #lotto/3-12-13-16-23-41  ·  #lotto/3--41 (Lücke)  ·  #eurojackpot/statistik  ·
 * #lotto/jackpots  ·  #lotto
 * @returns {{ gameId: string, view: string, slots: (number | null)[] | null } | null}
 */
export function parseHash(hash) {
  const [gameId, rest = ''] = hash.replace(/^#\/?/, '').split('/');
  const game = GAMES[gameId];
  if (!game) return null;
  if (rest !== 'pruefen' && VIEWS.includes(rest)) return { gameId, view: rest, slots: null };
  // Leere Stellen sind Lücken: „3--41“ → [3, null, 41] (Number('') = 0 wird zur Lücke).
  // Ohne Ziffern ist es kein Tipp (unbekannte Ansicht, Tippfehler) – der gespeicherte Tipp bleibt.
  const slots = /\d/.test(rest) ? normalizeTipp(game, rest.split('-').map(Number)) : null;
  return { gameId, view: 'pruefen', slots };
}

export function formatHash({ gameId, view, slots }) {
  if (view !== 'pruefen') return `#${gameId}/${view}`;
  return slots?.length ? `#${gameId}/${slots.map((n) => n ?? '').join('-')}` : `#${gameId}`;
}

const STORAGE_KEY = 'retro-lotto:v1';

export function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Privater Modus oder gesperrter Speicher – die App funktioniert auch ohne.
  }
}
