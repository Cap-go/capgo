import { z } from 'zod'
import { optionsBaseSchema } from './base'

// ============================================================================
// App Options Schemas
// ============================================================================

export const appOptionsSchema = optionsBaseSchema.extend({
  name: z.string().optional(),
  icon: z.string().optional(),
  retention: z.number().optional(),
  exposeMetadata: z.boolean().optional(),
})

export type AppOptions = z.infer<typeof appOptionsSchema>

export const appDebugOptionsSchema = optionsBaseSchema.extend({
  device: z.string().optional(),
})

export type AppDebugOptions = z.infer<typeof appDebugOptionsSchema>

export const appSettingOptionsSchema = optionsBaseSchema.extend({
  bool: z.string().optional(),
  string: z.string().optional(),
})

export type AppSettingOptions = z.infer<typeof appSettingOptionsSchema>
