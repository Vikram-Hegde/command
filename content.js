/* CommandK overlay — injected on every page, renders into a shadow root. */
(() => {
  if (window.__cmdk_injected) return;
  window.__cmdk_injected = true;

  let host = null, shadow = null, els = {};
  let open = false, filtered = [], sel = 0;
  // `mode` scopes the results, `ui` is NORMAL vs SEARCH, `help` is the cheatsheet.
  let mode = 'all', ui = 'search', help = false;
  let cache = { tabs: [], bookmarks: [], history: [], closed: [] };
  let engine = 'google';
  let debounce = null;

  chrome.storage?.local.get(['engine'], r => { if (r.engine) engine = r.engine; });

  // ---------- shell ----------
  function buildShell() {
    host = document.createElement('div');
    host.id = 'cmdk-host';
    host.style.display = 'none';
    shadow = host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);

    const mount = () => {
      // Draw the shell before the stylesheet fetch resolves, so there's no delay.
      shadow.innerHTML = `
        <style id="cmdk-css"></style>
        <div class="cmdk-overlay" id="ov">
          <div class="cmdk-palette" id="pal" role="dialog" aria-label="Command palette">
            <div class="cmdk-input-row">
              <span class="cmdk-icon">${(window.PHOSPHOR && window.PHOSPHOR.command) || '⌘'}</span>
              <input class="cmdk-input" id="inp" placeholder="Type a command, tab, bookmark…  (e.g. “mute”, “duplicate”, “github”)" autocomplete="off" spellcheck="false" />
              <span class="cmdk-chip" id="chip"></span>
              <span class="cmdk-esc">esc</span>
            </div>
            <div class="cmdk-list" id="list"></div>
            <div class="cmdk-footer" id="foot"></div>
          </div>
        </div>`;
      els.ov = shadow.getElementById('ov');
      els.css = shadow.getElementById('cmdk-css');
      els.inp = shadow.getElementById('inp');
      els.list = shadow.getElementById('list');
      els.chip = shadow.getElementById('chip');
      els.foot = shadow.getElementById('foot');
      els.ov.addEventListener('mousedown', e => { if (e.target.id === 'ov' || e.target.className === 'cmdk-overlay') close(); });
      // Advance through favicon fallbacks. No inline onerror: that runs in page
      // context and is blocked by strict CSPs.
      els.list.addEventListener('error', e => {
        const t = e.target;
        if (t && t.tagName === 'IMG' && t.hasAttribute('data-fav')) advanceFav(t, window.PHOSPHOR || {});
      }, true);
      els.inp.addEventListener('input', onInput);
      els.inp.addEventListener('keydown', onKey);
      // Clicking the field from NORMAL drops back into search for that scope.
      els.inp.addEventListener('click', () => { if (ui === 'normal' || help) setUI('search'); });
      // These carry no palette logic, but must not reach site handlers.
      for (const t of ['keypress', 'keyup']) {
        els.inp.addEventListener(t, e => e.stopPropagation());
      }
      els.list.addEventListener('click', e => {
        const el = e.target.closest('.cmdk-item'); if (!el) return;
        sel = +el.dataset.i; choose(e);
      });
      // Styles must be inlined into the shadow root. Re-fetched on every open
      // (see openPal) so palette.css edits apply without a page reload.
      loadShadowCss();
      renderStatus();
    };
    mount();
  }

  function toast(msg) {
    els.inp.value = ''; els.inp.placeholder = msg;
    setTimeout(() => { if (!help && ui === 'search') els.inp.placeholder = searchPlaceholder(); }, 1500);
  }

  // ---------- modal state ----------
  const searchPlaceholder = () => modeById(mode).placeholder || 'Type a command…';
  const NORMAL_FOOTER = '<span><b>t</b> tabs</span><span><b>h</b> history</span><span><b>b</b> bookmarks</span><span><b>a</b> actions</span><span><b>/</b> search</span><span><b>?</b> help</span>';
  const SEARCH_FOOTER = '<span><b>↑↓</b> navigate</span><span><b>↵</b> open</span><span><b>⇧↵</b> new tab</span><span><b>esc</b> normal mode</span>';

  // Reflects mode/ui/help into the chip, placeholder, footer and root state.
  function renderStatus() {
    if (!els.chip) return;
    const m = modeById(mode);
    if (help) els.chip.textContent = '? help';
    else if (ui === 'normal') els.chip.textContent = mode === 'all' ? 'NORMAL' : `NORMAL · ${m.label}`;
    else els.chip.textContent = m.label;
    els.chip.dataset.ui = help ? 'help' : ui;
    els.inp.readOnly = ui === 'normal';
    els.inp.placeholder = ui === 'normal' ? 'Press t/h/b/a to scope · / to search · ? for help' : searchPlaceholder();
    els.foot.innerHTML = help ? '<span><b>?</b> or <b>esc</b> to close help</span>' : (ui === 'normal' ? NORMAL_FOOTER : SEARCH_FOOTER);
  }
  function setUI(next) {
    if (next === 'normal' && help) help = false;
    ui = next;
    if (ui === 'search') setTimeout(() => els.inp.focus(), 0);
    else els.inp.blur();
    renderStatus();
  }
  function setHelp(on) {
    help = on;
    if (on) els.inp.blur();
    else if (ui === 'search') setTimeout(() => els.inp.focus(), 0);
    renderStatus();
    render();
  }
  // NORMAL-mode command dispatch (also used while help is open).
  function handleCmdKey(e) {
    if (help) {
      if (e.key === '?' || e.key === 'Escape' || e.key === 'q') setHelp(false);
      return;
    }
    const intent = commandIntent(e.key);
    if (!intent) return;
    switch (intent.type) {
      case 'help': setHelp(true); break;
      case 'mode': mode = intent.mode; setUI('search'); refresh(els.inp.value); break;
      case 'search': setUI('search'); break;
      case 'move': setSel(sel + intent.delta); break;
      case 'choose': choose(e); break;
      case 'escape':
        if (mode !== 'all') { mode = 'all'; renderStatus(); refresh(els.inp.value); }
        else close();
        break;
      case 'close': close(); break;
    }
  }

  // Fetches palette.css (exposed via web_accessible_resources) and applies it
  // as a constructable stylesheet so there's no unstyled flash; falls back to a
  // <style> tag. Re-run on every open so edits apply without a page reload.
  let shadowSheet = null;
  function fontFaces() {
    // Inter is bundled; remote fonts are blocked by the extension CSP and
    // relative URLs would resolve against the page, so use absolute ext URLs.
    return [400, 500, 600].map(w =>
      `@font-face{font-family:'Inter';font-style:normal;font-weight:${w};font-display:swap;` +
      `src:url(${chrome.runtime.getURL(`fonts/inter-${w}.woff2`)}) format('woff2');}`
    ).join('');
  }
  async function loadShadowCss() {
    if (!shadow) return;
    try {
      const res = await fetch(chrome.runtime.getURL('palette.css'), { cache: 'no-store' });
      if (!res.ok) return;
      const css = fontFaces() + await res.text();
      try {
        if (!shadowSheet) {
          shadowSheet = new CSSStyleSheet();
          shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, shadowSheet];
        }
        shadowSheet.replaceSync(css);
        if (els.css) els.css.textContent = '';
      } catch {
        if (els.css) els.css.textContent = css;
      }
    } catch (err) {
      console.warn('[CommandK] palette.css could not load:', err);
    }
  }

  // ---------- open/close ----------
  function toggle() { open ? close() : openPal(); }
  async function openPal() {
    if (!host) buildShell();
    open = true; sel = 0;
    mode = 'all'; ui = 'search'; help = false;
    host.style.display = 'block';
    // wait for mount on first run
    for (let i = 0; i < 20 && !els.inp; i++) await new Promise(r => setTimeout(r, 50));
    loadShadowCss();
    els.inp.value = '';
    setUI('search');
    await refresh('');
  }
  function close() { open = false; if (host) host.style.display = 'none'; }

  // ---------- data ----------
  async function refresh(q) {
    const d = await fetchData(q);
    if (d) cache = d;
    filtered = buildItems(q, mode, cache, { engine }).slice(0, 60);
    sel = 0; render();
  }

  // ---------- render ----------
  function render() {
    if (!els.list) return;
    if (help) { els.list.innerHTML = helpHtml(); return; }
    els.list.innerHTML = filtered.length
      ? itemsHtml(filtered, sel, window.PHOSPHOR || {})
      : emptyHtml(mode, els.inp.value, engine);
    els.list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  // Moving the highlight must not touch innerHTML — rebuilding the list
  // recreates the favicon <img> nodes and makes them reload/flash.
  function setSel(n) {
    sel = Math.max(0, Math.min(n, filtered.length - 1));
    const nodes = els.list.querySelectorAll('.cmdk-item');
    nodes.forEach((el, i) => el.classList.toggle('selected', i === sel));
    nodes[sel]?.scrollIntoView({ block: 'nearest' });
  }

  function onInput() {
    clearTimeout(debounce);
    debounce = setTimeout(() => refresh(els.inp.value), 140);
  }
  function onKey(e) {
    e.stopPropagation(); // palette keystrokes never bubble out to the page
    if (e.key === 'Tab') { e.preventDefault(); return; } // focus trap
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(sel - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(e); }
    else if (e.key === 'Escape') { e.preventDefault(); setUI('normal'); }
    else if (e.key === '?' && !els.inp.value) { e.preventDefault(); setHelp(true); }
  }

  async function choose(e) {
    const it = filtered[sel];
    const q = els.inp.value;
    if (!it) {
      if (q.trim() && mode === 'all') openResult(ENGINES[engine](q.trim()), e);
      return;
    }
    const newTab = e.shiftKey, bg = e.ctrlKey || e.metaKey;
    if (it.kind === 'tab') {
      close();
      await chrome.runtime.sendMessage({ type: 'EXEC', action: 'switch-tab', payload: { tabId: it.tabId, windowId: it.windowId } });
    } else if (it.kind === 'calc') {
      try { await navigator.clipboard.writeText(it.value); } catch {}
      toast(`Copied ${it.value}`); close();
    } else if (it.kind === 'action') {
      const def = it.def;
      if (def.id === 'engine') {
        engine = nextEngine(engine);
        chrome.storage?.local.set({ engine });
        els.inp.value = '';
        refresh('');
        toast(`Search engine: ${engine}`);
        return;
      }
      close();
      if (def.local) { try { await def.local(); } catch {} return; }
      routeAction(def.id);
    } else {
      openResult(it.url, e, newTab, bg);
    }
  }

  async function openResult(url, e, newTab, bg) {
    close();
    if (newTab || bg) await chrome.runtime.sendMessage({ type: 'NEW_TAB', url }).catch(() => window.open(url, '_blank'));
    else await chrome.runtime.sendMessage({ type: 'OPEN_URL', url }).catch(() => location.href = url);
  }

  // Exec metadata lives on the ACTIONS registry; no per-host switch needed.
  function routeAction(id) {
    const def = actionById(id);
    if (!def?.exec) return;
    return chrome.runtime.sendMessage({ type: 'EXEC', action: def.exec, payload: { ...(def.payload || {}) } }).catch(() => {});
  }

  // ---------- keyboard containment ----------
  // Page and content-script events share one propagation path, so while the
  // palette is modal we swallow page keystrokes and let our own handlers see
  // everything from inside the shadow host.
  const isPaletteEvent = e => {
    try {
      const p = e.composedPath && e.composedPath();
      if (p) return !!host && p.includes(host);
    } catch {}
    return !!(host && (e.target === host || (host.contains && host.contains(e.target))));
  };
  function containKeyboard(e) {
    // Use e.code, not e.key: Shift+K doesn't always produce "K" on every layout.
    if (e.type === 'keydown' && (e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyK') {
      if (!e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        toggle();
      }
      return;
    }
    if (!open) return;
    if (isPaletteEvent(e)) return;
    // NORMAL/help: the input is blurred, so page keys are commands. Leave
    // modifier combos (Cmd+L, …) to the browser.
    if (ui === 'normal' || help) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.type === 'keydown') handleCmdKey(e);
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (!(e.key && /^F\d{1,2}$/.test(e.key))) e.preventDefault();
      return;
    }
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    // Block page defaults behind the modal (scroll, focus move, activation),
    // but never F-keys.
    if (!(e.key && /^F\d{1,2}$/.test(e.key))) e.preventDefault();
    // If focus slipped out of the palette, pull it back.
    if (e.type === 'keydown' && els.inp) {
      try { els.inp.focus({ preventScroll: true }); } catch {}
    }
  }
  for (const type of ['keydown', 'keypress', 'keyup']) {
    window.addEventListener(type, containKeyboard, true);
  }

  chrome.runtime?.onMessage.addListener(msg => { if (msg.type === 'TOGGLE_PALETTE') toggle(); });

  buildShell();
})();
