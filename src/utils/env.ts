/** API base URL — read from Vite env at build time, falls back to relative (proxied by dev server). */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

/** True in Vite dev mode — used to expose debug helpers on window. */
export const IS_DEV: boolean = import.meta.env.DEV ?? false;
