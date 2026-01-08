import { bigint, boolean, integer, pgEnum, pgTable, serial, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

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
  id: uuid('id').notNull(),
  created_by: uuid('created_by').notNull(),
  logo: text('logo'),
  name: text('name').notNull(),
  management_email: text('management_email').notNull(),
  customer_id: text('customer_id'),
  require_apikey_expiration: boolean('require_apikey_expiration').notNull().default(false),
  max_apikey_expiration_days: integer('max_apikey_expiration_days'),
})

export const stripe_info = pgTable('stripe_info', {
  id: bigint('id', { mode: 'number' }).primaryKey().notNull(),
  customer_id: text('customer_id'),
  status: text('status'),
  trial_at: text('trial_at'),
  is_good_plan: boolean('is_good_plan'),
  mau_exceeded: boolean('mau_exceeded'),
  storage_exceeded: boolean('storage_exceeded'),
  bandwidth_exceeded: boolean('bandwidth_exceeded'),
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
})
