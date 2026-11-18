// Jackpots: die Gewinnkombination jeder Ziehung, nach Jahr – dazu Fakten über ganze Ziehungen.

import { formatDate, formatList, formatNumber, formatPercent, formatTimes, plural } from '../lib/format.js';
import { html, mount } from '../lib/html.js';
import { indexFrom } from '../lib/match.js';
import { drawsWithin, missingTriples, neighbourDraws, pairExpected, rarestPairs, runIn } from '../lib/stats.js';
import { drawBalls } from './result-view.js';

/** Höchstens so viele Beispiele (Folgen, Paare) nebeneinander. */
const MAX_EXAMPLES = 3;
const ORDINALS = ['', '', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste', 'siebte', 'achte', 'neunte', 'zehnte'];

/**
 * „Etwa jede zweite Ziehung enthält“ – oder als Prozentangabe, wenn kein griffiger Bruch passt.
 * @returns {[string, boolean]} Subjekt und ob es im Singular steht
 */
function share(part, whole) {
  const n = Math.round(whole / part);
  return n >= 2 && n < ORDINALS.length
    ? [`Etwa jede ${ORDINALS[n]} Ziehung`, true]
    : [`${formatPercent(part / whole)} aller Ziehungen`, false];
}

/** Kugeln als Link nach „Prüfen“ – dort erklärt das Ergebnis die Kombination. */
const comboLink = (gameId, numbers) =>
  html`<a class="record-link" href="#${gameId}/${numbers.join('-')}">${numbers.map(
    (n) => html`<span class="mini-ball">${n}</span>`,
  )}</a>`;

/** „4 und 13“ · „24 und 32 sowie 25 und 36“ */
function pairNames(pairs) {
  const names = pairs.map(({ pair: [a, b] }) => `${a} und ${b}`);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} sowie ${names.at(-1)}`;
}

/** Die Fakten hängen nur von den Ziehungen ab – einmal je Spiel berechnen. */
const factCache = new WeakMap();
function factsFor(store) {
  if (!factCache.has(store)) {
    factCache.set(store, {
      neighbours: neighbourDraws(store),
      birthdays: drawsWithin(store, 31),
      rarest: rarestPairs(store, { from: 0, to: store.size }, MAX_EXAMPLES),
      triples: missingTriples(store, MAX_EXAMPLES),
    });
  }
  return factCache.get(store);
}

/** Jahre mit Ziehungen, neueste zuerst. */
const yearsOf = (store) => [...new Set(store.dates.map((d) => Number(d.slice(0, 4))))].toReversed();

export class JackpotView extends HTMLElement {
  #store = null;
  #tipp = new Set();
  #tippKey = '';
  #years = [];
  #year = null;

  connectedCallback() {
    this.addEventListener('click', (event) => {
      const step = event.target.closest('[data-year-step]');
      if (step) this.#setYear(this.#year + Number(step.dataset.yearStep));
    });
    this.addEventListener('change', (event) => {
      if (event.target.matches('.year-select')) this.#setYear(Number(event.target.value));
    });
  }

  update(store, tipp) {
    const tippKey = tipp.join();
    if (store === this.#store && tippKey === this.#tippKey && this.#year !== null) return;
    if (store !== this.#store) {
      this.#years = store ? yearsOf(store) : [];
      this.#year = this.#years[0] ?? null;
    }
    this.#store = store;
    this.#tipp = new Set(tipp);
    this.#tippKey = tippKey;
    this.#render();
  }

  #setYear(year) {
    if (!this.#years.includes(year) || year === this.#year) return;
    this.#year = year;
    this.#renderYear();
  }

  #render() {
    const store = this.#store;
    if (!store) {
      mount(this, html`<p class="result-loading" role="status">Ziehungen werden geladen …</p>`);
      return;
    }
    const { game } = store;
    mount(
      this,
      html`<p class="stats-intro">
          Jede Ziehung hat genau eine Jackpot-Kombination: Wer diese ${game.pick} Zahlen getippt hatte, hatte
          ${game.pick} Richtige, egal welche ${game.extra}. ${formatNumber(store.size)} Jackpots vom
          ${formatDate(store.dates[0])} bis ${formatDate(store.dates.at(-1))}.
        </p>

        <section class="stats-block" aria-labelledby="h-facts">
          <h2 id="h-facts">Wusstest du?</h2>
          ${this.#facts()}
        </section>

        <section class="stats-block" aria-labelledby="h-archive">
          <h2 id="h-archive">Alle Jackpots</h2>
          <div class="year-nav">
            <button type="button" class="button year-step" data-year-step="-1" aria-label="Früheres Jahr">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6" /></svg>
            </button>
            <select class="year-select" aria-label="Jahr">
              ${this.#years.map((y) => html`<option value="${y}">${y}</option>`)}
            </select>
            <button type="button" class="button year-step" data-year-step="1" aria-label="Späteres Jahr">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6" /></svg>
            </button>
            <p class="year-summary stat-meta" aria-live="polite"></p>
          </div>
          <ol class="draw-list jackpot-list"></ol>
          <p class="footnote">
            Antippen öffnet die Kombination in „Prüfen“.${this.#tipp.size ? ' Zahlen aus deinem Tipp sind hervorgehoben.' : ''}
          </p>
        </section>`,
    );
    this.#renderYear();
  }

  /** Nur die Liste neu aufbauen – Auswahlfeld und Knöpfe bleiben stehen und behalten den Fokus. */
  #renderYear() {
    const store = this.#store;
    const year = this.#year;
    const from = indexFrom(store, `${year}-01-01`);
    const to = indexFrom(store, `${year + 1}-01-01`);

    this.querySelector('.year-select').value = String(year);
    this.querySelector('[data-year-step="-1"]').disabled = year === this.#years.at(-1);
    this.querySelector('[data-year-step="1"]').disabled = year === this.#years[0];
    this.querySelector('.year-summary').textContent = `${plural(to - from, 'Ziehung', 'Ziehungen')} in ${year}`;

    const rows = [];
    for (let i = to - 1; i >= from; i--) {
      const numbers = store.numbers[i];
      rows.push(html`<li>
        <a class="draw-row draw-link" href="#${store.game.id}/${numbers.join('-')}">
          <time datetime="${store.dates[i]}">${formatDate(store.dates[i])}</time>
          ${drawBalls(numbers, this.#tipp)}
        </a>
      </li>`);
    }
    mount(this.querySelector('.jackpot-list'), html`${rows}`);
  }

  #facts() {
    const store = this.#store;
    const { game } = store;
    const { neighbours, birthdays, rarest, triples } = factsFor(store);

    const [subject, singular] = share(neighbours.count, store.size);
    const longest = neighbours.longest;
    const runs = longest.indices.slice(-MAX_EXAMPLES);
    const runDates = longest.indices.map((i) => formatDate(store.dates[i]));
    const runWhen =
      runDates.length <= MAX_EXAMPLES
        ? `am ${formatList(runDates)}`
        : `${formatTimes(runDates.length)}, zuletzt am ${runDates.at(-1)}`;

    const lastBirthday = birthdays.last;
    const pairsExpected = pairExpected(game, store.size);
    const pairTotal = (game.max * (game.max - 1)) / 2;

    return html`<ul class="fact-list">
      <li class="fact">
        <p><strong>${subject}</strong> ${singular ? 'enthält' : 'enthalten'} Nachbarzahlen wie 12 und 13.</p>
        <p class="fact-detail">
          Das sind ${formatPercent(neighbours.count / store.size)}, bei reinem Zufall wären es
          ${formatPercent(neighbours.expectedShare)}. Am längsten: ${longest.length} Zahlen am Stück, ${runWhen}.
        </p>
        <p class="fact-examples">${runs.map((i) => comboLink(game.id, runIn(store.numbers[i], longest.length)))}</p>
      </li>

      <li class="fact">
        <p>
          <strong>Nur ${formatPercent(birthdays.count / store.size)} aller Ziehungen</strong> bestanden ausschließlich
          aus Zahlen bis 31.
        </p>
        <p class="fact-detail">
          Wer nur Geburtstage tippt, hätte bei allen anderen nie ${game.pick} Richtige haben können. Bei reinem
          Zufall wären es ${formatPercent(birthdays.expectedShare)}.${lastBirthday !== undefined
            ? ` Zuletzt am ${formatDate(store.dates[lastBirthday])}:`
            : ''}
        </p>
        ${lastBirthday !== undefined
          ? html`<p class="fact-examples">${comboLink(game.id, store.numbers[lastBirthday])}</p>`
          : ''}
      </li>

      <li class="fact">
        <p>
          <strong>${pairNames(rarest)}</strong> ${rarest.length === 1 ? 'kamen' : 'kamen jeweils'} nur
          ${formatTimes(rarest[0].count)} gemeinsam, so selten wie kein anderes Paar.
        </p>
        <p class="fact-detail">
          Erwartet wären rund ${formatTimes(Math.round(pairsExpected))}. Bei ${formatNumber(pairTotal)} möglichen
          Paaren liegt aber immer eines weit darunter.
        </p>
        <p class="fact-examples">${rarest.map(({ pair }) => comboLink(game.id, pair))}</p>
      </li>

      <li class="fact">
        <p>
          <strong>${formatNumber(triples.count)} von ${formatNumber(triples.total)} möglichen Dreiern</strong>
          wurden noch nie gemeinsam gezogen.
        </p>
        <p class="fact-detail">
          Bei reinem Zufall wären es rund ${formatNumber(Math.round(triples.expected))}.${triples.examples.length
            ? ' Zum Beispiel:'
            : ''}
        </p>
        ${triples.examples.length
          ? html`<p class="fact-examples">${triples.examples.map((t) => comboLink(game.id, t))}</p>`
          : ''}
      </li>
    </ul>`;
  }
}

customElements.define('jackpot-view', JackpotView);
