// VS Code's "vscode:uninstall" hook: runs as a detached Node process, with no
// `vscode` API available, after the extension is removed and Cursor is next
// restarted. It undoes what `unregisterImport` (src/customUiStyle.ts) does
// from inside the extension host, but from the outside: reading and writing
// the user's settings.json file directly, and deleting the generated script
// from global storage.
//
// This hook also fires when the extension is merely *updated* -- the old
// version is marked obsolete the same way an uninstalled one is -- so the
// very first thing this does is check whether a newer install is sitting
// right next to it before touching anything.
//
// Kept dependency-free and outside the TypeScript build on purpose: it must
// keep working standalone long after the rest of the extension is gone.

'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const GENERATED_FILE_NAME = 'composer-zoom.js'
const IMPORTS_SETTING_PATTERN = /"custom-ui-style\.external\.imports"\s*:\s*/

// Installed extension folders are named "<publisher>.<name>-<version>", with
// an optional platform suffix such as "-universal" or "-darwin-arm64".
const EXTENSION_DIR_PATTERN = /^(.+?)-\d+\.\d+\.\d+(?:-[\w.]+)?$/

const getExtensionId = (extensionDirName) => {
  const match = EXTENSION_DIR_PATTERN.exec(extensionDirName)
  return match ? match[1] : null
}

// The uninstall hook also runs right after an update, while the old version's
// folder is still briefly marked obsolete. A sibling folder for the same
// extension means this is that case, not a real removal, so cleanup must be
// skipped -- otherwise every update would strip the settings it just wrote.
const isGenuineUninstall = (ownDir) => {
  const ownDirName = path.basename(ownDir)
  const extensionId = getExtensionId(ownDirName)
  if (!extensionId) return true

  let siblings
  try {
    siblings = fs.readdirSync(path.dirname(ownDir))
  } catch {
    return true
  }

  const prefix = `${extensionId.toLowerCase()}-`
  return !siblings.some(
    (name) => name !== ownDirName && name.toLowerCase().startsWith(prefix),
  )
}

const getUserDir = () => {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User')
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(appData, 'Cursor', 'User')
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(configHome, 'Cursor', 'User')
}

// Advances `i` past a JSON string literal (leaving it on the closing quote)
// or a `//` / `/* */` comment (leaving it just past the end), so bracket and
// comma scanning below never mistakes a character inside either for one that
// has structural meaning.
const skipStringOrComment = (text, i) => {
  const char = text[i]

  if (char === '"') {
    let j = i + 1
    while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
    return j
  }

  if (char === '/' && text[i + 1] === '/') {
    const end = text.indexOf('\n', i)
    return end === -1 ? text.length : end
  }

  if (char === '/' && text[i + 1] === '*') {
    const end = text.indexOf('*/', i + 2)
    return end === -1 ? text.length : end + 1
  }

  return i
}

// Returns the index of the `]` matching the `[` at `start`.
const findArrayEnd = (text, start) => {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const skipTo = skipStringOrComment(text, i)
    if (skipTo !== i) {
      i = skipTo
      continue
    }

    if (text[i] === '[' || text[i] === '{') depth++
    if (text[i] === ']' || text[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// Splits the array's inner text on its top-level commas only, so a comma
// inside a nested `{ url: "..." }` entry does not split that entry in two.
const splitTopLevel = (text) => {
  const parts = []
  let depth = 0
  let last = 0

  for (let i = 0; i < text.length; i++) {
    const skipTo = skipStringOrComment(text, i)
    if (skipTo !== i) {
      i = skipTo
      continue
    }

    if (text[i] === '[' || text[i] === '{') depth++
    if (text[i] === ']' || text[i] === '}') depth--
    if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(last, i))
      last = i + 1
    }
  }

  const tail = text.slice(last)
  if (tail.trim().length > 0) parts.push(tail)
  return parts
}

// Mirrors `isOwnImport` in src/customUiStyle.ts: only a plain string entry
// ending in our generated file name is ours to remove.
const isOwnImportEntry = (rawEntry) => {
  const trimmed = rawEntry.trim()
  if (!trimmed.startsWith('"')) return false

  try {
    const value = JSON.parse(trimmed)
    return typeof value === 'string' && value.endsWith(`/${GENERATED_FILE_NAME}`)
  } catch {
    return false
  }
}

// Rebuilds the array with our entries dropped, reusing the indentation of the
// property line so the edit reads like a normal, if regenerated, setting.
// Returns null when nothing needed to change.
const withoutOwnImports = (inner, indent) => {
  const parts = splitTopLevel(inner)
  const before = parts.map((part) => part.trim()).filter((part) => part.length > 0)
  const after = before.filter((part) => !isOwnImportEntry(part))

  if (after.length === before.length) return null
  if (after.length === 0) return '[]'

  const elementIndent = `${indent}  `
  return `[\n${after.map((entry) => `${elementIndent}${entry}`).join(',\n')}\n${indent}]`
}

const removeStaleImport = (settingsPath) => {
  let raw
  try {
    raw = fs.readFileSync(settingsPath, 'utf-8')
  } catch {
    return
  }

  const keyMatch = IMPORTS_SETTING_PATTERN.exec(raw)
  if (!keyMatch) return

  const arrayStart = keyMatch.index + keyMatch[0].length
  if (raw[arrayStart] !== '[') return

  const arrayEnd = findArrayEnd(raw, arrayStart)
  if (arrayEnd === -1) return

  const lineStart = raw.lastIndexOf('\n', keyMatch.index) + 1
  const indentMatch = /^[ \t]*/.exec(raw.slice(lineStart))
  const indent = indentMatch ? indentMatch[0] : ''

  const rebuilt = withoutOwnImports(raw.slice(arrayStart + 1, arrayEnd), indent)
  if (rebuilt === null) return

  const next = raw.slice(0, arrayStart) + rebuilt + raw.slice(arrayEnd + 1)
  fs.writeFileSync(settingsPath, next, 'utf-8')
}

const removeGeneratedStorage = (userDir, extensionId) => {
  const storageDir = path.join(userDir, 'globalStorage', extensionId.toLowerCase())
  fs.rmSync(storageDir, { recursive: true, force: true })
}

const main = () => {
  const ownDir = path.resolve(__dirname, '..')
  if (!isGenuineUninstall(ownDir)) return

  const extensionId = getExtensionId(path.basename(ownDir))
  const userDir = getUserDir()

  removeStaleImport(path.join(userDir, 'settings.json'))
  if (extensionId) removeGeneratedStorage(userDir, extensionId)
}

try {
  main()
} catch {
  // Best-effort cleanup: an uninstall hook must never surface a crash.
}
