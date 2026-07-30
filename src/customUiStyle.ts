import * as vscode from 'vscode'
import { GENERATED_FILE_NAME } from './runtime'

export const CUSTOM_UI_STYLE_ID = 'subframe7536.custom-ui-style'

const SECTION = 'custom-ui-style'
const IMPORTS_SETTING = 'external.imports'
const RELOAD_COMMAND = 'custom-ui-style.reload'

export const isCustomUiStyleInstalled = (): boolean =>
  vscode.extensions.getExtension(CUSTOM_UI_STYLE_ID) !== undefined

export const runCustomUiStyleReload = async (): Promise<void> => {
  await vscode.commands.executeCommand(RELOAD_COMMAND)
}

// Custom UI Style accepts plain strings and `{ url }` objects. Ours is always a
// string, and recognising it by file name lets a stale entry from a previous
// storage location be cleaned up without disturbing anyone else's imports.
const isOwnImport = (entry: unknown): boolean =>
  typeof entry === 'string' && entry.endsWith(`/${GENERATED_FILE_NAME}`)

const readImports = (): unknown[] => {
  const configured = vscode.workspace.getConfiguration(SECTION).get<unknown[]>(IMPORTS_SETTING)
  return Array.isArray(configured) ? configured : []
}

// Application-scoped on Custom UI Style's side, so it only accepts a global write.
const writeImports = async (imports: unknown[]): Promise<void> => {
  await vscode.workspace
    .getConfiguration(SECTION)
    .update(IMPORTS_SETTING, imports, vscode.ConfigurationTarget.Global)
}

const isSameList = (left: unknown[], right: unknown[]): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

// Resolves true only when the setting actually had to change, because every
// write makes Custom UI Style raise its own prompt to re-apply.
export const registerImport = async (filePath: string): Promise<boolean> => {
  const current = readImports()
  const next = [...current.filter((entry) => !isOwnImport(entry)), vscode.Uri.file(filePath).toString()]

  if (isSameList(current, next)) return false

  await writeImports(next)
  return true
}

export const unregisterImport = async (): Promise<boolean> => {
  const current = readImports()
  const next = current.filter((entry) => !isOwnImport(entry))

  if (isSameList(current, next)) return false

  await writeImports(next)
  return true
}
