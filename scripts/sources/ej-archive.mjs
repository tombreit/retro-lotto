// Eurojackpot-Jahresarchiv von eurojackpot-zahlen.eu (HTML), lückenlos seit 23.03.2012.
// Wird nur für den einmaligen Backfill und als Notfall bei Lücken verwendet.

import { parseArchive } from '../lib/html-archive.mjs';
import { fetchText, sleep } from '../lib/http.mjs';

const BASE = 'https://www.eurojackpot-zahlen.eu/eurojackpot-zahlenarchiv.php';

export const parseEjArchive = (html) =>
  parseArchive(html, { row: 'zahlen_rahmen', number: 'zahlenarchiv_zahl', pick: 5 });

/** Lädt die angegebenen Jahre nacheinander (höflich mit Pause). */
export async function ejArchive({ years, today }) {
  const currentYear = Number(today.slice(0, 4));
  const draws = [];
  for (const [i, year] of years.entries()) {
    if (i > 0) await sleep(1000);
    // Das laufende Jahr gibt es nur unter der URL ohne Parameter.
    const html = await fetchText(year === currentYear ? BASE : `${BASE}?j=${year}`);
    const parsed = parseEjArchive(html).draws.filter((d) => d.date.startsWith(`${year}-`));
    draws.push(...parsed);
  }
  return { name: 'eurojackpot-zahlen.eu', draws };
}
