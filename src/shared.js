// @ts-check
/* shared.js — facade that re-exports modularized helpers.
   Keeps the public API stable while splitting internals:
   search/*, engines, modes, ui/render, data/fetch, actions/registry.
   DOM-free; page-only handlers run in page context. */

/**
 * @typedef {Object} ResultItem
 * @property {string} kind      tab | action | bookmark | history | calc | url | search
 * @property {string} group
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} [icon]
 * @property {string} [url]
 * @property {string} [directIcon]
 * @property {number} [tabId]
 * @property {number} [windowId]
 * @property {boolean} [active]
 * @property {string} [actionId]
 * @property {string} [value]
 * @property {Action} [def]
 * @property {number} score
 */

/**
 * @typedef {Object} Action
 * @property {string} id
 * @property {string} title
 * @property {string} hint
 * @property {string} icon
 * @property {string} kw
 * @property {string} [exec]        background EXEC action name
 * @property {Record<string, any>} [payload]  extra EXEC args
 * @property {boolean} [pageOnly]   needs a live page DOM (hidden in popup)
 * @property {string} [requires]    capability key from CAPS
 * @property {() => any} [before]   hook run before exec (e.g. beforeCapture)
 * @property {() => any} [local]    handler that runs in the page
 */

/** @typedef {Object} DataCache
 * @property {any[]} [tabs]
 * @property {any[]} [bookmarks]
 * @property {any[]} [history]
 * @property {any[]} [closed]
 */

/** @typedef {import('./platform.js').Caps} Caps */

// engines
export { ENGINES, nextEngine } from './engines.js';
// data
export { fetchData } from './data/fetch.js';
// search
export { match, fuzzyScore } from './search/fuzzy.js';
export { isMath, evalMath } from './search/calculator.js';
export { isUrl, normUrl } from './search/url.js';
export { buildItems } from './search/ranking.js';
// modes
export { MODES, modeById, modeByKey, scopedItems, helpHtml, commandIntent } from './modes.js';
// ui
export { escHtml, advanceFav, itemsHtml, emptyHtml } from './ui/render.js';
// actions
export { ACTIONS, actionById } from './actions/registry.js';
