// Datums-Helfer. Ziehungen werden überall als ISO-Datum (YYYY-MM-DD, deutsche Ortszeit) geführt.

const berlin = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Epoch-Millisekunden oder ISO-Zeitstempel → Kalenderdatum in Berlin. */
export const berlinDate = (instant) => berlin.format(new Date(instant));

/** „09.10.1955“ → „1955-10-09“ (null bei ungültigem Datum). */
export function deToIso(text) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isValidIso(iso) ? iso : null;
}

export function isValidIso(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(iso);
}

/** Wochentag 0 = Sonntag … 6 = Samstag. */
export const weekday = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();

export function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const todayBerlin = () => berlinDate(Date.now());
