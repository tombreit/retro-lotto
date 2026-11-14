import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAMES } from '../src/games.js';
import {
  addNumbers,
  backspaceTarget,
  formatHash,
  freeSlot,
  normalizeTipp,
  numbersOf,
  parseEntry,
  parseHash,
  quickTipp,
  removeNumber,
} from '../src/lib/tipp.js';

const { lotto, eurojackpot } = GAMES;
const _ = null;

describe('Tipp', () => {
  it('normalisiert Plätze: Ungültiges und Doppeltes wird zur Lücke, Lücken am Ende fallen weg', () => {
    assert.deepEqual(normalizeTipp(lotto, [12, 3, 3, 0, 50, 49, 1.5]), [12, 3, _, _, _, 49]);
    assert.deepEqual(normalizeTipp(lotto, [12, 3, 3, 0]), [12, 3]);
    assert.deepEqual(normalizeTipp(eurojackpot, [50, 1, 2, 3, 4, 5]), [50, 1, 2, 3, 4]);
    assert.deepEqual(normalizeTipp(lotto, [_, _]), []);
  });

  it('jede Zahl behält ihren Platz, Lücken werden zuerst gefüllt', () => {
    let slots = addNumbers(lotto, [], [41, 3, 12]);
    assert.deepEqual(slots, [41, 3, 12]);
    slots = removeNumber(lotto, slots, 3);
    assert.deepEqual(slots, [41, _, 12]);
    assert.equal(freeSlot(lotto, slots), 1);
    slots = addNumbers(lotto, slots, [7, 20]);
    assert.deepEqual(slots, [41, 7, 12, 20]);
    slots = removeNumber(lotto, slots, 20);
    assert.deepEqual(slots, [41, 7, 12], 'Lücke am Ende verschwindet');
    assert.deepEqual(numbersOf([41, _, 12]), [41, 12]);
    // Voll: nichts geht mehr hinein.
    const full = [1, 2, 3, 4, 5, 6];
    assert.equal(freeSlot(lotto, full), -1);
    assert.deepEqual(addNumbers(lotto, full, [7]), full);
  });

  it('Rücktaste entfernt die Zahl links vom freien Platz', () => {
    assert.equal(backspaceTarget(lotto, [41, 3, 12]), 12);
    assert.equal(backspaceTarget(lotto, [41, _, 12]), 41);
    assert.equal(backspaceTarget(lotto, [_, _, 12]), 12, 'links nichts – dann die letzte');
    assert.equal(backspaceTarget(lotto, [1, 2, 3, 4, 5, 6]), 6);
    assert.equal(backspaceTarget(lotto, []), null);
  });

  it('Quicktipp füllt nur die Lücken', () => {
    for (let i = 0; i < 200; i++) {
      const tipp = quickTipp(lotto, [13, _, 7]);
      assert.equal(tipp.length, 6);
      assert.equal(new Set(tipp).size, 6);
      assert.equal(tipp[0], 13);
      assert.equal(tipp[2], 7);
      const fresh = [tipp[1], ...tipp.slice(3)];
      assert.deepEqual(fresh, fresh.toSorted((a, b) => a - b));
      assert.ok(tipp.every((n) => n >= 1 && n <= 49));
    }
    const ej = quickTipp(eurojackpot);
    assert.equal(ej.length, 5);
    assert.ok(ej.every((n) => n >= 1 && n <= 50));
  });

  it('URL-Hash Round-Trip, auch mit Lücken', () => {
    const state = { gameId: 'lotto', view: 'pruefen', slots: [3, 12, 13, 16, 23, 41] };
    assert.equal(formatHash(state), '#lotto/3-12-13-16-23-41');
    assert.deepEqual(parseHash(formatHash(state)), state);
    const gaps = { gameId: 'lotto', view: 'pruefen', slots: [3, _, 41] };
    assert.equal(formatHash(gaps), '#lotto/3--41');
    assert.deepEqual(parseHash(formatHash(gaps)), gaps);
    assert.deepEqual(parseHash('#eurojackpot/statistik'), { gameId: 'eurojackpot', view: 'statistik', slots: null });
    assert.deepEqual(parseHash('#lotto'), { gameId: 'lotto', view: 'pruefen', slots: null });
    assert.deepEqual(parseHash('#lotto/41-3-3-99'), { gameId: 'lotto', view: 'pruefen', slots: [41, 3] });
    assert.equal(parseHash('#keno/1-2'), null);
    assert.equal(parseHash(''), null);
  });

  it('Tastatureingabe: fertige Zahlen sofort, mehrdeutige erst nach Trennzeichen', () => {
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
