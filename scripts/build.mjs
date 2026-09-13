#!/usr/bin/env node
// Assembles per-browser builds into dist/. Chrome uses manifest.json as-is;
// Firefox merges manifest.firefox.json (event page instead of a service
// worker, no `favicon` permission, plus the gecko id). No dependencies.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RUNTIME = [
  'platform.js', 'background.js', 'content.js', 'shared.js',
  'popup.html', 'popup.js', 'palette.css', 'host.css', 'phosphor-icons.js',
  'fonts', 'icons'
];

const readJson = async file => JSON.parse(await readFile(join(ROOT, file), 'utf8'));

async function emit(target, manifest) {
  const out = join(ROOT, 'dist', target);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const item of RUNTIME) {
    await cp(join(ROOT, item), join(out, item), { recursive: true });
  }
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`built dist/${target}`);
}

const chromeManifest = await readJson('manifest.json');
const firefox = await readJson('manifest.firefox.json');

const firefoxManifest = {
  ...chromeManifest,
  ...firefox,
  background: firefox.background,
  permissions: (firefox.permissions ?? chromeManifest.permissions).filter(p => p !== 'favicon')
};

await emit('chrome', chromeManifest);
await emit('firefox', firefoxManifest);
