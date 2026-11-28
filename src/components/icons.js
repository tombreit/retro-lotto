// Inline-Icons (24er-Raster, Strichstärke über CSS).
import { html } from '../lib/html.js';

export const icons = {
  dice: html`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" class="dot"/><circle cx="15.5" cy="8.5" r="1.3" class="dot"/><circle cx="12" cy="12" r="1.3" class="dot"/><circle cx="8.5" cy="15.5" r="1.3" class="dot"/><circle cx="15.5" cy="15.5" r="1.3" class="dot"/></svg>`,
  clear: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  share: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>`,
  /** Spielschein mit Kreuzchen */
  ticket: html`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="3" width="15" height="18" rx="2.5"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/></svg>`,
  check: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  bell: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 16.5v-5.5a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 21h4"/></svg>`,
  /** Uhr mit Pfeil zurück – Zeitreise */
  clock: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4 4.5v3h3"/><path d="M12 8v4.5l3 1.8"/></svg>`,
  replay: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.4-5.5"/><path d="M20 4.5v3h-3"/></svg>`,
};
