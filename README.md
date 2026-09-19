# CommandK

You get a keyboard-first palette for Chrome and Firefox. Press `⌘K` to search tabs, history, bookmarks, and actions, or run calculations. It targets Manifest V3, ships with no runtime dependencies, and builds with tsdown and oxc.

Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> (<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> on macOS) on any page:

- **Search everything:** open tabs, history, bookmarks, and actions ranked by relevance.
- **Scope with modes:** use vim-style scopes for tabs, history, bookmarks, or actions.
- **Do the math:** type `12 * (3 + 4)` and hit Enter to copy the result.
- **Act on the current tab:** mute, pin, duplicate, discard, screenshot, group, close others, and more.
- **Go anywhere:** type a URL to open it, or type free text to search your engine.

<p align="center"><em>Tip: you also get a mini palette in the toolbar popup. It works on <code>chrome://</code>, error, and store pages where Chrome blocks content scripts.</em></p>

## Install (load unpacked)

You won't find this on the Chrome Web Store or AMO yet. Build it from source:

```sh
pnpm install
pnpm build         # writes dist/chrome and dist/firefox
```

**Chrome / Edge / Brave / Arc:** open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `dist/chrome`.

**Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and pick `dist/firefox/manifest.json`. For auto-reload during development, run `pnpm run:firefox`.

Then press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> to open the palette. Firefox reserves <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> for the Web Console. If the palette does not open, rebind the shortcut at `about:addons` → gear → **Manage Extension Shortcuts**.

### Keep it after restart (Firefox)

Firefox Release blocks unsigned add-ons, so a temporary install disappears when you quit. Pick one path:

- **Sign it yourself (regular Firefox):** create API keys at [AMO](https://addons.mozilla.org/developers/addon/api/key/), then
  ```sh
  export AMO_API_KEY=... AMO_API_SECRET=...
  pnpm sign:firefox
  ```
  Install the `.xpi` it produces via `about:addons` → gear → **Install Add-on From File**. AMO lists unlisted add-ons as signed and they still auto-update, you just can't search for them.
- **Developer Edition / Nightly:** set `xpinstall.signatures.required` to `false` in `about:config`, run `pnpm package:firefox`, rename the `.zip` to `.xpi`, and install it from file.

## Keyboard reference

You start in **SEARCH** mode. Press <kbd>Esc</kbd> to switch to **NORMAL** mode and use single keys as commands.

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

- **One ranked list:** you see open tabs first, then matching actions, bookmarks, and history. The palette pins a typed URL near the top and keeps the generic “search the web” row at the bottom as fallback.
- **Fuzzy matching:** the palette scores by word boundaries and consecutive runs, so `gh` finds GitHub.
- **Scoped modes:** you narrow the list to tabs or history without lifting your hands from the keyboard.
- **Calculator:** a safe recursive-descent evaluator with no `eval`. It handles `+ - * / ^`, parentheses, decimals, unary minus, and postfix `%`.
- **Vim-style help:** press `?` for a cheatsheet of all shortcuts.
- **Favicons:** you get the tab icon first, then Chrome’s cache, then a favicon service, then a glyph.
- **Works where you need it:** the overlay runs on normal pages, the toolbar popup covers pages where Chrome blocks scripts.

## Permissions

CommandK needs broad permissions because a palette has to read your browsing context. You grant each one to:

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

`favicon` ships on Chrome alone. Firefox builds omit it and use the tab’s own icon. You can revoke host permissions in Firefox, so if the overlay stops showing, re-enable access in the add-on’s Permissions tab.

**Privacy:** everything stays on your machine. CommandK sends nothing to a server and collects no analytics. It calls Chrome’s extension APIs and nothing else. For sites missing an icon in Chrome’s cache, it fetches one from `google.com/s2/favicons`. Nothing else leaves your browser.

## Development

Run `pnpm build`. tsdown bundles each entry as a self-contained IIFE in `build/`, then the build script assembles `dist/chrome` and `dist/firefox` with the right manifest and assets. Chrome gets a service worker, Firefox gets an event page. Reload the extension after you edit. The overlay fetches `palette.css` again on each open, so you see CSS changes without a page reload.

Commands:

- `pnpm build`: bundle and assemble both targets.
- `pnpm dev`: rebuild the bundles in watch mode.
- `pnpm test`: check capabilities and action gating for both engines.
- `pnpm typecheck`: run `tsc` with `strict` and `@types/chrome`.
- `pnpm lint` / `pnpm lint:fix`: oxlint.
- `pnpm format` / `pnpm format:check`: oxfmt.
- `pnpm run:firefox`: build and launch a temp Firefox profile.
- `pnpm package:firefox`: build a zip in `dist/` with `web-ext`.

### Cross-browser architecture

`src/platform.ts` holds all engine differences. It exports a capability object and a few adapters:

```ts
import { caps, page, saveImage, beforeCapture } from './platform.js';

caps; // { faviconCache, canDiscard, canGroup, dataUrlDownloads, captureNeedsRepaint }
page('settings'); // chrome://settings vs about:preferences
saveImage(dataUrl, filename); // data: vs blob: downloads
beforeCapture(); // repaint wait where needed
```

You write generic code against capability names, never against a browser name. You tag an action with `requires: 'canDiscard'` or `before: beforeCapture` in `src/shared.ts`, and the palette hides it or runs the hook as needed. To support a third engine, you add one adapter and a manifest. You don't touch call sites. The test suite loads `platform.ts` and `shared.ts` under both manifests and checks capabilities, action visibility, and wiring, so a fix for one browser can't break the other.

## Credits

Icons from [Phosphor Icons](https://github.com/phosphor-icons/core) (MIT). Typeface is [Inter](https://github.com/rsms/inter) (SIL Open Font License). See [THIRD_PARTY.md](THIRD_PARTY.md).

## License

[MIT](LICENSE)
