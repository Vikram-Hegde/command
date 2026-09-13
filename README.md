# CommandK

A fast, keyboard-first command palette for Chrome and Firefox — tabs, history, bookmarks, actions, and a calculator in one `⌘K` overlay. Manifest V3, zero runtime dependencies, bundled with [tsdown](https://tsdown.dev) and linted/formatted with the oxc toolchain.

Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> (<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> on macOS) on any page:

- **Search everything** — open tabs, history, bookmarks, and actions, ranked by relevance.
- **Scope with modes** — vim-style scopes for tabs, history, bookmarks, or actions.
- **Do the math** — type `12 * (3 + 4)` and hit Enter to copy the result.
- **Act on the current tab** — mute, pin, duplicate, discard, screenshot, group, close others, and more.
- **Go anywhere** — type a URL to open it, or free text to search your engine.

<p align="center"><em>Tip: the extension also ships a mini palette in the toolbar popup that works on <code>chrome://</code>, error, and store pages where content scripts are blocked.</em></p>

## Install (load unpacked)

The extension is not on the Chrome Web Store or AMO yet. To run it from source:

```sh
pnpm install
pnpm build         # writes dist/chrome and dist/firefox
```

**Chrome / Edge / Brave / Arc:** open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select `dist/chrome`.

**Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and select `dist/firefox/manifest.json`. To develop with auto-reload, run `pnpm run:firefox` instead.

Then press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> to open the palette. In Firefox, if <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> is grabbed by the Web Console, rebind it at `about:addons` → gear → **Manage Extension Shortcuts**.

### Permanent Firefox install

Firefox Release only installs **signed** add-ons, so a temporary load disappears on restart. To keep it permanently:

- **Sign it yourself (regular Firefox):** create API keys at [AMO](https://addons.mozilla.org/developers/addon/api/key/), then
  ```sh
  export AMO_API_KEY=... AMO_API_SECRET=...
  pnpm sign:firefox
  ```
  and install the resulting `.xpi` via `about:addons` → gear → **Install Add-on From File…**. Unlisted add-ons aren't searchable on AMO but are signed and auto-update.
- **Firefox Developer Edition / Nightly:** set `xpinstall.signatures.required` to `false` in `about:config`, run `pnpm package:firefox`, rename the generated `.zip` to `.xpi`, and install it from file.

## Keyboard reference

The palette opens in **SEARCH** mode. Press <kbd>Esc</kbd> to enter **NORMAL** mode, where single keys are commands.

### Modes (in NORMAL)

| Key | Scope                       |
| --- | --------------------------- |
| `t` | Open tabs                   |
| `h` | History and recently closed |
| `b` | Bookmarks                   |
| `a` | Browser actions             |
| `/` | Search everything           |
| `i` | Search the current scope    |
| `?` | Toggle the help cheatsheet  |

### Navigation

| Key                                           | Action                                |
| --------------------------------------------- | ------------------------------------- |
| <kbd>↑</kbd>/<kbd>↓</kbd> or `j`/`k`          | Move selection                        |
| <kbd>Enter</kbd>                              | Open                                  |
| <kbd>Shift</kbd>+<kbd>Enter</kbd>             | Open in a new tab                     |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> | Open in background                    |
| <kbd>Esc</kbd>                                | Back one step (help → NORMAL → close) |
| `q`                                           | Close palette                         |

## Features

- **One ranked list** — open tabs always come first, then matching actions, bookmarks, and history. A typed URL is pinned near the top; the generic "search the web" row is the fallback at the bottom.
- **Fuzzy matching** — subsequence scoring that favors word boundaries and consecutive runs.
- **Scoped modes** — narrow the list to just tabs or just history without leaving the keyboard.
- **Calculator** — a safe recursive-descent evaluator (no `eval`): `+ - * / ^`, parentheses, decimals, unary minus, and postfix `%`.
- **Vim-style help** — press `?` for a cheatsheet of every shortcut.
- **Favicons** — falls back through the tab icon, Chrome's icon cache, and a favicon service, down to a clean glyph.
- **Works everywhere** — the overlay injects into normal pages; the popup mini palette covers restricted pages.

## Permissions

CommandK asks for broad permissions because a command palette needs to see your browsing context. Here's exactly why each one is used:

| Permission                    | Why                                                 |
| ----------------------------- | --------------------------------------------------- |
| `tabs`                        | List, switch, and manage open tabs                  |
| `history`                     | Search browsing history                             |
| `bookmarks`                   | Read bookmarks                                      |
| `sessions`                    | Reopen recently closed tabs                         |
| `downloads`                   | Save screenshots                                    |
| `favicon`                     | Read icons from Chrome's favicon cache              |
| `storage`                     | Remember your chosen search engine                  |
| `activeTab`, `scripting`      | Inject the overlay into the current tab when needed |
| `<all_urls>` (content script) | Show the `⌘K` overlay on any page you're on         |

`favicon` is Chrome-only; the Firefox build omits it and falls back to the tab's own icon. In Firefox, host permissions are revocable, so if the overlay stops appearing, re-grant access from the add-on's Permissions tab.

**Privacy:** everything runs locally in your browser. CommandK sends no data to any server, has no analytics, and only talks to Chrome's own extension APIs. The favicon fallback requests an icon from `google.com/s2/favicons` for sites whose icon isn't in Chrome's cache — nothing else leaves your machine.

## Development

`pnpm build` runs tsdown (Rolldown) to produce one self-contained IIFE per entry
point in `build/`, then assembles `dist/chrome` and `dist/firefox` with the right
manifest and static assets (Chrome's service worker vs. Firefox's event page).
Reload the extension after editing. The overlay re-fetches `palette.css` on every
open, so CSS changes show up without reloading the page.

Commands:

- `pnpm build` — bundle and assemble both targets.
- `pnpm dev` — rebuild the JS bundles in watch mode.
- `pnpm test` — verify capabilities and action gating for both engines.
- `pnpm typecheck` — JSDoc type-checking via `tsc` (`checkJs` + `@types/chrome`).
- `pnpm lint` / `pnpm lint:fix` — oxlint.
- `pnpm format` / `pnpm format:check` — oxfmt.
- `pnpm run:firefox` — build and launch a temporary Firefox profile.
- `pnpm package:firefox` — build a zip in `dist/` via `web-ext`.

### Cross-browser architecture

`src/platform.js` is the single source of truth for engine differences. It
exports a capability object plus a few adapters:

```js
import { caps, page, saveImage, beforeCapture } from './platform.js';

caps; // { faviconCache, canDiscard, canGroup, dataUrlDownloads, captureNeedsRepaint }
page('settings'); // chrome://settings vs about:preferences
saveImage(dataUrl, filename); // data: vs blob: downloads
beforeCapture(); // repaint wait where needed
```

Generic code depends on capability names, never on the browser. An action
declares `requires: 'canDiscard'` or `before: beforeCapture` in the registry
(`src/shared.js`) and is hidden or hooked accordingly. Adding a third engine
means writing one adapter and a manifest, not editing call sites. `pnpm test`
loads `platform.js` and `shared.js` under both manifest profiles and asserts the
expected capabilities, action visibility, and wiring, so a change for one
browser can't silently regress the other.

## Credits

Icons from [Phosphor Icons](https://github.com/phosphor-icons/core) (MIT). Typeface is [Inter](https://github.com/rsms/inter) (SIL Open Font License). See [THIRD_PARTY.md](THIRD_PARTY.md).

## License

[MIT](LICENSE)
