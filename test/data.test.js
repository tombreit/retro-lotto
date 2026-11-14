// Integritätsprüfung der committeten Daten – schlägt an, falls ein Update Unsinn geschrieben hat.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAMES } from '../src/games.js';
import { checkDraw, findGaps } from '../scripts/lib/validate.mjs';
import { loadRows } from './helpers.js';

for (const game of Object.values(GAMES)) {
  describe(`data/${game.id}.json`, () => {
    const draws = loadRows(game.id).map(([date, numbers]) => ({ date, numbers }));

    it('beginnt mit der ersten Ziehung', () => assert.equal(draws[0].date, game.firstDraw));

    it('alle Ziehungen gültig, Zahlen sortiert', () => {
      for (const d of draws) {
        assert.equal(checkDraw(game, d), null);
        assert.deepEqual(d.numbers, d.numbers.toSorted((a, b) => a - b), d.date);
      }
    });

    it('streng chronologisch, keine doppelten Daten', () => {
      for (let i = 1; i < draws.length; i++) assert.ok(draws[i - 1].date < draws[i].date, draws[i].date);
    });

    it('keine Lücken an regulären Ziehungstagen', () => assert.deepEqual(findGaps(game, draws), []));
  });
}
