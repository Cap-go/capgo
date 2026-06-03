// Preload for running tests against SOURCE (not the bundle), so dev-only hooks
// gated by `if (globalThis.__CAPGO_DEV__)` activate.
// Usage: bun --preload ./test/dev-preload.mjs test/<file>.mjs
globalThis.__CAPGO_DEV__ = true
