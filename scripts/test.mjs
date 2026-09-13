#!/usr/bin/env node
// Capability matrix: asserts the platform adapter and action gating for both
// engine profiles, plus the bundled-entry wiring. Run in CI so a change aimed
// at one browser can't silently regress the other.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}`);
  if (!cond) failures++;
}

const CHROME_MANIFEST = { permissions: ['tabs', 'favicon'] };
const FIREFOX_MANIFEST = { permissions: ['tabs'], browser_specific_settings: { gecko: {} } };

// platform.js reads globalThis.chrome at import, so stub it first.
globalThis.chrome = {
  runtime: { getManifest: () => CHROME_MANIFEST, getURL: (p) => 'ext://' + p },
  downloads: {},
  tabs: {},
};

const { detectCaps, pagesFor } = await import('../src/platform.js');
const { buildItems, actionById } = await import('../src/shared.js');

const empty = { tabs: [], bookmarks: [], history: [], closed: [] };
const visible = (caps, id) => buildItems('', 'all', empty, { caps }).some((i) => i.actionId === id);

console.log('Chrome profile');
const chromeCaps = detectCaps(CHROME_MANIFEST);
check('favicon cache available', chromeCaps.faviconCache);
check('accepts data: downloads', chromeCaps.dataUrlDownloads);
check('capture needs repaint', chromeCaps.captureNeedsRepaint);
check('discard + group exposed', visible(chromeCaps, 'discard') && visible(chromeCaps, 'group'));
check('settings -> chrome://', pagesFor(CHROME_MANIFEST).settings === 'chrome://settings');
check('new tab -> chrome://newtab', pagesFor(CHROME_MANIFEST).newtab === 'chrome://newtab');

console.log('Firefox profile');
const ffCaps = detectCaps(FIREFOX_MANIFEST);
check('no favicon cache', !ffCaps.faviconCache);
check('blob: downloads required', !ffCaps.dataUrlDownloads);
check('no capture repaint needed', !ffCaps.captureNeedsRepaint);
check('discard + group hidden', !visible(ffCaps, 'discard') && !visible(ffCaps, 'group'));
check('settings -> about:preferences', pagesFor(FIREFOX_MANIFEST).settings === 'about:preferences');
check('new tab -> about:newtab', pagesFor(FIREFOX_MANIFEST).newtab === 'about:newtab');

console.log('Registry');
check('screenshot declares a before hook', typeof actionById('screenshot').before === 'function');
check('discard requires a capability', actionById('discard').requires === 'canDiscard');

console.log('Wiring');
const chromeManifest = JSON.parse(read('manifest.json'));
const ffManifest = JSON.parse(read('manifest.firefox.json'));
check('chrome loads one content bundle', JSON.stringify(chromeManifest.content_scripts[0].js) === '["content.js"]');
check('firefox loads one background bundle', JSON.stringify(ffManifest.background.scripts) === '["background.js"]');
check('popup loads one bundle', /<script src="popup\.js"><\/script>/.test(read('src/popup.html')));
check('build copies the bundles', read('scripts/build.mjs').includes("'content.js'"));
for (const f of ['src/background.js', 'src/shared.js', 'src/content.js', 'src/popup.js']) {
  check(`${f} has no engine branch`, !/\bIS_FIREFOX\b/.test(read(f)));
  check(`${f} has no runtime global contract`, !/globalThis\.CMDK_PLATFORM|window\.PHOSPHOR/.test(read(f)));
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
