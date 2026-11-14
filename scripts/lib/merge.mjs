// Führt Snapshot und Quellen zusammen. Schlüssel ist das Datum.
// Grundsatz: Bestehende Ziehungen werden nie verändert; neue werden nur übernommen,
// wenn sie valide sind und keine Quelle widerspricht.

import { checkDraw, isDrawDay } from './validate.mjs';

const sortNumbers = (numbers) => numbers.toSorted((a, b) => a - b);
const sameNumbers = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);

/**
 * @param {object} game
 * @param {{date: string, numbers: number[]}[]} snapshot
 * @param {{name: string, draws: {date: string, numbers: number[]}[]}[]} sources
 * @param {{ today: string }} options
 */
export function mergeDraws(game, snapshot, sources, { today }) {
  /** @type {Map<string, {date: string, numbers: number[], from: string[]}>} */
  const byDate = new Map(snapshot.map((d) => [d.date, { ...d, from: ['snapshot'] }]));
  const conflicts = [];
  const rejected = [];
  const added = new Set();

  for (const source of sources) {
    for (const raw of source.draws) {
      const draw = { date: raw.date, numbers: sortNumbers(raw.numbers ?? []) };
      const problem = checkDraw(game, draw);
      if (problem) {
        rejected.push(`${source.name}: ${problem}`);
        continue;
      }
      const existing = byDate.get(draw.date);
      if (existing) {
        if (sameNumbers(existing.numbers, draw.numbers)) existing.from.push(source.name);
        else
          conflicts.push(
            `${draw.date}: ${existing.from.join('+')} = ${existing.numbers.join(' ')}` +
              `, aber ${source.name} = ${draw.numbers.join(' ')}`,
          );
        continue;
      }
      if (draw.date > today) {
        rejected.push(`${source.name}: ${draw.date} liegt in der Zukunft`);
        continue;
      }
      // Historische Termine sind unregelmäßig (Sonntagsziehungen bis 1965, Feiertage) –
      // neue Ziehungen müssen aber auf einen regulären Ziehungstag fallen.
      const isNew = snapshot.length === 0 ? false : draw.date > snapshot.at(-1).date;
      if (isNew && !isDrawDay(game, draw.date)) {
        rejected.push(`${source.name}: ${draw.date} ist kein Ziehungstag`);
        continue;
      }
      byDate.set(draw.date, { ...draw, from: [source.name] });
      added.add(draw.date);
    }
  }

  const draws = [...byDate.values()]
    .toSorted((a, b) => a.date.localeCompare(b.date))
    .map(({ date, numbers }) => ({ date, numbers }));
  const addedDraws = [...byDate.values()].filter((d) => added.has(d.date));
  return { draws, added: addedDraws, conflicts, rejected };
}
