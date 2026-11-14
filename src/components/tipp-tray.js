// Tipp-Leiste: die gewählten Zahlen als Kugeln (antippen entfernt sie), ein Tastatur-Eingabefeld im
// nächsten freien Kreis und die Aktionen.
//
// Das Eingabefeld wird nur einmal angelegt und nie neu gerendert – sonst ginge bei jeder Zahl der
// Fokus verloren und die Bildschirmtastatur klappte zu. Es liegt per CSS über dem nächsten freien
// Kreis (--entry), die Kugeln darunter werden bei jeder Änderung neu gezeichnet.

import { html, mount } from '../lib/html.js';
import { parseEntry } from '../lib/tipp.js';
import { icons } from './icons.js';

const coarse = matchMedia('(pointer: coarse)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export class TippTray extends HTMLElement {
  #game = null;
  #field;
  #list;
  #input;
  #actions;

  connectedCallback() {
    if (this.#input) return;
    mount(
      this,
      html`<div class="tray">
          <div class="tray-field">
            <ol class="tray-balls"></ol>
            <input class="tray-input" type="text" inputmode="decimal" enterkeyhint="done"
              autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
          </div>
          <span class="tray-edge" aria-hidden="true"></span>
        </div>
        <div class="tray-actions"></div>`,
    );
    this.#field = this.querySelector('.tray-field');
    this.#list = this.querySelector('.tray-balls');
    this.#input = this.querySelector('.tray-input');
    this.#actions = this.querySelector('.tray-actions');

    this.addEventListener('click', (event) => {
      // Freie Kreise öffnen die Tastatur – im Klick-Handler, damit iOS sie auch wirklich zeigt.
      if (event.target.closest('.slot')) return this.#input.focus();
      const button = event.target.closest('button');
      if (!button) return;
      const detail = button.dataset.number
        ? { action: 'remove', number: Number(button.dataset.number) }
        : { action: button.dataset.action };
      this.#emit(detail);
    });

    const input = this.#input;
    input.addEventListener('input', (event) => {
      if (event.isComposing) return;
      this.#take({ final: event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop' });
    });
    input.addEventListener('compositionend', () => this.#take());
    input.addEventListener('blur', () => this.#take({ final: true }));
    input.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'Backspace':
          if (input.value) return;
          event.preventDefault();
          return this.#emit({ action: 'remove-last' });
        case 'Enter':
          event.preventDefault();
          this.#take({ final: true });
          if (coarse.matches) input.blur();
          return;
        case 'Escape':
          input.value = '';
          return input.blur();
      }
    });
  }

  render(game, numbers) {
    if (game !== this.#game) {
      this.#game = game;
      this.#input.value = '';
      this.#input.setAttribute('aria-label', `Zahl eingeben, 1 bis ${game.max}`);
    }
    const complete = numbers.length === game.pick;
    this.#field.classList.toggle('is-full', complete);
    this.#field.style.setProperty('--pick', game.pick);
    this.#field.style.setProperty('--entry', Math.min(numbers.length, game.pick - 1));

    const slots = Array.from({ length: game.pick }, (_, i) => numbers[i]);
    this.#list.setAttribute('aria-label', `Dein Tipp: ${numbers.length} von ${game.pick} Zahlen`);
    mount(
      this.#list,
      html`${slots.map((n, i) =>
        n
          ? html`<li>
              <button type="button" class="ball is-picked" data-number="${n}" aria-label="${n} entfernen">${n}</button>
            </li>`
          : html`<li class="slot ${i === numbers.length ? 'is-entry' : ''}" aria-hidden="true"></li>`,
      )}`,
    );
    mount(
      this.#actions,
      html`<button type="button" class="button button-primary" data-action="random">
          ${icons.dice}${complete || numbers.length === 0 ? 'Zufallstipp' : 'Auffüllen'}
        </button>
        <button type="button" class="button" data-action="clear" ${numbers.length ? '' : 'disabled'}>
          ${icons.clear}Leeren
        </button>
        <button type="button" class="button" data-action="share" ${numbers.length ? '' : 'disabled'}>
          ${icons.share}Teilen
        </button>`,
    );
  }

  /** Text so verarbeiten, als wäre er ins Feld getippt worden – für Tastendrücke außerhalb des Felds. */
  type(text, { final = false } = {}) {
    this.#input.focus({ preventScroll: true });
    this.#input.value += text;
    this.#take({ final });
  }

  /** Feld verlassen und unfertige Eingaben verwerfen, z. B. beim Wechsel zur Statistik. */
  clearEntry() {
    this.#input.value = '';
    if (document.activeElement === this.#input) this.#input.blur();
  }

  blurEntry() {
    this.#input.blur();
  }

  /** Lenkt den Blick auf eine Kugel, die schon im Tipp ist. */
  flash(number) {
    if (reducedMotion.matches) return;
    this.#list.querySelector(`[data-number="${number}"]`)?.animate(
      [{ transform: 'none' }, { transform: 'scale(1.2)' }, { transform: 'none' }],
      { duration: 360, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }

  /** Kopfschütteln für ungültige Eingaben. */
  reject() {
    if (reducedMotion.matches) return;
    const shake = [0, -6, 6, -4, 4, 0].map((x) => ({ translate: `${x}px 0` }));
    for (const element of [this.#input, this.#list.querySelector('.is-entry')])
      element?.animate(shake, { duration: 320, easing: 'ease-out' });
  }

  #take({ final = false } = {}) {
    if (!this.#game) return;
    const { numbers, invalid, rest } = parseEntry(this.#input.value, this.#game.max, { final });
    // Im Feld bleibt nur der unfertige Rest – Trennzeichen und fertige Zahlen verschwinden.
    if (this.#input.value !== rest) this.#input.value = rest;
    if (!numbers.length && !invalid.length) return;
    // Startpunkt für die Flug-Animation der neuen Kugeln, vor dem Neuzeichnen gemessen.
    const origin = this.#list.querySelector('.is-entry')?.getBoundingClientRect();
    this.#emit({ action: 'enter', numbers, invalid, origin });
  }

  #emit(detail) {
    this.dispatchEvent(new CustomEvent('tray-action', { bubbles: true, detail }));
  }
}

customElements.define('tipp-tray', TippTray);
