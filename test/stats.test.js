import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { binomial } from '../src/games.js';
import {
  currentGaps,
  drawsWithin,
  longestRunOf,
  missingTriples,
  neighbourDraws,
  numberStats,
  rangeFor,
  rarestPairs,
  repeatedCombinations,
  runIn,
  topPairs,
} from '../src/lib/stats.js';
import { loadStore } from './helpers.js';

describe('Statistik', () => {
  const store = loadStore('lotto');

  it('Häufigkeiten summieren sich zu 6 × Ziehungen', () => {
    const stats = numberStats(store, { from: 0, to: store.size });
    assert.equal(stats.length, 49);
    assert.equal(stats.reduce((sum, s) => sum + s.count, 0), store.size * 6);
  });

  it('Zeiträume schneiden korrekt zu', () => {
    const all = rangeFor(store, 'all');
    const recent = rangeFor(store, '1y');
    assert.deepEqual(all, { from: 0, to: store.size });
    assert.ok(store.dates[recent.from] >= `${Number(store.dates.at(-1).slice(0, 4)) - 1}`);
    assert.ok(recent.to - recent.from >= 100 && recent.to - recent.from <= 106);
  });

  it('aktuelle Lücken: jede Zahl genau einmal, absteigend sortiert', () => {
    const gaps = currentGaps(store);
    assert.equal(gaps.length, 49);
    assert.ok(gaps.every((g, i) => i === 0 || gaps[i - 1].since >= g.since));
    const latest = store.numbers.at(-1);
    for (const n of latest) assert.equal(gaps.find((g) => g.number === n).since, 0);
  });

  it('Paare: Top-Paar zählt so oft wie manuell nachgezählt', () => {
    const [top] = topPairs(store, { from: 0, to: store.size }, 1);
    const [a, b] = top.pair;
    const manual = store.numbers.filter((n) => n.includes(a) && n.includes(b)).length;
    assert.equal(top.count, manual);
  });

  it('findet die doppelt gezogene Kombination', () => {
    const repeated = repeatedCombinations(store);
    const dates = repeated.map((idx) => idx.map((i) => store.dates[i]));
    assert.deepEqual(dates, [['1962-05-27', '2020-01-08']]);
  });
});

describe('Muster ganzer Ziehungen', () => {
  const lotto = loadStore('lotto');
  const eurojackpot = loadStore('eurojackpot');
  const together = (store, numbers) => store.numbers.filter((n) => numbers.every((x) => n.includes(x))).length;

  it('Folgen: längste Folge und ihre Zahlen', () => {
    assert.equal(longestRunOf([26, 2, 5, 3, 6, 4]), 5);
    assert.equal(longestRunOf([1, 3, 5]), 1);
    assert.deepEqual(runIn([26, 2, 5, 3, 6, 4], 5), [2, 3, 4, 5, 6]);
    assert.deepEqual(runIn([7, 9, 10, 30], 2), [9, 10]);
  });

  it('Nachbarzahlen: Anzahl, längste Folge und Erwartung', () => {
    for (const store of [lotto, eurojackpot]) {
      const { count, expectedShare, longest } = neighbourDraws(store);
      const manual = store.numbers.filter((n) => n.some((x) => n.includes(x + 1))).length;
      assert.equal(count, manual);
      assert.ok(Math.abs(count / store.size - expectedShare) < 0.05);
      assert.ok(longest.indices.length > 0);
      for (const i of longest.indices) assert.equal(runIn(store.numbers[i], longest.length).length, longest.length);
      assert.ok(store.numbers.every((n) => longestRunOf(n) <= longest.length));
    }
    // 2-3-4-5-6 am 10.04.1999 bleibt mindestens so lang
    assert.ok(neighbourDraws(lotto).longest.length >= 5);
  });

  it('Geburtstagszahlen: alle Zahlen bis 31', () => {
    const { count, last, expectedShare } = drawsWithin(lotto, 31);
    const within = [...lotto.numbers.keys()].filter((i) => lotto.numbers[i].every((n) => n <= 31));
    assert.equal(count, within.length);
    assert.equal(last, within.at(-1));
    assert.equal(expectedShare, binomial(31, 6) / binomial(49, 6));
  });

  it('seltenstes Paar: stimmt mit Nachzählen überein und liegt unter allen anderen', () => {
    for (const store of [lotto, eurojackpot]) {
      const all = { from: 0, to: store.size };
      const rarest = rarestPairs(store, all);
      assert.ok(rarest.length >= 1 && rarest.length <= 3);
      for (const { pair, count } of rarest) assert.equal(count, together(store, pair));
      const [least] = topPairs(store, all, Infinity).toReversed();
      assert.equal(rarest[0].count, least.count);
    }
  });

  it('nie gemeinsam gezogene Dreier', () => {
    for (const store of [lotto, eurojackpot]) {
      const { count, total, expected, examples } = missingTriples(store);
      assert.equal(total, binomial(store.game.max, 3));
      assert.ok(count > 0 && count < total);
      assert.ok(Math.abs(count - expected) < 5 * Math.sqrt(expected));
      assert.equal(examples.length, 3);
      for (const triple of examples) assert.equal(together(store, triple), 0);
    }
    // Brute-Force-Gegenprobe (Eurojackpot: weniger Ziehungen)
    const { max } = eurojackpot.game;
    let missing = 0;
    for (let a = 1; a <= max; a++)
      for (let b = a + 1; b <= max; b++)
        for (let c = b + 1; c <= max; c++)
          if (!eurojackpot.numbers.some((n) => n.includes(a) && n.includes(b) && n.includes(c))) missing++;
    assert.equal(missingTriples(eurojackpot).count, missing);
  });
});
