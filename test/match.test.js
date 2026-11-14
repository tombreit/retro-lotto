import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAMES, binomial } from '../src/games.js';
import { analyze, createStore, expected, indexFrom, maskOf, popcount } from '../src/lib/match.js';
import { loadStore } from './helpers.js';

describe('popcount & maskOf', () => {
  it('zählt Bits korrekt, auch bei gesetztem Vorzeichenbit', () => {
    assert.equal(popcount(0), 0);
    assert.equal(popcount(0xffffffff), 32);
    assert.equal(popcount(0x80000001), 2);
    assert.equal(popcount(0b1011), 3);
  });

  it('verteilt Zahlen auf lo (1–31) und hi (32–50)', () => {
    assert.deepEqual(maskOf([1, 31]), { lo: 0x40000001, hi: 0 });
    assert.deepEqual(maskOf([32, 50]), { lo: 0, hi: (1 | (1 << 18)) >>> 0 });
  });
});

describe('Spielregeln', () => {
  it('kennt die klassischen Gewinnchancen', () => {
    assert.equal(GAMES.lotto.combinations, 13_983_816);
    assert.equal(GAMES.eurojackpot.combinations, 2_118_760);
    assert.equal(binomial(49, 6), 13_983_816);
  });

  it('Wahrscheinlichkeiten summieren sich zu 1', () => {
    for (const game of Object.values(GAMES)) {
      for (const chosen of [1, 3, game.pick]) {
        const sum = Array.from({ length: chosen + 1 }, (_, h) => game.probability(h, chosen)).reduce((a, b) => a + b);
        assert.ok(Math.abs(sum - 1) < 1e-12, `${game.id} chosen=${chosen}`);
      }
    }
    assert.equal(1 / GAMES.lotto.probability(6), 13_983_816);
  });
});

describe('analyze (Lotto-Historie)', () => {
  const store = loadStore('lotto');

  it('findet die zweimal gezogene Kombination 2-3-11-25-27-35', () => {
    const result = analyze(store, [2, 3, 11, 25, 27, 35]);
    assert.equal(result.best, 6);
    assert.deepEqual(result.matches.get(6).map((i) => store.dates[i]), ['1962-05-27', '2020-01-08']);
  });

  it('findet die allererste Ziehung', () => {
    const result = analyze(store, [3, 12, 13, 16, 23, 41]);
    assert.deepEqual(result.matches.get(6).map((i) => store.dates[i]), ['1955-10-09']);
  });

  it('Histogramm deckt alle Ziehungen ab', () => {
    const result = analyze(store, [1, 2, 3, 4, 5, 6]);
    assert.equal(result.histogram.reduce((a, b) => a + b, 0), store.size);
    // Ab 3 Richtigen werden die Ziehungen gelistet, darunter nicht.
    assert.deepEqual([...result.matches.keys()], [3, 4, 5, 6]);
  });

  it('unvollständiger Tipp: wie oft wurden alle Zahlen gemeinsam gezogen', () => {
    const single = analyze(store, [13]);
    const manual = store.numbers.filter((nums) => nums.includes(13)).length;
    assert.equal(single.histogram[1], manual);
    assert.equal(single.matches.get(1).length, manual);
  });

  it('leerer Tipp liefert nur das Histogramm', () => {
    const result = analyze(store, []);
    assert.equal(result.histogram[0], store.size);
    assert.equal(result.matches.size, 0);
  });

  it('erwartete Werte liegen nahe an der Realität', () => {
    const result = analyze(store, [7, 14, 21, 28, 35, 42]);
    const exp3 = expected(store, 6, 3);
    assert.ok(Math.abs(result.histogram[3] - exp3) < exp3 * 0.35);
  });
});

describe('indexFrom', () => {
  const store = createStore(GAMES.lotto, [
    ['2000-01-01', [1, 2, 3, 4, 5, 6]],
    ['2000-01-08', [1, 2, 3, 4, 5, 7]],
    ['2000-01-15', [1, 2, 3, 4, 5, 8]],
  ]);
  it('sucht binär den ersten Index ≥ Datum', () => {
    assert.equal(indexFrom(store, '1999-12-31'), 0);
    assert.equal(indexFrom(store, '2000-01-08'), 1);
    assert.equal(indexFrom(store, '2000-01-09'), 2);
    assert.equal(indexFrom(store, '2001-01-01'), 3);
  });
});
