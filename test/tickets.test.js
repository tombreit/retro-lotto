import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAMES } from '../src/games.js';
import {
  awaitedDraw,
  chanceAtLeast,
  createTicket,
  describeResult,
  isOpen,
  markSeen,
  resultsByDraw,
  settle,
  stopStanding,
  summarize,
} from '../src/lib/tickets.js';

const { lotto, eurojackpot } = GAMES;

const DRAWS = [
  ['2026-11-21', [9, 18, 36, 40, 41, 49]],
  ['2026-11-25', [3, 6, 14, 16, 24, 43]],
  ['2026-11-28', [3, 12, 13, 16, 23, 41]],
  ['2026-12-02', [1, 2, 4, 5, 7, 8]],
];

const ticket = (options = {}) =>
  createTicket({ gameId: 'lotto', numbers: [41, 3, 12, 13, 16, 23], firstDraw: '2026-11-25', id: 't1', now: 0, ...options });

describe('Spielscheine', () => {
  it('legt einen Schein mit sortierten Zahlen an', () => {
    const single = ticket();
    assert.deepEqual(single.numbers, [3, 12, 13, 16, 23, 41]);
    assert.equal(single.endDraw, '2026-11-25');
    assert.equal(ticket({ standing: true }).endDraw, null);
  });

  it('wertet einen einfachen Schein nur für seine Ziehung aus', () => {
    const { ticket: settled, fresh } = settle(ticket(), DRAWS);
    assert.equal(fresh.length, 1);
    assert.deepEqual(settled.results, [{ date: '2026-11-25', drawn: [3, 6, 14, 16, 24, 43], hits: 2, seen: false }]);
    assert.equal(isOpen(ticket()), true);
    assert.equal(isOpen(settled), false);
  });

  it('ist idempotent: dieselben Ziehungen ändern nichts mehr', () => {
    const first = settle(ticket(), DRAWS).ticket;
    const again = settle(first, DRAWS);
    assert.equal(again.ticket, first);
    assert.deepEqual(again.fresh, []);
  });

  it('wartet, solange die Ziehung noch fehlt', () => {
    const late = ticket({ firstDraw: '2026-12-05' });
    const { ticket: same, fresh } = settle(late, DRAWS);
    assert.equal(same, late);
    assert.deepEqual(fresh, []);
    assert.equal(isOpen(late), true);
  });

  it('lässt einen Dauerschein bei jeder Ziehung ab der ersten mitspielen', () => {
    const { ticket: settled, fresh } = settle(ticket({ standing: true }), DRAWS);
    assert.deepEqual(fresh.map((r) => [r.date, r.hits]), [['2026-11-25', 2], ['2026-11-28', 6], ['2026-12-02', 0]]);
    assert.equal(isOpen(settled), true);
    assert.equal(awaitedDraw(settled, lotto), '2026-12-05');
    assert.equal(awaitedDraw(ticket({ standing: true }), lotto), '2026-11-25');
  });

  it('führt Ergebnisse aus verschiedenen Ausschnitten nach Datum zusammen', () => {
    // Der Service Worker kennt nur die jüngsten Ziehungen, die Seite alle.
    const recent = settle(ticket({ standing: true }), DRAWS.slice(2)).ticket;
    const { ticket: merged, fresh } = settle(recent, DRAWS);
    assert.deepEqual(fresh.map((r) => r.date), ['2026-11-25']);
    assert.deepEqual(merged.results.map((r) => r.date), ['2026-11-25', '2026-11-28', '2026-12-02']);
  });

  it('stoppt einen Dauerschein nach der letzten geschlossenen Ziehung', () => {
    const standing = ticket({ standing: true });
    assert.equal(stopStanding(standing, '2026-11-21'), null);
    const stopped = stopStanding(standing, '2026-11-28');
    assert.equal(stopped.endDraw, '2026-11-28');
    const settled = settle(stopped, DRAWS).ticket;
    assert.deepEqual(settled.results.map((r) => r.date), ['2026-11-25', '2026-11-28']);
    assert.equal(isOpen(settled), false);
  });

  it('markiert Ergebnisse als gesehen – einzeln oder alle', () => {
    const settled = settle(ticket({ standing: true }), DRAWS).ticket;
    const one = markSeen(settled, '2026-11-28');
    assert.deepEqual(one.results.map((r) => r.seen), [false, true, false]);
    const allSeen = markSeen(one);
    assert.deepEqual(allSeen.results.map((r) => r.seen), [true, true, true]);
    // Nichts mehr zu tun: derselbe Schein kommt zurück, es wird nichts geschrieben.
    assert.equal(markSeen(allSeen), allSeen);
  });

  it('bündelt Ergebnisse je Ziehung, neueste zuerst', () => {
    const a = settle(ticket({ standing: true }), DRAWS).ticket;
    const b = settle(ticket({ id: 't2', numbers: [1, 2, 3, 4, 5, 6], firstDraw: '2026-12-02' }), DRAWS).ticket;
    const other = settle(createTicket({ gameId: 'eurojackpot', numbers: [1, 2, 3, 4, 5], firstDraw: '2026-12-01', id: 'e1' }), [
      ['2026-12-01', [1, 2, 3, 40, 41]],
    ]).ticket;
    const groups = resultsByDraw([a, b, other], 'lotto');
    assert.deepEqual(groups.map((g) => g.date), ['2026-12-02', '2026-11-28', '2026-11-25']);
    assert.equal(groups[0].entries.length, 2);
    assert.equal(groups[0].best, 4);
    assert.equal(groups[0].seen, false);
    assert.equal(resultsByDraw([markSeen(a), markSeen(b)], 'lotto')[0].seen, true);
    assert.equal(resultsByDraw([a, b, other], 'eurojackpot')[0].best, 3);
  });

  it('zieht Bilanz: Tipps, Richtige, Bestwert, gesparter Einsatz, Trefferkarte', () => {
    const a = settle(ticket({ standing: true }), DRAWS).ticket;
    const summary = summarize([a], lotto);
    assert.equal(summary.plays, 3);
    assert.equal(summary.hits, 8);
    assert.equal(summary.best, 6);
    assert.equal(summary.bestDate, '2026-11-28');
    assert.equal(summary.wins, 1);
    assert.equal(summary.saved, 3.6);
    assert.deepEqual([...summary.collected].toSorted((x, y) => x - y), [3, 12, 13, 16, 23, 41]);
    assert.equal(summarize([a], eurojackpot).plays, 0);
    assert.equal(summarize([], lotto).bestDate, null);
  });

  it('ordnet ein Ergebnis mit der echten Wahrscheinlichkeit ein', () => {
    assert.ok(Math.abs(chanceAtLeast(lotto, 0) - 1) < 1e-12);
    assert.match(describeResult(lotto, 0).headline, /^Kein Treffer\.$/);
    assert.match(describeResult(lotto, 0).sub, /43,6\s%/);
    assert.match(describeResult(lotto, 1).sub, /41,3\s%/);
    const two = describeResult(lotto, 2);
    assert.equal(two.win, false);
    assert.match(two.sub, /So weit kommen nur 15,1\s% aller Tipps\. Ab 3 wäre es ein Gewinn\./);
    const three = describeResult(lotto, 3);
    assert.equal(three.win, true);
    assert.equal(three.headline, '3 Richtige!');
    assert.match(three.sub, /Gewinn gewesen\. So weit kommen nur 1,9\s% aller Tipps\./);
    assert.match(describeResult(lotto, 4).sub, /So weit kommt nur einer von 1\.013 Tipps\./);
    assert.match(describeResult(lotto, 6).sub, /1 zu 13\.983\.816/);
    assert.match(describeResult(eurojackpot, 5).sub, /1 zu 2\.118\.760/);
  });
});

