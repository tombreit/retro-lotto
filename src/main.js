import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import './components/number-grid.js';
import './components/tipp-tray.js';
import './components/result-view.js';
import './components/stats-view.js';
import './components/jackpot-view.js';

import { loadStore } from './data.js';
import { GAMES, GAME_IDS } from './games.js';
import { formatDate, formatList, formatNumber } from './lib/format.js';
import { html, mount } from './lib/html.js';
import {
  addNumbers,
  backspaceTarget,
  formatHash,
  loadPrefs,
  normalizeTipp,
  numbersOf,
  parseHash,
  quickTipp,
  removeNumber,
  savePrefs,
  VIEWS,
} from './lib/tipp.js';

const $ = (selector) => document.querySelector(selector);
const grid = $('number-grid');
const tray = $('tipp-tray');
const result = $('result-view');
const stats = $('stats-view');
const jackpots = $('jackpot-view');
const toast = $('.toast');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = matchMedia('(pointer: coarse)');
/** Einspaltiges Layout (Smartphone) – muss zur Media Query in components.css passen. */
const narrowLayout = matchMedia('(width < 62rem)');

// ---------------------------------------------------------------- Zustand

const prefs = loadPrefs();
const state = {
  gameId: GAMES[prefs.gameId] ? prefs.gameId : 'lotto',
  view: 'pruefen',
  period: prefs.period ?? 'all',
  tipps: Object.fromEntries(GAME_IDS.map((id) => [id, normalizeTipp(GAMES[id], prefs.tipps?.[id] ?? [])])),
};
const stores = {};

const game = () => GAMES[state.gameId];
/** Plätze des aktuellen Tipps, mit Lücken (`null`) – bestimmt, wo jede Kugel liegt. */
const slots = () => state.tipps[state.gameId];
/** Nur die Zahlen – für Auswertung, Raster und Teilen. */
const tipp = () => numbersOf(slots());
const setSlots = (next) => (state.tipps[state.gameId] = next);
const isComplete = () => tipp().length === game().pick;

function applyHash() {
  const parsed = parseHash(location.hash);
  if (!parsed) return false;
  state.gameId = parsed.gameId;
  state.view = parsed.view;
  if (parsed.slots) state.tipps[parsed.gameId] = parsed.slots;
  return true;
}
applyHash();

