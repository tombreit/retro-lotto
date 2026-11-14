// Spielregeln als Daten – gemeinsam genutzt von App und Build-Skripten.

/** Binomialkoeffizient n über k (exakt für die hier vorkommenden Größen). */
export function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

function defineGame(config) {
  const { max, pick } = config;
  const combinations = binomial(max, pick);
  return Object.freeze({
    ...config,
    combinations,
    /**
     * Wahrscheinlichkeit, dass von `chosen` getippten Zahlen genau `hits` gezogen werden
     * (hypergeometrisch). Mit chosen = pick ergibt das die klassischen Gewinnchancen.
     */
    probability: (hits, chosen = pick) =>
      (binomial(chosen, hits) * binomial(max - chosen, pick - hits)) / combinations,
  });
}

export const GAMES = Object.freeze({
  lotto: defineGame({
    id: 'lotto',
    name: 'Lotto 6 aus 49',
    label: '6 aus 49',
    max: 49,
    pick: 6,
    columns: 7,
    /** Zusatzzahl, die die App bewusst nicht auswertet – für Hinweise wie „egal welche Superzahl“. */
    extra: 'Superzahl',
    /** Ab so vielen Richtigen gibt es auch ohne Superzahl einen Gewinn. */
    minWinHits: 3,
    /** Wochentage für neue Ziehungen (0 = So): Mittwoch und Samstag. */
    drawDays: [3, 6],
    /** Ab hier werden fehlende Ziehungstage als Lücke gemeldet. */
    gapCheckFrom: '2001-01-01',
    firstDraw: '1955-10-09',
  }),
  eurojackpot: defineGame({
    id: 'eurojackpot',
    name: 'Eurojackpot 5 aus 50',
    label: 'Eurojackpot',
    max: 50,
    pick: 5,
    columns: 7,
    extra: 'Eurozahlen',
    minWinHits: 3,
    /** Dienstag (seit 03/2022) und Freitag. */
    drawDays: [2, 5],
    gapCheckFrom: '2012-03-23',
    firstDraw: '2012-03-23',
    /** Bis hierhin wurde nur freitags gezogen. */
    tuesdaysFrom: '2022-03-29',
    /**
     * Die offizielle Ziehungsnummer (Eesti Loto) liegt konstant um 2 über der Anzahl der
     * Ziehungen, obwohl jeder Di/Fr-Termin seit 23.03.2012 vorhanden ist (geprüft 14.11.2026).
     * Weicht der Abstand ab, fehlt eine Ziehung.
     */
    drawNumberOffset: 2,
  }),
});

export const GAME_IDS = Object.keys(GAMES);
