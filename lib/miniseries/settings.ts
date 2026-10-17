import type { Provider } from "./types.ts";

// Public product choices belong in code. Credentials are read by policy.ts.
export const MINISERIES_SETTINGS: {
  enabled: Record<Provider, boolean>;
  playback: Record<Provider, boolean>;
  images: Record<Provider, boolean>;
  dramaBoxMediaHosts: string[];
} = {
  enabled: { microdramalist: true, syln: true, dramabox: false, reelshort: true },
  playback: { microdramalist: false, syln: true, dramabox: false, reelshort: true },
  images: { microdramalist: false, syln: true, dramabox: true, reelshort: false },
  // Direct providers remain disabled until their real contracts are operational.
  dramaBoxMediaHosts: [],
};
