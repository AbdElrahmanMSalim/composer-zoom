// Pure list edits for Custom UI Style's `external.imports`, kept apart from the
// `vscode` API so test/runtime.test.js can exercise them directly.

import { GENERATED_FILE_NAME } from './runtime'

// Custom UI Style accepts plain strings and `{ url }` objects. Ours is always a
// string, and recognising it by file name lets a stale entry from a previous
// storage location be cleaned up without disturbing anyone else's imports.
export const isOwnImport = (entry: unknown): boolean =>
  typeof entry === 'string' && entry.endsWith(`/${GENERATED_FILE_NAME}`)

// Our entry keeps whatever position it already has. Moving it to the end would
// fight any other extension doing the same: each would rewrite the list on
// every start to put itself last, and every write makes Custom UI Style ask to
// re-apply, so the prompt would never go away.
export const withOwnImport = (current: unknown[], ownImport: string): unknown[] => {
  const index = current.findIndex(isOwnImport)
  if (index === -1) return [...current, ownImport]

  return current.flatMap((entry, position) => {
    if (position === index) return [ownImport]
    return isOwnImport(entry) ? [] : [entry]
  })
}

export const withoutOwnImport = (current: unknown[]): unknown[] =>
  current.filter((entry) => !isOwnImport(entry))
