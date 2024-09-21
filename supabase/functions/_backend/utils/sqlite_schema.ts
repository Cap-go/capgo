import { customType, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const boolean = customType<{ data: boolean }>({
  dataType() {
    return 'boolean'
  },
  toDriver(value: boolean): string {
    return value ? 'true' : 'false'
  },
})

export const apps = sqliteTable('apps', {
  id: text('id').primaryKey().unique(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
  app_id: text('app_id').notNull(),
  icon_url: text('icon_url').notNull(),
  user_id: text('user_id').notNull(),
  name: text('name').unique(),
  last_version: text('last_version'),
  updated_at: integer('updated_at', { mode: 'timestamp' }),
  retention: integer('retention', { mode: 'number' }).notNull().default(2592000),
})
export const app_versions = sqliteTable('app_versions', {
  id: integer('id', { mode: 'number' }).primaryKey().notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
  app_id: text('app_id').notNull().references(() => apps.name),
  name: text('name').notNull(),
  bucket_id: text('bucket_id'),
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
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
  name: text('name').notNull(),
  app_id: text('app_id').notNull().references(() => apps.name),
  version: integer('version', { mode: 'number' }).notNull().references(() => app_versions.id),
  created_by: text('created_by').notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).notNull(),
  public: boolean('public').notNull().default(false),
  disable_auto_update_under_native: boolean('disable_auto_update_under_native').notNull().default(true),
  disable_auto_update: text('disable_auto_update', { enum: ['major', 'minor', 'version_number', 'none'] }).default('major').notNull(),
  enable_ab_testing: boolean('enable_ab_testing').notNull().default(false),
  enable_progressive_deploy: boolean('enable_progressive_deploy').default(false).notNull(),
  secondary_version_percentage: real('secondary_version_percentage').default(0).notNull(),
  second_version: integer('second_version', { mode: 'number' }).references(() => app_versions.id),
  beta: boolean('beta').notNull().default(false),
  ios: boolean('ios').default(true).notNull(),
  android: boolean('android').notNull().default(true),
  allow_device_self_set: boolean('allow_device_self_set').default(false).notNull(),
  allow_emulator: boolean('allow_emulator').notNull().default(true),
  allow_dev: boolean('allow_dev').notNull().default(true),
})

export const devices_override = sqliteTable('devices_override', {
  device_id: text('device_id').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }),
  version: integer('version', { mode: 'number' }).notNull().references(() => app_versions.id),
  app_id: text('app_id').notNull().references(() => apps.name),
  created_by: text('created_by'),
})

export const channel_devices = sqliteTable('channel_devices', {
  device_id: text('device_id').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }),
  channel_id: integer('channel_id', { mode: 'number' }).notNull().references(() => channels.id),
  app_id: text('app_id').notNull().references(() => apps.name),
  created_by: text('created_by'),
})

export type AppVersionsType = typeof app_versions.$inferInsert
