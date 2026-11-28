// Ziehungstermine. Alles rechnet in Berliner Zeit – egal, in welcher Zeitzone das Gerät steht.

import { addDays, berlinDate, weekday } from './dates.js';

const wallClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Abstand der Berliner Wandzeit zu UTC an einem Zeitpunkt, in Millisekunden (+1 h oder +2 h). */
function berlinOffset(instant) {
  const part = Object.fromEntries(wallClock.formatToParts(new Date(instant)).map((p) => [p.type, Number(p.value)]));
  const asUtc = Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Berliner Wandzeit (ISO-Datum und „HH:MM“) → Zeitpunkt in Epoch-Millisekunden. */
export function berlinInstant(iso, time) {
  const wall = Date.parse(`${iso}T${time}:00Z`);
  // Der Offset gilt am Zielzeitpunkt, nicht an der Schätzung – zweimal annähern reicht,
  // auch wenn die Schätzung auf der anderen Seite einer Zeitumstellung liegt.
  let instant = wall;
  for (let i = 0; i < 2; i++) instant = wall - berlinOffset(instant);
  return instant;
}

/** Annahmeschluss und Ziehungszeit eines Ziehungstags oder null, wenn an dem Tag nicht gezogen wird. */
export function drawTimes(game, iso) {
  const times = game.drawTimes[weekday(iso)];
  if (!times) return null;
  return { date: iso, closesAt: berlinInstant(iso, times.closes), drawAt: berlinInstant(iso, times.at) };
}

function firstDraw(game, now, isAhead) {
  const today = berlinDate(now);
  for (let offset = 0; offset <= 7; offset++) {
    const draw = drawTimes(game, addDays(today, offset));
    if (draw && isAhead(draw)) return draw;
  }
  throw new Error(`Kein Ziehungstag für ${game.id} gefunden`);
}

/** Die nächste Ziehung, für die noch Scheine angenommen werden. */
export const nextDraw = (game, now = Date.now()) => firstDraw(game, now, (draw) => now < draw.closesAt);

/** Die nächste Ziehung, die noch nicht stattgefunden hat (auch nach Annahmeschluss). */
export const upcomingDraw = (game, now = Date.now()) => firstDraw(game, now, (draw) => now < draw.drawAt);

/** Der Ziehungstag nach bzw. vor einem Datum. */
export function drawDateAfter(game, iso, step = 1) {
  for (let offset = 1; offset <= 7; offset++) {
    const date = addDays(iso, step * offset);
    if (game.drawTimes[weekday(date)]) return date;
  }
  throw new Error(`Kein Ziehungstag für ${game.id} gefunden`);
}

/** Die letzte Ziehung, deren Annahmeschluss schon vorbei ist – bis dahin hat ein Dauerschein mitgespielt. */
export const lastClosedDraw = (game, now = Date.now()) => drawDateAfter(game, nextDraw(game, now).date, -1);

/** Zerlegt eine Dauer in Tage, Stunden und Minuten (aufgerundet auf die volle Minute). */
export function durationParts(ms) {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 };
}
