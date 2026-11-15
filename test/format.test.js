import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatAgo, formatDate, formatOdds, formatRoughly, formatTimes, plural } from '../src/lib/format.js';

describe('Formatierung', () => {
  it('relative Zeitangaben', () => {
    const today = '2026-11-14';
    assert.equal(formatAgo('2026-11-14', today), 'heute');
    assert.equal(formatAgo('2026-11-13', today), 'gestern');
    assert.equal(formatAgo('2026-03-01', today), 'vor 8 Monaten');
    assert.equal(formatAgo('2025-11-20', today), 'vor 11 Monaten');
    assert.equal(formatAgo('1962-05-27', today), 'vor 64 Jahren');
  });
  it('deutsche Zahlen und Daten', () => {
    assert.equal(formatDate('1955-10-09'), '09.10.1955');
    assert.equal(formatOdds(13_983_816), '1 : 13.983.816');
    assert.equal(plural(1, 'Ziehung', 'Ziehungen'), '1 Ziehung');
    assert.equal(plural(5064, 'Ziehung', 'Ziehungen'), '5.064 Ziehungen');
  });
  it('Häufigkeiten und gerundete Angaben', () => {
    assert.equal(formatTimes(1), 'einmal');
    assert.equal(formatTimes(2), 'zweimal');
    assert.equal(formatTimes(1081), '1.081\u2011mal', 'geschützter Bindestrich');
    assert.equal(formatRoughly(2761.9), '2.800');
    assert.equal(formatRoughly(2104.1), '2.100');
    assert.equal(formatRoughly(94.4), '94');
    assert.equal(formatRoughly(4.81), '4,8');
  });
});
