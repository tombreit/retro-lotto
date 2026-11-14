// Tipp-Zustand: Normalisierung, Quicktipp, URL-Hash und lokale Ablage.

import { GAMES } from '../games.js';

export const VIEWS = ['pruefen', 'statistik'];

/** Bereinigt eine Zahlenliste: ganzzahlig, im Bereich, eindeutig, sortiert, höchstens `pick`. */
export function normalizeTipp(game, numbers) {
  const valid = numbers.filter((n) => Number.isInteger(n) && n >= 1 && n <= game.max);
  return [...new Set(valid)].slice(0, game.pick).toSorted((a, b) => a - b);
}

/** Füllt einen Tipp mit kryptografisch zufälligen Zahlen auf `pick` auf. */
export function quickTipp(game, keep = []) {
  const chosen = new Set(normalizeTipp(game, keep));
  const buffer = new Uint32Array(1);
  while (chosen.size < game.pick) {
    crypto.getRandomValues(buffer);
    // Verwerfen statt Modulo-Bias: nur Werte unterhalb eines Vielfachen von max zulassen.
    const limit = Math.floor(2 ** 32 / game.max) * game.max;
    if (buffer[0] < limit) chosen.add((buffer[0] % game.max) + 1);
  }
  return [...chosen].toSorted((a, b) => a - b);
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
 * Hash-Format: #lotto/3-12-13-16-23-41  ·  #eurojackpot/statistik  ·  #lotto
 * @returns {{ gameId: string, view: string, numbers: number[] | null } | null}
 */
export function parseHash(hash) {
  const [gameId, rest = ''] = hash.replace(/^#\/?/, '').split('/');
  const game = GAMES[gameId];
  if (!game) return null;
  if (rest === 'statistik') return { gameId, view: 'statistik', numbers: null };
  const numbers = rest ? normalizeTipp(game, rest.split('-').map(Number)) : null;
  return { gameId, view: 'pruefen', numbers };
}

export function formatHash({ gameId, view, numbers }) {
  if (view === 'statistik') return `#${gameId}/statistik`;
  return numbers?.length ? `#${gameId}/${numbers.join('-')}` : `#${gameId}`;
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
