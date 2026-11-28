// Datums-Helfer der Daten-Pipeline. Die allgemeinen Helfer liegen in src/lib/dates.js,
// weil App und Service Worker sie ebenfalls brauchen.

import { isValidIso } from '../../src/lib/dates.js';

export { addDays, berlinDate, isValidIso, todayBerlin, weekday } from '../../src/lib/dates.js';

/** „09.10.1955“ → „1955-10-09“ (null bei ungültigem Datum). */
export function deToIso(text) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isValidIso(iso) ? iso : null;
}
