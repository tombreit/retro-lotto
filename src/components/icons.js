// Inline-Icons (24er-Raster, Strichstärke über CSS).
import { html } from '../lib/html.js';

export const icons = {
  dice: html`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" class="dot"/><circle cx="15.5" cy="8.5" r="1.3" class="dot"/><circle cx="12" cy="12" r="1.3" class="dot"/><circle cx="8.5" cy="15.5" r="1.3" class="dot"/><circle cx="15.5" cy="15.5" r="1.3" class="dot"/></svg>`,
  clear: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  share: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>`,
};
