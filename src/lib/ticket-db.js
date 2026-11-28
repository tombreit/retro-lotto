// Ablage der Spielscheine in IndexedDB – der einzige Speicher, den Seite und Service Worker teilen.
//
// Regel für alle Schreibzugriffe: nie einen Schein aus dem Arbeitsspeicher zurückschreiben. Jede
// Änderung liest die Scheine in derselben Transaktion neu (`updateTickets`), sonst überschreibt die
// Seite, was der Service Worker inzwischen ausgewertet hat – und umgekehrt.

import { settle } from './tickets.js';

const NAME = 'retro-lotto';
const VERSION = 1;

let opening;

function open() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('tickets')) db.createObjectStore('tickets', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    request.onblocked = () => reject(new Error('IndexedDB ist durch ein anderes Fenster blockiert'));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const forget = () => (opening = undefined);
      // Eine neuere App-Version will die Datenbank umbauen: loslassen statt sie zu blockieren.
      db.onversionchange = () => {
        db.close();
        forget();
      };
      db.onclose = forget;
      resolve(db);
    };
  });
  opening.catch(() => (opening = undefined));
  return opening;
}

/**
 * Führt `work(store, done)` in einer Transaktion aus. Das Ergebnis (`done(value)`) wird erst
 * ausgeliefert, wenn die Transaktion wirklich geschrieben ist.
 */
async function transact(storeName, mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error ?? new Error('Transaktion abgebrochen'));
    work(tx.objectStore(storeName), (value) => (result = value));
  });
}

/** @returns {Promise<object[]>} */
export const readTickets = () =>
  transact('tickets', 'readonly', (store, done) => {
    store.getAll().onsuccess = (event) => done(event.target.result);
  });

export const addTicket = (ticket) => transact('tickets', 'readwrite', (store) => void store.add(ticket));

/**
 * Liest alle Scheine und schreibt die geänderten zurück, in einer Transaktion.
 * `change(ticket)` liefert den neuen Schein, denselben (unverändert) oder null (löschen).
 * @returns {Promise<object[]>} alle Scheine nach der Änderung
 */
export const updateTickets = (change) =>
  transact('tickets', 'readwrite', (store, done) => {
    store.getAll().onsuccess = (event) => {
      const tickets = [];
      for (const ticket of event.target.result) {
        const next = change(ticket);
        if (next === null) store.delete(ticket.id);
        else {
          if (next !== ticket) store.put(next);
          tickets.push(next);
        }
      }
      done(tickets);
    };
  });

/**
 * Wertet alle Scheine gegen die übergebenen Ziehungen aus.
 * @param {Record<string, [string, number[]][]>} drawsByGame
 * @returns {Promise<{ tickets: object[], fresh: { ticket: object, result: object }[] }>}
 */
export async function settleAll(drawsByGame) {
  const fresh = [];
  const tickets = await updateTickets((ticket) => {
    const draws = drawsByGame[ticket.gameId];
    if (!draws) return ticket;
    const settled = settle(ticket, draws);
    fresh.push(...settled.fresh.map((result) => ({ ticket: settled.ticket, result })));
    return settled.ticket;
  });
  return { tickets, fresh };
}

export const kvGet = (key) =>
  transact('kv', 'readonly', (store, done) => {
    store.get(key).onsuccess = (event) => done(event.target.result);
  });

export const kvSet = (key, value) => transact('kv', 'readwrite', (store) => void store.put(value, key));
