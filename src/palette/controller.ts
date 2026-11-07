/* palette/controller.ts — deduplicates content/popup logic. */
import { fetchData } from '../data/fetch.js';
import { buildItems } from '../search/ranking.js';
import { itemsHtml, emptyHtml, advanceFav } from '../ui/render.js';
import { helpHtml, modeById, commandIntent } from '../modes.js';
import { ENGINES, nextEngine } from '../engines.js';
import { getEngine, setEngine } from '../settings.js';
import { api } from '../platform.js';
import { PHASE, clampSelection, createState, transition, type PhaseEvent } from './state.js';
import type { Action } from '../actions/registry.js';

export interface ControllerOpts {
  includePageOnly: boolean;
  tabLimit?: number;
  tabMatchLimit?: number;
  maxItems?: number;
  input: HTMLInputElement;
  list: HTMLElement;
  chip: HTMLElement;
  hints: HTMLElement;
  PH: Record<string, string>;
  onClose?: () => void;
  onToast?: (msg: string) => void;
  onOpenUrl: (url: string, e: Event, newTab: boolean, bg: boolean) => Promise<void>;
  onAction: (def: Action) => Promise<void>;
}

export function createPaletteController(opts: ControllerOpts) {
  const { input, list, chip, hints, PH, includePageOnly, onClose, onToast, onOpenUrl, onAction } = opts;
  const tabLimit = opts.tabLimit ?? 6;
  const tabMatchLimit = opts.tabMatchLimit ?? 8;
  const maxItems = opts.maxItems ?? 60;

  const state = createState();
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;

  // Ranking must not use a stale engine while a cycle is being persisted.
  const engineReady = getEngine().then((e) => {
    state.engine = e;
  });

  const normalPlaceholder = 'Press t/h/b/a to scope · / to search · ? for help';
  const searchPlaceholder = (): string => modeById(state.scope).placeholder || 'Type a command…';
  const NORMAL_FOOTER =
    '<span><b>t</b> tabs</span><span><b>h</b> history</span><span><b>b</b> bookmarks</span><span><b>a</b> actions</span><span><b>/</b> search</span><span><b>?</b> help</span>';
  const SEARCH_FOOTER =
    '<span><b>↑↓</b> navigate</span><span><b>↵</b> open</span><span><b>⇧↵</b> new tab</span><span><b>esc</b> normal mode</span>';

  function renderStatus(): void {
    if (!chip) return;
    const m = modeById(state.scope);
    if (state.phase === PHASE.HELP) chip.textContent = '? help';
    else if (state.phase === PHASE.NORMAL) chip.textContent = state.scope === 'all' ? 'NORMAL' : `NORMAL · ${m.label}`;
    else chip.textContent = m.label;
    chip.dataset.ui = state.phase;
    input.readOnly = state.phase !== PHASE.SEARCH;
    if (state.phase === PHASE.NORMAL) input.placeholder = normalPlaceholder;
    else if (state.phase === PHASE.HELP)
      input.placeholder = state.resume === PHASE.NORMAL ? normalPlaceholder : searchPlaceholder();
    else input.placeholder = searchPlaceholder();
    if (state.load === 'error') chip.title = 'Browser data unavailable — showing cached results';
    else chip.removeAttribute('title');
    if (hints) {
      const isPopupHints = hints.id === 'hints';
      if (isPopupHints) {
        const normal = NORMAL_FOOTER.replaceAll('<b>', '<kbd>').replaceAll('</b>', '</kbd>');
        const search = SEARCH_FOOTER.replaceAll('<b>', '<kbd>').replaceAll('</b>', '</kbd>');
        hints.innerHTML =
          state.phase === PHASE.HELP
            ? '<span><kbd>?</kbd> or <kbd>esc</kbd> to close help</span>'
            : state.phase === PHASE.NORMAL
              ? normal
              : search;
      } else {
        hints.innerHTML =
          state.phase === PHASE.HELP
            ? '<span><b>?</b> or <b>esc</b> to close help</span>'
            : state.phase === PHASE.NORMAL
              ? NORMAL_FOOTER
              : SEARCH_FOOTER;
      }
    }
  }

  function dispatch(event: PhaseEvent): void {
    for (const effect of transition(state, event)) {
      switch (effect) {
        case 'focus':
          setTimeout(() => input.focus(), 0);
          break;
        case 'blur':
          input.blur();
          break;
        case 'render':
          render();
          break;
        case 'refresh':
          queueRefresh(input.value);
          break;
        case 'close':
          onClose?.();
          break;
      }
    }
    renderStatus();
  }

  function handleCmdKey(e: KeyboardEvent): void {
    if (state.phase === PHASE.HELP) {
      if (e.key === '?' || e.key === 'Escape' || e.key === 'q') dispatch({ type: 'dismiss-help' });
      return;
    }
    const intent = commandIntent(e.key);
    if (!intent) return;
    switch (intent.type) {
      case 'help':
        dispatch({ type: 'help' });
        break;
      case 'mode':
        dispatch({ type: 'scope', scope: intent.mode });
        break;
      case 'search':
        dispatch({ type: 'search' });
        break;
      case 'move':
        setSel(state.selected + intent.delta);
        break;
      case 'choose':
        void choose(e);
        break;
      case 'escape':
        dispatch({ type: 'escape' });
        break;
      case 'close':
        dispatch({ type: 'close' });
        break;
    }
  }

  async function refresh(q: string): Promise<void> {
    const cur = ++seq;
    state.load = 'loading';
    if (!state.filtered.length) render();
    await engineReady;
    const d = await fetchData(q);
    if (cur !== seq) return;
    if (d) {
      state.cache = d;
      state.load = 'ready';
    } else {
      state.load = 'error';
    }
    state.filtered = buildItems(q, state.scope, state.cache, {
      engine: state.engine,
      includePageOnly,
      tabLimit,
      tabMatchLimit,
    }).slice(0, maxItems);
    state.selected = 0;
    render();
    renderStatus();
  }

  function queueRefresh(q: string): void {
    void refresh(q);
  }

  function cancelPending(): void {
    if (debounce) {
      clearTimeout(debounce);
      debounce = null;
    }
    seq++;
    state.load = 'idle';
  }

  function render(): void {
    if (!list) return;
    if (state.phase === PHASE.HELP) {
      list.innerHTML = helpHtml();
      return;
    }
    list.innerHTML = state.filtered.length
      ? itemsHtml(state.filtered, state.selected, PH)
      : emptyHtml(state.scope, input.value, state.engine, state.load);
    list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  function setSel(n: number): void {
    clampSelection(state, n);
    const nodes = list.querySelectorAll('.cmdk-item');
    nodes.forEach((el, i) => el.classList.toggle('selected', i === state.selected));
    nodes[state.selected]?.scrollIntoView({ block: 'nearest' });
  }

  function onInput(): void {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      void refresh(input.value);
    }, 140);
  }

  function onKey(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === 'Tab') {
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel(state.selected + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel(state.selected - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void choose(e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      dispatch({ type: 'escape' });
    } else if (e.key === '?' && !input.value) {
      e.preventDefault();
      dispatch({ type: 'help' });
    }
  }

  async function choose(e: Event & { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): Promise<void> {
    const it = state.filtered[state.selected];
    const q = input.value;
    if (!it) {
      if (q.trim() && state.scope === 'all') {
        const url = ENGINES[state.engine as keyof typeof ENGINES](q.trim());
        await onOpenUrl(url, e, false, false);
      }
      return;
    }
    const newTab = (e as KeyboardEvent).shiftKey;
    const bg = (e as KeyboardEvent).ctrlKey || (e as KeyboardEvent).metaKey;
    if (it.kind === 'tab') {
      await api.runtime.sendMessage({
        type: 'EXEC',
        action: 'switch-tab',
        payload: { tabId: it.tabId, windowId: it.windowId },
      });
      if (onClose) onClose();
    } else if (it.kind === 'calc') {
      try {
        await navigator.clipboard.writeText(it.value!);
      } catch {}
      if (onToast) onToast(`Copied ${it.value}`);
      if (onClose) onClose();
    } else if (it.kind === 'action') {
      const def = it.def!;
      if (def.run.type === 'engine') {
        await engineReady;
        state.engine = nextEngine(state.engine);
        setEngine(state.engine);
        input.value = '';
        await refresh('');
        if (onToast) onToast(`Search engine: ${state.engine}`);
        return;
      }
      await onAction(def);
    } else {
      await onOpenUrl(it.url!, e, newTab, bg);
    }
  }

  function bind(): void {
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKey as EventListener);
    input.addEventListener('click', () => {
      if (state.phase !== PHASE.SEARCH) dispatch({ type: 'search' });
    });
    for (const t of ['keypress', 'keyup'] as const) input.addEventListener(t, (e) => e.stopPropagation());
    list.addEventListener(
      'error',
      (e) => {
        const t = e.target as Element;
        if (t && t.tagName === 'IMG' && t.hasAttribute('data-fav')) advanceFav(t as HTMLImageElement, PH);
      },
      true,
    );
    list.addEventListener('click', (e) => {
      const target = e.target as Element;
      const el = target.closest('.cmdk-item') as HTMLElement | null;
      if (!el) return;
      clampSelection(state, Number((el as HTMLElement).dataset.i));
      void choose(e as unknown as Event & { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean });
    });
  }

  return {
    get phase(): string {
      return state.phase;
    },
    enter: (): void => dispatch({ type: 'enter' }),
    refresh,
    queueRefresh,
    renderStatus,
    handleCmdKey,
    cancelPending,
    bind,
  };
}
