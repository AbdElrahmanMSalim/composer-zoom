// Exercises runtime/composerZoom.js under a stubbed DOM.
//
// The runtime cannot be loaded in a normal test runner because it expects
// Cursor's workbench, so the environment it needs -- window, document,
// localStorage, timers -- is faked here and keystrokes are dispatched directly
// at the listener it registers.
//
// Run with: npm run test:runtime

const fs = require('node:fs')
const path = require('node:path')

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'runtime', 'composerZoom.js'), 'utf-8')

const IDE_PARTS = '.part.editor, .part.activitybar, .part.sidebar, .part.panel'
const DEFAULT_COMPOSER = '.composer-bar[data-composer-status], .agent-prompt-input-root'

// The generated file is the prelude and the runtime concatenated, so the seam
// between them needs covering too: settings assigned straight onto the stub
// window would not notice the prelude failing to terminate its statement.
const { buildConfigPrelude } = require('../out/runtime')

const createEnv = ({
  hasParts = true,
  hasComposer = true,
  store = {},
  config = null,
  viaPrelude = false,
  prefix = '',
} = {}) => {
  const elements = {}
  const listeners = {}
  const present = new Set()
  let intervalFn = null

  if (hasParts) present.add(IDE_PARTS)
  if (hasComposer) present.add(config?.selector ?? DEFAULT_COMPOSER)

  // Listeners are collected rather than replaced so a second injection would be
  // visible as a doubled effect instead of silently overwriting the first.
  const addListener = (type, fn) => {
    listeners[type] = listeners[type] ?? []
    listeners[type].push(fn)
  }

  const emit = (type, event) => {
    for (const fn of listeners[type] ?? []) fn(event)
  }

  const document = {
    head: { appendChild: (element) => { elements[element.id] = element } },
    createElement: () => ({ id: '', textContent: '' }),
    getElementById: (id) => elements[id] || null,
    querySelector: (selector) => (present.has(selector) ? { selector } : null),
    addEventListener: addListener,
  }

  const window = {
    document,
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = value },
    },
    addEventListener: addListener,
    setInterval: (fn) => { intervalFn = fn; return 1 },
    clearInterval: () => { intervalFn = null },
  }

  if (config && !viaPrelude) window.__composerZoomConfig = config

  const source = `${prefix}${viaPrelude ? buildConfigPrelude(config) : ''}${SOURCE}`
  const runSource = () => new Function('window', 'document', source)(window, document)
  runSource()

  const style = () => elements['composer-zoom-style'].textContent

  return {
    store,
    css: style,
    selector: () => style().split(' {')[0],
    zoom: () => {
      const match = /zoom: ([0-9.]+)/.exec(style())
      return match ? match[1] : null
    },
    showParts: () => present.add(IDE_PARTS),
    showComposer: () => present.add(config?.selector ?? DEFAULT_COMPOSER),
    tick: () => { if (intervalFn) intervalFn() },
    isPolling: () => intervalFn !== null,
    injectAgain: runSource,
    keydownListenerCount: () => (listeners.keydown ?? []).length,
    fireStorage: (key) => emit('storage', { key }),
    press: (code, overrides = {}) => {
      let prevented = false
      emit('keydown', {
        code,
        metaKey: true,
        altKey: true,
        ctrlKey: false,
        shiftKey: false,
        preventDefault: () => { prevented = true },
        stopPropagation: () => {},
        ...overrides,
      })
      return prevented
    },
  }
}

let failures = 0

const group = (name) => {
  console.log(`\n${name}`)
}

const check = (label, actual, expected) => {
  const isOk = JSON.stringify(actual) === JSON.stringify(expected)
  if (!isOk) failures++
  const detail = isOk ? '' : ` (expected ${JSON.stringify(expected)})`
  console.log(`  ${isOk ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}${detail}`)
}

