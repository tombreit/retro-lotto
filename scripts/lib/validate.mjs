// Plausibilitätsprüfungen für Ziehungen.

import { addDays, isValidIso, weekday } from './dates.mjs';

/** Prüft Form und Wertebereich einer Ziehung. Gibt eine Fehlermeldung oder null zurück. */
export function checkDraw(game, { date, numbers }) {
  if (typeof date !== 'string' || !isValidIso(date)) return `ungültiges Datum ${date}`;
  if (!Array.isArray(numbers) || numbers.length !== game.pick)
    return `${date}: erwartet ${game.pick} Zahlen, erhalten ${numbers?.length}`;
  if (!numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= game.max))
    return `${date}: Zahl außerhalb 1–${game.max}: ${numbers}`;
  if (new Set(numbers).size !== numbers.length) return `${date}: doppelte Zahl: ${numbers}`;
  return null;
}

/** Ist das Datum ein regulärer Ziehungstag für neue Ziehungen? */
export function isDrawDay(game, date) {
  const day = weekday(date);
  if (!game.drawDays.includes(day)) return false;
  if (game.tuesdaysFrom && day === 2 && date < game.tuesdaysFrom) return false;
  return true;
}

/** Alle erwarteten Ziehungstage im Intervall [from, to]. */
export function* expectedDates(game, from, to) {
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (isDrawDay(game, date)) yield date;
  }
}

/** Erwartete, aber fehlende Ziehungstage zwischen game.gapCheckFrom und der letzten Ziehung. */
export function findGaps(game, draws) {
  if (draws.length === 0) return [];
  const known = new Set(draws.map((d) => d.date));
  const last = draws.at(-1).date;
  return [...expectedDates(game, game.gapCheckFrom, last)].filter((d) => !known.has(d));
}
