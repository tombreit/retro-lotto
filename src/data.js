// Lädt die Ziehungsdaten eines Spiels als eigenen, gehashten Chunk – erst wenn er gebraucht wird.

import { GAMES } from './games.js';
import { createStore } from './lib/match.js';

const loaders = {
  lotto: () => import('../data/lotto.json'),
  eurojackpot: () => import('../data/eurojackpot.json'),
};

const stores = new Map();

/** @returns {Promise<ReturnType<typeof createStore>>} */
export function loadStore(gameId) {
  if (!stores.has(gameId)) {
    const promise = loaders[gameId]().then((module) => createStore(GAMES[gameId], module.default.draws));
    promise.catch(() => stores.delete(gameId)); // erneuter Versuch beim nächsten Aufruf
    stores.set(gameId, promise);
  }
  return stores.get(gameId);
}
