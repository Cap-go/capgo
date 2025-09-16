import { customType, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const boolean = customType<{ data: boolean }>({
  dataType() {
    return 'boolean'
  },
  toDriver(value: boolean): boolean {
    return value
  },
})

export const apps = sqliteTable('apps', {
  id: text('id').primaryKey(),
  app_id: text('app_id').notNull(),
  icon_url: text('icon_url').notNull(),
  user_id: text('user_id'),
  name: text('name'),
  last_version: text('last_version'),
  retention: integer('retention', { mode: 'number' }).notNull().default(2592000),
  owner_org: text('owner_org').notNull(),
})

export const app_versions = sqliteTable('app_versions', {
  id: integer('id', { mode: 'number' }).primaryKey().notNull(),
  owner_org: text('owner_org').notNull(),
  app_id: text('app_id').notNull(),
  name: text('name').notNull(),
  r2_path: text('r2_path'),
  user_id: text('user_id'),
  deleted: boolean('deleted').default(false).notNull(),
  external_url: text('external_url'),
  checksum: text('checksum'),
  session_key: text('session_key'),
  storage_provider: text('storage_provider').default('r2').notNull(),
  min_update_version: text('min_update_version'),
})

export const manifest = sqliteTable('manifest', {
  id: integer('id', { mode: 'number' }).primaryKey().notNull(),
  app_version_id: integer('app_version_id', { mode: 'number' }).notNull(),
  file_name: text('file_name').notNull(),
  s3_path: text('s3_path').notNull(),
  file_hash: text('file_hash').notNull(),
})

export const channels = sqliteTable('channels', {
  id: integer('id', { mode: 'number' }).primaryKey().notNull(),
  owner_org: text('owner_org').notNull(),
  name: text('name').notNull(),
  app_id: text('app_id').notNull(),
  version: integer('version', { mode: 'number' }).notNull(),
  created_by: text('created_by'),
  public: boolean('public').default(false).notNull(),
  disable_auto_update_under_native: boolean('disable_auto_update_under_native').default(true).notNull(),
  disable_auto_update: text('disable_auto_update').default('major').notNull(),
  ios: boolean('ios').default(true).notNull(),
  android: boolean('android').default(true).notNull(),
  allow_device_self_set: boolean('allow_device_self_set').default(false).notNull(),
  allow_emulator: boolean('allow_emulator').default(true).notNull(),
  allow_dev: boolean('allow_dev').default(true).notNull(),
})

export const channel_devices = sqliteTable('channel_devices', {
  id: integer('id', { mode: 'number' }).primaryKey().notNull(),
  channel_id: integer('channel_id', { mode: 'number' }).notNull(),
  app_id: text('app_id').notNull(),
  device_id: text('device_id').notNull(),
  owner_org: text('owner_org').notNull(),
})

export const orgs = sqliteTable('orgs', {
  id: text('id').primaryKey().notNull(),
  created_by: text('created_by').notNull(),
  logo: text('logo'),
  name: text('name').notNull(),
  management_email: text('management_email').notNull(),
  customer_id: text('customer_id'),
})

export const stripe_info = sqliteTable('stripe_info', {
  id: integer('id', { mode: 'number' }).primaryKey().notNull(),
  customer_id: text('customer_id'),
  status: text('status'),
  trial_at: text('trial_at'),
  is_good_plan: boolean('is_good_plan'),
  mau_exceeded: boolean('mau_exceeded'),
  storage_exceeded: boolean('storage_exceeded'),
  bandwidth_exceeded: boolean('bandwidth_exceeded'),
})
