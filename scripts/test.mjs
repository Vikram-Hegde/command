#!/usr/bin/env node
// Capability matrix: loads platform.js + shared.js under a Chrome-like and a
// Firefox-like manifest and asserts the adapter and action gating, plus that
// every runtime entry point actually loads platform.js first. Run in CI so a
// change aimed at one browser can't silently regress the other.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}`);
  if (!cond) failures++;
}

const platformSrc = read('platform.js');
const sharedSrc = read('shared.js');

// Evaluate the two scripts in an isolated context shaped like a content script.
function load(manifest) {
  const sandbox = {
    console, Math, Date, URL, encodeURIComponent,
    chrome: {
      runtime: { getManifest: () => manifest, getURL: p => 'ext://' + p },
      downloads: {}, tabs: {}
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(platformSrc, sandbox, { filename: 'platform.js' });
  vm.runInContext(`${sharedSrc}\n;globalThis.__t = { buildItems, CAPS, actionById, PLATFORM: globalThis.CMDK_PLATFORM };`, sandbox, { filename: 'shared.js' });
  return sandbox.__t;
}

const empty = { tabs: [], bookmarks: [], history: [], closed: [] };
const visible = (t, id) => t.buildItems('', 'all', empty).some(i => i.actionId === id);

console.log('Chrome profile');
const chrome = load({ permissions: ['tabs', 'favicon'] });
check('favicon cache available', chrome.CAPS.faviconCache);
check('accepts data: downloads', chrome.CAPS.dataUrlDownloads);
check('capture needs repaint', chrome.CAPS.captureNeedsRepaint);
check('discard + group exposed', visible(chrome, 'discard') && visible(chrome, 'group'));
check('settings -> chrome://', chrome.PLATFORM.page('settings') === 'chrome://settings');
check('new tab -> chrome://newtab', chrome.PLATFORM.newTab === 'chrome://newtab');

console.log('Firefox profile');
const ff = load({ permissions: ['tabs'], browser_specific_settings: { gecko: {} } });
check('no favicon cache', !ff.CAPS.faviconCache);
check('blob: downloads required', !ff.CAPS.dataUrlDownloads);
check('no capture repaint needed', !ff.CAPS.captureNeedsRepaint);
check('discard + group hidden', !visible(ff, 'discard') && !visible(ff, 'group'));
check('settings -> about:preferences', ff.PLATFORM.page('settings') === 'about:preferences');
check('new tab -> about:newtab', ff.PLATFORM.newTab === 'about:newtab');
check('screenshot uses platform before-hook',
  ff.actionById('screenshot').before === 'beforeCapture' && typeof ff.PLATFORM.beforeCapture === 'function');
check('platform exposes saveImage', typeof ff.PLATFORM.saveImage === 'function');

console.log('Wiring');
const chromeManifest = JSON.parse(read('manifest.json'));
const ffManifest = JSON.parse(read('manifest.firefox.json'));
check('chrome content scripts load platform.js first', chromeManifest.content_scripts[0].js[0] === 'platform.js');
check('firefox background loads platform.js first', ffManifest.background.scripts[0] === 'platform.js');
check('popup loads platform.js', /<script src="platform\.js"><\/script>/.test(read('popup.html')));
check('build copies platform.js', read('scripts/build.mjs').includes("'platform.js'"));
for (const f of ['background.js', 'shared.js', 'content.js', 'popup.js']) {
  check(`${f} has no engine branch`, !/\bIS_FIREFOX\b/.test(read(f)));
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
