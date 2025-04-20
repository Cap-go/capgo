import type { Database } from './supabase.types.ts'
import { bigint, boolean, customType, pgEnum, pgTable, serial, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

// do_not_change

export const disableUpdatePgEnum = pgEnum('disable_update', ['major', 'minor', 'patch', 'version_number', 'none'])

// Keeping this for backward compatibility but marking as deprecated
const manfiestType = customType <{ data: Database['public']['CompositeTypes']['manifest_entry'][] }>({
  dataType() {
    return 'manifest_entry[]'
  },
  fromDriver(value: unknown) {
    if (Array.isArray(value)) {
      for (const element of value) {
        if (typeof element !== 'string')
          throw new Error(`Cannot do DB type mapping - not every element is a string. Data: ${JSON.stringify(value)}`)
        if (element.split(',').length !== 3)
          throw new Error(`Cannot do DB type mapping - splitted string length is not 3. Data: ${element}`)
      }

      return value.map((val) => {
        const split = val.split(',')
        return {
          file_name: split[0].slice(1),
          s3_path: split[1],
          file_hash: split[2].slice(0, -1),
        }
      })
    }

    return [{ file_hash: '', file_name: '', s3_path: '' }]
  },
})

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
})
export const app_versions = pgTable('app_versions', {
  id: bigint('id', { mode: 'number' }).primaryKey().notNull(),
  created_at: timestamp('created_at').notNull(),
  app_id: varchar('app_id').notNull().references(() => apps.name),
  name: varchar('name').notNull(),
  user_id: uuid('user_id'),
  updated_at: timestamp('updated_at').defaultNow(),
  deleted: boolean('deleted').default(false),
  external_url: varchar('external_url'),
  checksum: varchar('checksum'),
  session_key: varchar('session_key'),
  storage_provider: text('storage_provider').default('r2').notNull(),
  min_update_version: varchar('min_update_version'),
  r2_path: varchar('r2_path'),
  // Keeping this for backward compatibility but it's deprecated now
  manifest: manfiestType('manifest'),
})

// New manifest table schema
export const manifest = pgTable('manifest', {
  id: serial('id').primaryKey().notNull(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
  app_version_id: bigint('app_version_id', { mode: 'number' }).notNull().references(() => app_versions.id, { onDelete: 'cascade' }),
  file_name: varchar('file_name').notNull(),
  s3_path: varchar('s3_path').notNull(),
  file_hash: varchar('file_hash').notNull(),
  file_size: bigint('file_size', { mode: 'number' }).default(0),
})

export const channels = pgTable('channels', {
  id: bigint('id', { mode: 'number' }).primaryKey().notNull(),
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
  allow_device_self_set: boolean('allow_device_self_set').default(false).notNull(),
  allow_emulator: boolean('allow_emulator').notNull().default(true),
  allow_dev: boolean('allow_dev').notNull().default(true),
})

export const channel_devices = pgTable('channel_devices', {
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
  device_id: text('device_id').notNull(),
  channel_id: bigint('channel_id', { mode: 'number' }).notNull().references(() => channels.id),
  app_id: varchar('app_id').notNull().references(() => apps.name),
  created_by: uuid('created_by'),
})

export const orgs = pgTable('orgs', {
  id: uuid('id').notNull(),
  created_by: uuid('created_by').notNull(),
})
