#!/usr/bin/env bash
# Assert the dev-only CAPGO_KEYCHAIN_HELPER_PATH override is dead-code-eliminated
# from the PRODUCTION CLI bundle.
#
# resolveHelperBinary() gates the override behind __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__,
# which cli/build.mjs defines as `false` for production builds; the minifier then
# deletes the whole branch, including the env-var access. A regression (an
# accidental NODE_ENV=development build, or refactoring the define away) would ship
# the override to users — this fails the build instead.
#
# Notes:
#  - We force a production build so the result does not depend on the ambient
#    NODE_ENV of whoever runs `bun run test`.
#  - We force a production build so the result does not depend on the ambient
#    NODE_ENV of whoever runs `bun run test`.
#  - We grep the bare variable name. That is safe because this check's npm script
#    is `bash scripts/check-helper-dce.sh` (it does NOT mention the variable), so
#    the bundle's inlined package.json no longer contains it — the only possible
#    match is the override code itself (minified, e.g. `MN.env.CAPGO_KEYCHAIN_HELPER_PATH`).
set -euo pipefail
cd "$(dirname "$0")/.."

NODE_ENV=production bun run build >/dev/null

if grep -q 'CAPGO_KEYCHAIN_HELPER_PATH' dist/index.js; then
  echo "FAIL: the dev-only keychain-helper override survived dead-code elimination" >&2
  echo "      in the production bundle (cli/dist/index.js). It must be stripped." >&2
  exit 1
fi

# The ASC key helper gates CAPGO_ASC_KEY_HELPER_PATH behind the SAME build flag.
# It must likewise be dead-code-eliminated from the production bundle.
if grep -q 'CAPGO_ASC_KEY_HELPER_PATH' dist/index.js; then
  echo "FAIL: the dev-only asc-key-helper override survived dead-code elimination" >&2
  echo "      in the production bundle (cli/dist/index.js). It must be stripped." >&2
  exit 1
fi

# The asc-key helper's package-bundle TEST seam (CAPGO_ASC_KEY_HELPER_PACKAGE_BUNDLE,
# which forces a given .app onto the signature-verified 'package' path so the E2E
# suite can exercise the untrusted case) sits behind the SAME build flag and must
# also be stripped from the production bundle.
if grep -q 'CAPGO_ASC_KEY_HELPER_PACKAGE_BUNDLE' dist/index.js; then
  echo "FAIL: the dev-only asc-key-helper package-bundle test seam survived dead-code" >&2
  echo "      elimination in the production bundle (cli/dist/index.js). It must be stripped." >&2
  exit 1
fi
echo "helper-dce OK: dev keychain + asc-key helper overrides absent from the production bundle"
