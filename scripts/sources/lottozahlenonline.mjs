// Lotto-Jahresarchiv von lottozahlenonline.de (HTML). Aktuell bis zur letzten Ziehung
// und damit die Brücke, bis das LottoNumberArchive nachgezogen hat.

import { parseArchive } from '../lib/html-archive.mjs';
import { fetchText } from '../lib/http.mjs';

const url = (year) =>
  `https://www.lottozahlenonline.de/statistik/beide-spieltage/lottozahlen-archiv.php?j=${year}`;

export const parseLottozahlenonline = (html) =>
  parseArchive(html, { row: 'zahlensuche_rahmen', number: 'zahlensuche_zahl', pick: 6 });

/** Holt das laufende Jahr – im Januar zusätzlich das Vorjahr. */
export async function lottozahlenonline({ today }) {
  const year = Number(today.slice(0, 4));
  const years = today.slice(5, 7) === '01' ? [year - 1, year] : [year];
  const draws = [];
  for (const y of years) draws.push(...parseLottozahlenonline(await fetchText(url(y))).draws);
  return { name: 'lottozahlenonline.de', draws };
}
