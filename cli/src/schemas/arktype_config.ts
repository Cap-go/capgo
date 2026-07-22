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
        throw ctx
      },
    },
  },
})
