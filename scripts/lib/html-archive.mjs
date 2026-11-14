// Gemeinsamer Parser für die HTML-Archive (lottozahlenonline.de, eurojackpot-zahlen.eu).
// Beide Seiten nutzen dieselbe Struktur: ein Container pro Ziehung, darin ein <time> mit
// dem Datum als Text (DD.MM.YYYY) und je ein <div class="…_zahl"> pro Gewinnzahl.
// Das datetime-Attribut wird ignoriert – auf eurojackpot-zahlen.eu ist es fehlerhaft (YYYY-DD-MM).

import { deToIso } from './dates.mjs';

/**
 * @param {string} html
 * @param {{ row: string, number: string, pick: number }} spec
 *   row: Klassenname des Ziehungs-Containers, number: Klassenname einer Gewinnzahl
 * @returns {{ draws: {date: string, numbers: number[]}[], incomplete: string[] }}
 */
export function parseArchive(html, { row, number, pick }) {
  const draws = [];
  const incomplete = [];
  const chunks = html.split(`class="${row}"`).slice(1);
  const numberRe = new RegExp(`class="${number}"[^>]*>\\s*(\\d{1,2})\\s*<`, 'g');

  for (const chunk of chunks) {
    const dateText = /<time\b[^>]*>\s*([\d.]+)\s*<\/time>/.exec(chunk)?.[1];
    const date = dateText && deToIso(dateText);
    if (!date) continue;
    const numbers = [...chunk.matchAll(numberRe)].map((m) => Number(m[1]));
    if (numbers.length === pick) draws.push({ date, numbers });
    else incomplete.push(date); // z. B. Ziehung läuft gerade, Zahlen werden noch eingetragen
  }
  return { draws, incomplete };
}
