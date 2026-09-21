# Composer Zoom

Resize Cursor's chat pane with a keyboard shortcut. Replies, code blocks and the composer all scale together, so the text you read gets bigger along with the text you type. The change is instant — no settings file to edit, no window reload, no restart. The IDE window and the Agents window each remember their own zoom level.

![Growing, shrinking and resetting the chat pane with the keyboard](https://raw.githubusercontent.com/AbdElrahmanMSalim/composer-zoom/main/media/demo.gif)

Cursor 3's Agents window keeps its prompt input in a separate part of the page, so it is named separately in the default selector and scales along with the replies:

![The Agents window replies and prompt input at several zoom levels](https://raw.githubusercontent.com/AbdElrahmanMSalim/composer-zoom/main/media/demo-agents.gif)

| Shortcut (macOS) | Shortcut (Windows / Linux) | Action |
| --- | --- | --- |
| <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>=</kbd> | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>=</kbd> | Grow the chat pane |
| <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>-</kbd> | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>-</kbd> | Shrink the chat pane |
| <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>0</kbd> | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>0</kbd> | Reset to the default zoom |

On macOS that's Command and Option. Shift is ignored, so reaching for <kbd>+</kbd> with Shift held works the same as the unshifted key.

## Installing

Install from the extensions pane and accept the one-time reload prompt. That's it.

Cursor exposes no API for styling its own interface, so the actual resizing is done by a small script injected into Cursor's UI. This extension does not do that injection itself — it delegates to [Custom UI Style](https://open-vsx.org/extension/subframe7536/custom-ui-style), which is declared as a dependency and installs automatically. That extension owns the risky parts: patching Cursor's application files, keeping the integrity checksums in `product.json` consistent, backing up the originals, and re-applying after a Cursor update. This extension only generates the script from your settings and registers it, which keeps it small and reviewable.

The one-time reload prompt comes from Custom UI Style applying the patch. After that, zooming is instant and no further reloads are needed unless you change a setting.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `composerZoom.defaultZoom` | `1.7` | Level used before anything is set, and the target of the reset shortcut |
| `composerZoom.step` | `0.1` | How much each keypress changes the zoom |
| `composerZoom.minZoom` | `1` | Lower bound, so the composer can't shrink out of sight |
| `composerZoom.maxZoom` | `3` | Upper bound, so the composer can't overflow the window |
| `composerZoom.separatePerWindow` | `true` | Keep separate levels for the IDE and Agents windows; turn off to share one |
| `composerZoom.selector` | `.composer-bar[data-composer-status], .agent-prompt-input-root` | Elements to zoom; change only if a Cursor update renames one |
| `composerZoom.modifiers` | `[]` | Required modifiers. Empty means the platform default |
| `composerZoom.growKey` | `Equal` | [`KeyboardEvent.code`](https://developer.mozilla.org/docs/Web/API/UI_Events/Keyboard_event_code_values) that grows |
| `composerZoom.shrinkKey` | `Minus` | `KeyboardEvent.code` that shrinks |
| `composerZoom.resetKey` | `Digit0` | `KeyboardEvent.code` that resets |

Changing any setting regenerates the injected script, so you'll be prompted to reload once for it to take effect.

Keys are matched on `KeyboardEvent.code` rather than the character produced, because macOS turns <kbd>⌥</kbd>+<kbd>=</kbd> into `≠` and <kbd>⌥</kbd>+<kbd>-</kbd> into `–`.

The `modifiers` values are DOM names: `meta` is Command (⌘) on macOS, and `alt` is the Option (⌥) key.

## Commands

- **Composer Zoom: Apply Settings and Reload** — regenerate and re-register the script, then reload. Use this if the shortcuts stop responding, such as after a Cursor update.
- **Composer Zoom: Remove Injected Script** — deregister the script so Cursor is left untouched.

## How the two windows are told apart

The IDE window and the Agents window both load the same `workbench.html`, so the same script runs in both. They're distinguished by workbench structure: the IDE window renders an editor area, activity bar, sidebar and panel, while the Agents window renders none of them. Matching on any one of the four means hiding your panel or activity bar can't confuse it.

Because the workbench boots asynchronously, an IDE window has no parts yet at load and momentarily looks like the Agents window. The script re-resolves as the UI fills in and again on every keypress, by which point the answer is unambiguous.

## Known limitations

Shortcuts don't fire while focus is inside an iframe-based panel, such as the built-in browser preview, because the keystroke never reaches the workbench window. Click back into the editor or chat and they respond again.

A Cursor update replaces the application files and removes the patch. Custom UI Style detects this and offers to re-apply; if the shortcuts are dead after an update, that prompt was likely dismissed. Run **Composer Zoom: Apply Settings and Reload** to restore it.

Because Cursor's DOM is internal and unversioned, a future release could rename either element the default selector names. The `composerZoom.selector` setting exists as an escape hatch so you don't have to wait for an extension update.

The default names two elements because Cursor's two layouts differ. The classic workbench nests the input inside the chat pane, so zooming the pane carries the input with it. Cursor 3's Agents window mounts its prompt input in a separate subtree, so it has to be named on its own. Nothing is zoomed twice, since `.agent-prompt-input-root` exists only in the Agents layout.

## Development

```bash
npm install
npm run build         # compile the extension host
npm run test:runtime  # exercise the injected script under a stubbed DOM
npm run package       # produce a .vsix
```

The code is in two halves that cannot see each other. `src/` is the extension host: it runs in Node, reads your settings, generates the script into global storage, and registers it with Custom UI Style. `runtime/composerZoom.js` is the injected half: it runs in Cursor's UI process with DOM access, and receives settings through a generated `window.__composerZoomConfig` prelude.

`test/runtime.test.js` exercises the runtime under a stubbed DOM, covering the window detection, the boot race, step math and clamping, modifier matching, and cross-window sync.

## License

MIT
