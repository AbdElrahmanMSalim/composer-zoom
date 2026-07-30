import * as vscode from 'vscode'

export type Modifier = 'meta' | 'ctrl' | 'alt' | 'shift'

export interface RuntimeConfig {
  selector: string
  defaultZoom: number
  step: number
  minZoom: number
  maxZoom: number
  separatePerWindow: boolean
  modifiers: Modifier[]
  growKey: string
  shrinkKey: string
  resetKey: string
}

export const SETTINGS_SECTION = 'composerZoom'

const MODIFIERS: readonly Modifier[] = ['meta', 'ctrl', 'alt', 'shift']
const MAC_MODIFIERS: readonly Modifier[] = ['meta', 'alt']
const NON_MAC_MODIFIERS: readonly Modifier[] = ['ctrl', 'alt']

const DEFAULTS = {
  selector: '.composer-bar[data-composer-status]',
  defaultZoom: 1.7,
  step: 0.1,
  minZoom: 1,
  maxZoom: 3,
  growKey: 'Equal',
  shrinkKey: 'Minus',
  resetKey: 'Digit0',
} as const

const readPositiveNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback

const readNonEmptyString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback

const isModifier = (value: unknown): value is Modifier =>
  typeof value === 'string' && (MODIFIERS as readonly string[]).includes(value)

// An empty list means "use the platform default", which is what ships, so the
// shortcuts feel native on every OS without anyone configuring them.
const readModifiers = (value: unknown): Modifier[] => {
  const platformDefault = process.platform === 'darwin' ? MAC_MODIFIERS : NON_MAC_MODIFIERS
  if (!Array.isArray(value)) return [...platformDefault]

  const modifiers = value.filter(isModifier)
  return modifiers.length > 0 ? modifiers : [...platformDefault]
}

export const readRuntimeConfig = (): RuntimeConfig => {
  const settings = vscode.workspace.getConfiguration(SETTINGS_SECTION)

  const minZoom = readPositiveNumber(settings.get('minZoom'), DEFAULTS.minZoom)
  const maxZoom = readPositiveNumber(settings.get('maxZoom'), DEFAULTS.maxZoom)

  // A crossed-over range would clamp every value to the lower bound and freeze
  // the zoom, so fall back to the shipped bounds instead of obeying it.
  const isRangeValid = minZoom < maxZoom

  return {
    selector: readNonEmptyString(settings.get('selector'), DEFAULTS.selector),
    defaultZoom: readPositiveNumber(settings.get('defaultZoom'), DEFAULTS.defaultZoom),
    step: readPositiveNumber(settings.get('step'), DEFAULTS.step),
    minZoom: isRangeValid ? minZoom : DEFAULTS.minZoom,
    maxZoom: isRangeValid ? maxZoom : DEFAULTS.maxZoom,
    separatePerWindow: settings.get('separatePerWindow') !== false,
    modifiers: readModifiers(settings.get('modifiers')),
    growKey: readNonEmptyString(settings.get('growKey'), DEFAULTS.growKey),
    shrinkKey: readNonEmptyString(settings.get('shrinkKey'), DEFAULTS.shrinkKey),
    resetKey: readNonEmptyString(settings.get('resetKey'), DEFAULTS.resetKey),
  }
}
