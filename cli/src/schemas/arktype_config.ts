import { configure } from 'arktype/config'

// Match Zod optional semantics for present `undefined` values.
// Only soften JSON Schema export for the undefined unit introduced by that
// setting — other unsupported nodes should still fail loudly.
configure({
  exactOptionalPropertyTypes: false,
  toJsonSchema: {
    fallback: {
      unit: (ctx) => {
        if (ctx.unit === undefined)
          return ctx.base
        // Re-throw as Error so diagnostics keep a stack / message instead of
        // stringifying the fallback context as [object Object].
        throw new TypeError(`Unsupported ArkType unit in JSON Schema export: ${String(ctx.unit)}`)
      },
    },
  },
})
