// Type shims for `@capacitor/cli` subpath imports that don't ship .d.ts files.
//
// The CLI workspace (`cli/`) imports `@capacitor/cli/dist/config` and
// `@capacitor/cli/dist/util/monorepotools` directly because the package's
// main entrypoint doesn't re-export those helpers. Inside `cli/tsconfig.json`
// these resolve without complaint, but `vue-tsc --noEmit` (run from the
// repo-root `tsconfig.json` via `bun typecheck`) processes the CLI source as
// a side-effect of root-level test files importing from `cli/src/...`, and
// trips `TS7016: Could not find a declaration file for module ...`.
//
// Declaring the modules here gives vue-tsc enough information to keep typing
// the rest of the file; the runtime CLI build still goes through cli/tsc
// which has stricter behavior and works against the actual JS exports.
//
// If `@capacitor/cli` ever ships these declarations or we stop importing the
// subpaths, delete this file.

declare module '@capacitor/cli/dist/config'
declare module '@capacitor/cli/dist/util/monorepotools'
