import { type } from './arktype'
import { optionsBaseSchema } from './base'

// ============================================================================
// Organization Command Options Schemas
// ============================================================================

export const organizationAddOptionsSchema = type({
  '...': optionsBaseSchema,
  '+': 'delete',
  'name?': 'string',
  'email?': 'string',
})

export type OrganizationAddOptions = typeof organizationAddOptionsSchema.infer

export const organizationDeleteOptionsSchema = type({
  '...': optionsBaseSchema,
  '+': 'delete',
  'autoConfirm?': 'boolean',
})

export type OrganizationDeleteOptions = typeof organizationDeleteOptionsSchema.infer

export const passwordPolicyConfigSchema = type({
  '+': 'delete',
  enabled: 'boolean',
  min_length: 'number',
  require_uppercase: 'boolean',
  require_number: 'boolean',
  require_special: 'boolean',
})

export type PasswordPolicyConfig = typeof passwordPolicyConfigSchema.infer

export const organizationSetOptionsSchema = type({
  '...': optionsBaseSchema,
  '+': 'delete',
  'name?': 'string',
  'email?': 'string',
  'enforce2fa?': 'boolean',
  'passwordPolicy?': 'boolean',
  'minLength?': 'number',
  'requireUppercase?': 'boolean',
  'requireNumber?': 'boolean',
  'requireSpecial?': 'boolean',
  'requireApikeyExpiration?': 'boolean',
  'maxApikeyExpirationDays?': 'number | null',
  'enforceHashedApiKeys?': 'boolean',
})

export type OrganizationSetOptions = typeof organizationSetOptionsSchema.infer
