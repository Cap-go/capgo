import { type } from 'arktype'

// ============================================================================
// Base Options Schema
// ============================================================================

export const optionsBaseSchema = type({
  apikey: 'string',
  'supaHost?': 'string',
  'supaAnon?': 'string',
})

export type OptionsBase = typeof optionsBaseSchema.infer
