/** API base URL — read from Vite env at build time, falls back to relative (proxied by dev server). */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? '';
