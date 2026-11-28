// Hilfen zum Ausprobieren des Mitspielens, ohne auf eine echte Ziehung zu warten.
// Wird nur im Entwicklungsserver und in Builds mit VITE_DEBUG=1 geladen:
//
//   retroLotto.backdate()        Schein für die letzte Ziehung – sofort „Die Zahlen sind da.“
//   retroLotto.backdate(5)       Dauerschein, der schon bei den letzten 5 Ziehungen mitgespielt hat
//   retroLotto.backdate(1, { settle: false })   nur ablegen – auswerten soll der Service Worker
//   retroLotto.checkInBackground()              den Service Worker prüfen lassen (wie Periodic Sync)
//   retroLotto.clear()           alle Scheine löschen

import { GAMES } from './games.js';
import { addTicket, updateTickets } from './lib/ticket-db.js';
import { quickTipp, numbersOf } from './lib/tipp.js';
import { createTicket } from './lib/tickets.js';

export function installDebug({ stores, state, tipp, isComplete, syncPlay }) {
  window.retroLotto = {
    async backdate(draws = 1, { settle = true, numbers = null } = {}) {
      const game = GAMES[state.gameId];
      const store = stores[game.id];
      if (!store) throw new Error('Ziehungen noch nicht geladen');
      const picked = numbers ?? (isComplete() ? tipp() : numbersOf(quickTipp(game)));
      const ticket = createTicket({
        gameId: game.id,
        numbers: picked,
        firstDraw: store.dates.at(-draws),
        standing: draws > 1,
        now: Date.parse(`${store.dates.at(-draws)}T08:00:00Z`),
      });
      await addTicket(ticket);
      if (settle) await syncPlay();
      return ticket;
    },
    async checkInBackground() {
      const registration = await navigator.serviceWorker.ready;
      registration.active.postMessage({ type: 'check-draws' });
    },
    async clear() {
      await updateTickets(() => null);
      await syncPlay();
    },
  };
}
