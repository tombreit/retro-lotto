import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAMES } from '../src/games.js';
import {
  berlinInstant,
  drawDateAfter,
  durationParts,
  lastClosedDraw,
  nextDraw,
  upcomingDraw,
} from '../src/lib/schedule.js';

const { lotto, eurojackpot } = GAMES;
const utc = (iso) => Date.parse(`${iso}:00Z`);

describe('Ziehungstermine', () => {
  it('rechnet Berliner Wandzeit in Zeitpunkte um – Winter wie Sommer', () => {
    assert.equal(berlinInstant('2026-11-28', '19:25'), utc('2026-11-28T18:25'));
    assert.equal(berlinInstant('2026-07-04', '19:25'), utc('2026-07-04T17:25'));
  });

  it('trifft die Tage rund um die Zeitumstellung', () => {
    // Sommerzeit beginnt am So, 28.03.2027, und endet am So, 31.10.2027.
    assert.equal(berlinInstant('2027-03-27', '19:25'), utc('2027-03-27T18:25'));
    assert.equal(berlinInstant('2027-03-30', '20:00'), utc('2027-03-30T18:00'));
    assert.equal(berlinInstant('2027-03-31', '18:25'), utc('2027-03-31T16:25'));
    assert.equal(berlinInstant('2027-10-30', '19:25'), utc('2027-10-30T17:25'));
    assert.equal(berlinInstant('2027-11-03', '18:25'), utc('2027-11-03T17:25'));
    // Auch mitten in der Umstellungsnacht stimmt der nächste Termin.
    assert.equal(nextDraw(lotto, utc('2027-03-28T00:30')).drawAt, utc('2027-03-31T16:25'));
    assert.equal(nextDraw(eurojackpot, utc('2027-10-31T00:30')).drawAt, utc('2027-11-02T19:00'));
  });

  it('nimmt bis zum Annahmeschluss Scheine für die heutige Ziehung an', () => {
    // Samstag, 28.11.2026, 12:00 Uhr in Berlin
    const draw = nextDraw(lotto, utc('2026-11-28T11:00'));
    assert.equal(draw.date, '2026-11-28');
    assert.equal(draw.closesAt, utc('2026-11-28T18:00'));
    assert.equal(draw.drawAt, utc('2026-11-28T18:25'));
    assert.equal(nextDraw(lotto, utc('2026-11-28T17:59')).date, '2026-11-28');
  });

  it('springt nach dem Annahmeschluss auf die nächste Ziehung', () => {
    assert.equal(nextDraw(lotto, utc('2026-11-28T18:00')).date, '2026-12-02');
    assert.equal(nextDraw(lotto, utc('2026-11-28T23:30')).date, '2026-12-02');
    assert.equal(nextDraw(eurojackpot, utc('2026-11-28T11:00')).date, '2026-12-01');
    assert.equal(nextDraw(eurojackpot, utc('2026-12-01T18:30')).date, '2026-12-04');
  });

  it('kennt die laufende Ziehung zwischen Annahmeschluss und Ziehung', () => {
    assert.equal(upcomingDraw(lotto, utc('2026-11-28T18:10')).date, '2026-11-28');
    assert.equal(upcomingDraw(lotto, utc('2026-11-28T18:25')).date, '2026-12-02');
  });

  it('hängt nicht von der Zeitzone des Geräts ab', () => {
    const before = process.env.TZ;
    try {
      for (const zone of ['Pacific/Auckland', 'America/Los_Angeles', 'UTC']) {
        process.env.TZ = zone;
        assert.equal(nextDraw(lotto, utc('2026-11-28T17:59')).date, '2026-11-28', zone);
        assert.equal(nextDraw(lotto, utc('2026-11-28T18:00')).date, '2026-12-02', zone);
        // 23:30 Uhr in Berlin ist in Auckland schon der nächste Tag – es zählt der Berliner Kalender.
        assert.equal(nextDraw(eurojackpot, utc('2026-11-30T22:30')).date, '2026-12-01', zone);
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  it('findet den Ziehungstag davor und danach', () => {
    assert.equal(drawDateAfter(lotto, '2026-11-28'), '2026-12-02');
    assert.equal(drawDateAfter(lotto, '2026-11-29'), '2026-12-02');
    assert.equal(drawDateAfter(lotto, '2026-12-02', -1), '2026-11-28');
    assert.equal(drawDateAfter(eurojackpot, '2026-11-27'), '2026-12-01');
  });

  it('weiß, bis wohin ein Dauerschein schon mitgespielt hat', () => {
    assert.equal(lastClosedDraw(lotto, utc('2026-11-28T17:59')), '2026-11-25');
    assert.equal(lastClosedDraw(lotto, utc('2026-11-28T18:00')), '2026-11-28');
  });

  it('zerlegt Dauern in Tage, Stunden, Minuten', () => {
    assert.deepEqual(durationParts(0), { days: 0, hours: 0, minutes: 0 });
    assert.deepEqual(durationParts(59_000), { days: 0, hours: 0, minutes: 1 });
    assert.deepEqual(durationParts((2 * 1440 + 4 * 60 + 5) * 60_000), { days: 2, hours: 4, minutes: 5 });
    assert.deepEqual(durationParts(-5000), { days: 0, hours: 0, minutes: 0 });
  });
});
