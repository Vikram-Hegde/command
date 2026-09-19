// @ts-check
/* modes.js — vim-style scopes. */

/** @type {{ id:string, key:string, label:string, placeholder:string, groups:string[]|null }[]} */
export const MODES = [
  { id: 'all', key: '/', label: 'All', placeholder: 'Type a command, tab, bookmark…', groups: null },
  {
    id: 'tabs',
    key: 't',
    label: 'Tabs',
    placeholder: 'Search open tabs…',
    groups: ['Current / Open Tabs', 'Open Tabs'],
  },
  { id: 'history', key: 'h', label: 'History', placeholder: 'Search history…', groups: ['History', 'Recently Closed'] },
  { id: 'bookmarks', key: 'b', label: 'Bookmarks', placeholder: 'Search bookmarks…', groups: ['Bookmarks'] },
  { id: 'actions', key: 'a', label: 'Actions', placeholder: 'Search actions…', groups: ['Actions'] },
];

/** @param {string} id */
export const modeById = (id) => MODES.find((m) => m.id === id) || MODES[0];

/** @param {string} key */
export const modeByKey = (key) => MODES.find((m) => m.key === key);

/**
 * @param {import('./shared.js').ResultItem[]} items
 * @param {string} modeId
 */
export const scopedItems = (items, modeId) => {
  const m = modeById(modeId);
  return m.groups ? items.filter((it) => m.groups.includes(it.group)) : items;
};

/**
 * @param {string} key
 * @returns {{ type:string, mode?:string, delta?:number }|null}
 */
export function commandIntent(key) {
  if (key === '?') return { type: 'help' };
  const m = modeByKey(key);
  if (m) return { type: 'mode', mode: m.id };
  if (key === 'i') return { type: 'search' };
  if (key === 'j' || key === 'ArrowDown') return { type: 'move', delta: 1 };
  if (key === 'k' || key === 'ArrowUp') return { type: 'move', delta: -1 };
  if (key === 'Enter') return { type: 'choose' };
  if (key === 'Escape') return { type: 'escape' };
  if (key === 'q') return { type: 'close' };
  return null;
}

/** Static cheatsheet markup; hosts inject it into their own list container. */
export function helpHtml() {
  const rows = (/** @type {[string,string][]} */ list) =>
    list
      .map(
        ([k, d]) =>
          `<div class="cmdk-help-row"><span class="cmdk-help-k">${k}</span><span class="cmdk-help-d">${d}</span></div>`,
      )
      .join('');
  return `
    <div class="cmdk-help">
      <div class="cmdk-help-head">Keyboard reference</div>
      <div class="cmdk-help-sec">Modes <span>Esc from search, then…</span></div>
      ${rows([
        ['t', 'Open tabs only'],
        ['h', 'History and recently closed'],
        ['b', 'Bookmarks only'],
        ['a', 'Browser actions only'],
        ['/', 'Search everything'],
        ['i', 'Search the current scope'],
        ['?', 'Toggle this help'],
      ])}
      <div class="cmdk-help-sec">Navigate <span>in NORMAL mode</span></div>
      ${rows([
        ['↑ ↓ / j k', 'Move selection'],
        ['↵', 'Open'],
        ['⇧↵', 'Open in new tab'],
        ['⌃↵ / ⌘↵', 'Open in background'],
        ['esc', 'Back · close'],
        ['q', 'Close palette'],
      ])}
    </div>`;
}
