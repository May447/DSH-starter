/// <reference types="vite/client" />

import type { LauncherBridge } from '@shared/contract'

declare global {
  interface Window {
    /** Injected by the preload script; see `src/preload/index.ts`. */
    dshStarter: LauncherBridge
  }
}

export {}
