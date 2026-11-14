// Lesen und Schreiben der committeten Datendateien (eine Ziehung pro Zeile → lesbare Git-Diffs).

import { readFile, writeFile } from 'node:fs/promises';

export const snapshotPath = (gameId) => new URL(`../../data/${gameId}.json`, import.meta.url);

export async function readSnapshot(gameId) {
  try {
    const json = JSON.parse(await readFile(snapshotPath(gameId), 'utf8'));
    return json.draws.map(([date, numbers]) => ({ date, numbers }));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export function serialize(gameId, draws) {
  const lines = draws.map((d) => JSON.stringify([d.date, d.numbers]));
  return `{"game":${JSON.stringify(gameId)},"draws":[\n${lines.join(',\n')}\n]}\n`;
}

export async function writeSnapshot(gameId, draws) {
  await writeFile(snapshotPath(gameId), serialize(gameId, draws));
}
