import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { LauncherSettings } from '@shared/contract'
import { normalizeSettings } from '@shared/defaults'

/**
 * Tiny JSON settings store living in Electron's `userData` directory.
 *
 * Writes are atomic (temp file + rename) so a crash mid-save cannot leave a
 * truncated settings.json behind.
 */
export class SettingsStore {
  readonly #file: string
  #cache: LauncherSettings | undefined

  constructor(file = join(app.getPath('userData'), 'settings.json')) {
    this.#file = file
  }

  /** Absolute path of the settings file, for diagnostics and the settings UI. */
  get file(): string {
    return this.#file
  }

  /** Read settings from disk once; later calls return the in-memory copy. */
  async get(): Promise<LauncherSettings> {
    if (this.#cache !== undefined) return this.#cache
    try {
      // Editors and older PowerShell versions like to prepend a BOM; JSON.parse rejects it.
      const text = (await readFile(this.#file, 'utf8')).replace(/^\uFEFF/, '')
      this.#cache = normalizeSettings(JSON.parse(text) as unknown)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') console.warn('dsh-starter: settings.json is unreadable, falling back to defaults', error)
      this.#cache = normalizeSettings(undefined)
    }
    return this.#cache
  }

  /** Normalize, persist, and return the settings that were written. */
  async save(next: LauncherSettings): Promise<LauncherSettings> {
    const normalized = normalizeSettings(next)
    await mkdir(dirname(this.#file), { recursive: true })
    const temporary = `${this.#file}.${String(Date.now())}.tmp`
    await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
    await rename(temporary, this.#file)
    this.#cache = normalized
    return normalized
  }
}
