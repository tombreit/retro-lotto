// Komplette Lotto-Historie seit 1955 aus dem LottoNumberArchive von Johannes Friedrich
// (https://github.com/JohannesFriedrich/LottoNumberArchive, LGPL-3.0).
// Hinkt den Ziehungen typischerweise einige Tage hinterher.

import { deToIso } from '../lib/dates.mjs';
import { fetchJson } from '../lib/http.mjs';

export const URL = 'https://johannesfriedrich.github.io/LottoNumberArchive/Lottonumbers_complete.json';

export function parseLottoArchive(json) {
  return json.data.map((d) => ({ date: deToIso(d.date), numbers: d.Lottozahl }));
}

export async function lottoArchive() {
  return { name: 'LottoNumberArchive', draws: parseLottoArchive(await fetchJson(URL)) };
}
