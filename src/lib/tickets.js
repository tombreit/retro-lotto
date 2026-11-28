// Spielscheine: anlegen, auswerten, zusammenfassen. Reine Funktionen ohne Speicher und ohne DOM –
// die Seite und der Service Worker nutzen dieselbe Logik.
//
// Schein:   { id, gameId, numbers, createdAt, firstDraw, standing, endDraw, results }
// Ergebnis: { date, drawn, hits, seen }
// `firstDraw`/`endDraw` sind Ziehungstage (einschließlich); bei einem Dauerschein ist `endDraw`
// null, bis er gestoppt wird. Ziehungen kommen als [datum, zahlen] wie in data/*.json.

import { formatDay, formatNumber, formatPercent, formatWeekday } from './format.js';
import { drawDateAfter } from './schedule.js';

/** Zufällige Kennung. `randomUUID` gibt es nur über https – der Ersatz funktioniert überall. */
const newId = () =>
  crypto.randomUUID?.() ??
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');

export function createTicket({ gameId, numbers, firstDraw, standing = false, now = Date.now(), id = newId() }) {
  return {
    id,
    gameId,
    numbers: numbers.toSorted((a, b) => a - b),
    createdAt: now,
    firstDraw,
    standing,
    endDraw: standing ? null : firstDraw,
    results: [],
  };
}

export const hitsOf = (numbers, drawn) => numbers.filter((n) => drawn.includes(n)).length;

/** Spielt der Schein bei dieser Ziehung mit? */
export const covers = (ticket, date) =>
  date >= ticket.firstDraw && (ticket.endDraw === null || date <= ticket.endDraw);

/**
 * Ergänzt die Ergebnisse aller Ziehungen, die der Schein abdeckt und noch nicht kennt.
 * Idempotent: Schlüssel ist das Ziehungsdatum. Ändert sich nichts, kommt derselbe Schein zurück.
 * @returns {{ ticket: object, fresh: object[] }}
 */
export function settle(ticket, draws) {
  const known = new Set(ticket.results.map((r) => r.date));
  const fresh = [];
  for (const [date, drawn] of draws) {
    if (known.has(date) || !covers(ticket, date)) continue;
    known.add(date);
    fresh.push({ date, drawn, hits: hitsOf(ticket.numbers, drawn), seen: false });
  }
  if (fresh.length === 0) return { ticket, fresh };
  const results = [...ticket.results, ...fresh].toSorted((a, b) => a.date.localeCompare(b.date));
  return { ticket: { ...ticket, results }, fresh };
}

/** Offen ist ein Schein, solange noch eine Ziehung aussteht. */
export const isOpen = (ticket) =>
  ticket.endDraw === null || !ticket.results.some((r) => r.date === ticket.endDraw);

/** Der Ziehungstag, auf den ein offener Schein als Nächstes wartet. */
export function awaitedDraw(ticket, game) {
  const last = ticket.results.at(-1)?.date;
  return last ? drawDateAfter(game, last) : ticket.firstDraw;
}

/**
 * Stoppt einen Dauerschein: Er gilt noch für die letzte Ziehung, deren Annahmeschluss vorbei ist.
 * Hat er noch gar nicht mitgespielt, bleibt nichts übrig (null).
 */
export function stopStanding(ticket, lastClosedDate) {
  if (lastClosedDate < ticket.firstDraw) return null;
  return { ...ticket, endDraw: lastClosedDate };
}

/** Markiert Ergebnisse als gesehen – alle oder nur die einer Ziehung. */
export function markSeen(ticket, date = null) {
  if (!ticket.results.some((r) => !r.seen && (date === null || r.date === date))) return ticket;
  return {
    ...ticket,
    results: ticket.results.map((r) => (!r.seen && (date === null || r.date === date) ? { ...r, seen: true } : r)),
  };
}

/**
 * Ergebnisse eines Spiels je Ziehung gebündelt, neueste zuerst.
 * @returns {{ date: string, drawn: number[], best: number, seen: boolean, entries: { ticket: object, result: object }[] }[]}
 */
