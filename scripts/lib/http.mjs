// Schlanker fetch-Wrapper mit Timeout und Retry. Bewusst ohne Abhängigkeiten.

const USER_AGENT = 'retro-lotto-build/1.0 (static site data updater)';

export async function fetchText(url, { retries = 2, timeout = 20_000, accept = '*/*' } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: accept },
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(1000 * 2 ** attempt);
    }
  }
  throw new Error(`${url}: ${lastError?.message ?? lastError}`);
}

export async function fetchJson(url, options) {
  return JSON.parse(await fetchText(url, { accept: 'application/json', ...options }));
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
