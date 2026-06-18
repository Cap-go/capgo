// __CAPGO_DEV__ is replaced at build time by Bun.build `define`: `false` in the
// NPM release build (so dead-code elimination strips every `if
// (globalThis.__CAPGO_DEV__) { … }` branch and its imports out of dist/index.js),
// and `true` in the dev/test build. In raw source it is `undefined` (falsy) —
// safe to read, no ReferenceError; the test preload sets it true so dev hooks
// activate when running tests against source.
export {}
declare global {
  // eslint-disable-next-line no-var, vars-on-top
  var __CAPGO_DEV__: boolean | undefined
  // Defined `true` in the NPM release since PR 2 (the MCP onboarding is
  // release-ready); was `false` in PR 1, where DCE stripped
  // registerOnboardingTools + the MCP-only deciders out of dist.
  // eslint-disable-next-line no-var, vars-on-top
  var __CAPGO_MCP_ONBOARDING__: boolean | undefined
}
