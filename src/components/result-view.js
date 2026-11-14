// Ergebnis: live ausgewertet bei jeder Änderung des Tipps.

import { analyze, expected } from '../lib/match.js';
import {
  formatAgo,
  formatDate,
  formatDecimal,
  formatList,
  formatNumber,
  formatOdds,
  formatPercent,
  plural,
} from '../lib/format.js';
import { html, mount } from '../lib/html.js';

const PAGE = 60;

/** Erwartungswerte: eine Nachkommastelle, winzige Werte als „≈ 0“. */
const formatExpected = (value) => (formatDecimal(value) === '0' ? '≈ 0' : formatDecimal(value));

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

export class ResultView extends HTMLElement {
  #store = null;
  #tipp = [];
  #open = new Set();
  #shown = new Map();

  connectedCallback() {
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

  update(store, tipp) {
    const tippChanged = tipp.join() !== this.#tipp.join();
    if (tippChanged) this.#shown.clear();
    this.#store = store;
    this.#tipp = tipp;
    this.#render();
  }

  #render() {
    const store = this.#store;
    const tipp = this.#tipp;
    if (!store) {
      mount(this, html`<p class="result-loading" role="status">Ziehungen werden geladen …</p>`);
      return;
    }
    const game = store.game;
    this.dataset.state = tipp.length === 0 ? 'empty' : tipp.length < game.pick ? 'partial' : 'full';
    if (tipp.length === 0) mount(this, this.#empty(store));
    else {
      this.analysis = analyze(store, tipp);
      mount(this, tipp.length < game.pick ? this.#partial(store, tipp) : this.#full(store, tipp));
    }
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
    return html`<div class="result-card is-empty">
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
  }

  #partial(store, tipp) {
    const { game } = store;
    const a = this.analysis;
    const k = tipp.length;
    const together = a.matches.get(k) ?? [];
    const exp = expected(store, k, k);
    const missing = game.pick - k;
    const last = together.at(-1);

    const headline =
      k === 1
        ? `Die ${tipp[0]} wurde ${formatNumber(together.length)}-mal gezogen.`
        : together.length > 0
          ? `Diese ${k} Zahlen kamen ${formatNumber(together.length)}-mal gemeinsam.`
          : `Diese ${k} Zahlen kamen noch nie gemeinsam.`;

    const sub = [
      last !== undefined && `Zuletzt am ${formatDate(store.dates[last])}.`,
      `Erwartet wären ${formatExpected(exp)}.`,
    ].filter(Boolean);

    return html`<div class="result-card">
        <p class="result-headline">${headline}</p>
        <p class="result-sub">${sub.join(' ')}</p>
        <p class="result-hint">Noch ${plural(missing, 'Zahl', 'Zahlen')} bis zum vollständigen Tipp.</p>
      </div>
      ${together.length > 0
        ? html`<details class="hit-row" data-hits="${k}" ${this.#open.has(k) ? 'open' : ''}>
            <summary>
              <span class="hit-label">${k === 1 ? 'Alle Ziehungen mit dieser Zahl' : 'Alle gemeinsamen Ziehungen'}</span>
              <span class="hit-count">${formatNumber(together.length)}</span>
            </summary>
            <div class="details-body"></div>
          </details>`
        : ''}`;
  }

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
      const dates = jackpots.map((i) => formatDate(store.dates[i]));
      headline = `Volltreffer! ${game.pick} Richtige am ${formatList(dates)}.`;
      sub = jackpots.length > 1
        ? 'Diese Kombination wurde mehr als einmal gezogen – ein echtes Kuriosum.'
        : `Das war ${formatAgo(store.dates[jackpots[0]])}.`;
    } else if (a.best >= game.minWinHits) {
      const bestDraws = a.matches.get(a.best);
      const bestLast = store.dates[bestDraws.at(-1)];
      headline = 'Noch nie gezogen.';
      sub =
        bestDraws.length === 1
          ? `Am nächsten dran: ${a.best} Richtige am ${formatDate(bestLast)}, ${formatAgo(bestLast)}.`
          : `Am nächsten dran: ${bestDraws.length}-mal ${a.best} Richtige, zuletzt am ${formatDate(bestLast)}.`;
    } else {
      headline = 'Noch nie gezogen.';
      sub = `Mehr als ${a.best} Richtige gab es mit diesen Zahlen nie.`;
    }

    const rows = [];
    for (let h = game.pick; h >= game.minWinHits; h--) {
      const count = a.histogram[h];
      const exp = expected(store, game.pick, h);
      const cells = html`<span class="hit-label">${h} Richtige</span>
        <span class="hit-expected">erwartet ${formatExpected(exp)}</span>
        <span class="hit-count">${formatNumber(count)}</span>`;
      rows.push(
        count
          ? html`<details class="hit-row" data-hits="${h}" ${this.#open.has(h) ? 'open' : ''}>
              <summary>${cells}</summary>
              <div class="details-body"></div>
            </details>`
          : html`<div class="hit-row is-zero"><div class="hit-summary">${cells}</div></div>`,
      );
    }

    return html`<div class="result-card is-${tone}">
        <p class="result-headline">${headline}</p>
        <p class="result-sub">${sub}</p>
      </div>
      <p class="result-summary">
        Gewonnen hättest du in ${plural(wins, 'Ziehung', 'Ziehungen')} von ${formatNumber(store.size)}
        (${formatPercent(wins / store.size)}), jeweils ab ${game.minWinHits} Richtigen.
      </p>
      <div class="hit-ladder">${rows}</div>
      <p class="result-odds">Chance auf ${game.pick} Richtige pro Ziehung: ${formatOdds(game.combinations)}</p>`;
  }
}

customElements.define('result-view', ResultView);