describe('Benachrichtigung', () => {
  it('nennt das beste Ergebnis, die Zahlen und die nächste Chance', async () => {
    const { announcement } = await import('../src/lib/tickets.js');
    const a = settle(ticket({ standing: true }), DRAWS).ticket;
    const b = settle(ticket({ id: 't2', numbers: [1, 2, 3, 4, 5, 6], firstDraw: '2026-12-02' }), DRAWS).ticket;
    const [latest, jackpot, first] = resultsByDraw([a, b], 'lotto');

    assert.deepEqual(announcement(lotto, first), {
      title: '2 Richtige beim Lotto',
      body: 'Ziehung vom Mittwoch, 25. November: 3, 6, 14, 16, 24, 43. Nächste Chance am Samstag.',
    });
    assert.equal(announcement(lotto, jackpot).title, '6 Richtige beim Lotto!');
    assert.match(announcement(lotto, jackpot).body, /Das wäre ein Gewinn gewesen\.$/);
    assert.match(announcement(lotto, latest).body, /Dein bester von 2 Scheinen\. Das wäre ein Gewinn gewesen\.$/);
    assert.equal(announcement(lotto, { ...first, best: 0 }).title, 'Kein Treffer beim Lotto');
  });
});

describe('Kennung eines Scheins', () => {
  it('entsteht auch ohne crypto.randomUUID (Seite über http)', () => {
    const original = crypto.randomUUID;
    try {
      crypto.randomUUID = undefined;
      const a = createTicket({ gameId: 'lotto', numbers: [1, 2, 3, 4, 5, 6], firstDraw: '2026-12-02' });
      const b = createTicket({ gameId: 'lotto', numbers: [1, 2, 3, 4, 5, 6], firstDraw: '2026-12-02' });
      assert.match(a.id, /^[0-9a-f]{32}$/);
      assert.notEqual(a.id, b.id);
    } finally {
      crypto.randomUUID = original;
    }
    assert.match(createTicket({ gameId: 'lotto', numbers: [1, 2, 3, 4, 5, 6], firstDraw: '2026-12-02' }).id, /^[0-9a-f-]{36}$/);
  });
});
