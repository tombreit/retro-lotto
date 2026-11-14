// Eurojackpot-Ziehungen über die öffentliche API von Eesti Loto (estnischer Eurojackpot-Partner).
// Reicht zurück bis 09/2025 und liefert die fortlaufende offizielle Ziehungsnummer.

import { berlinDate } from '../lib/dates.mjs';
import { fetchJson } from '../lib/http.mjs';

const API = 'https://api.eestiloto.ee/api/v1';
const PAGE_SIZE = 30; // Maximum der API

/**
 * @param {{ known: Set<string>, all?: boolean }} options
 *   known: bereits bekannte Ziehungsdaten – deren Details werden nicht erneut geladen.
 *   all: alle verfügbaren Ziehungen laden (für den Abgleich beim Backfill).
 */
export async function eestiLoto({ known, all = false }) {
  const games = await fetchJson(`${API}/games`);
  const game = games.find((g) => g.gameCode?.toUpperCase() === 'EUROJACKPOT');
  if (!game) throw new Error('Eurojackpot nicht in /games gefunden');

  const items = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      status: 'DRAW_COMPLETED',
      gameId: game.id,
      page,
      size: PAGE_SIZE,
      sort: 'dateTime:desc',
    });
    const data = await fetchJson(`${API}/draws?${params}`);
    const content = data.content ?? [];
    items.push(...content);
    const reachedKnown = !all && content.some((d) => known.has(berlinDate(d.dateTime)));
    if (reachedKnown || content.length === 0 || page >= (data.page?.totalPages ?? 1)) break;
  }

  const numbered = items.map((d) => ({ date: berlinDate(d.dateTime), number: d.number }));
  const wanted = items.filter((d) => all || !known.has(berlinDate(d.dateTime)));

  const draws = [];
  for (let i = 0; i < wanted.length; i += 4) {
    const details = await Promise.all(
      wanted.slice(i, i + 4).map((d) => fetchJson(`${API}/draws/${d.id}`)),
    );
    for (const detail of details) {
      const main = detail.results?.stages?.find((s) => s.code === 'MAIN-NUMBERS');
      if (main?.winningNumbers?.length)
        draws.push({ date: berlinDate(detail.dateTime), numbers: main.winningNumbers });
    }
  }
  return { name: 'Eesti Loto', draws, numbered };
}
