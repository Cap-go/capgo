import { configure } from 'arktype/config'

// Match Zod optional semantics for present `undefined` values, and allow
// MCP/Standard Schema JSON Schema export when optional props include undefined.
configure({
  exactOptionalPropertyTypes: false,
  toJsonSchema: {
    fallback: {
      default: ctx => ctx.base,
    },
  },
})
