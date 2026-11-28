// Mitspielen: hält die Spielscheine als Spiegel im Arbeitsspeicher (damit render() synchron bleibt)
// und schreibt jede Änderung über die Datenbank – nie den Spiegel zurück.

import { GAMES, GAME_IDS } from './games.js';
import { indexFrom } from './lib/match.js';
import { drawTimes, lastClosedDraw, nextDraw } from './lib/schedule.js';
import { addTicket, readTickets, settleAll, updateTickets } from './lib/ticket-db.js';
import { awaitedDraw, createTicket, isOpen, markSeen, resultsByDraw, stopStanding } from './lib/tickets.js';

const LATEST_URL = './draws-latest.json';
/** So oft höchstens fragt eine offene Seite nach neuen Ziehungen. */
const LATEST_INTERVAL = 5 * 60_000;

let tickets = [];
/**
 * Warum hier nicht mitgespielt werden kann – oder null.
 * - 'insecure': Die Seite läuft ohne https. Scheine hingen dann an der http-Adresse und wären weg,
 *   sobald die Seite auf https wechselt; deshalb gibt es dort gar keine.
 * - 'storage': Der Browser lässt nichts speichern (privater Modus, voller Speicher).
 */
let problem = globalThis.isSecureContext === false ? 'insecure' : 'indexedDB' in globalThis ? null : 'storage';
let listener = () => {};
let latestCheckedAt = 0;

function publish(next) {
  tickets = next;
  listener();
}

/** Schreibzugriff; scheitert er (privater Modus, voller Speicher), bleibt die App benutzbar. */
async function write(operation) {
  if (problem) return false;
  try {
    publish(await operation());
    return true;
  } catch (error) {
    console.warn('Spielscheine:', error);
    return false;
  }
}

export const playState = {
  /** @returns {object[]} alle Scheine beider Spiele */
  get tickets() {
    return tickets;
  },
  /** @returns {'insecure' | 'storage' | null} warum Mitspielen hier nicht geht */
  get problem() {
    return problem;
  },
};

export function onTicketsChange(callback) {
  listener = callback;
}

/** Liest die Scheine neu – auch nachdem der Service Worker im Hintergrund ausgewertet hat. */
export async function loadTickets() {
  if (problem) return;
  try {
    publish(await readTickets());
  } catch (error) {
    console.warn('Spielscheine:', error);
    problem = 'storage';
    listener();
  }
}

/** Gibt einen Schein für die nächste Ziehung ab. Der Termin wird jetzt bestimmt, nicht beim Rendern. */
export async function submitTicket(game, numbers, { standing = false } = {}) {
  const ticket = createTicket({ gameId: game.id, numbers, firstDraw: nextDraw(game).date, standing });
  const saved = await write(async () => {
    await addTicket(ticket);
    return readTickets();
  });
  if (!saved) return null;
  // Der Browser soll die Scheine nicht bei Platzmangel wegräumen.
  navigator.storage?.persist?.().catch(() => {});
  return ticket;
}

export const removeTicket = (id) => write(() => updateTickets((t) => (t.id === id ? null : t)));

export const stopTicket = (id) =>
  write(() => updateTickets((t) => (t.id === id ? stopStanding(t, lastClosedDraw(GAMES[t.gameId])) : t)));

/** Markiert die Ergebnisse einer Ziehung (oder alle eines Spiels) als gesehen. */
export const markResultsSeen = (gameId, date = null) =>
  write(() => updateTickets((t) => (t.gameId === gameId ? markSeen(t, date) : t)));

/** Wertet die Scheine eines Spiels mit dessen vollständigen Ziehungen aus. */
export async function settleWithStore(store) {
  const mine = tickets.filter((t) => t.gameId === store.game.id);
  if (mine.length === 0) return;
  const earliest = mine.map((t) => t.firstDraw).toSorted()[0];
  const draws = [];
  for (let i = indexFrom(store, earliest); i < store.size; i++) draws.push([store.dates[i], store.numbers[i]]);
  await write(async () => (await settleAll({ [store.game.id]: draws })).tickets);
}

/** Wartet ein offener Schein auf eine Ziehung, die schon gelaufen ist? */
export function drawIsDue(now = Date.now()) {
  return tickets.some((ticket) => {
    if (!isOpen(ticket)) return false;
    const game = GAMES[ticket.gameId];
    const draw = drawTimes(game, awaitedDraw(ticket, game));
    return draw !== null && draw.drawAt < now;
  });
}

/**
 * Holt die jüngsten Ziehungen direkt vom Server – für Seiten, die über eine Ziehung hinweg offen
 * waren und deren geladene Daten deshalb zu alt sind.
 */
export async function settleWithLatest({ force = false } = {}) {
  if (!force && Date.now() - latestCheckedAt < LATEST_INTERVAL) return;
  latestCheckedAt = Date.now();
  try {
    const response = await fetch(LATEST_URL, { cache: 'no-store' });
    if (!response.ok || !response.headers.get('content-type')?.includes('json')) return;
    const { draws } = await response.json();
    await write(async () => (await settleAll(draws)).tickets);
  } catch {
    // Offline – beim nächsten Mal wieder.
  }
}

/** Ziehungen mit ungesehenen Ergebnissen, über beide Spiele. */
export const unseenCount = () =>
  GAME_IDS.reduce((sum, id) => sum + resultsByDraw(tickets, id).filter((group) => !group.seen).length, 0);
