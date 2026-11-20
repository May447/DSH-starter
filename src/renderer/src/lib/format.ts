/** Small, dependency-free formatting helpers for the launcher chrome. */

/** `12s`, `1m 05s`, `1h 02m` — used for elapsed/uptime readouts. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  if (total < 60) return `${String(total)}s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return `${String(minutes)}m ${String(seconds).padStart(2, '0')}s`
  const hours = Math.floor(minutes / 60)
  return `${String(hours)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** Last path segment, for card titles and compact command labels. */
export function basenameOf(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== '')
  return parts.length === 0 ? path : (parts[parts.length - 1] ?? path)
}

/** Keep long absolute paths readable in narrow places; full value stays in `title`. */
export function shortenPath(path: string, max = 38): string {
  if (path.length <= max) return path
  const head = path.slice(0, Math.max(4, Math.floor(max / 3)))
  const tail = path.slice(-(max - head.length - 1))
  return `${head}…${tail}`
}

/** The ready URL is a bearer token; never show the token itself in the chrome. */
export function displayUrl(url: string): string {
  return url.replace(/(token=)[^&#]+/i, '$1••••••')
}

/** Port parsed out of the ready URL, for the status chips. */
export function portOfUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  try {
    const parsed = new URL(url)
    return parsed.port === '' ? '80' : parsed.port
  } catch {
    const match = /:(\d{2,5})/.exec(url)
    return match?.[1]
  }
}

/** Compact byte count for the terminal header. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}
