// Ziehungs-Animation: Die Kugeln fallen einzeln, Treffer leuchten auf dem eigenen Schein auf.
// Dieselbe Bühne für echte Ziehungen und die Zeitreise-Ziehung.
//
// Antippen überspringt die Animation; mit prefers-reduced-motion steht sofort das Endbild.
// Für Screenreader zählt nur das Ergebnis am Ende (Live-Region), nicht jede einzelne Kugel.

import { formatDay, formatFullDay, formatList } from '../lib/format.js';
import { html, mount } from '../lib/html.js';
import { describeResult, hitsOf } from '../lib/tickets.js';
import { icons } from './icons.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Eine Kugel, die fällt und zweimal nachfedert (CSS linear()), mit Ausweichkurve für ältere Browser.
const BOUNCE =
  'linear(0, 0.004, 0.016, 0.035, 0.063, 0.098, 0.141 13.6%, 0.25, 0.391, 0.563, 0.765, 1, 0.891 40.9%, 0.848, 0.813, 0.785, 0.766, 0.754, 0.75, 0.754, 0.766, 0.785, 0.813, 0.848, 0.891 68.2%, 1 72.7%, 0.973, 0.953, 0.941, 0.938, 0.941, 0.953, 0.973, 1, 0.988, 0.984, 0.988, 1)';
const DROP_EASING = CSS.supports('animation-timing-function', BOUNCE) ? BOUNCE : 'cubic-bezier(0.3, 1.3, 0.5, 1)';
const POP_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

const DROP_MS = 620;
const PAUSE_MS = 150;

