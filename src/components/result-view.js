// Ergebnis: live ausgewertet bei jeder Änderung des Tipps.

import { analyze, chanceEver, expected, expectedWins } from '../lib/match.js';
import { formatAgo, formatDate, formatList, formatNumber, formatRoughly, formatTimes, plural } from '../lib/format.js';
import { html, mount } from '../lib/html.js';

const PAGE = 60;

/** Erwartete Häufigkeit in Worten: „rund 65-mal“, „seltener als einmal“, „so gut wie nie“. */
function roughly(value) {
  if (value < 0.05) return 'so gut wie nie';
  if (value < 1) return 'seltener als einmal';
  return `rund ${formatTimes(Math.round(value))}`;
}

/** Kleine Kugelreihe einer Ziehung, Treffer hervorgehoben. */
export const drawBalls = (numbers, tipp) =>
  html`<span class="mini-balls">${numbers.map(
    (n) => html`<span class="mini-ball ${tipp.has(n) ? 'is-hit' : ''}">${n}</span>`,
  )}</span>`;

const drawRow = (store, index, tipp) => html`<li class="draw-row">
  <time datetime="${store.dates[index]}">${formatDate(store.dates[index])}</time>
  ${drawBalls(store.numbers[index], tipp)}
</li>`;

/** Liste von Ziehungen, neueste zuerst, seitenweise. */
function drawList(store, indices, tipp, shown) {
  const newestFirst = indices.toReversed();
  const visible = newestFirst.slice(0, shown);
  const rest = newestFirst.length - visible.length;
  return html`<ol class="draw-list">${visible.map((i) => drawRow(store, i, tipp))}</ol>
    ${rest > 0
      ? html`<button type="button" class="button button-quiet" data-more>
          ${rest > PAGE ? `${PAGE} weitere anzeigen` : `${rest} weitere anzeigen`}
        </button>`
      : ''}`;
}

/**
 * Das Ergebnis besteht aus zwei Blöcken, die das Layout getrennt platziert: der Kernaussage
 * (`.result-lead`, zugleich Live-Region für Screenreader) und den Details (`.result-more`).
 * Bei vollem Tipp steht die Kernaussage auf dem Smartphone über dem Raster, sonst darunter.
 * Beide Container bleiben bestehen – eine neu eingefügte Live-Region würde nicht angesagt.
 */
export class ResultView extends HTMLElement {
  #game = null;
  #store = null;
  #tipp = [];
  #open = new Set();
  #shown = new Map();
  #lead;
  #more;