function persist() {
  savePrefs({ gameId: state.gameId, period: state.period, tipps: state.tipps });
  const hash = formatHash({ gameId: state.gameId, view: state.view, slots: slots() });
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

// ---------------------------------------------------------------- Rendern

function render() {
  const g = game();
  const store = stores[state.gameId];
  document.documentElement.dataset.game = g.id;
  document.title = `Retro-Lotto – ${g.name}`;

  for (const button of document.querySelectorAll('[data-game-id]'))
    button.setAttribute('aria-checked', String(button.dataset.gameId === g.id));
  for (const link of document.querySelectorAll('.tab-bar [data-view]')) {
    const view = link.dataset.view;
    link.href = formatHash({ gameId: g.id, view, slots: slots() });
    if (view === state.view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  for (const view of VIEWS) $(`#view-${view}`).hidden = state.view !== view;

  if (state.view === 'pruefen') {
    grid.game = g;
    grid.value = tipp();
    tray.render(g, slots());
    result.update(g, store, tipp());
  } else {
    tray.clearEntry();
    if (state.view === 'statistik') stats.update(store, state.period);
    else jackpots.update(store, tipp());
  }
  renderFooter(store);
}

function renderFooter(store) {
  const summary = $('.data-summary');
  // Fußzeile erst zeigen, wenn die Daten da sind – sonst springt sie beim Laden nach unten.
  $('.data-footer').hidden = !store;
  if (!store) return;
  summary.textContent = `${formatNumber(store.size)} Ziehungen vom ${formatDate(store.dates[0])} bis ${formatDate(store.dates.at(-1))}.`;
}

/**
 * Führt eine Zustandsänderung aus. Wechsel von Spiel oder Ansicht laufen über die View Transitions
 * API; Änderungen am Tipp animieren die Kugeln per FLIP (Web Animations) – das blockiert, anders als
 * eine View Transition, keine Eingaben und erlaubt schnelles Tippen.
 */
function commit(change, { animate = 'view', origin } = {}) {
  const run = () => {
    const wasComplete = isComplete();
    change();
    persist();
    render();
    if (!wasComplete && isComplete()) revealResult();
  };
  if (reducedMotion.matches || document.hidden) return run();
  if (animate === 'balls') return flyBalls(run, origin);
  if (!document.startViewTransition) return run();
  document.startViewTransition(run);
}

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const rectOf = (element) => element?.getBoundingClientRect();
const offset = (from, to) =>
  `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`;

/**
 * Wird der Tipp voll, steht das Ergebnis auf dem Smartphone direkt unter der Tipp-Leiste. War die
 * Seite gescrollt, läge es jetzt außer Sicht (über dem Bild oder hinter der klebenden Leiste) –
 * dann nach oben scrollen.
 */
function revealResult() {
  if (!narrowLayout.matches || state.view !== 'pruefen') return;
  const top = rectOf(result.querySelector('.result-lead')).top;
  if (top >= rectOf(tray.querySelector('.tray')).bottom - 1 && top < innerHeight / 2) return;
  scrollTo({ top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
}

/**
 * Neue Kugeln fliegen aus dem Raster in ihren Platz in der Leiste, entfernte zurück ins Raster.
 * Alle anderen bleiben, wo sie sind – entfernte Zahlen hinterlassen eine Lücke.
 * Mit `origin` (getippte Zahlen) wachsen neue Kugeln stattdessen aus dem Eingabefeld.
 *
 * Wird der Tipp voll (oder wieder unvollständig), wechseln auf dem Smartphone Ergebnis, Knöpfe und
 * Raster die Reihenfolge: Raster und Knöpfe gleiten an ihren neuen Platz, das Ergebnis blendet ein.
 */
function flyBalls(run, origin) {
  const trayBalls = () => new Map([...tray.querySelectorAll('.ball[data-number]')].map((b) => [Number(b.dataset.number), b]));
  const before = new Map([...trayBalls()].map(([n, b]) => [n, rectOf(b)]));
  const blocks = [grid, tray.querySelector('.tray-actions')];
  const lead = result.querySelector('.result-lead');
  const blockTops = blocks.map((block) => rectOf(block).top);
  const leadTop = rectOf(lead).top;
  run();
  const after = trayBalls();

  blocks.forEach((block, i) => {
    const dy = blockTops[i] - rectOf(block).top;
    if (Math.abs(dy) > 1) block.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration: 420, easing: EASE });
  });
  if (Math.abs(leadTop - rectOf(lead).top) > 1)
    lead.animate([{ opacity: 0, translate: '0 0.75rem' }, { opacity: 1, translate: '0 0' }], {
      duration: 360,
      delay: 120,
      easing: EASE,
      fill: 'backwards',
    });
  // Startpunkt im Raster dort, wo die Zahl angetippt wurde – vor einer etwaigen Verschiebung.
  const gridShift = blockTops[0] - rectOf(grid).top;
  const fromGrid = (n) => {
    const r = rectOf(grid.ballFor(n));
    return r && { left: r.left, top: r.top + gridShift, width: r.width, height: r.height };
  };

  let stagger = 0;
  for (const [n, ball] of after) {
    const to = rectOf(ball);
    const isNew = !before.has(n);
    const typed = isNew && origin;
    const from = before.get(n) ?? origin ?? fromGrid(n);
    if (!from || (!typed && Math.abs(from.left - to.left) < 1 && Math.abs(from.top - to.top) < 1)) continue;
    const start = typed ? { transform: `${offset(from, to)} scale(0.4)`, opacity: 0 } : { transform: offset(from, to) };
    ball.animate([start, { transform: 'none', opacity: 1 }], {
      duration: isNew ? 420 : 260,
      delay: isNew ? 45 * stagger++ : 0,
      easing: EASE,
      fill: 'backwards',
    });
  }

  for (const [n, from] of before) {
    if (after.has(n)) continue;
    const target = grid.ballFor(n);
    const to = rectOf(target);
    if (!to) continue;
    const ghost = document.createElement('span');
    ghost.className = 'ball is-picked ball-ghost';
    ghost.textContent = n;
    Object.assign(ghost.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
    document.body.append(ghost);
    ghost
      .animate([{ transform: offset(from, to), opacity: 1 }, { transform: 'none', opacity: 1, offset: 0.85 }, { transform: 'none', opacity: 0 }], {
        duration: 380,
        easing: EASE,
      })
      .finished.finally(() => ghost.remove());
  }
}

async function ensureStore(gameId) {
  if (stores[gameId]) return;
  try {
    stores[gameId] = await loadStore(gameId);
    if (gameId === state.gameId) render();
  } catch (error) {
    console.error(error);
    showToast('Die Ziehungen konnten nicht geladen werden. Bitte Seite neu laden.');
  }
}

// ---------------------------------------------------------------- Aktionen

function toggleNumber(number) {
  const current = tipp();
  const has = current.includes(number);
  if (!has && current.length >= game().pick) {
    showToast(`Schon ${game().pick} Zahlen gewählt – tippe oben eine an, um sie zu entfernen.`);
    return;
  }
  navigator.vibrate?.(8);
  commit(
    () => {
      setSlots(has ? removeNumber(game(), slots(), number) : addNumbers(game(), slots(), [number]));
    },
    { animate: 'balls' },
  );
}

/** Getippte Zahlen übernehmen; Doppelte, Ungültige und Überzählige erklären statt still schlucken. */
function enterNumbers({ numbers, invalid, origin }) {
  const g = game();
  const current = tipp();
  const added = [];
  const repeated = [];
  let overflow = false;
  for (const n of numbers) {
    if (current.includes(n) || added.includes(n)) repeated.push(n);
    else if (current.length + added.length >= g.pick) overflow = true;
    else added.push(n);
  }
  if (added.length)
    commit(() => setSlots(addNumbers(g, slots(), added)), { animate: 'balls', origin });

  if (invalid.length) {
    tray.reject();
    showToast(`${formatList(invalid.map(String))} gibt es nicht – nur 1 bis ${g.max}.`);
  } else if (overflow) {
    showToast(`Schon ${g.pick} Zahlen gewählt – die Rücktaste entfernt die letzte.`);
  } else if (repeated.length) {
    repeated.forEach((n) => tray.flash(n));
    showToast(`${formatList(repeated.map(String))} ${repeated.length === 1 ? 'ist' : 'sind'} schon dabei.`);
  }
  // Auf dem Smartphone die Tastatur schließen, sobald der Tipp steht – dann ist das Ergebnis frei.
  if (added.length && tipp().length === g.pick && coarsePointer.matches) tray.blurEntry();
}

/** Rücktaste: entfernt die Zahl links vom freien Platz, an dem die Eingabe steht. */
function backspace() {
  const number = backspaceTarget(game(), slots());
  if (number !== null) commit(() => setSlots(removeNumber(game(), slots(), number)), { animate: 'balls' });
}

async function share() {
  const numbers = tipp();
  // Geteilt wird ohne Lücken – der Empfänger soll einfach die Zahlen sehen.
  const url = new URL(formatHash({ gameId: state.gameId, view: 'pruefen', slots: numbers }), location.href).href;
  const text = `Hätten ${numbers.join(', ')} beim ${game().name} schon mal gewonnen?`;
  try {
    if (navigator.share) await navigator.share({ title: 'Retro-Lotto', text, url });
    else {
      await navigator.clipboard.writeText(url);
      showToast('Link kopiert.');
    }
  } catch (error) {
    if (error.name !== 'AbortError') showToast('Teilen nicht möglich – kopiere den Link aus der Adresszeile.');
  }
}

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  if (!toast.matches(':popover-open')) toast.showPopover();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.hidePopover(), 2600);
}

grid.addEventListener('number-toggle', (event) => toggleNumber(event.detail.number));

tray.addEventListener('tray-action', ({ detail }) => {
  switch (detail.action) {
    case 'remove':
      return toggleNumber(detail.number);
    case 'backspace':
      return backspace();
    case 'enter':
      return enterNumbers(detail);
    case 'random': {
      const keep = tipp().length === game().pick ? [] : slots();
      return commit(() => setSlots(quickTipp(game(), keep)), { animate: 'balls' });
    }
    case 'clear':
      return commit(() => setSlots([]), { animate: 'balls' });
    case 'share':
      return share();
  }
});

for (const button of document.querySelectorAll('[data-game-id]')) {
  button.addEventListener('click', () => {
    if (button.dataset.gameId === state.gameId) return;
    commit(() => (state.gameId = button.dataset.gameId));
    ensureStore(state.gameId);
  });
}

stats.addEventListener('period-change', ({ detail }) => commit(() => (state.period = detail.period)));

// Tab-Links und geteilte Links ändern den Hash – Zurück/Vor funktioniert damit von selbst.
addEventListener('hashchange', () => {
  const before = state.gameId;
  commit(() => applyHash());
  if (state.gameId !== before) ensureStore(state.gameId);
  if (state.view === 'pruefen' && location.hash.includes('-')) scrollTo({ top: 0, behavior: 'smooth' });
});

// Tastatur: Ziffern landen im Eingabefeld der Tipp-Leiste, auch ohne es vorher anzuklicken;
// die Rücktaste entfernt die letzte Zahl, Einfügen übernimmt ganze Zahlenreihen.
const isTextEntry = (target) =>
  target.closest?.('input:not([type=checkbox], [type=radio]), textarea, select, [contenteditable], [popover]');

addEventListener('keydown', (event) => {
  if (state.view !== 'pruefen' || event.metaKey || event.ctrlKey || event.altKey || isTextEntry(event.target)) return;
  if (event.key === 'Backspace' && tipp().length) {
    event.preventDefault();
    backspace();
  } else if (/^\d$/.test(event.key)) {
    event.preventDefault();
    tray.type(event.key);
  }
});

addEventListener('paste', (event) => {
  if (state.view !== 'pruefen' || isTextEntry(event.target)) return;
  const text = event.clipboardData?.getData('text') ?? '';
  if (!/\d/.test(text)) return;
  event.preventDefault();
  tray.type(text, { final: true });
});

// ---------------------------------------------------------------- Über die Daten

mount(
  $('.about-content'),
  html`<p>
      <strong>Lotto 6 aus 49:</strong> alle Samstagsziehungen seit dem 9. Oktober 1955 (bis 1965 meist sonntags)
      und alle Mittwochsziehungen seit Dezember 2000. Die Mittwochsziehungen A und B von 1986 bis 2000 sind
      nicht enthalten.
    </p>
    <p><strong>Eurojackpot:</strong> alle Ziehungen seit dem 23. März 2012, freitags und seit März 2022 auch dienstags.</p>
    <p>
      Ausgewertet werden nur die Gewinnzahlen, nicht Superzahl und Eurozahlen. Als Gewinn zählen ab 3 Richtige –
      dafür gibt es in beiden Spielen auch ohne Superzahl bzw. Eurozahlen eine Gewinnklasse.
    </p>
    <p>
      Die Daten werden nach jeder Ziehung automatisch aktualisiert und mehrfach gegengeprüft. Quellen:
      <a href="https://github.com/JohannesFriedrich/LottoNumberArchive">LottoNumberArchive</a> (LGPL-3.0),
      lottozahlenonline.de, lotto.de, Eesti Loto und eurojackpot-zahlen.eu.
    </p>
    <p class="stat-meta">
      Alle Angaben ohne Gewähr. Vergangene Ziehungen sagen nichts über künftige voraus.
      Glücksspiel kann süchtig machen – Hilfe gibt es bei <a href="https://www.check-dein-spiel.de">check-dein-spiel.de</a>.
    </p>`,
);

// ---------------------------------------------------------------- Start

persist();
render();
await ensureStore(state.gameId);

// Das andere Spiel im Leerlauf vorladen, damit der Wechsel sofort geht.
const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
idle(() => GAME_IDS.filter((id) => id !== state.gameId).forEach((id) => ensureStore(id)));

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service Worker:', error));
}
