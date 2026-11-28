// Mitspielen-Karte in der Prüfen-Ansicht: erscheint, sobald der Tipp vollständig ist.
// Der Zustand gehört der App – die Karte meldet Wünsche („play-action“) und zeigt an, was sie bekommt.
// Der Countdown ändert nur seinen eigenen Text (tick), damit nichts springt und der Fokus bleibt.

import { formatDay, formatDuration } from '../lib/format.js';
import { html, mount } from '../lib/html.js';
import { durationParts, nextDraw } from '../lib/schedule.js';
import { awaitedDraw } from '../lib/tickets.js';
import { icons } from './icons.js';

/** Was nach der Ziehung passiert – je nachdem, was das Gerät kann. */
function afterDraw(notify, gameId) {
  const tickets = html`<a class="button" href="#${gameId}/spielen">Meine Scheine</a>`;
  switch (notify.state) {
    case 'on':
      return { text: 'Nach der Ziehung bekommst du eine Benachrichtigung.', actions: tickets };
    case 'ask':
      return {
        text: 'Soll sich Retro-Lotto nach der Ziehung bei dir melden?',
        actions: html`<button type="button" class="button button-primary" data-action="notify-on">
            ${icons.bell}Benachrichtigen
          </button>
          ${tickets}`,
      };
    case 'install':
      return {
        text: 'Als installierte App meldet sich Retro-Lotto nach der Ziehung von selbst.',
        actions: html`${notify.canPromptInstall
            ? html`<button type="button" class="button button-primary" data-action="install">App installieren</button>`
            : ''}
          ${tickets}`,
      };
    default:
      return { text: 'Das Ergebnis wartet nach der Ziehung unter „Spielen“ auf dich.', actions: tickets };
  }
}

export class PlayCard extends HTMLElement {
  #game = null;
  #standing = false;
  #drawDate = null;
  #playing = false;

  connectedCallback() {
    this.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      this.dispatchEvent(
        new CustomEvent('play-action', {
          bubbles: true,
          detail: { action: button.dataset.action, standing: this.#standing },
        }),
      );
    });
    this.addEventListener('change', (event) => {
      if (event.target.matches('[data-standing]')) this.#standing = event.target.checked;
    });
  }

  /**
   * @param {object} props
   * @param {object} props.game
   * @param {object | null} props.ticket  offener Schein mit genau diesen Zahlen, falls es einen gibt
   * @param {{ state: string, canPromptInstall: boolean }} props.notify
   * @param {'insecure' | 'storage' | null} props.problem  warum Mitspielen hier nicht geht
   */
  update({ game, ticket, notify, problem }) {
    this.#game = game;
    this.#playing = ticket !== null;
    const draw = nextDraw(game);
    this.#drawDate = draw.date;

    if (problem) {
      mount(
        this,
        html`<div class="play-card">
          <p class="play-title">
            ${problem === 'insecure' ? 'Mitspielen geht nur über https.' : 'Mitspielen geht hier gerade nicht.'}
          </p>
          <p class="play-meta">
            ${problem === 'insecure'
              ? 'Diese Seite ist ohne sichere Verbindung geöffnet – Scheine gingen hier verloren.'
              : 'Dein Browser lässt keine Scheine speichern – etwa im privaten Modus.'}
            Die Zeitreise-Ziehung geht trotzdem.
          </p>
          <div class="play-row">
            <button type="button" class="button" data-action="timetravel">${icons.clock}Zeitreise-Ziehung</button>
          </div>
        </div>`,
      );
      return;
    }

    // In beiden Zuständen gleich aufgebaut – beim Abgeben springt darunter nichts.
    const timetravel = html`<button type="button" class="link-button" data-action="timetravel">
      Nicht warten? Zeitreise-Ziehung starten
    </button>`;

    if (ticket) {
      const awaited = formatDay(awaitedDraw(ticket, game));
      const { text, actions } = afterDraw(notify, game.id);
      mount(
        this,
        html`<div class="play-card is-playing">
          <p class="play-title">
            ${icons.check}${ticket.standing
              ? `Dieser Tipp spielt als Dauerschein mit, das nächste Mal am ${awaited}.`
              : `Dieser Tipp spielt am ${awaited} mit.`}
          </p>
          <p class="play-meta">${text}</p>
          <div class="play-row">${actions}</div>
          ${timetravel}
        </div>`,
      );
      return;
    }

    mount(
      this,
      html`<div class="play-card">
        <p class="play-title">Mitspielen am ${formatDay(draw.date)}</p>
        <p class="play-meta">Kostenlos und ohne Gewinn. <span data-countdown></span></p>
        <div class="play-row">
          <button type="button" class="button button-accent" data-action="submit">${icons.ticket}Mitspielen</button>
          <label class="switch">
            <input type="checkbox" data-standing ${this.#standing ? 'checked' : ''} />
            <span class="switch-track" aria-hidden="true"></span>
            <span>Dauerschein</span>
          </label>
        </div>
        ${timetravel}
      </div>`,
    );
    this.tick();
  }

  /** Aktualisiert den Countdown. Meldet true, wenn der Annahmeschluss vorbei ist und neu gezeichnet werden muss. */
  tick(now = Date.now()) {
    if (!this.#game || this.#playing) return false;
    const draw = nextDraw(this.#game, now);
    if (draw.date !== this.#drawDate) return true;
    const countdown = this.querySelector('[data-countdown]');
    if (countdown)
      countdown.textContent = `Noch ${formatDuration(durationParts(draw.closesAt - now))} bis zum Annahmeschluss.`;
    return false;
  }
}

customElements.define('play-card', PlayCard);