  connectedCallback() {
    if (this.#lead) return;
    mount(this, html`<div class="result-lead" aria-live="polite"></div><div class="result-more"></div>`);
    this.#lead = this.querySelector('.result-lead');
    this.#more = this.querySelector('.result-more');
    this.addEventListener('toggle', (event) => {
      const details = event.target.closest?.('details[data-hits]');
      if (!details) return;
      const hits = Number(details.dataset.hits);
      if (details.open) this.#open.add(hits);
      else this.#open.delete(hits);
      if (details.open && !details.querySelector('.draw-list')) this.#fillDetails(details);
    }, true);
    this.addEventListener('click', (event) => {
      const more = event.target.closest('[data-more]');
      if (!more) return;
      const details = more.closest('[data-hits]');
      const key = Number(details.dataset.hits);
      this.#shown.set(key, (this.#shown.get(key) ?? PAGE) + PAGE);
      this.#fillDetails(details);
    });
  }

  /** @param store fehlt, solange die Ziehungen des Spiels noch laden */
  update(game, store, tipp) {
    const tippChanged = tipp.join() !== this.#tipp.join();
    if (tippChanged) this.#shown.clear();
    this.#game = game;
    this.#store = store;
    this.#tipp = tipp;
    this.#render();
  }

  #render() {
    const store = this.#store;
    const tipp = this.#tipp;
    const game = this.#game;
    // Der Zustand steht schon vor dem Laden fest – das Layout (Ergebnis über oder unter dem Raster)
    // darf beim Eintreffen der Daten nicht mehr springen.
    this.dataset.state = tipp.length === 0 ? 'empty' : tipp.length < game.pick ? 'partial' : 'full';
    if (!store) {
      mount(
        this.#lead,
        this.dataset.state === 'full'
          ? html`<div class="result-card is-loading" role="status">
              <p class="result-headline">Prüfe deinen Tipp …</p>
              <p class="result-sub">Die Ziehungen werden geladen.</p>
            </div>`
          : html`<p class="result-loading" role="status">Ziehungen werden geladen …</p>`,
      );
      mount(this.#more, html``);
      return;
    }
    if (tipp.length) this.analysis = analyze(store, tipp);
    const { lead, more = html`` } =
      tipp.length === 0 ? this.#empty(store) : tipp.length < game.pick ? this.#partial(store, tipp) : this.#full(store, tipp);
    mount(this.#lead, lead);
    mount(this.#more, more);
    for (const details of this.querySelectorAll('details[open][data-hits]')) this.#fillDetails(details);
  }

  #fillDetails(details) {
    const hits = Number(details.dataset.hits);
    const indices = this.analysis.matches.get(hits) ?? [];
    const target = details.querySelector('.details-body');
    mount(target, drawList(this.#store, indices, new Set(this.#tipp), this.#shown.get(hits) ?? PAGE));
  }

  #empty(store) {
    const { game } = store;
    const lead = html`<div class="result-card is-empty">
      <p class="result-headline">Wähle ${game.pick} Zahlen.</p>
      <p class="result-sub">
        Schon ab der ersten Zahl siehst du, wie oft sie gezogen wurde. Mit ${game.pick} Zahlen
        prüfst du deinen Tipp gegen alle ${formatNumber(store.size)} Ziehungen seit
        ${formatDate(store.dates[0])}.
      </p>
      <p class="result-hint">
        <span class="for-touch">Lieber über die Tastatur? Tippe oben auf das +.</span>
        <span class="for-pointer">Du kannst die Zahlen auch einfach eintippen, getrennt durch Leerzeichen oder Komma.</span>
      </p>
    </div>`;
    return { lead };
  }

  #partial(store, tipp) {
    const { game } = store;
    const k = tipp.length;
    const together = this.analysis.matches.get(k) ?? [];
    const last = together.at(-1);
    // Bezugsgröße: Wie oft kommen k bestimmte Zahlen bei reinem Zufall zusammen?
    const usual = roughly(expected(store, k, k));

    const headline =
      k === 1
        ? `Die ${tipp[0]} wurde ${formatTimes(together.length)} gezogen.`
        : together.length > 0
          ? `Diese ${k} Zahlen wurden ${formatTimes(together.length)} zusammen gezogen.`
          : `Diese ${k} Zahlen wurden noch nie zusammen gezogen.`;
    const sub = [
      last !== undefined && `${together.length === 1 ? 'Das war' : 'Zuletzt'} am ${formatDate(store.dates[last])}.`,
      k === 1 ? `Im Schnitt wird jede Zahl ${usual} gezogen.` : `Im Schnitt kommen ${k} bestimmte Zahlen ${usual} zusammen.`,
    ].filter(Boolean);

    const lead = html`<div class="result-card">
      <p class="result-headline">${headline}</p>
      <p class="result-sub">${sub.join(' ')}</p>
      <p class="result-hint">Noch ${plural(game.pick - k, 'Zahl', 'Zahlen')} bis zum vollständigen Tipp.</p>
    </div>`;
    const more =
      together.length > 0
        ? html`<details class="hit-row" data-hits="${k}" ${this.#open.has(k) ? 'open' : ''}>
            <summary>
              <span class="hit-label">${k === 1 ? 'Alle Ziehungen mit dieser Zahl' : 'Alle gemeinsamen Ziehungen'}</span>
              <span class="hit-count">${formatNumber(together.length)}</span>
            </summary>
            <div class="details-body"></div>
          </details>`
        : html``;
    return { lead, more };
  }

  /**
   * Voller Tipp. Reihenfolge der Aussagen, nach Relevanz:
   * 1. Wurde genau diese Kombination je gezogen? (Schlagzeile)
   * 2. Hätte der Tipp sonst gewonnen – wie oft, mit wie vielen Richtigen? (Unterzeile)
   * 3. Die Gewinne einzeln, mit Datum – unter der ausdrücklichen Annahme „bei jeder Ziehung gespielt“.
   * 4. Einordnung: Ist das viel? Und warum ist „nie gezogen“ der Normalfall?
   */
  #full(store, tipp) {
    const { game } = store;
    const a = this.analysis;
    const jackpots = a.matches.get(game.pick);
    let wins = 0;
    for (let h = game.minWinHits; h <= game.pick; h++) wins += a.histogram[h];

    let headline;
    let sub;
    let tone = 'neutral';
    if (jackpots.length > 0) {
      tone = 'jackpot';
      headline = `Volltreffer! ${game.pick} Richtige am ${formatList(jackpots.map((i) => formatDate(store.dates[i])))}.`;
      sub = jackpots.length > 1
        ? 'Diese Kombination wurde mehr als einmal gezogen – ein echtes Kuriosum.'
        : `Das war ${formatAgo(store.dates[jackpots[0]])}.`;
    } else if (wins > 0) {
      headline = 'Noch nie gezogen.';
      const span = a.best - game.minWinHits;
      const range = `${span === 0 ? a.best : `${game.minWinHits} ${span === 1 ? 'oder' : 'bis'} ${a.best}`} Richtigen`;
      sub = `Gewonnen hättest du trotzdem: ${formatTimes(wins)} mit ${range}.`;
    } else {
      headline = 'Noch nie gezogen.';
      sub = `Auch sonst kein Gewinn: Mehr als ${a.best} Richtige hatte dieser Tipp nie.`;
    }

    // Nur Gewinnklassen, die tatsächlich vorkamen – von oben nach unten.
    const rows = [];
    for (let h = game.pick; h >= game.minWinHits; h--) {
      const count = a.histogram[h];
      if (!count) continue;
      rows.push(html`<details class="hit-row" data-hits="${h}" ${this.#open.has(h) ? 'open' : ''}>
        <summary>
          <span class="hit-label">${h} Richtige</span>
          <span class="hit-count">${formatTimes(count)}</span>
        </summary>
        <div class="details-body"></div>
      </details>`);
    }

    // Abweichung in Standardabweichungen (Poisson): unter 1 ist reiner Zufall, ab 2 auffällig.
    const usualWins = expectedWins(store);
    const z = (wins - usualWins) / Math.sqrt(usualWins);
    const comparison =
      wins === 0
        ? 'kein einziges Mal'
        : Math.abs(z) < 1
          ? 'etwa genauso oft'
          : `${Math.abs(z) < 2 ? 'etwas' : 'deutlich'} ${z > 0 ? 'öfter' : 'seltener'}`;
    const odds = `Die Chance auf ${game.pick} Richtige liegt bei 1 zu ${formatNumber(game.combinations)} pro Ziehung,
      egal welche ${game.extra} – und selbst über alle ${formatNumber(store.size)} Ziehungen nur bei etwa
      1 zu ${formatRoughly(1 / chanceEver(store))}.`;

    const lead = html`<div class="result-card is-${tone}">
      <p class="result-headline">${headline}</p>
      <p class="result-sub">${sub}</p>
    </div>`;
    const more = html`${wins > 0
        ? html`<p class="result-intro">
              Hättest du diesen Tipp bei allen ${formatNumber(store.size)} Ziehungen seit dem
              ${formatDate(store.dates[0])} gespielt, wären das deine Gewinne:
            </p>
            <div class="hit-ladder">${rows}</div>`
        : ''}
      <p class="result-note">
        Im Schnitt gewinnt jeder Tipp in diesem Zeitraum ${roughly(usualWins)} – deiner ${comparison}.
      </p>
      <p class="result-note">${jackpots.length ? 'Zum Vergleich:' : 'Nie gezogen ist der Normalfall:'} ${odds}</p>`;
    return { lead, more };
  }
}

customElements.define('result-view', ResultView);
