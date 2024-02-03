CREATE TABLE app_versions (
    id bigint NOT NULL,
    created_at timestamp with time zone,
    app_id character varying NOT NULL,
    name character varying NOT NULL,
    bucket_id character varying,
    user_id uuid NOT NULL,
    updated_at timestamp with time zone,
    deleted boolean DEFAULT false NOT NULL,
    external_url character varying,
    checksum character varying,
    session_key character varying,
    storage_provider text NOT NULL,
    minUpdateVersion character varying null,
    native_packages array null
);

CREATE TABLE apps (
    created_at timestamp with time zone,
    app_id character varying NOT NULL PRIMARY KEY,
    icon_url character varying NOT NULL,
    user_id uuid NOT NULL,
    name character varying,
    last_version character varying,
    updated_at timestamp with time zone,
    id uuid,
    retention bigint NOT NULL
);

CREATE TABLE channel_devices (
    id bigint NOT NULL,
    created_at timestamp with time zone,
    channel_id bigint NOT NULL,
    app_id character varying NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    created_by uuid NOT NULL,
    device_id text NOT NULL
);

CREATE TABLE channels (
    id bigint NOT NULL,
    created_at timestamp with time zone NOT NULL,
    name character varying NOT NULL,
    app_id character varying NOT NULL,
    version bigint NOT NULL,
    created_by uuid NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    public boolean DEFAULT false NOT NULL,
    disableAutoUpdateUnderNative boolean DEFAULT true NOT NULL,
    enableAbTesting boolean not null default false,
    enable_progressive_deploy boolean not null default false,
    secondaryVersionPercentage double precision not null,
    secondVersion bigint NULL,
    disableAutoUpdate character varying NOT NULL,
    beta boolean DEFAULT false NOT NULL,
    ios boolean DEFAULT true NOT NULL,
    android boolean DEFAULT true NOT NULL,
    allow_device_self_set boolean DEFAULT false NOT NULL,
    allow_emulator boolean DEFAULT true NOT NULL,
    allow_dev boolean DEFAULT true NOT NULL
);

CREATE TABLE devices_override (
    id bigint NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    device_id text NOT NULL,
    version bigint NOT NULL,
    app_id character varying NOT NULL,
    created_by uuid
)

CREATE INDEX "idx_app_id_device_id_channel_devices" ON "channel_devices" ("app_id", "device_id");
CREATE INDEX "idx_app_id_name_app_versions" ON "app_versions" ("app_id", "name");
CREATE INDEX "idx_app_id_device_id_devices_override" ON "devices_override" ("app_id", "device_id");
CREATE INDEX "idx_app_id_public_channel_android" ON "channels" ("app_id", "public", "android");
CREATE INDEX "idx_app_id_public_channel_ios" ON "channels" ("app_id", "public", "ios");