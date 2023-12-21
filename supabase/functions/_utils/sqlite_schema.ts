import { sqliteTable, integer, text, real, customType } from 'https://esm.sh/drizzle-orm@^0.29.1/sqlite-core';

const boolean = customType<{ data: boolean }>({
    dataType() {
        return 'boolean';
    },
    toDriver(value: boolean): string {
        return value ? 'true' : 'false';
    },
})

export const apps = sqliteTable('apps', {
    created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
    app_id: text('app_id').notNull(),
    icon_url: text('icon_url').notNull(),
    user_id: text('user_id').notNull(),
    name: text('name').unique(),
    last_version: text('last_version'),
    updated_at: integer('updated_at', { mode: 'timestamp' }),
    id: text('id').primaryKey().unique(),
    retention: integer('retention', { mode: 'number' }).notNull().default(2592000)
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
    minUpdateVersion: text('minUpdateVersion'),
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
    disableAutoUpdateUnderNative: boolean('disableAutoUpdateUnderNative').notNull().default(true),
    disableAutoUpdate: text('disableAutoUpdate', { enum: ["major", "minor", "version_number", "none"] }).default('major').notNull(),
    enableAbTesting: boolean('enableAbTesting').notNull().default(false),
    enable_progressive_deploy: boolean('enable_progressive_deploy').default(false).notNull(),
    secondaryVersionPercentage: real('secondaryVersionPercentage').default(0).notNull(),
    secondVersion: integer('secondVersion', { mode: 'number' }).references(() => app_versions.id),
    beta: boolean('beta').notNull().default(false),
    ios: boolean('ios').default(true).notNull(),
    android: boolean('android').notNull().default(true),
    allow_device_self_set: boolean('allow_device_self_set').default(false).notNull(),
    allow_emulator:  boolean('allow_emulator').notNull().default(true),
    allow_dev: boolean('allow_dev').notNull().default(true), 
})


export const devices_override = sqliteTable('devices_override', {
    created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp' }),
    device_id: text('device_id').notNull(),
    version: integer('version', { mode: 'number' }).notNull().references(() => app_versions.id),
    app_id: text('app_id').notNull().references(() => apps.name),
    created_by: text('created_by')
})

export const channel_devices = sqliteTable('channel_devices', {
    created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp' }),
    device_id: text('device_id').notNull(),
    channel_id: integer('channel_id', { mode: 'number' }).notNull().references(() => channels.id),
    app_id: text('app_id').notNull().references(() => apps.name),
    created_by: text('created_by')
})

export type AppVersionsType = typeof app_versions.$inferInsert