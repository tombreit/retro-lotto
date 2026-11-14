import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAMES } from '../src/games.js';
import { formatHash, normalizeTipp, parseEntry, parseHash, quickTipp } from '../src/lib/tipp.js';

describe('Tipp', () => {
  it('normalisiert Eingaben', () => {
    assert.deepEqual(normalizeTipp(GAMES.lotto, [12, 3, 3, 0, 50, 49, 1.5]), [3, 12, 49]);
    assert.deepEqual(normalizeTipp(GAMES.eurojackpot, [50, 1, 2, 3, 4, 5]), [1, 2, 3, 4, 50]);
  });

  it('Quicktipp ergänzt bestehende Zahlen', () => {
    for (let i = 0; i < 200; i++) {
      const tipp = quickTipp(GAMES.lotto, [7, 13]);
      assert.equal(tipp.length, 6);
      assert.equal(new Set(tipp).size, 6);
      assert.ok(tipp.includes(7) && tipp.includes(13));
      assert.ok(tipp.every((n) => n >= 1 && n <= 49));
    }
    const ej = quickTipp(GAMES.eurojackpot);
    assert.equal(ej.length, 5);
    assert.ok(ej.every((n) => n >= 1 && n <= 50));
  });

  it('URL-Hash Round-Trip', () => {
    const state = { gameId: 'lotto', view: 'pruefen', numbers: [3, 12, 13, 16, 23, 41] };
    assert.equal(formatHash(state), '#lotto/3-12-13-16-23-41');
    assert.deepEqual(parseHash(formatHash(state)), state);
    assert.deepEqual(parseHash('#eurojackpot/statistik'), { gameId: 'eurojackpot', view: 'statistik', numbers: null });
    assert.deepEqual(parseHash('#lotto'), { gameId: 'lotto', view: 'pruefen', numbers: null });
    assert.deepEqual(parseHash('#lotto/41-3-3-99'), { gameId: 'lotto', view: 'pruefen', numbers: [3, 41] });
    assert.equal(parseHash('#keno/1-2'), null);
    assert.equal(parseHash(''), null);
  });

  it('Tastatureingabe: fertige Zahlen sofort, mehrdeutige erst nach Trennzeichen', () => {
    const { lotto, eurojackpot } = GAMES;
    const entry = (text, max = lotto.max, options) => parseEntry(text, max, options);
    assert.deepEqual(entry(''), { numbers: [], invalid: [], rest: '' });
    // „3“ könnte noch 31 werden, „7“ nicht mehr (70 > 49), zwei Ziffern sind immer fertig.
    assert.deepEqual(entry('3'), { numbers: [], invalid: [], rest: '3' });
    assert.deepEqual(entry('7'), { numbers: [7], invalid: [], rest: '' });
    assert.deepEqual(entry('12'), { numbers: [12], invalid: [], rest: '' });
    assert.deepEqual(entry('3,'), { numbers: [3], invalid: [], rest: '' });
    // Bei Eurojackpot kann aus „5“ noch 50 werden.
    assert.deepEqual(entry('5'), { numbers: [5], invalid: [], rest: '' });
    assert.deepEqual(entry('5', eurojackpot.max), { numbers: [], invalid: [], rest: '5' });
    // Beliebige Trennzeichen, führende Nullen, ungültige Werte.
    assert.deepEqual(entry('3, 12;13 16-23/41').numbers, [3, 12, 13, 16, 23, 41]);
    assert.deepEqual(entry('0'), { numbers: [], invalid: [], rest: '0' });
    assert.deepEqual(entry('07'), { numbers: [7], invalid: [], rest: '' });
    assert.deepEqual(entry('50 0 123 4'), { numbers: [], invalid: [50, 0, 123], rest: '4' });
    // Abschließen übernimmt auch den unfertigen Rest.
    assert.deepEqual(entry('4', lotto.max, { final: true }), { numbers: [4], invalid: [], rest: '' });
    assert.deepEqual(entry('0', lotto.max, { final: true }), { numbers: [], invalid: [0], rest: '' });
  });
});
