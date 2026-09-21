# Changelog

## Unreleased

- A shortcut pressed where the selector matches nothing is now ignored instead of moving the stored zoom level. Cursor's Agents window renders a composer the default selector cannot reach on its new-chat screen, so presses there looked like no-ops and then landed all at once on the next conversation opened

## 0.1.1

- Fixed the generated script never running. Its settings block was not terminated with a semicolon, so the runtime's leading `(` continued the statement and called the settings object, throwing before any shortcut was registered
- The runtime now opens and closes with a semicolon, so a neighbouring Custom UI Style import cannot break it the same way

## 0.1.0

Initial release.

- Grow, shrink and reset the Cursor composer with a keyboard shortcut, applied instantly with no reload
- Independent zoom levels for the IDE window and the Agents window, with an option to share one level
- Configurable step, bounds, default level, modifiers, key codes and target selector
- Platform-aware default modifiers: Cmd+Alt on macOS, Ctrl+Alt elsewhere
- Delegates workbench injection to Custom UI Style rather than patching Cursor directly
