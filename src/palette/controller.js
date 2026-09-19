// @ts-check
/* palette/controller.js — deduplicates content.js/popup.js logic.
   Hosts provide DOM refs + callbacks; controller owns searching, filtering,
   selection, and UI transitions. */
import { fetchData } from '../data/fetch.js';
import { buildItems } from '../search/ranking.js';
import { itemsHtml, emptyHtml, advanceFav } from '../ui/render.js';
import { helpHtml, modeById, commandIntent } from '../modes.js';
import { ENGINES, nextEngine } from '../engines.js';
import { getEngine, setEngine } from '../settings.js';
import { api } from '../platform.js';

/**
 * @typedef {Object} ControllerOpts
 * @property {boolean} includePageOnly
 * @property {number} [tabLimit]
 * @property {number} [tabMatchLimit]
 * @property {number} [maxItems]
 * @property {HTMLInputElement} input
 * @property {HTMLElement} list
 * @property {HTMLElement} chip
 * @property {HTMLElement} hints
 * @property {Record<string,string>} PH
 * @property {() => void} [onClose]
 * @property {(msg:string)=>void} [onToast]
 * @property {(url:string, e:Event, newTab:boolean, bg:boolean)=>Promise<void>} onOpenUrl
 * @property {(actionId:string)=>Promise<void>} onAction
 */

/**
 * @param {ControllerOpts} opts
 */
