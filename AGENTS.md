# AGENTS.md

Guidance for agents and humans working on CommandK. It records the principles
this codebase was built around, follow them for work.

## What this is

A keyboard-first command palette for **Chrome and Firefox** (Manifest V3): an
in-page `⌘K` overlay plus a toolbar popup, with tabs, history, bookmarks,
browser actions, and a calculator. No runtime dependencies.

## Commands

Use **pnpm** (not npm/yarn).

```sh
pnpm install
pnpm build          # tsdown bundles -> scripts/build.mjs assembles dist/<target>
pnpm dev            # tsdown watch
pnpm test           # capability-matrix test for both engines
pnpm typecheck      # tsc + checkJs + @types/chrome
pnpm lint           # oxlint
pnpm lint:fix
pnpm format         # oxfmt
pnpm format:check
pnpm run:firefox    # build + load in a temporary Firefox profile
pnpm package:firefox
pnpm sign:firefox   # AMO unlisted signing (needs AMO_API_KEY/SECRET)
```

## Architecture

- **`src/` is ESM; the shipped bundles are self-contained IIFEs.** `tsdown`
  builds one bundle per entry (`content`, `background`, `popup`). Each manifest
  lists a single script, so there is no script-order coupling.
- **No cross-file globals.** Modules `import`/`export` explicitly. Do not add a
  `globalThis` handshake or `window.PHOSPHOR`-style globals.
- **`src/platform.js` is the only browser-aware module.** Everything else
  depends on capability names, never on the browser.
- **`src/shared.js` is pure logic + the action registry + rendering.** Keep it
  DOM-free; page-only behavior lives on action handlers.
- **Data-driven actions.** Add behavior to the `ACTIONS` registry in
  `src/shared.js`, not to host switch statements:
  - `exec` / `payload` — background action to run
  - `requires` — a capability key; the action hides where unsupported
  - `before` — a hook (e.g. `beforeCapture`) run before `exec`
  - `local` — runs in the page; `pageOnly` hides it in the popup
- **Per-target manifests.** `manifest.json` (Chrome, service worker) +
  `manifest.firefox.json` (overrides: event page, no `favicon`, gecko id).
  `scripts/build.mjs` merges and emits both.

## Browser compatibility rules

- **Never branch on the browser.** Detect a capability in `platform.js`
  (`detectCaps`) and consume `caps.<name>`. No `IS_FIREFOX`.
- **Derive capabilities from the manifest, not API sniffing** — content scripts
  have no `tabs` API, so `tabs.discard`-style checks are wrong there.
- **Guard manifest reads** so a failure degrades gracefully instead of
  breaking the whole script.
- **Prefer adapters** in `platform.js` (`page`, `saveImage`, `beforeCapture`)
  over inline conditionals.
- **Test both profiles.** `scripts/test.mjs` asserts capabilities, action
  visibility, and wiring for Chrome and Firefox, and fails if an engine branch
  or global contract reappears. Extend it when you add engine-specific behavior.
- Firefox minimum is **140** (`data_collection_permissions` requires it).

## Engine gotchas already handled

- Firefox rejects `data:` URLs in `downloads.download()` → `saveImage` uses a
  `blob:` URL there; Chrome's service worker can't create object URLs and takes
  the `data:` URL directly.
- Firefox has no `tabs.discard` / `tabs.group` → gated by `canDiscard` /
  `canGroup`.
- Chrome's `captureVisibleTab` can catch the overlay still painted → the
  screenshot action uses `before: beforeCapture` (double `requestAnimationFrame`).
- Chrome-only `favicon` permission / `/_favicon/` → gated by `faviconCache`.
- `Ctrl+Shift+K` clashes with Firefox's Web Console → documented rebinding.

## Code style

- **Type with JSDoc**, checked by `tsc` (`checkJs`, `@types/chrome`). Annotate
  public functions and the action/registry shapes. Prefer `/** @type {...} */`
  casts at DOM boundaries over `any`.
- **Formatting is oxfmt's job** (120 cols, single quotes, sorted
  `package.json`). Do not hand-align; run `pnpm format`.
- **Lint with oxlint** and keep it at zero errors. Avoid being clever: prefer an
  `if`/`else` or `switch` over a side-effecting ternary; don't spread a falsy
  fallback.
- **Comments are sparse and human.** Explain _why_ for non-obvious things (CSP,
  why `e.code` over `e.key`, favicon fallback order, the blob/repaint quirks).
  No obvious "what" comments, no AI/tooling artifacts, no "(see file X)" clutter.
- **Rendering:** escape interpolated text (`escHtml`), never use inline event
  handlers (strict CSP blocks them), and use capture-phase delegation for
  `img` error fallbacks.
- **Selection changes must not rebuild `innerHTML`** — toggling a class avoids
  reloading favicon `<img>` nodes.

## Product/UX decisions

- Palette opens in **SEARCH** mode; `Esc` enters vim-like **NORMAL** mode
  (`t`/`h`/`b`/`a` scopes, `/` search everything, `?` help, `j`/`k` navigate).
- Ranking is tiered: calculator → typed URL → real matches → the generic
  "search the web" fallback at the bottom.
- Chrome and Firefox builds share all logic; only manifests and `platform.js`
  differ.

## Before committing

Run the full gate and make sure it is green:

```sh
pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

For runtime-visible changes, also load the build (`pnpm run:firefox` or load
`dist/chrome` unpacked) and sanity-check the palette.

## Commits

- Commit only when asked. Never commit `dist/`, `build/`, or `node_modules/`
  (see `.gitignore`); `pnpm-lock.yaml` **is** committed.
- Write concise, descriptive messages (imperative subject, bullet body for
  multi-part changes). Keep each commit focused.
