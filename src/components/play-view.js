// Tab „Spielen“: was als Nächstes passiert (Ergebnis aufdecken, Countdown oder Einladung), die
// offenen Scheine, Bilanz, Trefferkarte und Verlauf. Folgt dem Spielumschalter.
//
// Ungesehene Ergebnisse tauchen nur oben zum Aufdecken auf – Bilanz, Trefferkarte und Verlauf
// rechnen sie erst danach ein, sonst wäre die Überraschung verraten.

import { GAMES, GAME_IDS } from '../games.js';
import {
  formatDate,
  formatDay,
  formatDuration,
  formatEuro,
  formatNumber,
  formatTime,
  plural,
} from '../lib/format.js';
import { html, mount } from '../lib/html.js';
import { drawTimes, durationParts, nextDraw } from '../lib/schedule.js';
import { awaitedDraw, isOpen, resultsByDraw, summarize } from '../lib/tickets.js';
import { icons } from './icons.js';
import { drawBalls } from './result-view.js';

const PAGE = 20;

/** Nur was schon aufgedeckt wurde. */
const revealedOnly = (tickets) => tickets.map((t) => ({ ...t, results: t.results.filter((r) => r.seen) }));

/** Das Tippfeld eines Scheins im Kleinen: gedruckt in der Spielfarbe, angekreuzt mit Tinte. */
const miniField = (game, numbers) =>
  html`<span class="mini-field" style="--cols: ${game.columns}" aria-hidden="true">${Array.from(
    { length: game.max },
    (_, i) => html`<i class="${numbers.includes(i + 1) ? 'is-marked' : ''}"></i>`,
  )}</span>`;

export class PlayView extends HTMLElement {
  #props = null;
  #shown = PAGE;
  /** Zustand der Kopfzeile – ändert er sich mit der Zeit, wird neu gezeichnet. */
  #phase = '';

