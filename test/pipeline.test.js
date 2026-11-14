import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAMES } from '../src/games.js';
import { berlinDate, deToIso } from '../scripts/lib/dates.mjs';
import { mergeDraws } from '../scripts/lib/merge.mjs';
import { checkDraw, findGaps, isDrawDay } from '../scripts/lib/validate.mjs';
import { serialize } from '../scripts/lib/snapshot.mjs';
import { parseEjArchive } from '../scripts/sources/ej-archive.mjs';
import { parseLottoDe } from '../scripts/sources/lotto-de.mjs';
import { parseLottozahlenonline } from '../scripts/sources/lottozahlenonline.mjs';
import { fixture } from './helpers.js';

const lotto = GAMES.lotto;
const today = '2026-11-14';

describe('Datum', () => {
  it('lotto.de liefert Mitternacht deutscher Zeit (Winter- und Sommerzeit)', () => {
    assert.equal(berlinDate(1794351600000), '2026-11-11'); // 2026-11-10T23:00Z
    assert.equal(berlinDate(Date.UTC(2026, 6, 31, 22)), '2026-08-01');
  });
  it('wandelt deutsche Datumsangaben und lehnt Unsinn ab', () => {
    assert.equal(deToIso('09.10.1955'), '1955-10-09');
    assert.equal(deToIso('31.02.2020'), null);
  });
});

describe('Parser', () => {
  it('lottozahlenonline.de: vollständige Zeilen, unvollständige separat, Kalender ignoriert', () => {
    const { draws, incomplete } = parseLottozahlenonline(fixture('lottozahlenonline.html'));
    assert.deepEqual(draws.map((d) => d.date), ['2026-01-03', '2026-01-07', '2026-01-10']);
    assert.deepEqual(draws[0].numbers, [3, 8, 11, 12, 16, 46]);
    assert.deepEqual(incomplete, ['2026-11-18']);
  });

  it('eurojackpot-zahlen.eu: Datum aus dem Text (datetime-Attribut ist fehlerhaft), ohne Eurozahlen', () => {
    const { draws } = parseEjArchive(fixture('eurojackpot-zahlen.html'));
    assert.deepEqual(draws, [
      { date: '2012-03-23', numbers: [5, 8, 21, 37, 46] },
      { date: '2012-03-30', numbers: [5, 7, 12, 19, 26] },
    ]);
  });

  it('lotto.de: filtert Eurozahlen heraus', () => {
    const json = {
      drawDate: 1794524400000,
      drawNumbersCollection: [
        { drawNumber: 5, drawNumberType: 0, index: 0 },
        { drawNumber: 35, drawNumberType: 0, index: 1 },
        { drawNumber: 27, drawNumberType: 0, index: 2 },
        { drawNumber: 44, drawNumberType: 0, index: 3 },
        { drawNumber: 12, drawNumberType: 0, index: 4 },
        { drawNumber: 12, drawNumberType: 1, index: 5 },
        { drawNumber: 4, drawNumberType: 1, index: 6 },
      ],
    };
    assert.deepEqual(parseLottoDe(json), [{ date: '2026-11-13', numbers: [5, 35, 27, 44, 12] }]);
  });
});

describe('Validierung', () => {
  it('prüft Anzahl, Bereich und Eindeutigkeit', () => {
    assert.equal(checkDraw(lotto, { date: '2026-11-14', numbers: [1, 2, 3, 4, 5, 6] }), null);
    assert.match(checkDraw(lotto, { date: '2026-11-14', numbers: [1, 2, 3, 4, 5] }), /erwartet 6/);
    assert.match(checkDraw(lotto, { date: '2026-11-14', numbers: [1, 2, 3, 4, 5, 50] }), /außerhalb/);
    assert.match(checkDraw(lotto, { date: '2026-11-14', numbers: [1, 2, 3, 4, 5, 5] }), /doppelt/);
  });

  it('Eurojackpot zieht dienstags erst seit 29.03.2022', () => {
    const ej = GAMES.eurojackpot;
    assert.equal(isDrawDay(ej, '2022-03-22'), false);
    assert.equal(isDrawDay(ej, '2022-03-29'), true);
    assert.equal(isDrawDay(ej, '2012-03-23'), true);
  });

  it('findet Lücken', () => {
    const draws = [
      { date: '2026-11-04', numbers: [] },
      { date: '2026-11-11', numbers: [] },
    ];
    const gaps = findGaps({ ...lotto, gapCheckFrom: '2026-11-04' }, draws);
    assert.deepEqual(gaps, ['2026-11-07']);
  });
});

describe('Merge', () => {
  const snapshot = [{ date: '2026-11-07', numbers: [6, 9, 19, 45, 47, 48] }];

  it('ergänzt neue Ziehungen und sortiert Zahlen', () => {
    const result = mergeDraws(lotto, snapshot, [{ name: 'a', draws: [{ date: '2026-11-11', numbers: [49, 11, 20, 21, 23, 31] }] }], { today });
    assert.deepEqual(result.draws.at(-1), { date: '2026-11-11', numbers: [11, 20, 21, 23, 31, 49] });
    assert.equal(result.added.length, 1);
    assert.equal(result.conflicts.length, 0);
  });

  it('meldet Widersprüche statt zu überschreiben', () => {
    const result = mergeDraws(lotto, snapshot, [{ name: 'a', draws: [{ date: '2026-11-07', numbers: [1, 2, 3, 4, 5, 6] }] }], { today });
    assert.equal(result.conflicts.length, 1);
    assert.deepEqual(result.draws, snapshot);
  });

  it('meldet Widersprüche zwischen zwei Quellen für dieselbe neue Ziehung', () => {
    const sources = [
      { name: 'a', draws: [{ date: '2026-11-11', numbers: [1, 2, 3, 4, 5, 6] }] },
      { name: 'b', draws: [{ date: '2026-11-11', numbers: [1, 2, 3, 4, 5, 7] }] },
    ];
    assert.equal(mergeDraws(lotto, snapshot, sources, { today }).conflicts.length, 1);
  });

  it('verwirft Zukunft, Nicht-Ziehungstage und kaputte Datensätze', () => {
    const sources = [{
      name: 'a',
      draws: [
        { date: '2026-11-18', numbers: [1, 2, 3, 4, 5, 6] }, // Zukunft
        { date: '2026-11-12', numbers: [1, 2, 3, 4, 5, 6] }, // Donnerstag
        { date: '2026-11-11', numbers: [1, 2, 3] }, // unvollständig
      ],
    }];
    const result = mergeDraws(lotto, snapshot, sources, { today });
    assert.equal(result.added.length, 0);
    assert.equal(result.rejected.length, 3);
  });
});

describe('Snapshot-Format', () => {
  it('eine Ziehung pro Zeile, gültiges JSON', () => {
    const text = serialize('lotto', [{ date: '2026-11-14', numbers: [11, 15, 17, 32, 39, 49] }]);
    assert.equal(text, '{"game":"lotto","draws":[\n["2026-11-14",[11,15,17,32,39,49]]\n]}\n');
    assert.deepEqual(JSON.parse(text).draws, [['2026-11-14', [11, 15, 17, 32, 39, 49]]]);
  });
});
