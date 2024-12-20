import { customType, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const boolean = customType<{ data: boolean }>({
  dataType() {
    return 'boolean'
  },
  toDriver(value: boolean): boolean {
    return value
  },
})

export const apps = sqliteTable('apps', {
  id: text('id').primaryKey().unique(),
  owner_org: text('owner_org').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
  app_id: text('app_id').notNull(),
  icon_url: text('icon_url').notNull(),
  user_id: text('user_id').notNull(),
  name: text('name').unique(),
  last_version: text('last_version'),
  updated_at: integer('updated_at', { mode: 'timestamp' }),
  retention: integer('retention', { mode: 'number' }).notNull().default(2592000),
  default_upload_channel: text('default_upload_channel'),
})
export const app_versions = sqliteTable('app_versions', {
  id: integer('id', { mode: 'number' }).primaryKey().notNull(),
  owner_org: text('owner_org').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
  app_id: text('app_id').notNull().references(() => apps.name),
  name: text('name').notNull(),
  bucket_id: text('bucket_id'),
  r2_path: text('r2_path'),
  user_id: text('user_id'),
  updated_at: integer('updated_at', { mode: 'timestamp' }),
  deleted: boolean('deleted').default(false),
  external_url: text('external_url'),
  checksum: text('checksum'),
  session_key: text('session_key'),
  storage_provider: text('storage_provider').default('r2').notNull(),
  min_update_version: text('min_update_version'),
  manifest: text('manifest', { mode: 'json' }),
})

export const channels = sqliteTable('channels', {
  id: integer('id', { mode: 'number' }).primaryKey().notNull(),
  owner_org: text('owner_org').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
  name: text('name').notNull(),
  app_id: text('app_id').notNull().references(() => apps.name),
  version: integer('version', { mode: 'number' }).notNull().references(() => app_versions.id),
  created_by: text('created_by'),
  updated_at: integer('updated_at', { mode: 'timestamp' }).notNull(),
  public: boolean('public').notNull().default(false),
  disable_auto_update_under_native: boolean('disable_auto_update_under_native').notNull().default(true),
  disable_auto_update: text('disable_auto_update', { enum: ['major', 'minor', 'patch', 'version_number', 'none'] }).default('major').notNull(),
  ios: boolean('ios').default(true).notNull(),
  android: boolean('android').notNull().default(true),
  allow_device_self_set: boolean('allow_device_self_set').default(false).notNull(),
  allow_emulator: boolean('allow_emulator').notNull().default(true),
  allow_dev: boolean('allow_dev').notNull().default(true),
})

export const channel_devices = sqliteTable('channel_devices', {
  id: integer('id', { mode: 'number' }).primaryKey().notNull(),
  owner_org: text('owner_org').notNull(),
  device_id: text('device_id').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).notNull(),
  channel_id: integer('channel_id', { mode: 'number' }).notNull().references(() => channels.id),
  app_id: text('app_id').notNull().references(() => apps.name),
})

export const orgs = sqliteTable('orgs', {
  id: text('id').primaryKey().notNull(),
  created_by: text('created_by').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).notNull(),
  logo: text('logo'),
  name: text('name').notNull(),
  management_email: text('management_email').notNull(),
  customer_id: text('customer_id'),
})

export type AppVersionsType = typeof app_versions.$inferInsert
