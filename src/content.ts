/* CommandK overlay — injected on every page, renders into a shadow root. */
import { api } from './platform.js';
import { PHOSPHOR } from './phosphor-icons.js';
import { actionById } from './actions/registry.js';
import { createPaletteController } from './palette/controller.js';

(() => {
  if ((window as unknown as { __cmdk_injected?: boolean }).__cmdk_injected) return;
  (window as unknown as { __cmdk_injected: boolean }).__cmdk_injected = true;

  let host: HTMLElement | null = null;
  let shadow: ShadowRoot | null = null;
  const els: Record<string, HTMLElement> = {};
  let open = false;
  let palette: ReturnType<typeof createPaletteController> | null = null;
  let shadowSheet: CSSStyleSheet | null = null;

  function toast(msg: string): void {
    if (!els.inp) return;
    (els.inp as HTMLInputElement).value = '';
    (els.inp as HTMLInputElement).placeholder = msg;
    setTimeout(() => {
      if (palette && !palette.help && palette.ui === 'search')
        (els.inp as HTMLInputElement).placeholder = palette.mode ? '' : '';
      palette?.renderStatus();
    }, 1500);
  }

  function buildShell(): void {
    host = document.createElement('div');
    host.id = 'cmdk-host';
    shadow = host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);

    const mount = (): void => {
      if (!shadow) return;
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
      els.ov = shadow.getElementById('ov') as HTMLElement;
      els.css = shadow.getElementById('cmdk-css') as HTMLElement;
      els.inp = shadow.getElementById('inp') as HTMLElement;
      els.list = shadow.getElementById('list') as HTMLElement;
      els.chip = shadow.getElementById('chip') as HTMLElement;
      els.foot = shadow.getElementById('foot') as HTMLElement;
      els.ov.addEventListener('mousedown', (e) => {
        if ((e.target as HTMLElement).id === 'ov' || (e.target as HTMLElement).className === 'cmdk-overlay') close();
      });

      palette = createPaletteController({
        includePageOnly: true,
        input: els.inp as HTMLInputElement,
        list: els.list,
        chip: els.chip,
        hints: els.foot,
        PH: PHOSPHOR as unknown as Record<string, string>,
        onClose: close,
        onToast: toast,
        onOpenUrl: async (url, _e, newTab, bg) => {
          close();
          if (newTab || bg)
            await api.runtime
              .sendMessage({ type: 'NEW_TAB', url } as unknown as never)
              .catch(() => window.open(url, '_blank'));
          else
            await api.runtime
              .sendMessage({ type: 'OPEN_URL', url } as unknown as never)
              .catch(() => (location.href = url));
        },
        onAction: async (id) => {
          const def = actionById(id);
          if (!def?.exec) return;
          close();
          if (def.before) await def.before();
          return api.runtime
            .sendMessage({
              type: 'EXEC',
              action: def.exec,
              payload: { ...(def.payload as Record<string, unknown>) },
            } as unknown as never)
            .catch(() => {});
        },
      });
      palette.bind();
      void loadShadowCss();
      palette.renderStatus();
    };
    mount();
  }

  function fontFaces(): string {
    return [400, 500, 600]
      .map(
        (w) =>
          `@font-face{font-family:'Inter';font-style:normal;font-weight:${w};font-display:swap;` +
          `src:url(${api.runtime.getURL(`fonts/inter-${w}.woff2`)}) format('woff2');}`,
      )
      .join('');
  }
  async function loadShadowCss(): Promise<void> {
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

  function toggle(): void {
    if (open) close();
    else void openPal();
  }
  async function openPal(): Promise<void> {
    if (!host) buildShell();
    open = true;
    if (palette) {
      palette.mode = 'all';
      palette.setHelp(false);
      palette.setUI('search');
    }
    host!.setAttribute('data-open', '');
    for (let i = 0; i < 20 && !els.inp; i++) await new Promise((r) => setTimeout(r, 50));
    void loadShadowCss();
    (els.inp as HTMLInputElement).value = '';
    palette?.setUI('search');
    await palette?.refresh('');
  }
  function close(): void {
    open = false;
    if (host) host.removeAttribute('data-open');
  }

  const isPaletteEvent = (e: Event): boolean => {
    try {
      const p = (e as unknown as { composedPath?: () => EventTarget[] }).composedPath?.();
      if (p) return !!host && p.includes(host);
    } catch {}
    return !!(host && ((e.target as Node) === host || (host.contains && host.contains(e.target as Node))));
  };
  function containKeyboard(e: KeyboardEvent): void {
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
        (els.inp as HTMLInputElement).focus({ preventScroll: true });
      } catch {}
    }
  }
  for (const type of ['keydown', 'keypress', 'keyup'] as const) {
    window.addEventListener(type, containKeyboard as EventListener, true);
  }

  api.runtime.onMessage.addListener((msg: { type: string }) => {
    if (msg.type === 'TOGGLE_PALETTE') toggle();
  });

  buildShell();
})();
