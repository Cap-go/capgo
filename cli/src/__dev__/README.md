# `src/__dev__/` — dev/test-only modules (NEVER shipped)

Modules here exist only for development and testing (e.g. spoofing the Apple API
in AI tests). They MUST be referenced **only** from inside
`if (globalThis.__CAPGO_DEV__) { … }` branches.

Why this is safe in the NPM release:

1. The release build defines `globalThis.__CAPGO_DEV__ = false` (see `build.mjs`),
   so `minify`'s dead-code elimination removes the branch **and** tree-shakes the
   imported `__dev__` module out of `dist/index.js`.
2. npm publishes only `dist/` (`package.json` `files`), so source is never published.
3. `test/test-dev-gate-stripped.mjs` greps the built bundle for dev markers and
   fails the build if any leak.

Never import a `__dev__` module from a non-dev (always-on) code path.