export function resultsByDraw(tickets, gameId) {
  const byDate = new Map();
  for (const ticket of tickets) {
    if (ticket.gameId !== gameId) continue;
    for (const result of ticket.results) {
      if (!byDate.has(result.date))
        byDate.set(result.date, { date: result.date, drawn: result.drawn, best: 0, seen: true, entries: [] });
      const group = byDate.get(result.date);
      group.entries.push({ ticket, result });
      group.best = Math.max(group.best, result.hits);
      group.seen &&= result.seen;
    }
  }
  return [...byDate.values()].toSorted((a, b) => b.date.localeCompare(a.date));
}

/** Bilanz eines Spiels über alle ausgewerteten Tipps. */
export function summarize(tickets, game) {
  const summary = { plays: 0, hits: 0, best: 0, bestDate: null, wins: 0, saved: 0, collected: new Set() };
  for (const ticket of tickets) {
    if (ticket.gameId !== game.id) continue;
    for (const result of ticket.results) {
      summary.plays++;
      summary.hits += result.hits;
      if (result.hits >= game.minWinHits) summary.wins++;
      if (result.hits > summary.best || (result.hits === summary.best && summary.bestDate === null)) {
        summary.best = result.hits;
        summary.bestDate = result.date;
      }
      for (const n of ticket.numbers) if (result.drawn.includes(n)) summary.collected.add(n);
    }
  }
  // Cent-genau rechnen, damit aus 3 × 1,20 € nicht 3,5999 € wird.
  summary.saved = (summary.plays * Math.round(game.price * 100)) / 100;
  return summary;
}

/** Wahrscheinlichkeit, mit einem Tipp mindestens `hits` Richtige zu haben. */
export function chanceAtLeast(game, hits) {
  let sum = 0;
  for (let h = hits; h <= game.pick; h++) sum += game.probability(h);
  return sum;
}

/** „15 % aller Tipps“ bzw. bei Seltenem „einer von 1.032 Tipps“. */
const shareOfTipps = (p) =>
  p >= 0.01 ? `${formatPercent(p)} aller Tipps` : `einer von ${formatNumber(Math.round(1 / p))} Tipps`;

/**
 * Das Ergebnis in Worten – für die Ziehungs-Animation und die Benachrichtigung.
 * @returns {{ headline: string, sub: string, win: boolean }}
 */
export function describeResult(game, hits) {
  const win = hits >= game.minWinHits;
  if (hits === 0)
    return { headline: 'Kein Treffer.', sub: `Das geht ${shareOfTipps(game.probability(0))} so.`, win };
  if (hits === 1)
    return { headline: '1 Richtige.', sub: `Wie bei ${shareOfTipps(game.probability(1))}.`, win };
  if (hits === game.pick)
    return {
      headline: `${hits} Richtige!`,
      sub: `Das wäre der Jackpot gewesen. Die Chance dafür: 1 zu ${formatNumber(game.combinations)}.`,
      win,
    };
  const share = shareOfTipps(chanceAtLeast(game, hits));
  const far = share.startsWith('einer') ? `So weit kommt nur ${share}.` : `So weit kommen nur ${share}.`;
  return win
    ? { headline: `${hits} Richtige!`, sub: `Das wäre ein Gewinn gewesen. ${far}`, win }
    : { headline: `${hits} Richtige.`, sub: `${far} Ab ${game.minWinHits} wäre es ein Gewinn.`, win };
}

/**
 * Titel und Text der Benachrichtigung für eine ausgewertete Ziehung (eine Gruppe aus `resultsByDraw`).
 * Bei mehreren Scheinen zählt der beste.
 */
export function announcement(game, { date, drawn, best, entries }) {
  const { win } = describeResult(game, best);
  const title = best === 0 ? `Kein Treffer beim ${game.short}` : `${best} Richtige beim ${game.short}${win ? '!' : ''}`;
  const lines = [`Ziehung vom ${formatDay(date)}: ${drawn.join(', ')}.`];
  if (entries.length > 1) lines.push(`Dein bester von ${entries.length} Scheinen.`);
  lines.push(win ? 'Das wäre ein Gewinn gewesen.' : `Nächste Chance am ${formatWeekday(drawDateAfter(game, date))}.`);
  return { title, body: lines.join(' ') };
}
