// Offizielle letzte Ziehung von lotto.de (Deutscher Lotto- und Totoblock).
// Liefert nur die jeweils jüngste Ziehung – dient als offizielle Gegenprobe.

import { berlinDate } from '../lib/dates.mjs';
import { fetchJson } from '../lib/http.mjs';

const ENTITY = { lotto: 'lotto', eurojackpot: 'eurojackpot' };

export function parseLottoDe(json) {
  const numbers = (json.drawNumbersCollection ?? [])
    .filter((n) => (n.drawNumberType ?? 0) === 0) // 1 = Eurozahl
    .toSorted((a, b) => a.index - b.index)
    .map((n) => n.drawNumber);
  // drawDate ist Mitternacht deutscher Zeit als Epoch-Millisekunden
  return [{ date: berlinDate(json.drawDate), numbers }];
}

export async function lottoDe(gameId) {
  const json = await fetchJson(`https://www.lotto.de/api/stats/entities.${ENTITY[gameId]}/last`);
  return { name: 'lotto.de', draws: parseLottoDe(json) };
}