group('defaults')
const defaults = createEnv()
check('rule needs no .monaco-workbench ancestor', defaults.selector(), DEFAULT_COMPOSER)
check('starts at the default zoom', defaults.zoom(), '1.7')
defaults.press('Equal')
check('grows by one step', defaults.zoom(), '1.8')
defaults.press('Minus')
defaults.press('Minus')
check('shrinks by one step each', defaults.zoom(), '1.6')
defaults.press('Digit0')
check('resets', defaults.zoom(), '1.7')

group('window kinds are independent')
const shared = { 'composerZoom:ide': '2.5', 'composerZoom:agents': '1.2' }
const ide = createEnv({ hasParts: true, store: shared })
const agents = createEnv({ hasParts: false, store: shared })
check('ide reads its own key', ide.zoom(), '2.5')
check('agents reads its own key', agents.zoom(), '1.2')
agents.press('Minus')
check('agents value moved', shared['composerZoom:agents'], '1.1')
check('ide value untouched', shared['composerZoom:ide'], '2.5')

group('legacy value carries over to the ide only')
const legacyIde = createEnv({ hasParts: true, store: { composerZoom: '2.1' } })
check('ide inherits it', legacyIde.zoom(), '2.1')
legacyIde.press('Equal')
check('writes the namespaced key', legacyIde.store['composerZoom:ide'], '2.2')
check('leaves the legacy key alone', legacyIde.store.composerZoom, '2.1')
const legacyAgents = createEnv({ hasParts: false, store: { composerZoom: '2.1' } })
check('agents ignores it', legacyAgents.zoom(), '1.7')

group('separatePerWindow disabled shares one value')
const sharedStore = { 'composerZoom:all': '2.2' }
const sharedIde = createEnv({ hasParts: true, store: sharedStore, config: { separatePerWindow: false } })
const sharedAgents = createEnv({ hasParts: false, store: sharedStore, config: { separatePerWindow: false } })
check('ide reads the shared key', sharedIde.zoom(), '2.2')
check('agents reads the shared key', sharedAgents.zoom(), '2.2')
sharedAgents.press('Equal')
check('both now see the same value', sharedStore['composerZoom:all'], '2.3')

group('boot race: an ide window has no parts yet at load')
const booting = createEnv({
  hasParts: false,
  hasComposer: false,
  store: { 'composerZoom:ide': '2.5', 'composerZoom:agents': '1.2' },
})
check('provisionally treated as agents', booting.zoom(), '1.2')
booting.showParts()
booting.tick()
check('corrected once parts appear', booting.zoom(), '2.5')
check('still polling until the composer exists', booting.isPolling(), true)
booting.showComposer()
booting.tick()
check('polling stops', booting.isPolling(), false)

group('a keypress resolves the window afresh')
const midBoot = createEnv({
  hasParts: false,
  hasComposer: false,
  store: { 'composerZoom:ide': '2.5', 'composerZoom:agents': '1.2' },
})
midBoot.showParts()
midBoot.showComposer()
midBoot.press('Equal')
check('used the ide value', midBoot.store['composerZoom:ide'], '2.6')
check('left agents alone', midBoot.store['composerZoom:agents'], '1.2')

group('a keypress with nothing to zoom is ignored')
const nothingToZoom = createEnv({ hasComposer: false, store: { 'composerZoom:ide': '2' } })
check('the chord is not claimed', nothingToZoom.press('Equal'), false)
check('the stored level stays put', nothingToZoom.store['composerZoom:ide'], '2')
nothingToZoom.showComposer()
check('claimed once the composer exists', nothingToZoom.press('Equal'), true)
check('and the level moves', nothingToZoom.store['composerZoom:ide'], '2.1')

group('cross-window sync is scoped to the matching key')
const syncing = createEnv({ hasParts: true, store: { 'composerZoom:ide': '2.5' } })
syncing.store['composerZoom:agents'] = '1.1'
syncing.fireStorage('composerZoom:agents')
check('ignores the other window', syncing.zoom(), '2.5')
syncing.store['composerZoom:ide'] = '2.8'
syncing.fireStorage('composerZoom:ide')
check('follows its own key', syncing.zoom(), '2.8')
syncing.fireStorage('composerZoom')
check('ignores the legacy key', syncing.zoom(), '2.8')

