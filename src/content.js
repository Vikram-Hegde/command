// @ts-check
/* CommandK overlay — injected on every page, renders into a shadow root. */
import { api } from './platform.js';
import { PHOSPHOR } from './phosphor-icons.js';
import { actionById } from './actions/registry.js';
import { createPaletteController } from './palette/controller.js';

(() => {
  if (window.__cmdk_injected) return;
  window.__cmdk_injected = true;

  let host = null;
  let shadow = null;
  /** @type {any} */
  let els = {};
  let open = false;
  /** @type {ReturnType<typeof createPaletteController> | null} */
  let palette = null;
  let shadowSheet = null;

  function toast(msg) {
    if (!els.inp) return;
    els.inp.value = '';
    els.inp.placeholder = msg;
    setTimeout(() => {
      if (palette && !palette.help && palette.ui === 'search') els.inp.placeholder = palette.mode ? '' : '';
      palette?.renderStatus();
    }, 1500);
  }

  function buildShell() {
    host = document.createElement('div');
    host.id = 'cmdk-host';
    shadow = host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);

    const mount = () => {
      shadow.innerHTML = `
        <style id="cmdk-css"></style>
        <div class="cmdk-overlay" id="ov">
          <div class="cmdk-palette" id="pal" role="dialog" aria-label="Command palette">
            <div class="cmdk-input-row">
              <span class="cmdk-icon">${PHOSPHOR.command || '⌘'}</span>
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
      els.ov.addEventListener('mousedown', (e) => {
        if (e.target.id === 'ov' || e.target.className === 'cmdk-overlay') close();
      });

      palette = createPaletteController({
        includePageOnly: true,
        input: els.inp,
        list: els.list,
        chip: els.chip,
        hints: els.foot,
        PH: PHOSPHOR,
        onClose: close,
        onToast: toast,
        onOpenUrl: async (url, _e, newTab, bg) => {
          close();
          if (newTab || bg)
            await api.runtime.sendMessage({ type: 'NEW_TAB', url }).catch(() => window.open(url, '_blank'));
          else await api.runtime.sendMessage({ type: 'OPEN_URL', url }).catch(() => (location.href = url));
        },
        onAction: async (id) => {
          const def = actionById(id);
          if (!def?.exec) return;
          close();
          // e.g. screenshot asks platform to let overlay repaint
          if (def.before) await def.before();
          return api.runtime
            .sendMessage({ type: 'EXEC', action: def.exec, payload: { ...def.payload } })
            .catch(() => {});
        },
      });
      palette.bind();
      // focus trap + NORMAL mode click handling already bound by controller
      loadShadowCss();
      palette.renderStatus();
    };
    mount();
  }

  function fontFaces() {
    return [400, 500, 600]
      .map(
        (w) =>
          `@font-face{font-family:'Inter';font-style:normal;font-weight:${w};font-display:swap;` +
          `src:url(${api.runtime.getURL(`fonts/inter-${w}.woff2`)}) format('woff2');}`,
      )
      .join('');
  }
  async function loadShadowCss() {
    if (!shadow) return;
    try {
      const res = await fetch(api.runtime.getURL('palette.css'), { cache: 'no-store' });
      if (!res.ok) return;
      const css = fontFaces() + (await res.text());
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

  function toggle() {
    if (open) close();
    else openPal();
  }
  async function openPal() {
    if (!host) buildShell();
    open = true;
    if (palette) {
      palette.mode = 'all';
      palette.setHelp(false);
      // reset UI to search
      palette.setUI('search');
    }
    host.setAttribute('data-open', '');
    for (let i = 0; i < 20 && !els.inp; i++) await new Promise((r) => setTimeout(r, 50));
    loadShadowCss();
    els.inp.value = '';
    palette?.setUI('search');
    await palette?.refresh('');
  }
  function close() {
    open = false;
    if (host) host.removeAttribute('data-open');
  }

  // ---------- keyboard containment ----------
  const isPaletteEvent = (e) => {
    try {
      const p = e.composedPath && e.composedPath();
      if (p) return !!host && p.includes(host);
    } catch {}
    return !!(host && (e.target === host || (host.contains && host.contains(e.target))));
  };
  function containKeyboard(e) {
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
    if (palette && (palette.ui === 'normal' || palette.help)) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.type === 'keydown') palette.handleCmdKey(e);
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (!(e.key && /^F\d{1,2}$/.test(e.key))) e.preventDefault();
      return;
    }
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (!(e.key && /^F\d{1,2}$/.test(e.key))) e.preventDefault();
    if (e.type === 'keydown' && els.inp) {
      try {
        els.inp.focus({ preventScroll: true });
      } catch {}
    }
  }
  for (const type of ['keydown', 'keypress', 'keyup']) {
    window.addEventListener(type, containKeyboard, true);
  }

  api.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE_PALETTE') toggle();
  });

  buildShell();
})();
