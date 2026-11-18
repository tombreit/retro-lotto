// Statistik: heiße/kalte Zahlen als Abweichung vom Erwartungswert, Pausen, Paare, Rekorde.

import { formatDate, formatDecimal, formatList, formatNumber, formatPercent, plural } from '../lib/format.js';
import { html, mount } from '../lib/html.js';
import {
  PERIODS,
  currentGaps,
  numberStats,
  pairExpected,
  rangeFor,
  records,
  repeatedCombinations,
  topPairs,
} from '../lib/stats.js';

/** Fünf Stufen der divergierenden Skala, nach Abweichung in Standardabweichungen. */
const BANDS = [
  { id: 'cold-2', label: 'viel seltener', test: (z) => z <= -2 },
  { id: 'cold-1', label: 'seltener', test: (z) => z <= -1 },
  { id: 'neutral', label: 'normal', test: (z) => z < 1 },
  { id: 'hot-1', label: 'häufiger', test: (z) => z < 2 },
  { id: 'hot-2', label: 'viel häufiger', test: () => true },
];
const bandOf = (z) => BANDS.find((b) => b.test(z)).id;

const signed = (value, formatter) => (value > 0 ? '+' : value < 0 ? '−' : '±') + formatter(Math.abs(value));

const ball = (n, extra = '') => html`<span class="mini-ball ${extra}">${n}</span>`;

export class StatsView extends HTMLElement {
  #store = null;
  #period = 'all';
  #selected = null;
  #model = null;

