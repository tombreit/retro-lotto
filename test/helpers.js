import { readFileSync } from 'node:fs';
import { GAMES } from '../src/games.js';
import { createStore } from '../src/lib/match.js';

export const loadRows = (gameId) =>
  JSON.parse(readFileSync(new URL(`../data/${gameId}.json`, import.meta.url), 'utf8')).draws;

export const loadStore = (gameId) => createStore(GAMES[gameId], loadRows(gameId));

export const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
