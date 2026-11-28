import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatAgo,
  formatDate,
  formatDay,
  formatDuration,
  formatEuro,
  formatFullDay,
  formatOdds,
  formatRoughly,
  formatTime,
  formatTimes,
  formatWeekday,
  plural,
} from '../src/lib/format.js';

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
  it('Termine fürs Mitspielen', () => {
    assert.equal(formatDay('2026-12-02'), 'Mittwoch, 2. Dezember');
    assert.equal(formatFullDay('1977-03-13'), 'Sonntag, 13. März 1977');
    assert.equal(formatWeekday('2026-11-28'), 'Samstag');
    // Berliner Zeit, egal wo das Gerät steht: 17:25 UTC ist im Winter 18:25 Uhr, im Sommer 19:25 Uhr.
    assert.equal(formatTime(Date.parse('2026-12-02T17:25:00Z')), '18:25 Uhr');
    assert.equal(formatTime(Date.parse('2026-07-04T17:25:00Z')), '19:25 Uhr');
    assert.match(formatEuro(3.6), /^3,60\s€$/);
  });
  it('Dauern: die zwei größten Einheiten', () => {
    assert.equal(formatDuration({ days: 2, hours: 4, minutes: 5 }), '2 Tage und 4 Stunden');
    assert.equal(formatDuration({ days: 1, hours: 0, minutes: 30 }), '1 Tag');
    assert.equal(formatDuration({ days: 0, hours: 4, minutes: 12 }), '4 Stunden und 12 Minuten');
    assert.equal(formatDuration({ days: 0, hours: 1, minutes: 1 }), '1 Stunde und 1 Minute');
    assert.equal(formatDuration({ days: 0, hours: 0, minutes: 12 }), '12 Minuten');
    assert.equal(formatDuration({ days: 0, hours: 0, minutes: 0 }), '0 Minuten');
  });
});