group('modifiers')
const ctrlAlt = createEnv({ config: { modifiers: ['ctrl', 'alt'] } })
check('configured chord fires', ctrlAlt.press('Equal', { metaKey: false, ctrlKey: true }), true)
check('mac chord no longer fires', ctrlAlt.press('Equal', { metaKey: true, ctrlKey: false }), false)
const macDefault = createEnv()
check('shift is ignored when not required', macDefault.press('Equal', { shiftKey: true }), true)
check('a missing modifier is rejected', macDefault.press('Equal', { altKey: false }), false)
check('an extra modifier is rejected', macDefault.press('Equal', { ctrlKey: true }), false)
check('an unrelated key is ignored', macDefault.press('KeyA'), false)
const shiftRequired = createEnv({ config: { modifiers: ['meta', 'alt', 'shift'] } })
check('required shift is enforced', shiftRequired.press('Equal'), false)
check('required shift accepted', shiftRequired.press('Equal', { shiftKey: true }), true)

group('custom keys and selector')
const custom = createEnv({
  config: { growKey: 'BracketRight', shrinkKey: 'BracketLeft', resetKey: 'Backslash', selector: '.my-composer' },
})
check('selector is honoured', custom.selector(), '.my-composer')
custom.press('BracketRight')
check('custom grow key works', custom.zoom(), '1.8')
custom.press('BracketLeft')
custom.press('BracketLeft')
check('custom shrink key works', custom.zoom(), '1.6')
custom.press('Backslash')
check('custom reset key works', custom.zoom(), '1.7')
check('the replaced default key is inert', custom.press('Equal'), false)

group('custom step, range and default')
const tuned = createEnv({ config: { step: 0.05, minZoom: 0.5, maxZoom: 1.2, defaultZoom: 1 } })
check('starts at the configured default', tuned.zoom(), '1')
tuned.press('Equal')
check('fractional step does not drift', tuned.zoom(), '1.05')
for (let index = 0; index < 20; index++) tuned.press('Equal')
check('clamped at the configured max', tuned.zoom(), '1.2')
for (let index = 0; index < 40; index++) tuned.press('Minus')
check('clamped at the configured min', tuned.zoom(), '0.5')

group('stored values that cannot be trusted')
check('corrupt falls back to the default', createEnv({ store: { 'composerZoom:ide': 'nonsense' } }).zoom(), '1.7')
check('above range is clamped', createEnv({ store: { 'composerZoom:ide': '99' } }).zoom(), '3')
check('below range is clamped', createEnv({ store: { 'composerZoom:ide': '0.1' } }).zoom(), '1')
check(
  'a default outside the range is clamped too',
  createEnv({ config: { defaultZoom: 9, minZoom: 1, maxZoom: 2 } }).zoom(),
  '2',
)

group('double injection is ignored')
const guarded = createEnv()
check('one keydown listener after the first inject', guarded.keydownListenerCount(), 1)
guarded.injectAgain()
check('still one after a second inject', guarded.keydownListenerCount(), 1)
guarded.press('Equal')
check('a keypress still moves exactly one step', guarded.zoom(), '1.8')

group('the generated file runs as one script')
// Regression: the prelude once ended without a semicolon, so the runtime's
// leading `(` turned the whole thing into a call of the config object and threw
// before installing anything.
const generated = createEnv({
  viaPrelude: true,
  config: { selector: '.generated-composer', defaultZoom: 1.3, step: 0.2, minZoom: 1, maxZoom: 3 },
})
check('config from the prelude is applied', generated.selector(), '.generated-composer')
check('starts at the prelude default', generated.zoom(), '1.3')
generated.press('Equal')
check('the prelude step is used', generated.zoom(), '1.5')

// Custom UI Style concatenates every injected import, so a neighbouring script
// that forgets its own semicolon must not be able to swallow the runtime.
const afterNeighbour = createEnv({ prefix: 'window.__neighbour = { unterminated: true }\n' })
check('installs after an unterminated neighbour', afterNeighbour.zoom(), '1.7')

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