export function createPaletteController(opts) {
  const { input, list, chip, hints, PH, includePageOnly, onClose, onToast, onOpenUrl, onAction } = opts;
  const tabLimit = opts.tabLimit ?? 6;
  const tabMatchLimit = opts.tabMatchLimit ?? 8;
  const maxItems = opts.maxItems ?? 60;

  let mode = 'all';
  let ui = 'search';
  let help = false;
  let filtered = [];
  let sel = 0;
  let cache = { tabs: [], bookmarks: [], history: [], closed: [] };
  let engine = 'google';
  let debounce = /** @type {number|null} */ (null);
  let seq = 0;

  getEngine().then((e) => {
    engine = e;
  });

  const searchPlaceholder = () => modeById(mode).placeholder || 'Type a command…';
  const NORMAL_FOOTER =
    '<span><b>t</b> tabs</span><span><b>h</b> history</span><span><b>b</b> bookmarks</span><span><b>a</b> actions</span><span><b>/</b> search</span><span><b>?</b> help</span>';
  const SEARCH_FOOTER =
    '<span><b>↑↓</b> navigate</span><span><b>↵</b> open</span><span><b>⇧↵</b> new tab</span><span><b>esc</b> normal mode</span>';

  function renderStatus() {
    if (!chip) return;
    const m = modeById(mode);
    if (help) chip.textContent = '? help';
    else if (ui === 'normal') chip.textContent = mode === 'all' ? 'NORMAL' : `NORMAL · ${m.label}`;
    else chip.textContent = m.label;
    chip.dataset.ui = help ? 'help' : ui;
    input.readOnly = ui === 'normal';
    input.placeholder = ui === 'normal' ? 'Press t/h/b/a to scope · / to search · ? for help' : searchPlaceholder();
    if (hints) {
      const isPopupHints = hints.id === 'hints';
      if (isPopupHints) {
        // popup uses <kbd>, overlay uses <b>
        const normal = NORMAL_FOOTER.replaceAll('<b>', '<kbd>').replaceAll('</b>', '</kbd>');
        const search = SEARCH_FOOTER.replaceAll('<b>', '<kbd>').replaceAll('</b>', '</kbd>');
        hints.innerHTML = help
          ? '<span><kbd>?</kbd> or <kbd>esc</kbd> to close help</span>'
          : ui === 'normal'
            ? normal
            : search;
      } else {
        hints.innerHTML = help
          ? '<span><b>?</b> or <b>esc</b> to close help</span>'
          : ui === 'normal'
            ? NORMAL_FOOTER
            : SEARCH_FOOTER;
      }
    }
  }

  function setUI(next) {
    if (next === 'normal' && help) help = false;
    ui = next;
    if (ui === 'search') setTimeout(() => input.focus(), 0);
    else input.blur();
    renderStatus();
  }

  function setHelp(on) {
    help = on;
    if (on) input.blur();
    else if (ui === 'search') setTimeout(() => input.focus(), 0);
    renderStatus();
    render();
  }

  function handleCmdKey(e) {
    if (help) {
      if (e.key === '?' || e.key === 'Escape' || e.key === 'q') setHelp(false);
      return;
    }
    const intent = commandIntent(e.key);
    if (!intent) return;
    switch (intent.type) {
      case 'help':
        setHelp(true);
        break;
      case 'mode':
        mode = intent.mode;
        setUI('search');
        queueRefresh(/** @type {string} */ (input.value));
        break;
      case 'search':
        setUI('search');
        break;
      case 'move':
        setSel(sel + intent.delta);
        break;
      case 'choose':
        choose(e);
        break;
      case 'escape':
        if (mode !== 'all') {
          mode = 'all';
          renderStatus();
          queueRefresh(/** @type {string} */ (input.value));
        } else if (onClose) onClose();
        break;
      case 'close':
        if (onClose) onClose();
        break;
    }
  }

  async function refresh(q) {
    const cur = ++seq;
    const d = await fetchData(q);
    if (cur !== seq) return;
    if (d) cache = d;
    filtered = buildItems(q, mode, cache, { engine, includePageOnly, tabLimit, tabMatchLimit }).slice(0, maxItems);
    sel = 0;
    render();
  }

  function queueRefresh(q) {
    // immediate for mode switches, callers debounce input themselves
    refresh(q);
  }

  function render() {
    if (!list) return;
    if (help) {
      list.innerHTML = helpHtml();
      return;
    }
    list.innerHTML = filtered.length ? itemsHtml(filtered, sel, PH) : emptyHtml(mode, input.value, engine);
    list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  function setSel(n) {
    sel = Math.max(0, Math.min(n, filtered.length - 1));
    const nodes = list.querySelectorAll('.cmdk-item');
    nodes.forEach((el, i) => el.classList.toggle('selected', i === sel));
    nodes[sel]?.scrollIntoView({ block: 'nearest' });
  }

  function onInput() {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => refresh(input.value), 140);
  }

  function onKey(e) {
    e.stopPropagation();
    if (e.key === 'Tab') {
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel(sel + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel(sel - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setUI('normal');
    } else if (e.key === '?' && !input.value) {
      e.preventDefault();
      setHelp(true);
    }
  }

  async function choose(e) {
    const it = filtered[sel];
    const q = input.value;
    if (!it) {
      if (q.trim() && mode === 'all') {
        const url = ENGINES[engine](q.trim());
        await onOpenUrl(url, e, false, false);
      }
      return;
    }
    const newTab = e.shiftKey;
    const bg = e.ctrlKey || e.metaKey;
    if (it.kind === 'tab') {
      await api.runtime.sendMessage({
        type: 'EXEC',
        action: 'switch-tab',
        payload: { tabId: it.tabId, windowId: it.windowId },
      });
      if (onClose) onClose();
    } else if (it.kind === 'calc') {
      try {
        await navigator.clipboard.writeText(it.value);
      } catch {}
      if (onToast) onToast(`Copied ${it.value}`);
      if (onClose) onClose();
    } else if (it.kind === 'action') {
      const def = it.def;
      if (def.id === 'engine') {
        engine = nextEngine(engine);
        setEngine(engine);
        input.value = '';
        await refresh('');
        if (onToast) onToast(`Search engine: ${engine}`);
        return;
      }
      // copy-* needs tab context in popup; delegate to host instead of running page-local directly
      const isCopyFromPopup = !includePageOnly && (def.id === 'copy-url' || def.id === 'copy-title');
      if (def.local && !isCopyFromPopup) {
        if (onClose) onClose();
        try {
          await def.local();
        } catch {}
        return;
      }
      if (def.before) await def.before();
      await onAction(def.id);
    } else {
      await onOpenUrl(it.url, e, newTab, bg);
    }
  }

  // wiring helpers
  function bind() {
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKey);
    input.addEventListener('click', () => {
      if (ui === 'normal' || help) setUI('search');
    });
    for (const t of ['keypress', 'keyup']) input.addEventListener(t, (e) => e.stopPropagation());
    list.addEventListener(
      'error',
      (e) => {
        const t = /** @type {Element} */ (e.target);
        if (t && t.tagName === 'IMG' && t.hasAttribute('data-fav')) advanceFav(/** @type {HTMLImageElement} */ (t), PH);
      },
      true,
    );
    list.addEventListener('click', (e) => {
      const target = /** @type {Element} */ (e.target);
      const el = target.closest('.cmdk-item');
      if (!el) return;
      sel = +(/** @type {HTMLElement} */ (el).dataset.i);
      choose(e);
    });
    // click outside handled by host (overlay)
  }

  // expose state for hosts
  return {
    get mode() {
      return mode;
    },
    set mode(v) {
      mode = v;
    },
    get ui() {
      return ui;
    },
    get help() {
      return help;
    },
    get engine() {
      return engine;
    },
    set engine(v) {
      engine = v;
    },
    get filtered() {
      return filtered;
    },
    get selected() {
      return sel;
    },
    refresh,
    queueRefresh,
    render,
    renderStatus,
    setUI,
    setHelp,
    handleCmdKey,
    setSel,
    choose,
    bind,
    getCache: () => cache,
  };
}
