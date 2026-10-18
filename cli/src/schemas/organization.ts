import { z } from 'zod'
import { optionsBaseSchema } from './base'

// ============================================================================
// Organization Command Options Schemas
// ============================================================================

export const organizationAddOptionsSchema = optionsBaseSchema.extend({
  name: z.string().optional(),
  email: z.string().optional(),
})

export type OrganizationAddOptions = z.infer<typeof organizationAddOptionsSchema>

export const organizationDeleteOptionsSchema = optionsBaseSchema.extend({
  autoConfirm: z.boolean().optional(),
})

export type OrganizationDeleteOptions = z.infer<typeof organizationDeleteOptionsSchema>

export const passwordPolicyConfigSchema = z.object({
  enabled: z.boolean(),
  min_length: z.number(),
  require_uppercase: z.boolean(),
  require_number: z.boolean(),
  require_special: z.boolean(),
})

export type PasswordPolicyConfig = z.infer<typeof passwordPolicyConfigSchema>

export const organizationSetOptionsSchema = optionsBaseSchema.extend({
  name: z.string().optional(),
  email: z.string().optional(),
  enforce2fa: z.boolean().optional(),
  passwordPolicy: z.boolean().optional(),
  minLength: z.number().optional(),
  requireUppercase: z.boolean().optional(),
  requireNumber: z.boolean().optional(),
  requireSpecial: z.boolean().optional(),
  requireApikeyExpiration: z.boolean().optional(),
  maxApikeyExpirationDays: z.number().nullable().optional(),
  enforceHashedApiKeys: z.boolean().optional(),
  website: z.string().nullable().optional(),
  enforceEncryptedBundles: z.boolean().optional(),
  requiredEncryptionKey: z.string().nullable().optional(),
  /** Raw repeatable `key=true|false` CLI flags. */
  emailPreference: z.array(z.string()).optional(),
  /** Org email notification toggles patch (merged with emailPreference). */
  emailPreferences: z.record(z.string(), z.boolean()).optional(),
})

export type OrganizationSetOptions = z.infer<typeof organizationSetOptionsSchema>

export const organizationMemberRoleSchema = z.enum(['org_member', 'org_billing_admin', 'org_admin', 'org_super_admin'])

export type OrganizationMemberRole = z.infer<typeof organizationMemberRoleSchema>

export const organizationMemberOptionsSchema = optionsBaseSchema.extend({
  email: z.string().optional(),
  role: z.string().optional(),
})

export type OrganizationMemberOptions = z.infer<typeof organizationMemberOptionsSchema>
