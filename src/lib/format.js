// Deutsche Formatierung über die Intl-APIs.

const dateFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});
const longDateFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fullDayFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', timeZone: 'UTC' });
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
const euroFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const numberFmt = new Intl.NumberFormat('de-DE');
const decimalFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const percentFmt = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1 });
const listFmt = new Intl.ListFormat('de-DE', { type: 'conjunction' });
const relativeFmt = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });
const plurals = new Intl.PluralRules('de-DE');

const toDate = (iso) => new Date(`${iso}T00:00:00Z`);

export const formatDate = (iso) => dateFmt.format(toDate(iso));
export const formatLongDate = (iso) => longDateFmt.format(toDate(iso));
/** „Mittwoch, 2. Dezember“ – für Termine in der nahen Zukunft und Vergangenheit. */
export const formatDay = (iso) => dayFmt.format(toDate(iso));
/** „Sonntag, 13. März 1977“ */
export const formatFullDay = (iso) => fullDayFmt.format(toDate(iso));
/** „Mittwoch“ */
export const formatWeekday = (iso) => weekdayFmt.format(toDate(iso));
/** „18:25 Uhr“ – ein Zeitpunkt in Berliner Zeit, egal wo das Gerät steht. */
export const formatTime = (instant) => `${timeFmt.format(instant)} Uhr`;
export const formatEuro = (n) => euroFmt.format(n);
export const formatNumber = (n) => numberFmt.format(n);
export const formatDecimal = (n) => decimalFmt.format(n);
export const formatPercent = (n) => percentFmt.format(n);
export const formatList = (items) => listFmt.format(items);
export const formatOdds = (n) => `1 : ${numberFmt.format(Math.round(n))}`;

/** „einmal“, „zweimal“, „81-mal“ – mit geschütztem Bindestrich (U+2011), damit „81-“ nie allein am Zeilenende steht. */
export const formatTimes = (n) => (n === 1 ? 'einmal' : n === 2 ? 'zweimal' : `${numberFmt.format(n)}\u2011mal`);

/** Auf zwei geltende Stellen gerundet, für „etwa“-Angaben: 2.761,9 → „2.800“. */
export function formatRoughly(n) {
  if (!n) return numberFmt.format(0);
  const scale = 10 ** (Math.floor(Math.log10(Math.abs(n))) - 1);
  return numberFmt.format(Math.round(n / scale) * scale);
}

/** „1 Ziehung“ / „5 Ziehungen“ */
export const plural = (n, one, other) =>
  `${numberFmt.format(n)} ${plurals.select(n) === 'one' ? one : other}`;

/** „2 Tage und 4 Stunden“, „4 Stunden und 12 Minuten“, „12 Minuten“ – die zwei größten Einheiten. */
export function formatDuration({ days, hours, minutes }) {
  const units = [
    [days, 'Tag', 'Tage'],
    [hours, 'Stunde', 'Stunden'],
    [minutes, 'Minute', 'Minuten'],
  ];
  const first = units.findIndex(([n]) => n > 0);
  if (first < 0) return plural(0, 'Minute', 'Minuten');
  return units
    .slice(first, first + 2)
    .filter(([n]) => n > 0)
    .map(([n, one, other]) => plural(n, one, other))
    .join(' und ');
}

/** Heutiges Datum als ISO-String (lokale Zeit des Geräts). */
export const todayIso = () => new Date().toLocaleDateString('sv-SE');

/** „vor 64 Jahren“, „letztes Jahr“, „vor 3 Monaten“, „gestern“ – relativ zu heute. */
export function formatAgo(iso, referenceIso = todayIso()) {
  const days = Math.round((toDate(referenceIso) - toDate(iso)) / 86_400_000);
  if (days < 45) return relativeFmt.format(-days, 'day');
  if (days < 365) return relativeFmt.format(-Math.min(11, Math.round(days / 30.44)), 'month');
  return relativeFmt.format(-Math.max(1, Math.floor(days / 365.25)), 'year');
}
