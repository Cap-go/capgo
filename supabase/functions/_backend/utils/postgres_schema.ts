import { bigint, boolean, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

// do_not_change

export const disableUpdatePgEnum = pgEnum('disable_update', ['major', 'minor', 'patch', 'version_number', 'none'])
export const keyModePgEnum = pgEnum('key_mode', ['read', 'write', 'all', 'upload'])
export const userMinRightPgEnum = pgEnum('user_min_right', [
  'invite_read',
  'invite_upload',
  'invite_write',
  'invite_admin',
  'read',
  'upload',
  'write',
  'admin',
  'super_admin',
])

export const apps = pgTable('apps', {
  created_at: timestamp('created_at').notNull().defaultNow(),
  app_id: varchar('app_id').notNull(),
  icon_url: varchar('icon_url').notNull(),
  owner_org: uuid('owner_org').notNull(),
  name: varchar('name').unique(),
  last_version: varchar('last_version'),
  updated_at: timestamp('updated_at'),
  id: uuid('id').primaryKey().unique(),
  retention: bigint('retention', { mode: 'number' }).notNull().default(2592000),
  channel_device_count: bigint('channel_device_count', { mode: 'number' }).notNull().default(0),
  manifest_bundle_count: bigint('manifest_bundle_count', { mode: 'number' }).notNull().default(0),
  expose_metadata: boolean('expose_metadata').notNull().default(false),
})

export const app_versions = pgTable('app_versions', {
  id: bigint('id', { mode: 'number' }).primaryKey().notNull(),
  owner_org: uuid('owner_org').notNull(),
  created_at: timestamp('created_at').notNull(),
  app_id: varchar('app_id').notNull().references(() => apps.name),
  name: varchar('name').notNull(),
  user_id: uuid('user_id'),
  updated_at: timestamp('updated_at').defaultNow(),
  deleted: boolean('deleted').default(false),
  deleted_at: timestamp('deleted_at'),
  external_url: varchar('external_url'),
  checksum: varchar('checksum'),
  session_key: varchar('session_key'),
  key_id: varchar('key_id', { length: 20 }),
  storage_provider: text('storage_provider').default('r2').notNull(),
  min_update_version: varchar('min_update_version'),
  r2_path: varchar('r2_path'),
  link: varchar('link'),
  comment: varchar('comment'),
})

export const manifest = pgTable('manifest', {
  id: serial('id').primaryKey().notNull(),
  app_version_id: bigint('app_version_id', { mode: 'number' }).notNull().references(() => app_versions.id, { onDelete: 'cascade' }),
  file_name: varchar('file_name').notNull(),
  s3_path: varchar('s3_path').notNull(),
  file_hash: varchar('file_hash').notNull(),
  file_size: bigint('file_size', { mode: 'number' }).default(0),
})

export const channels = pgTable('channels', {
  id: bigint('id', { mode: 'number' }).primaryKey().notNull(),
  owner_org: uuid('owner_org').notNull(),
  created_at: timestamp('created_at').notNull(),
  name: varchar('name').notNull(),
  app_id: varchar('app_id').notNull().references(() => apps.name),
  version: bigint('version', { mode: 'number' }).notNull().references(() => app_versions.id),
  created_by: uuid('created_by').notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
  public: boolean('public').notNull().default(false),
  disable_auto_update_under_native: boolean('disable_auto_update_under_native').notNull().default(true),
  disable_auto_update: disableUpdatePgEnum('disable_auto_update').default('major').notNull(),
  ios: boolean('ios').default(true).notNull(),
  android: boolean('android').notNull().default(true),
  electron: boolean('electron').notNull().default(true),
  allow_device_self_set: boolean('allow_device_self_set').default(false).notNull(),
  allow_emulator: boolean('allow_emulator').notNull().default(true),
  allow_device: boolean('allow_device').notNull().default(true),
  allow_dev: boolean('allow_dev').notNull().default(true),
  allow_prod: boolean('allow_prod').notNull().default(true),
})

export const channel_devices = pgTable('channel_devices', {
  id: bigint('id', { mode: 'number' }),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
  device_id: text('device_id').notNull(),
  channel_id: bigint('channel_id', { mode: 'number' }).notNull().references(() => channels.id),
  app_id: varchar('app_id').notNull().references(() => apps.name),
  owner_org: uuid('owner_org').notNull(),
})

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().notNull(),
  created_by: uuid('created_by').notNull(),
  logo: text('logo'),
  name: text('name').notNull(),
  management_email: text('management_email').notNull(),
  customer_id: text('customer_id'),
  require_apikey_expiration: boolean('require_apikey_expiration').notNull().default(false),
  max_apikey_expiration_days: integer('max_apikey_expiration_days'),
  email_preferences: jsonb('email_preferences'),
})

export const notifications = pgTable('notifications', {
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
  last_send_at: timestamp('last_send_at').notNull().defaultNow(),
  total_send: bigint('total_send', { mode: 'number' }).notNull().default(1),
  owner_org: uuid('owner_org').notNull(),
  event: varchar('event', { length: 255 }).notNull(),
  uniq_id: varchar('uniq_id', { length: 255 }).notNull(),
})

export const users = pgTable('users', {
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  image_url: varchar('image_url'),
  first_name: varchar('first_name'),
  last_name: varchar('last_name'),
  country: varchar('country'),
  email: varchar('email').notNull(),
  id: uuid('id').primaryKey().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  enable_notifications: boolean('enable_notifications').notNull().default(true),
  opt_for_newsletters: boolean('opt_for_newsletters').notNull().default(true),
  ban_time: timestamp('ban_time', { withTimezone: true }),
  email_preferences: jsonb('email_preferences').notNull().default({
    usage_limit: true,
    credit_usage: true,
    onboarding: true,
    weekly_stats: true,
    monthly_stats: true,
    deploy_stats_24h: true,
    bundle_created: true,
    bundle_deployed: true,
    device_error: true,
    channel_self_rejected: true,
  }),
})

