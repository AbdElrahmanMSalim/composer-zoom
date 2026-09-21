// Runtime half of the Composer Zoom extension.
//
// Custom UI Style injects this file into Cursor's workbench, so unlike the
// extension host it runs inside the UI process and can restyle the composer the
// moment a key is pressed: no settings write, no re-patch, no restart.
//
// The extension writes a `window.__composerZoomConfig` assignment above this
// code, carrying the user's settings. Everything here lives inside an IIFE
// because Custom UI Style concatenates every injected `.js` import into one
// shared module scope, where top-level names would collide.
//
// That concatenation is also why this file opens and closes with a semicolon:
// an unterminated statement in a neighbouring import would otherwise swallow
// the IIFE below as a function call, and ours would do the same to the script
// that follows it.

;(function () {
  'use strict'

  // Two elements because Cursor's two layouts disagree about where the input
  // lives. The classic workbench nests it inside the composer bar, so one rule
  // covers replies and input together. Cursor 3's Agents window mounts the
  // prompt input in its own subtree, outside the conversation body, so it needs
  // naming separately. They are never nested in each other, so no surface ends
  // up zoomed twice: `.agent-prompt-input-root` exists only in the Agents
  // layout, and the classic input is not matched by it.
  const DEFAULTS = {
    selector: '.composer-bar[data-composer-status], .agent-prompt-input-root',
    defaultZoom: 1.7,
    step: 0.1,
    minZoom: 1,
    maxZoom: 3,
    separatePerWindow: true,
    modifiers: ['meta', 'alt'],
    growKey: 'Equal',
    shrinkKey: 'Minus',
    resetKey: 'Digit0',
  }

  const STYLE_ELEMENT_ID = 'composer-zoom-style'
  const IDE_STORAGE_KEY = 'composerZoom:ide'
  const AGENTS_STORAGE_KEY = 'composerZoom:agents'
  const SHARED_STORAGE_KEY = 'composerZoom:all'

  // Written by the standalone script this extension grew out of.
  const LEGACY_STORAGE_KEY = 'composerZoom'

  const MODIFIER_FLAGS = {
    meta: 'metaKey',
    ctrl: 'ctrlKey',
    alt: 'altKey',
    shift: 'shiftKey',
  }

  // Only the real IDE workbench builds these parts; the Agents window renders
  // none of them. Matching any one of the four means hiding the panel or the
  // activity bar cannot flip the answer.
  const IDE_PART_SELECTOR = '.part.editor, .part.activitybar, .part.sidebar, .part.panel'

  // The workbench boots asynchronously, so an IDE window has no parts yet at
  // load time and briefly looks like the Agents window. Keep re-resolving while
  // the UI fills in, then stop once the composer exists and the answer settles.
  const RESOLVE_POLL_MS = 250
  const RESOLVE_TIMEOUT_MS = 20000

  if (window.__composerZoomInstalled) return
  window.__composerZoomInstalled = true

  const config = { ...DEFAULTS, ...(window.__composerZoomConfig || {}) }
  const requiredModifiers = new Set(config.modifiers)

  let appliedStorageKey = null

  const clampZoom = (zoom) => Math.min(config.maxZoom, Math.max(config.minZoom, zoom))

  // Float addition drifts, so 1.7 + 0.1 would otherwise reach CSS as
  // 1.7999999999999998. Fixed precision keeps any step size on a clean grid.
  const snapZoom = (zoom) => Number.parseFloat(zoom.toFixed(3))

  const isIdeWindow = () => Boolean(document.querySelector(IDE_PART_SELECTOR))

  const getStorageKey = () => {
    if (!config.separatePerWindow) return SHARED_STORAGE_KEY
    return isIdeWindow() ? IDE_STORAGE_KEY : AGENTS_STORAGE_KEY
  }

  // The IDE and shared keys fall back to the legacy one so a zoom chosen before
  // the windows were told apart still carries over. The Agents window has no
  // such history and starts from the configured default.
  const readRawZoom = (key) => {
    const stored = window.localStorage.getItem(key)
    if (stored !== null) return stored
    if (key === AGENTS_STORAGE_KEY) return null
    return window.localStorage.getItem(LEGACY_STORAGE_KEY)
  }

  const readZoom = (key) => {
    const parsed = Number.parseFloat(readRawZoom(key))
    return Number.isFinite(parsed) ? clampZoom(parsed) : clampZoom(config.defaultZoom)
  }

  const getStyleElement = () => {
    const existing = document.getElementById(STYLE_ELEMENT_ID)
    if (existing) return existing

    const style = document.createElement('style')
    style.id = STYLE_ELEMENT_ID
    document.head.appendChild(style)
    return style
  }

  const renderZoom = (zoom) => {
    getStyleElement().textContent = `${config.selector} { zoom: ${zoom}; }`
  }

  const applyStoredZoom = () => {
    appliedStorageKey = getStorageKey()
    renderZoom(readZoom(appliedStorageKey))
  }

  const storeZoom = (key, zoom) => {
    appliedStorageKey = key
    renderZoom(zoom)
    window.localStorage.setItem(key, String(zoom))
  }

  // Shift is ignored unless explicitly required, so reaching for "+" with Shift
  // held behaves the same as pressing the unshifted key.
  const matchesModifiers = (event) =>
    Object.entries(MODIFIER_FLAGS).every(([name, flag]) => {
      if (requiredModifiers.has(name)) return event[flag] === true
      if (name === 'shift') return true
      return event[flag] === false
    })

  // Returns the change a keystroke asks for, or null when it is not ours.
  // Compared against `event.code` rather than `event.key` because macOS turns
  // Option+= into '≠' and Option+- into '–'.
  const resolveZoomAction = (event) => {
    if (!matchesModifiers(event)) return null
    if (event.code === config.growKey) return (current) => current + config.step
    if (event.code === config.shrinkKey) return (current) => current - config.step
    if (event.code === config.resetKey) return () => config.defaultZoom
    return null
  }

  const handleKeyDown = (event) => {
    const action = resolveZoomAction(event)
    if (!action) return

    // A rule aimed at nothing still writes to storage, so presses on a surface
    // the selector cannot reach would accumulate invisibly and then land all at
    // once when a matching one appears. Cursor's Agents window does exactly
    // that on its new-chat screen.
    if (!document.querySelector(config.selector)) return

    // Claim the chord before the workbench's own keybinding service sees it.
    event.preventDefault()
    event.stopPropagation()

    // Resolved fresh: by the time a key is pressed the UI has finished booting,
    // making this the authoritative answer for which window we are in.
    const key = getStorageKey()
    storeZoom(key, clampZoom(snapZoom(action(readZoom(key)))))
  }

  // Fires in Cursor's *other* windows when one of them writes a value, keeping
  // two IDE windows in step while leaving the Agents window alone.
  const handleStorageChange = (event) => {
    if (event.key === getStorageKey()) applyStoredZoom()
  }

  const watchUntilResolved = () => {
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      if (getStorageKey() !== appliedStorageKey) applyStoredZoom()

      const hasComposer = Boolean(document.querySelector(config.selector))
      if (hasComposer || Date.now() - startedAt > RESOLVE_TIMEOUT_MS) {
        window.clearInterval(timer)
      }
    }, RESOLVE_POLL_MS)
  }

  const install = () => {
    applyStoredZoom()
    watchUntilResolved()
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('storage', handleStorageChange)
  }

  if (document.head) install()
  else document.addEventListener('DOMContentLoaded', install, { once: true })
})();
