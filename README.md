# CommandK

A fast, keyboard-first command palette for Chrome — tabs, history, bookmarks, actions, and a calculator in one `⌘K` overlay. Built as a Manifest V3 extension with no build step and no dependencies.

Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> (<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> on macOS) on any page:

- **Search everything** — open tabs, history, bookmarks, and actions, ranked by relevance.
- **Scope with modes** — vim-style scopes for tabs, history, bookmarks, or actions.
- **Do the math** — type `12 * (3 + 4)` and hit Enter to copy the result.
- **Act on the current tab** — mute, pin, duplicate, discard, screenshot, group, close others, and more.
- **Go anywhere** — type a URL to open it, or free text to search your engine.

<p align="center"><em>Tip: the extension also ships a mini palette in the toolbar popup that works on <code>chrome://</code>, error, and store pages where content scripts are blocked.</em></p>

## Install (load unpacked)

The extension is not on the Chrome Web Store yet. To run it locally:

1. Clone this repo.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the repo folder.
4. Press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> to open the palette.

Works in any Chromium-based browser (Chrome, Edge, Brave, Arc, …).

## Keyboard reference

The palette opens in **SEARCH** mode. Press <kbd>Esc</kbd> to enter **NORMAL** mode, where single keys are commands.

### Modes (in NORMAL)

| Key | Scope |
| --- | --- |
| `t` | Open tabs |
| `h` | History and recently closed |
| `b` | Bookmarks |
| `a` | Browser actions |
| `/` | Search everything |
| `i` | Search the current scope |
| `?` | Toggle the help cheatsheet |

### Navigation

| Key | Action |
| --- | --- |
| <kbd>↑</kbd>/<kbd>↓</kbd> or `j`/`k` | Move selection |
| <kbd>Enter</kbd> | Open |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> | Open in a new tab |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> | Open in background |
| <kbd>Esc</kbd> | Back one step (help → NORMAL → close) |
| `q` | Close palette |

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

| Permission | Why |
| --- | --- |
| `tabs` | List, switch, and manage open tabs |
| `history` | Search browsing history |
| `bookmarks` | Read bookmarks |
| `sessions` | Reopen recently closed tabs |
| `downloads` | Save screenshots |
| `favicon` | Read icons from Chrome's favicon cache |
| `storage` | Remember your chosen search engine |
| `activeTab`, `scripting` | Inject the overlay into the current tab when needed |
| `<all_urls>` (content script) | Show the `⌘K` overlay on any page you're on |

**Privacy:** everything runs locally in your browser. CommandK sends no data to any server, has no analytics, and only talks to Chrome's own extension APIs. The favicon fallback requests an icon from `google.com/s2/favicons` for sites whose icon isn't in Chrome's cache — nothing else leaves your machine.

## Project layout

| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest, permissions, content-script order |
| `shared.js` | Fuzzy matching, URL/calc helpers, action registry, result building and rendering — shared by both surfaces |
| `content.js` | The in-page overlay (shadow DOM) |
| `popup.html` / `popup.js` | The toolbar popup mini palette |
| `background.js` | Service worker: browser data and action execution |
| `palette.css` | Palette styles (adopted into the shadow root) |
| `host.css` | Positions the shadow host on the page |
| `phosphor-icons.js` | Bundled Phosphor (Bold) icon set as an SVG map |
| `fonts/` | Bundled Inter weights |

## Development

There is no build step. Edit the files and reload the extension at `chrome://extensions` (or use the reload button on the extension card). The overlay re-fetches `palette.css` on every open, so CSS changes show up without reloading the page.

## Credits

Icons from [Phosphor Icons](https://github.com/phosphor-icons/core) (MIT). Typeface is [Inter](https://github.com/rsms/inter) (SIL Open Font License). See [THIRD_PARTY.md](THIRD_PARTY.md).

## License

[MIT](LICENSE)
