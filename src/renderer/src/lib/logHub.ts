import type { LogChunk } from '@shared/contract'

/**
 * In-memory fan-out for the launch log.
 *
 * The bridge subscription lives in one place (`useLauncher`); the xterm panel
 * subscribes through this hub. A bounded ring buffer keeps the last chunks so a
 * terminal that is re-created (remount, font/resize churn) can replay history
 * without asking the main process for it. The cap is what keeps a chatty `dsh`
 * from growing the renderer heap without bound.
 */

/** Hard cap on buffered chunks (in addition to the char cap below). */
const MAX_CHUNKS = 600
/** Hard cap on buffered characters, so a few huge chunks cannot blow the heap either. */
const MAX_CHARS = 480_000

type Listener = (chunk: LogChunk) => void

let buffer: LogChunk[] = []
let bufferedChars = 0
const listeners = new Set<Listener>()

/** Append a chunk, feed live listeners, and trim the replay buffer. */
export function publishLog(chunk: LogChunk): void {
  buffer.push(chunk)
  bufferedChars += chunk.data.length
  while (buffer.length > MAX_CHUNKS || bufferedChars > MAX_CHARS) {
    const dropped = buffer.shift()
    if (dropped === undefined) break
    bufferedChars -= dropped.data.length
  }
  for (const listener of listeners) listener(chunk)
}

/** A synthetic, launcher-generated log line (phase transitions, stop reasons). */
export function publishSystemLog(data: string): void {
  publishLog({ stream: 'system', data, at: Date.now() })
}

/** Listen for live chunks. Returns the unsubscribe function. */
export function subscribeLogs(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Feed the buffered history to one listener (used when the terminal is created). */
export function replayLogs(listener: Listener): void {
  for (const chunk of buffer) listener(chunk)
}

/** Drop history (called when the user clears the terminal). */
export function clearLogBuffer(): void {
  buffer = []
  bufferedChars = 0
}
