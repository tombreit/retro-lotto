// Eingaberaster: ein Fieldset mit Checkboxen, gestylt als Kugeln.
// Der Zustand gehört der App – das Raster meldet nur Wünsche („toggle“) und zeigt an, was es bekommt.

import { html, mount } from '../lib/html.js';

export class NumberGrid extends HTMLElement {
  #game = null;
  #selected = new Set();

  connectedCallback() {
    this.addEventListener('change', (event) => {
      const input = event.target.closest('input[type=checkbox]');
      if (!input) return;
      // Zurücksetzen – die App entscheidet und rendert synchron neu.
      input.checked = !input.checked;
      this.dispatchEvent(new CustomEvent('number-toggle', { bubbles: true, detail: { number: Number(input.value) } }));
    });
  }

  set game(game) {
    if (this.#game === game) return;
    this.#game = game;
    mount(
      this,
      html`<fieldset class="number-grid" style="--cols: ${game.columns}">
        <legend class="visually-hidden">${game.pick} aus ${game.max} wählen</legend>
        ${Array.from(
          { length: game.max },
          (_, i) => html`<label class="cell">
            <input type="checkbox" value="${i + 1}" /><span class="ball">${i + 1}</span>
          </label>`,
        )}
      </fieldset>`,
    );
    this.#sync();
  }

  set value(numbers) {
    this.#selected = new Set(numbers);
    this.#sync();
  }

  /** Die Kugel einer Zahl – für die View Transition in die Tipp-Leiste. */
  ballFor(number) {
    return this.querySelector(`input[value="${number}"] + .ball`);
  }

  #sync() {
    if (!this.#game) return;
    const full = this.#selected.size >= this.#game.pick;
    for (const input of this.querySelectorAll('input')) {
      input.checked = this.#selected.has(Number(input.value));
      input.disabled = full && !input.checked;
    }
    this.classList.toggle('is-full', full);
  }
}

customElements.define('number-grid', NumberGrid);
