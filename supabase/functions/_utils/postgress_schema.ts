import { pgEnum, pgTable, varchar, bigint, timestamp, uuid, boolean, text, jsonb, doublePrecision } from 'https://esm.sh/drizzle-orm@^0.29.1/pg-core';

export const disableUpdatePgEnum = pgEnum('disable_update', ["major", "minor", "version_number", "none"])

export const apps = pgTable('apps', {
    created_at: timestamp('created_at').notNull().defaultNow(),
    app_id: varchar('app_id').notNull(),
    icon_url: varchar('icon_url').notNull(),
    user_id: uuid('user_id').notNull(),
    name: varchar('name').unique(),
    last_version: varchar('last_version'),
    updated_at: timestamp('updated_at'),
    id: uuid('id').primaryKey().unique(),
    retention: bigint('retention', { mode: 'number' }).notNull().default(2592000)
})
export const app_versions = pgTable('app_versions', {
    id: bigint('id', { mode: 'number' }).primaryKey().notNull(),
    created_at: timestamp('created_at').notNull(),
    app_id: varchar('app_id').notNull().references(() => apps.name),
    name: varchar('name').notNull(),
    bucket_id: varchar('bucket_id'),
    user_id: uuid('user_id'),
    updated_at: timestamp('updated_at').defaultNow(),
    deleted: boolean('deleted').default(false),
    external_url: varchar('external_url'),
    checksum: varchar('checksum'),
    session_key: varchar('session_key'),
    storage_provider: text('storage_provider').default('r2').notNull(),
    minUpdateVersion: varchar('minUpdateVersion'),
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
    disableAutoUpdateUnderNative: boolean('disableAutoUpdateUnderNative').notNull().default(true),
    disableAutoUpdate: disableUpdatePgEnum('disableAutoUpdate').default('major').notNull(),
    enableAbTesting: boolean('enableAbTesting').notNull().default(false),
    enable_progressive_deploy: boolean('enable_progressive_deploy').default(false).notNull(),
    secondaryVersionPercentage: doublePrecision('secondaryVersionPercentage').default(0).notNull(),
    secondVersion: bigint('secondVersion', { mode: 'number' }).references(() => app_versions.id),
    beta: boolean('beta').notNull().default(false),
    ios: boolean('ios').default(true).notNull(),
    android: boolean('android').notNull().default(true),
    allow_device_self_set: boolean('allow_device_self_set').default(false).notNull(),
    allow_emulator:  boolean('allow_emulator').notNull().default(true),
    allow_dev: boolean('allow_dev').notNull().default(true), 
})


export const devices_override = pgTable('devices_override', {
    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
    device_id: text('device_id').notNull(),
    version: bigint('version', { mode: 'number' }).notNull().references(() => app_versions.id),
    app_id: varchar('app_id').notNull().references(() => apps.name),
    created_by: uuid('created_by')
})

export const channel_devices = pgTable('channel_devices', {
    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
    device_id: text('device_id').notNull(),
    channel_id: bigint('channel_id', { mode: 'number' }).notNull().references(() => channels.id),
    app_id: varchar('app_id').notNull().references(() => apps.name),
    created_by: uuid('created_by')
})

export type AppVersionsType = typeof app_versions.$inferInsert