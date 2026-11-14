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
const numberFmt = new Intl.NumberFormat('de-DE');
const decimalFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const percentFmt = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1 });
const listFmt = new Intl.ListFormat('de-DE', { type: 'conjunction' });
const relativeFmt = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });
const plurals = new Intl.PluralRules('de-DE');

const toDate = (iso) => new Date(`${iso}T00:00:00Z`);

export const formatDate = (iso) => dateFmt.format(toDate(iso));
export const formatLongDate = (iso) => longDateFmt.format(toDate(iso));
export const formatNumber = (n) => numberFmt.format(n);
export const formatDecimal = (n) => decimalFmt.format(n);
export const formatPercent = (n) => percentFmt.format(n);
export const formatList = (items) => listFmt.format(items);
export const formatOdds = (n) => `1 : ${numberFmt.format(Math.round(n))}`;

/** „1 Ziehung“ / „5 Ziehungen“ */
export const plural = (n, one, other) =>
  `${numberFmt.format(n)} ${plurals.select(n) === 'one' ? one : other}`;

/** Heutiges Datum als ISO-String (lokale Zeit des Geräts). */
export const todayIso = () => new Date().toLocaleDateString('sv-SE');

/** „vor 64 Jahren“, „letztes Jahr“, „vor 3 Monaten“, „gestern“ – relativ zu heute. */
export function formatAgo(iso, referenceIso = todayIso()) {
  const days = Math.round((toDate(referenceIso) - toDate(iso)) / 86_400_000);
  if (days < 45) return relativeFmt.format(-days, 'day');
  if (days < 365) return relativeFmt.format(-Math.min(11, Math.round(days / 30.44)), 'month');
  return relativeFmt.format(-Math.max(1, Math.floor(days / 365.25)), 'year');
}
