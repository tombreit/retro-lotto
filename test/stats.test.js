import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { currentGaps, numberStats, rangeFor, repeatedCombinations, topPairs } from '../src/lib/stats.js';
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