export const stripe_info = pgTable('stripe_info', {
  id: bigint('id', { mode: 'number' }).primaryKey().notNull(),
  customer_id: text('customer_id'),
  product_id: varchar('product_id'),
  status: text('status'),
  trial_at: text('trial_at'),
  is_good_plan: boolean('is_good_plan'),
  mau_exceeded: boolean('mau_exceeded'),
  storage_exceeded: boolean('storage_exceeded'),
  bandwidth_exceeded: boolean('bandwidth_exceeded'),
})

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().notNull(),
  name: varchar('name').notNull(),
  stripe_id: varchar('stripe_id').notNull(),
  credit_id: text('credit_id').notNull(),
})

export const apikeys = pgTable('apikeys', {
  id: bigint('id', { mode: 'number' }).primaryKey().notNull(),
  created_at: timestamp('created_at').defaultNow(),
  user_id: uuid('user_id').notNull(),
  key: varchar('key'),
  key_hash: varchar('key_hash'),
  mode: keyModePgEnum('mode').notNull(),
  updated_at: timestamp('updated_at').defaultNow(),
  name: varchar('name').notNull(),
  limited_to_orgs: uuid('limited_to_orgs').array(),
  limited_to_apps: varchar('limited_to_apps').array(),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  rbac_id: uuid('rbac_id').notNull(),
})

export const org_users = pgTable('org_users', {
  id: bigint('id', { mode: 'number' }).primaryKey().notNull(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
  user_id: uuid('user_id').notNull(),
  org_id: uuid('org_id').notNull(),
  app_id: varchar('app_id'),
  channel_id: bigint('channel_id', { mode: 'number' }),
  user_right: userMinRightPgEnum('user_right'),
  rbac_role_name: text('rbac_role_name'),
})

// SSO tables
export const org_saml_connections = pgTable('org_saml_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  sso_provider_id: uuid('sso_provider_id').notNull().unique(),
  provider_name: text('provider_name').notNull(),
  metadata_url: text('metadata_url'),
  metadata_xml: text('metadata_xml'),
  entity_id: text('entity_id').notNull(),
  current_certificate: text('current_certificate'),
  certificate_expires_at: timestamp('certificate_expires_at', { withTimezone: true }),
  certificate_last_checked: timestamp('certificate_last_checked', { withTimezone: true }).defaultNow(),
  enabled: boolean('enabled').notNull().default(false),
  verified: boolean('verified').notNull().default(false),
  auto_join_enabled: boolean('auto_join_enabled').notNull().default(false),
  attribute_mapping: text('attribute_mapping').default('{}'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  created_by: uuid('created_by'),
})

export const saml_domain_mappings = pgTable('saml_domain_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  domain: text('domain').notNull(),
  org_id: uuid('org_id').notNull(),
  sso_connection_id: uuid('sso_connection_id').notNull(),
  priority: integer('priority').notNull().default(0),
  verified: boolean('verified').notNull().default(true),
  verification_code: text('verification_code'),
  verified_at: timestamp('verified_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sso_audit_logs = pgTable('sso_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  user_id: uuid('user_id'),
  email: text('email'),
  event_type: text('event_type').notNull(),
  org_id: uuid('org_id'),
  sso_provider_id: uuid('sso_provider_id'),
  sso_connection_id: uuid('sso_connection_id'),
  ip_address: text('ip_address'),
  user_agent: text('user_agent'),
  country: text('country'),
  saml_assertion_id: text('saml_assertion_id'),
  saml_session_index: text('saml_session_index'),
  error_code: text('error_code'),
  error_message: text('error_message'),
  metadata: text('metadata'),
})

// RBAC tables
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  scope_type: text('scope_type').notNull(),
  description: text('description'),
  priority_rank: bigint('priority_rank', { mode: 'number' }).notNull().default(0),
  is_assignable: boolean('is_assignable').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
  created_by: uuid('created_by'),
})

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  is_system: boolean('is_system').notNull().default(false),
  created_by: uuid('created_by'),
  created_at: timestamp('created_at').notNull().defaultNow(),
})

export const group_members = pgTable(
  'group_members',
  {
    group_id: uuid('group_id').notNull(),
    user_id: uuid('user_id').notNull(),
    added_by: uuid('added_by'),
    added_at: timestamp('added_at').notNull().defaultNow(),
  },
  t => ({
    pk: primaryKey({ columns: [t.group_id, t.user_id] }),
  }),
)

export const role_bindings = pgTable('role_bindings', {
  id: uuid('id').primaryKey().defaultRandom(),
  principal_type: text('principal_type').notNull(),
  principal_id: uuid('principal_id').notNull(),
  role_id: uuid('role_id').notNull(),
  scope_type: text('scope_type').notNull(),
  org_id: uuid('org_id'),
  app_id: uuid('app_id'),
  bundle_id: bigint('bundle_id', { mode: 'number' }),
  channel_id: bigint('channel_id', { mode: 'number' }),
  granted_by: uuid('granted_by').notNull(),
  granted_at: timestamp('granted_at').notNull().defaultNow(),
  expires_at: timestamp('expires_at'),
  reason: text('reason'),
  is_direct: boolean('is_direct').notNull().default(true),
})

// Export all tables as schema object for convenience
export const schema = {
  apps,
  app_versions,
  manifest,
  channels,
  channel_devices,
  orgs,
  users,
  stripe_info,
  apikeys,
  org_users,
  org_saml_connections,
  saml_domain_mappings,
  sso_audit_logs,
  roles,
  groups,
  group_members,
  role_bindings,
}
