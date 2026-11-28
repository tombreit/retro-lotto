import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { build, defineConfig } from 'vite';

const GAME_IDS = ['lotto', 'eurojackpot'];
const LATEST_FILE = 'draws-latest.json';

/** Alle Dateien unter public/ (relativ), damit der Service Worker sie mit vorhält. */
function listPublic(dir = 'public') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listPublic(path) : [relative('public', path).replaceAll('\\', '/')];
  });
}

/**
 * Die jüngsten Ziehungen je Spiel als kleine, ungehashte Datei. Der Service Worker wertet damit im
 * Hintergrund die Spielscheine aus – die gehashten Daten-Chunks der Seite kennt er nicht.
 */
function latestDraws(count = 40) {
  const draws = Object.fromEntries(
    GAME_IDS.map((id) => [id, JSON.parse(readFileSync(`data/${id}.json`, 'utf8')).draws.slice(-count)]),
  );
  return JSON.stringify({ draws });
}

/**
 * Erzeugt sw.js: bündelt src/sw.js samt der gemeinsamen Logik zu einer einzigen klassischen Datei
 * und setzt die Precache-Liste aus dem fertigen Bundle ein. Der Cache-Name enthält einen Hash über
 * alle Dateinamen – jede neue Version (z. B. neue Ziehungen) ersetzt den alten Cache.
 */
function serviceWorker() {
  return {
    name: 'retro-lotto-service-worker',
    apply: 'build',
    buildStart() {
      this.addWatchFile(resolve('src/sw.js'));
    },
    async generateBundle(_options, bundle) {
      const files = [...Object.keys(bundle), ...listPublic()]
        .filter((f) => f !== 'index.html' && f !== LATEST_FILE)
        .toSorted();
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: LATEST_FILE, source: latestDraws() });

      // Eigener Build ohne Ausgabe auf die Platte: Als zweiter Einstiegspunkt des Haupt-Builds würde
      // der Worker gemeinsame Chunks mit der Seite teilen und wäre keine einzelne Datei mehr.
      const { output } = await build({
        configFile: false,
        logLevel: 'warn',
        define: { __VERSION__: JSON.stringify(version), __PRECACHE__: JSON.stringify(files) },
        build: {
          write: false,
          target: 'esnext',
          reportCompressedSize: false,
          rolldownOptions: { input: 'src/sw.js', output: { format: 'iife' } },
        },
      });
      const chunks = output.filter((item) => item.type === 'chunk');
      if (chunks.length !== 1) this.error(`sw.js muss eine einzelne Datei sein, es sind ${chunks.length} Chunks`);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: chunks[0].code });
    },
  };
}

/** Im Entwicklungsserver gibt es keinen Build – dieselbe Datei kommt hier direkt aus data/. */
function latestDrawsDev() {
  return {
    name: 'retro-lotto-latest-draws',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0].endsWith(`/${LATEST_FILE}`)) {
          response.setHeader('Content-Type', 'application/json');
          response.end(latestDraws());
        } else next();
      });
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
    reportCompressedSize: true,
  },
  plugins: [serviceWorker(), latestDrawsDev()],
});
