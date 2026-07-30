import * as vscode from 'vscode'
import { SETTINGS_SECTION, readRuntimeConfig } from './config'
import {
  CUSTOM_UI_STYLE_ID,
  isCustomUiStyleInstalled,
  registerImport,
  runCustomUiStyleReload,
  unregisterImport,
} from './customUiStyle'
import { writeRuntimeFile } from './runtime'

const APPLY_COMMAND = 'composerZoom.apply'
const REMOVE_COMMAND = 'composerZoom.remove'
const EXTENSION_SEARCH_COMMAND = 'workbench.extensions.search'

const RELOAD_ACTION = 'Reload now'
const LATER_ACTION = 'Later'
const SHOW_EXTENSION_ACTION = 'Show extension'

const promptReload = async (message: string): Promise<void> => {
  const choice = await vscode.window.showInformationMessage(message, RELOAD_ACTION, LATER_ACTION)
  if (choice === RELOAD_ACTION) await runCustomUiStyleReload()
}

const warnMissingDependency = async (): Promise<void> => {
  const choice = await vscode.window.showWarningMessage(
    'Composer Zoom relies on the Custom UI Style extension to inject itself into Cursor. Install or enable it, then run "Composer Zoom: Apply Settings and Reload".',
    SHOW_EXTENSION_ACTION,
  )

  if (choice === SHOW_EXTENSION_ACTION) {
    await vscode.commands.executeCommand(EXTENSION_SEARCH_COMMAND, CUSTOM_UI_STYLE_ID)
  }
}

interface SyncOptions {
  alwaysPromptReload: boolean
}

const sync = async (
  context: vscode.ExtensionContext,
  { alwaysPromptReload }: SyncOptions,
): Promise<void> => {
  if (!isCustomUiStyleInstalled()) {
    await warnMissingDependency()
    return
  }

  const { filePath, didChange } = await writeRuntimeFile(context, readRuntimeConfig())
  const didRegister = await registerImport(filePath)

  // Registering edits Custom UI Style's own settings, which makes it raise its
  // own "apply now?" prompt. Adding ours on top would ask twice for one change.
  if (didRegister) return

  if (didChange || alwaysPromptReload) {
    await promptReload('Composer Zoom updated its injected script. Reload to apply it.')
  }
}

const remove = async (): Promise<void> => {
  const didUnregister = await unregisterImport()

  // Unregistering also edits Custom UI Style's settings, so it prompts to
  // re-apply and strip the script from Cursor on its own.
  const message = didUnregister
    ? 'Composer Zoom will be removed from Cursor on the next apply.'
    : 'Composer Zoom is not currently injected.'

  void vscode.window.showInformationMessage(message)
}

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
  context.subscriptions.push(
    vscode.commands.registerCommand(APPLY_COMMAND, () =>
      sync(context, { alwaysPromptReload: true }),
    ),
    vscode.commands.registerCommand(REMOVE_COMMAND, remove),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration(SETTINGS_SECTION)) {
        await sync(context, { alwaysPromptReload: false })
      }
    }),
  )

  await sync(context, { alwaysPromptReload: false })
}

export const deactivate = (): void => {
  // The injected script lives inside Cursor's patched workbench, so tearing it
  // down is an explicit user action through the remove command.
}