  connectedCallback() {
    this.addEventListener('click', (event) => {
      const period = event.target.closest('[data-period]');
      if (period) {
        this.dispatchEvent(new CustomEvent('period-change', { bubbles: true, detail: { period: period.dataset.period } }));
        return;
      }
      const cell = event.target.closest('[data-number]');
      if (cell) this.#select(Number(cell.dataset.number));
    });
    // Hover zeigt Details nur bei echten Zeigegeräten; Touch nutzt Antippen.
    this.addEventListener('pointerover', (event) => {
      if (event.pointerType !== 'mouse') return;
      const cell = event.target.closest('.heat-cell');
      if (cell) this.#readout(Number(cell.dataset.number));
    });
    this.addEventListener('pointerleave', () => this.#readout(this.#selected));
    this.addEventListener('focusin', (event) => {
      const cell = event.target.closest('.heat-cell');
      if (cell) this.#readout(Number(cell.dataset.number));
    });
  }

  update(store, period) {
    if (store === this.#store && period === this.#period && this.#model) return;
    if (store !== this.#store) this.#selected = null;
    this.#store = store;
    this.#period = period;
    this.#render();
  }

  #select(number) {
    this.#selected = this.#selected === number ? null : number;
    for (const cell of this.querySelectorAll('.heat-cell'))
      cell.setAttribute('aria-pressed', String(Number(cell.dataset.number) === this.#selected));
    this.#readout(this.#selected);
  }

  #compute() {
    const store = this.#store;
    const { game } = store;
    const range = rangeFor(store, this.#period);
    const draws = range.to - range.from;
    const p = game.pick / game.max;
    const expectedCount = draws * p;
    const sigma = Math.sqrt(draws * p * (1 - p));
    const gaps = new Map(currentGaps(store).map((g) => [g.number, g]));
    const numbers = numberStats(store, range).map((s) => {
      const z = sigma > 0 ? (s.count - expectedCount) / sigma : 0;
      return { ...s, z, band: bandOf(z), deviation: expectedCount ? s.count / expectedCount - 1 : 0, gap: gaps.get(s.number) };
    });
    return { store, game, range, draws, expectedCount, numbers, gaps };
  }

  #render() {
    const store = this.#store;
    if (!store) {
      mount(this, html`<p class="result-loading" role="status">Ziehungen werden geladen …</p>`);
      return;
    }
    const m = (this.#model = this.#compute());
    const { game, range, draws, expectedCount, numbers } = m;
    const pairsExpected = pairExpected(game, draws);
    const pairs = topPairs(store, range, 5);
    const absent = currentGaps(store).slice(0, 5);
    const byDeviation = numbers.toSorted((a, b) => b.deviation - a.deviation);
    const extremes = [...byDeviation.slice(0, 5), ...byDeviation.slice(-5)];
    const maxDev = Math.max(...extremes.map((n) => Math.abs(n.deviation)), 0.01);

    mount(
      this,
      html`<div class="period-switch segmented" role="radiogroup" aria-label="Zeitraum">
          ${PERIODS.map(
            (p) => html`<button type="button" role="radio" data-period="${p.id}"
              aria-checked="${p.id === this.#period}">${p.label}</button>`,
          )}
        </div>
        <p class="stats-intro">
          ${formatNumber(draws)} Ziehungen vom ${formatDate(store.dates[range.from])} bis
          ${formatDate(store.dates[range.to - 1])}. Bei reinem Zufall wird jede Zahl etwa
          ${formatNumber(Math.round(expectedCount))}-mal gezogen.
        </p>

        <section class="stats-block" aria-labelledby="h-heat">
          <h2 id="h-heat">Heiße und kalte Zahlen</h2>
          <div class="heat-grid" style="--cols: ${game.columns}" role="group" aria-label="Häufigkeit je Zahl">
            ${numbers.map(
              (n) => html`<button type="button" class="heat-cell band-${n.band}" data-number="${n.number}"
                aria-pressed="${n.number === this.#selected}"
                aria-label="${n.number}: ${n.count}-mal gezogen, ${signed(n.deviation, formatPercent)} gegenüber erwartet">
                <span class="heat-number">${n.number}</span>
                <span class="heat-count">${formatNumber(n.count)}</span>
              </button>`,
            )}
          </div>
          <ul class="heat-legend" aria-label="Legende">
            ${BANDS.map((b) => html`<li><span class="swatch band-${b.id}"></span>${b.label}</li>`)}
          </ul>
          <div class="heat-readout" aria-live="polite"></div>
          <p class="footnote">
            „Normal“ heißt: weniger als eine Standardabweichung vom Erwartungswert entfernt.
            Bei ${game.max} Zahlen sind ein paar stärkere Ausreißer reiner Zufall – Lottokugeln
            haben kein Gedächtnis.
          </p>
        </section>

        <section class="stats-block" aria-labelledby="h-dev">
          <h2 id="h-dev">Größte Abweichungen</h2>
          <ol class="dev-chart" aria-label="Abweichung vom Erwartungswert, die fünf häufigsten und fünf seltensten Zahlen">
            ${extremes.map(
              (n, i) => html`<li class="${i === 5 ? 'is-split' : ''}">
                ${ball(n.number)}
                <span class="dev-track">
                  <span class="dev-bar ${n.deviation >= 0 ? 'is-hot' : 'is-cold'}"
                    style="--size: ${(Math.abs(n.deviation) / maxDev).toFixed(4)}"></span>
                </span>
                <span class="dev-value">${signed(n.deviation, formatPercent)}</span>
                <span class="dev-count">${formatNumber(n.count)}×</span>
              </li>`,
            )}
          </ol>
          <p class="footnote">Abweichung der Ziehungshäufigkeit vom Erwartungswert (${formatNumber(Math.round(expectedCount))}) im gewählten Zeitraum.</p>
        </section>

        <section class="stats-block" aria-labelledby="h-absent">
          <h2 id="h-absent">Am längsten nicht gezogen</h2>
          <ol class="stat-list">
            ${absent.map(
              (g) => html`<li>
                ${ball(g.number)}
                <span>seit ${plural(g.since, 'Ziehung', 'Ziehungen')}</span>
                <span class="stat-meta">zuletzt ${formatDate(store.dates[g.lastIndex])}</span>
              </li>`,
            )}
          </ol>
          <p class="footnote">Im Schnitt vergehen ${formatDecimal(game.max / game.pick)} Ziehungen zwischen zwei Auftritten einer Zahl.</p>
        </section>

        <section class="stats-block" aria-labelledby="h-pairs">
          <h2 id="h-pairs">Häufigste Paare</h2>
          <ol class="stat-list">
            ${pairs.map(
              ({ pair: [a, b], count }) => html`<li>
                <span class="pair">${ball(a)}${ball(b)}</span>
                <span>${formatNumber(count)}-mal gemeinsam</span>
                <span class="stat-meta">erwartet ${formatDecimal(pairsExpected)}</span>
              </li>`,
            )}
          </ol>
        </section>

        <section class="stats-block" aria-labelledby="h-records">
          <h2 id="h-records">Rekorde und Kurioses</h2>
          ${this.#records()}
        </section>

        <details class="table-view">
          <summary>Alle Zahlen als Tabelle</summary>
          <table>
            <thead>
              <tr><th scope="col">Zahl</th><th scope="col">Gezogen</th><th scope="col">Abweichung</th><th scope="col">Zuletzt</th></tr>
            </thead>
            <tbody>
              ${numbers.map(
                (n) => html`<tr>
                  <th scope="row">${n.number}</th>
                  <td>${formatNumber(n.count)}</td>
                  <td>${signed(n.deviation, formatPercent)}</td>
                  <td>${formatDate(store.dates[n.gap.lastIndex])}</td>
                </tr>`,
              )}
            </tbody>
          </table>
        </details>`,
    );
    this.#readout(this.#selected);
  }

  #records() {
    const store = this.#store;
    const { game } = store;
    const { streak, gap } = records(store);
    const repeated = repeatedCombinations(store);
    const items = [];
    for (const indices of repeated) {
      const numbers = store.numbers[indices[0]];
      items.push(html`<li>
        <a class="record-link" href="#${game.id}/${numbers.join('-')}">${numbers.map((n) => ball(n))}</a>
        <span>Diese Kombination wurde zweimal gezogen: am ${formatList(indices.map((i) => formatDate(store.dates[i])))}.</span>
      </li>`);
    }
    if (repeated.length === 0)
      items.push(html`<li><span>Noch keine Kombination wurde zweimal gezogen.</span></li>`);
    items.push(html`<li>
      ${ball(streak.number)}
      <span>Längste Serie: in ${streak.length} Ziehungen hintereinander, bis zum ${formatDate(store.dates[streak.end])}.</span>
    </li>`);
    items.push(html`<li>
      ${ball(gap.number)}
      <span>Längste Pause: ${formatNumber(gap.length)} Ziehungen ohne diese Zahl, vom ${formatDate(store.dates[gap.from])}
        bis zum ${formatDate(store.dates[gap.to])}.</span>
    </li>`);
    return html`<ul class="record-list">${items}</ul>`;
  }

  #readout(number) {
    const target = this.querySelector('.heat-readout');
    if (!target || !this.#model) return;
    const n = number && this.#model.numbers[number - 1];
    if (!n) {
      mount(target, html`<p class="readout-hint">Tippe auf eine Zahl für Details.</p>`);
      return;
    }
    const { store, expectedCount } = this.#model;
    mount(
      target,
      html`<div class="readout">
        <span class="mini-ball is-large band-${n.band}">${n.number}</span>
        <div>
          <p><strong>${formatNumber(n.count)}-mal</strong> gezogen, erwartet ${formatNumber(Math.round(expectedCount))}
            (${signed(n.deviation, formatPercent)}).</p>
          <p class="stat-meta">Zuletzt am ${formatDate(store.dates[n.gap.lastIndex])},
            ${n.gap.since === 0 ? 'in der letzten Ziehung' : `vor ${plural(n.gap.since, 'Ziehung', 'Ziehungen')}`}.</p>
        </div>
      </div>`,
    );
  }
}

customElements.define('stats-view', StatsView);
