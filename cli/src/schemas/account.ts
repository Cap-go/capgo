import { z } from 'zod'
import { optionsBaseSchema } from './base'

// ============================================================================
// Account Command Options Schemas
// ============================================================================

export const accountSetOptionsSchema = optionsBaseSchema.extend({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  country: z.string().optional(),
  discordUsername: z.string().nullable().optional(),
  formatLocale: z.string().nullable().optional(),
  notifications: z.boolean().optional(),
  newsletter: z.boolean().optional(),
  /** Raw repeatable `key=true|false` CLI flags. */
  emailPreference: z.array(z.string()).optional(),
  /** Account email notification toggles patch (merged with emailPreference). */
  emailPreferences: z.record(z.string(), z.boolean()).optional(),
})

export type AccountSetOptions = z.infer<typeof accountSetOptionsSchema>

export interface AccountProfile {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  country: string | null
  discord_username: string | null
  format_locale: string | null
  enable_notifications: boolean
  opt_for_newsletters: boolean
  email_preferences: Record<string, boolean> | null
  [key: string]: unknown
}