/** Zufällige Reihenfolge – die Daten sind sortiert, gezogen wird durcheinander. */
function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class DrawReveal extends HTMLElement {
  #run = 0;
  #skipped = false;
  #wake = null;
  #options = null;

  connectedCallback() {
    this.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (button) {
        this.dispatchEvent(new CustomEvent('reveal-action', { bubbles: true, detail: { action: button.dataset.action } }));
        return;
      }
      this.skip();
    });
  }

  /** Läuft gerade eine Animation? */
  get running() {
    return this.classList.contains('is-running');
  }

  /**
   * Spielt eine Ziehung ab.
   * @param {object} options
   * @param {object} options.game
   * @param {string} options.date     Ziehungstag
   * @param {number[]} options.drawn  gezogene Zahlen
   * @param {number[][]} options.tickets  die Zahlen jedes mitspielenden Scheins
   * @param {'draw' | 'timetravel'} options.mode
   * @param {string} [options.note]   Hinweis unter dem Ergebnis
   * @returns {Promise<void>} erfüllt, wenn das Endbild steht
   */
  async play(options) {
    const run = ++this.#run;
    this.#options = options;
    this.#skipped = reducedMotion.matches;
    this.#render();
    this.classList.add('is-running');
    const stale = () => run !== this.#run;

    if (options.mode === 'timetravel') await this.#spinYear(options.date, stale);
    for (const number of shuffled(options.drawn)) {
      if (stale()) return;
      await this.#drop(number);
      if (stale()) return;
      this.#land(number);
      await this.#wait(PAUSE_MS);
    }
    if (stale()) return;
    this.#finish();
  }

  /** Springt ans Ende der laufenden Animation. */
  skip() {
    if (!this.running || this.#skipped) return;
    this.#skipped = true;
    for (const animation of this.getAnimations({ subtree: true })) animation.finish();
    this.#wake?.();
  }

  /** Bricht ab, ohne ein Ergebnis zu zeigen – etwa wenn das Sheet geschlossen wird. */
  stop() {
    this.#run++;
    this.#wake?.();
    this.classList.remove('is-running');
  }

  #wait(ms) {
    if (this.#skipped) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.#wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  #render() {
    const { game, date, drawn, tickets, mode } = this.#options;
    const title = mode === 'timetravel' ? 'Zeitreise-Ziehung' : `${game.short} am ${formatDay(date)}`;
    mount(
      this,
      html`<div class="reveal">
        <h2 class="reveal-title" id="reveal-title">${title}</h2>
        ${mode === 'timetravel'
          ? html`<p class="reveal-date">
              <span class="reveal-date-rest" data-date-rest></span> <span class="reveal-year" data-year></span>
            </p>`
          : ''}

        <ol class="reveal-drawn" aria-hidden="true" style="--pick: ${game.pick}">
          ${drawn.map((n) => html`<li class="reveal-slot" data-slot="${n}"></li>`)}
        </ol>

        <ul class="reveal-tickets" aria-hidden="true">
          ${tickets.map(
            (numbers) => html`<li class="reveal-ticket">
              <span class="mini-balls">${numbers.map((n) => html`<span class="mini-ball" data-pick="${n}">${n}</span>`)}</span>
              <span class="reveal-count" data-count="0">0</span>
            </li>`,
          )}
        </ul>

        <div class="reveal-result" aria-live="polite"></div>
        <div class="reveal-actions"></div>
      </div>`,
    );
  }

  /** Zeitreise: Die Jahreszahl rattert durch die Jahrzehnte und bleibt auf dem Ziehungsjahr stehen. */
  async #spinYear(date, stale) {
    const year = this.querySelector('[data-year]');
    const rest = this.querySelector('[data-date-rest]');
    const target = Number(date.slice(0, 4));
    const full = formatFullDay(date);
    const first = Number(this.#options.game.firstDraw.slice(0, 4));
    const last = new Date().getFullYear();
    year.textContent = last;
    for (let step = 0; step < 16 && !this.#skipped; step++) {
      if (stale()) return;
      year.textContent = first + Math.floor(Math.random() * (last - first + 1));
      // Wird zum Ende hin langsamer, wie ein auslaufendes Zählwerk.
      await this.#wait(35 + step * step * 0.9);
    }
    if (stale()) return;
    year.textContent = target;
    rest.textContent = full.slice(0, full.lastIndexOf(' '));
    if (!this.#skipped) {
      year.animate([{ scale: 1.35 }, { scale: 1 }], { duration: 320, easing: POP_EASING });
      rest.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
    }
    await this.#wait(380);
  }

  /** Eine Kugel fällt in ihren Platz. */
  async #drop(number) {
    const slot = this.querySelector(`[data-slot="${number}"]`);
    const ball = document.createElement('span');
    ball.className = 'ball is-picked reveal-ball';
    ball.textContent = number;
    slot.append(ball);
    slot.classList.add('is-filled');
    if (this.#skipped) return;
    const animation = ball.animate(
      [
        { translate: '0 -11rem', opacity: 0 },
        { opacity: 1, offset: 0.12 },
        { translate: '0 0', opacity: 1 },
      ],
      { duration: DROP_MS, easing: DROP_EASING },
    );
    await animation.finished.catch(() => {});
  }

  /** Die Kugel liegt: Treffer auf den Scheinen markieren und mitzählen. */
  #land(number) {
    let hit = false;
    for (const ticket of this.querySelectorAll('.reveal-ticket')) {
      const pick = ticket.querySelector(`[data-pick="${number}"]`);
      if (!pick) continue;
      hit = true;
      pick.classList.add('is-hit');
      const count = ticket.querySelector('[data-count]');
      count.dataset.count = Number(count.dataset.count) + 1;
      count.textContent = count.dataset.count;
      if (this.#skipped) continue;
      pick.animate([{ scale: 1 }, { scale: 1.45 }, { scale: 1 }], { duration: 420, easing: POP_EASING });
      count.animate([{ scale: 1.5 }, { scale: 1 }], { duration: 320, easing: POP_EASING });
    }
    const slot = this.querySelector(`[data-slot="${number}"]`);
    slot.classList.add(hit ? 'is-hit' : 'is-miss');
    if (hit && !this.#skipped) navigator.vibrate?.(14);
  }

  #finish() {
    const { game, drawn, tickets, mode, note } = this.#options;
    this.classList.remove('is-running');
    const best = Math.max(...tickets.map((numbers) => hitsOf(numbers, drawn)));
    const { headline, sub, win } = describeResult(game, best);
    const several = tickets.length > 1 ? `Dein bester von ${tickets.length} Scheinen. ` : '';

    mount(
      this.querySelector('.reveal-result'),
      html`<p class="visually-hidden">Gezogen wurden ${formatList(drawn.map(String))}.</p>
        <p class="result-headline ${win ? 'is-win' : ''}">${headline}</p>
        <p class="result-sub">${several}${sub}</p>
        ${note ? html`<p class="result-hint">${note}</p>` : ''}`,
    );
    mount(
      this.querySelector('.reveal-actions'),
      mode === 'timetravel'
        ? html`<button type="button" class="button button-primary" data-action="again">${icons.replay}Nochmal</button>
            <button type="button" class="button" data-action="done">Fertig</button>`
        : html`<button type="button" class="button button-primary" data-action="done">Fertig</button>
            <button type="button" class="button" data-action="share">${icons.share}Teilen</button>`,
    );

    // Tastatur und Screenreader landen beim nächsten Schritt statt hinter dem Sheet.
    this.querySelector('.reveal-actions .button')?.focus({ preventScroll: true });

    if (this.#skipped) return;
    this.querySelector('.reveal-result').animate(
      [
        { opacity: 0, translate: '0 0.6rem' },
        { opacity: 1, translate: '0 0' },
      ],
      { duration: 360, easing: POP_EASING },
    );
    if (win) {
      navigator.vibrate?.([20, 60, 20, 60, 40]);
      this.#confetti();
    }
  }

  /** Ein Schwung Mini-Kugeln für einen Gewinn – selten genug, um etwas Besonderes zu bleiben. */
  #confetti() {
    const origin = this.querySelector('.reveal-drawn').getBoundingClientRect();
    const stage = this.querySelector('.reveal');
    const base = stage.getBoundingClientRect();
    for (let i = 0; i < 36; i++) {
      const piece = document.createElement('span');
      piece.className = `confetti confetti-${i % 3}`;
      const size = 6 + Math.random() * 8;
      const x = origin.left - base.left + Math.random() * origin.width;
      const y = origin.top - base.top + origin.height / 2;
      Object.assign(piece.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` });
      stage.append(piece);
      const dx = (Math.random() - 0.5) * 260;
      const up = 90 + Math.random() * 150;
      piece
        .animate(
          [
            { translate: '0 0', opacity: 1 },
            { translate: `${dx * 0.6}px ${-up}px`, opacity: 1, offset: 0.35, easing: 'cubic-bezier(0.3, 0, 0.8, 0.6)' },
            { translate: `${dx}px ${140 + Math.random() * 120}px`, opacity: 0 },
          ],
          { duration: 1100 + Math.random() * 700, delay: Math.random() * 120, easing: 'cubic-bezier(0.1, 0.7, 0.3, 1)', fill: 'backwards' },
        )
        .finished.finally(() => piece.remove());
    }
  }
}

customElements.define('draw-reveal', DrawReveal);
