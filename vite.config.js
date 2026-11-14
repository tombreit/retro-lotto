import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig } from 'vite';

/** Alle Dateien unter public/ (relativ), damit der Service Worker sie mit vorhält. */
function listPublic(dir = 'public') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listPublic(path) : [relative('public', path).replaceAll('\\', '/')];
  });
}

/**
 * Erzeugt sw.js mit der Precache-Liste aus dem fertigen Bundle. Der Cache-Name enthält einen
 * Hash über alle Dateinamen – jede neue Version (z. B. neue Ziehungen) ersetzt den alten Cache.
 */
function serviceWorker() {
  return {
    name: 'retro-lotto-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = [...Object.keys(bundle), ...listPublic()].filter((f) => f !== 'index.html').toSorted();
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const template = readFileSync('src/sw.template.js', 'utf8');
      const source = template
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(files, null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
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
  plugins: [serviceWorker()],
});