  connectedCallback() {
    this.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      if (button.dataset.action === 'more') {
        this.#shown += PAGE;
        this.#render();
        return;
      }
      this.dispatchEvent(
        new CustomEvent('play-action', { bubbles: true, detail: { ...button.dataset } }),
      );
    });
  }

  /**
   * @param {object} props
   * @param {object} props.game
   * @param {object[]} props.tickets  alle Scheine, auch die des anderen Spiels
   * @param {{ state: string, canPromptInstall: boolean }} props.notify
   * @param {'insecure' | 'storage' | null} props.problem  warum Mitspielen hier nicht geht
   */
  update(props) {
    if (props.game !== this.#props?.game) this.#shown = PAGE;
    this.#props = props;
    this.#render();
  }

  /** Lässt den Countdown weiterlaufen, ohne die Ansicht neu aufzubauen. */
  tick(now = Date.now()) {
    if (!this.#props) return;
    const head = this.#head(now);
    if (head.phase !== this.#phase) return this.#render();
    const countdown = this.querySelector('[data-countdown]');
    if (countdown && head.countdown) countdown.textContent = head.countdown;
  }

  /** Was oben steht, hängt davon ab, worauf der Nutzer gerade wartet. */
  #head(now) {
    const { game, tickets } = this.#props;
    const open = tickets.filter((t) => t.gameId === game.id && isOpen(t));
    const waiting = resultsByDraw(tickets, game.id)
      .filter((group) => !group.seen)
      .toReversed();
    if (waiting.length > 0) return { phase: `news:${waiting[0].date}:${waiting.length}`, kind: 'news', waiting, open };

    if (open.length === 0) return { phase: 'invite', kind: 'invite', open, next: nextDraw(game, now) };

    const date = open.map((t) => awaitedDraw(t, game)).toSorted()[0];
    const draw = drawTimes(game, date);
    const playing = open.filter((t) => awaitedDraw(t, game) === date).length;
    if (!draw || draw.drawAt <= now) return { phase: `drawn:${date}`, kind: 'drawn', open, date };
    return {
      phase: `countdown:${date}:${playing}`,
      kind: 'countdown',
      open,
      draw,
      playing,
      countdown: `Noch ${formatDuration(durationParts(draw.drawAt - now))}.`,
    };
  }

  #render() {
    const { game, tickets, notify, problem } = this.#props;
    const head = this.#head(Date.now());
    this.#phase = head.phase;
    const mine = tickets.filter((t) => t.gameId === game.id);
    const revealed = revealedOnly(tickets);
    const history = resultsByDraw(revealed, game.id);
    const summary = summarize(revealed, game);

    mount(
      this,
      html`<div class="play-main">
          ${this.#hero(head, history.length > 0)}
          ${head.open.length > 0 ? this.#tickets(head.open, revealed) : ''}
          ${problem === 'insecure'
            ? html`<p class="footnote">Mitspielen geht nur über https – diese Seite ist ohne sichere Verbindung geöffnet.</p>`
            : problem === 'storage'
              ? html`<p class="footnote">Dein Browser lässt hier keine Scheine speichern – etwa im privaten Modus.</p>`
              : ''}
          ${this.#elsewhere()} ${head.open.length > 0 ? this.#notify(notify) : ''}
        </div>
        <div class="play-side">
          ${history.length > 0 ? this.#tally(summary) : ''}
          ${mine.length > 0 ? this.#hitCard(summary.collected) : ''}
          ${history.length > 0 ? this.#history(history) : ''}
        </div>`,
    );
  }

  #hero(head, hasHistory) {
    const { game } = this.#props;
    const fill = (accent) =>
      html`<a class="button ${accent ? 'button-accent' : ''}" href="#${game.id}">
        ${icons.ticket}${accent ? 'Schein ausfüllen' : 'Neuer Schein'}
      </a>`;
    // Der leise Zweitweg, wie in der Mitspielen-Karte: sofort spielen statt warten.
    const timetravel = html`<button type="button" class="link-button" data-action="timetravel">
      Nicht warten? Zeitreise-Ziehung starten
    </button>`;

    if (head.kind === 'news') {
      const [first, ...rest] = head.waiting;
      const count = first.entries.length;
      return html`<div class="result-card play-hero">
        <p class="result-headline">Die Zahlen sind da.</p>
        <p class="result-sub">
          Ziehung vom ${formatDay(first.date)}. ${count === 1 ? 'Dein Schein wartet.' : `Deine ${count} Scheine warten.`}
          ${rest.length > 0 ? `Danach ${rest.length === 1 ? 'kommt noch eine weitere Ziehung' : `kommen noch ${rest.length} weitere Ziehungen`}.` : ''}
        </p>
        <div class="play-row">
          <button type="button" class="button button-accent" data-action="reveal" data-date="${first.date}">
            Aufdecken
          </button>
          ${rest.length > 0
            ? html`<button type="button" class="button" data-action="seen-all">Alle überspringen</button>`
            : ''}
        </div>
      </div>`;
    }

    if (head.kind === 'drawn') {
      return html`<div class="result-card play-hero">
        <p class="result-headline">Die Kugeln sind gefallen.</p>
        <p class="result-sub">
          Die Ziehung vom ${formatDay(head.date)} ist gelaufen. Die Zahlen kommen meist noch am selben Abend –
          schau einfach später wieder rein.
        </p>
        <div class="play-row">${fill(false)}</div>
        ${timetravel}
      </div>`;
    }

    if (head.kind === 'countdown') {
      const { draw, playing } = head;
      return html`<div class="result-card play-hero">
        <p class="result-headline" data-countdown>${head.countdown}</p>
        <p class="result-sub">
          Dann wird gezogen: ${formatDay(draw.date)}, ${formatTime(draw.drawAt)}.
          ${playing === 1 ? 'Ein Schein spielt mit.' : `${playing} Scheine spielen mit.`}
        </p>
        <div class="play-row">${fill(false)}</div>
        ${timetravel}
      </div>`;
    }

    const { next } = head;
    return html`<div class="result-card play-hero">
      <p class="result-headline">${hasHistory ? 'Bereit für die nächste Runde?' : 'Spiel mit – ohne Einsatz.'}</p>
      <p class="result-sub">
        Füll einen Schein aus. Nach der Ziehung am ${formatDay(next.date)} siehst du, wie viele Richtige du gehabt
        hättest.
      </p>
      <div class="play-row">${fill(true)}</div>
      <p class="result-hint">
        Oder gleich jetzt: Die Zeitreise-Ziehung schickt einen Tipp gegen eine zufällige Ziehung seit
        ${game.firstDraw.slice(0, 4)}.
      </p>
      <button type="button" class="link-button" data-action="timetravel">Zeitreise-Ziehung starten</button>
    </div>`;
  }

  #tickets(open, revealed) {
    const { game } = this.#props;
    const now = Date.now();
    const rows = open
      .toSorted((a, b) => awaitedDraw(a, game).localeCompare(awaitedDraw(b, game)) || a.createdAt - b.createdAt)
      .map((ticket) => {
        const date = awaitedDraw(ticket, game);
        const draw = drawTimes(game, date);
        const past = revealed.find((t) => t.id === ticket.id).results;
        const when = !draw || draw.drawAt <= now ? `Ziehung vom ${formatDay(date)} – die Zahlen folgen.` : `Spielt am ${formatDay(date)}.`;
        const record =
          ticket.standing && past.length > 0
            ? ` Bisher ${plural(past.length, 'Ziehung', 'Ziehungen')}, bestes Ergebnis ${Math.max(...past.map((r) => r.hits))} Richtige.`
            : '';
        return html`<li class="ticket">
          ${miniField(game, ticket.numbers)}
          <div class="ticket-body">
            <a class="ticket-numbers" href="#${game.id}/${ticket.numbers.join('-')}" aria-label="Tipp ${ticket.numbers.join(', ')} in Prüfen öffnen">
              ${ticket.numbers.map((n) => html`<span>${n}</span>`)}
            </a>
            <p class="ticket-status">${ticket.standing ? html`<strong>Dauerschein.</strong> ` : ''}${when}${record}</p>
            <button type="button" class="ticket-remove" data-action="${ticket.standing ? 'stop' : 'remove'}" data-id="${ticket.id}">
              ${ticket.standing ? 'Dauerschein stoppen' : 'Schein entfernen'}
            </button>
          </div>
        </li>`;
      });
    return html`<section class="stats-block" aria-labelledby="h-tickets">
      <h2 id="h-tickets">${open.length === 1 ? 'Dein Schein' : 'Deine Scheine'}</h2>
      <ul class="ticket-list">${rows}</ul>
    </section>`;
  }

  /** Hinweis, wenn beim anderen Spiel etwas wartet. */
  #elsewhere() {
    const { game, tickets } = this.#props;
    return GAME_IDS.filter((id) => id !== game.id).map((id) => {
      const other = GAMES[id];
      const waiting = resultsByDraw(tickets, id).filter((group) => !group.seen).length;
      const open = tickets.filter((t) => t.gameId === id && isOpen(t)).length;
      if (waiting === 0 && open === 0) return '';
      const text =
        waiting > 0
          ? `Beim ${other.short} ${waiting === 1 ? 'wartet ein Ergebnis' : `warten ${waiting} Ergebnisse`} auf dich.`
          : `Beim ${other.short} ${open === 1 ? 'spielt ein Schein' : `spielen ${open} Scheine`} mit.`;
      return html`<p class="play-elsewhere"><a href="#${id}/spielen">${text}</a></p>`;
    });
  }

  #notify(notify) {
    const block = (text, action = '') =>
      html`<section class="stats-block" aria-labelledby="h-notify">
        <h2 id="h-notify">Nach der Ziehung</h2>
        <p class="stats-lede">${text}</p>
        ${action}
      </section>`;
    switch (notify.state) {
      case 'on':
        return block(
          'Retro-Lotto meldet sich, sobald deine Scheine ausgewertet sind – meist am Abend der Ziehung oder am nächsten Morgen.',
          html`<button type="button" class="button" data-action="notify-off">Benachrichtigungen ausschalten</button>`,
        );
      case 'ask':
        return block(
          'Retro-Lotto kann sich melden, sobald deine Scheine ausgewertet sind.',
          html`<button type="button" class="button button-primary" data-action="notify-on">${icons.bell}Benachrichtigen</button>`,
        );
      case 'install':
        return block(
          'Als installierte App meldet sich Retro-Lotto nach der Ziehung von selbst.',
          notify.canPromptInstall
            ? html`<button type="button" class="button button-primary" data-action="install">App installieren</button>`
            : html`<p class="footnote">Im Menü deines Browsers: „App installieren“ oder „Zum Startbildschirm hinzufügen“.</p>`,
        );
      case 'blocked':
        return block(
          'Benachrichtigungen sind für diese Seite im Browser gesperrt. Dein Ergebnis wartet hier, sobald du die App nach der Ziehung öffnest.',
        );
      default:
        return block('Dein Ergebnis wartet hier, sobald du die App nach der Ziehung öffnest.');
    }
  }

  #tally(summary) {
    const { game } = this.#props;
    const row = (label, value) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`;
    return html`<section class="stats-block" aria-labelledby="h-tally">
      <h2 id="h-tally">Bilanz</h2>
      <dl class="tally">
        ${row('Gespielte Tipps', formatNumber(summary.plays))}
        ${row('Richtige insgesamt', formatNumber(summary.hits))}
        ${row(
          'Bestes Ergebnis',
          html`${summary.best} Richtige <small>am ${formatDate(summary.bestDate)}</small>`,
        )}
        ${row('Einsatz gespart', formatEuro(summary.saved))}
      </dl>
      <p class="footnote">
        So viel hätten deine Tipps in der Annahmestelle gekostet: ${formatEuro(game.price)} je Tipp, ohne Gebühr.
      </p>
    </section>`;
  }

  #hitCard(collected) {
    const { game } = this.#props;
    const lede =
      collected.size === 0
        ? 'Jede Zahl, die du einmal richtig hast, bleibt hier liegen. Noch ist die Karte leer.'
        : collected.size === game.max
          ? `Alle ${game.max} Zahlen hattest du schon einmal richtig. Mehr geht nicht.`
          : `${collected.size} von ${game.max} Zahlen hattest du schon einmal richtig.`;
    return html`<section class="stats-block" aria-labelledby="h-hitcard">
      <h2 id="h-hitcard">Trefferkarte</h2>
      <p class="stats-lede">${lede}</p>
      <ol class="hit-card" style="--cols: ${game.columns}" aria-label="Getroffene Zahlen">
        ${Array.from({ length: game.max }, (_, i) => i + 1).map((n) =>
          collected.has(n)
            ? html`<li class="ball is-picked" aria-label="${n}, getroffen">${n}</li>`
            : html`<li aria-label="${n}, noch offen">${n}</li>`,
        )}
      </ol>
    </section>`;
  }

  #history(groups) {
    const rows = groups.flatMap(({ date, drawn, entries }) =>
      entries.map(
        ({ ticket, result }) => html`<li class="draw-row history-row">
          <time datetime="${date}">${formatDate(date)}</time>
          ${drawBalls(drawn, new Set(ticket.numbers))}
          <span class="history-hits" aria-label="${result.hits} Richtige">${result.hits}</span>
        </li>`,
      ),
    );
    const rest = rows.length - this.#shown;
    return html`<section class="stats-block" aria-labelledby="h-history">
      <h2 id="h-history">Verlauf</h2>
      <ol class="draw-list">${rows.slice(0, this.#shown)}</ol>
      ${rest > 0
        ? html`<button type="button" class="button button-quiet" data-action="more">
            ${Math.min(rest, PAGE)} weitere anzeigen
          </button>`
        : ''}
      <p class="footnote">Gezogene Zahlen je Schein, deine Treffer hervorgehoben. Rechts die Zahl der Richtigen.</p>
    </section>`;
  }
}

customElements.define('play-view', PlayView);
