// Benachrichtigungen nach der Ziehung – ohne Server.
//
// Im Hintergrund weckt nur Periodic Background Sync den Service Worker, und das gibt es allein in
// Chromium-Browsern mit installierter App. Überall sonst (iPhone, Firefox, nicht installiert) zeigt
// die App das Ergebnis beim nächsten Öffnen. Dieses Modul sagt ehrlich, was auf dem Gerät geht.

import { kvGet, kvSet } from './ticket-db.js';

const TAG = 'check-draws';
/** Wunsch an den Browser; wie oft er wirklich weckt, entscheidet er selbst (meist höchstens alle 12 h). */
const MIN_INTERVAL = 2 * 60 * 60_000;

let installPrompt = null;
let listener = () => {};

if (typeof window !== 'undefined') {
  // Chromium meldet, dass die App installierbar ist – den Dialog zeigen wir erst auf Knopfdruck.
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    listener();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    listener();
  });
}

export function onNotifyChange(callback) {
  listener = callback;
}

const registration = () => navigator.serviceWorker?.getRegistration();

async function backgroundAllowed() {
  try {
    return (await navigator.permissions.query({ name: 'periodic-background-sync' })).state === 'granted';
  } catch {
    return false;
  }
}

/**
 * Was auf diesem Gerät möglich ist:
 * - 'on'       Benachrichtigungen sind eingerichtet
 * - 'ask'      möglich, der Nutzer muss nur noch zustimmen
 * - 'install'  möglich, sobald die App installiert ist
 * - 'blocked'  im Browser für diese Seite abgelehnt
 * - 'none'     der Browser kann im Hintergrund nichts melden
 * @returns {Promise<{ state: string, canPromptInstall: boolean }>}
 */
export async function notifyStatus() {
  const canPromptInstall = installPrompt !== null;
  const reg = 'Notification' in globalThis ? await registration() : null;
  if (!reg || !('periodicSync' in reg)) return { state: 'none', canPromptInstall };
  if (Notification.permission === 'denied') return { state: 'blocked', canPromptInstall };
  if (!(await backgroundAllowed())) return { state: 'install', canPromptInstall };
  if (Notification.permission !== 'granted') return { state: 'ask', canPromptInstall };
  const wanted = (await kvGet('notify').catch(() => undefined)) !== false;
  return { state: wanted ? 'on' : 'ask', canPromptInstall };
}

async function register() {
  const reg = await registration();
  if (!reg?.periodicSync || !(await backgroundAllowed())) return false;
  await reg.periodicSync.register(TAG, { minInterval: MIN_INTERVAL });
  return true;
}

/**
 * Schaltet Benachrichtigungen ein. Muss direkt aus einem Klick aufgerufen werden: Die Erlaubnis
 * wird als Erstes angefragt, vor jedem anderen `await`.
 */
export async function enableNotifications() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;
  await kvSet('notify', true).catch(() => {});
  return register().catch(() => false);
}

export async function disableNotifications() {
  await kvSet('notify', false).catch(() => {});
  const reg = await registration();
  await reg?.periodicSync?.unregister(TAG).catch(() => {});
}

/**
 * Bei jedem Start erneut anmelden: Die Anmeldung scheitert, solange die App nicht installiert ist,
 * und der Browser kann sie jederzeit verwerfen.
 */
export async function renewNotifications() {
  if (!('Notification' in globalThis) || Notification.permission !== 'granted') return;
  if ((await kvGet('notify').catch(() => undefined)) === false) return;
  await register().catch(() => {});
}

/** Zeigt den Installationsdialog des Browsers. */
export async function promptInstall() {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  listener();
  return outcome === 'accepted';
}

/** Zahl am App-Icon (Desktop, iOS als installierte App) – wo es das nicht gibt, passiert nichts. */
export function setBadge(count) {
  const done = count > 0 ? navigator.setAppBadge?.(count) : navigator.clearAppBadge?.();
  done?.catch(() => {});
}
