import type { Context } from 'hono'
import type { getDrizzleClient } from './pg.ts'
import type { getDrizzleClientD1 } from './pg_d1.ts'
import { and, eq, or, sql } from 'drizzle-orm'
import { getAlias } from './pg.ts'
import { getAliasV2, parseManifestEntries } from './pg_d1.ts'
import * as schema from './postgress_schema.ts'
import * as schemaV2 from './sqlite_schema.ts'

export function requestInfosPostgresLite(
  c: Context,
  app_id: string,
  version_name: string,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
) {
  const { versionAlias, channelAlias } = getAlias()

  const appVersions = drizzleCient
    .select({
      id: versionAlias.id,
    })
    .from(versionAlias)
    .where(or(eq(versionAlias.name, version_name), eq(versionAlias.app_id, app_id)))
    .limit(1)
    .then(data => data.at(0))

  const channel = drizzleCient
    .select({
      version: {
        id: sql<number>`${versionAlias.id}`.as('vid'),
        name: sql<string>`${versionAlias.name}`.as('vname'),
        checksum: sql<string | null>`${versionAlias.checksum}`.as('vchecksum'),
        session_key: sql<string | null>`${versionAlias.session_key}`.as('vsession_key'),
        storage_provider: sql<string>`${versionAlias.storage_provider}`.as('vstorage_provider'),
        external_url: sql<string | null>`${versionAlias.external_url}`.as('vexternal_url'),
        min_update_version: sql<string | null>`${versionAlias.min_update_version}`.as('vminUpdateVersion'),
        r2_path: sql`${versionAlias.r2_path}`.mapWith(versionAlias.r2_path).as('vr2_path'),
      },
      channels: {
        id: channelAlias.id,
        name: channelAlias.name,
        app_id: channelAlias.app_id,
        public: channelAlias.public,
      },
      manifestEntries: sql<{ file_name: string, file_hash: string, s3_path: string }[]>`array_agg(json_build_object(
        'file_name', ${schema.manifest.file_name},
        'file_hash', ${schema.manifest.file_hash},
        's3_path', ${schema.manifest.s3_path}
      ))`,
    })
    .from(channelAlias)
    .innerJoin(versionAlias, eq(channelAlias.version, versionAlias.id))
    .leftJoin(schema.manifest, eq(schema.manifest.app_version_id, versionAlias.id))
    .where(and(
      eq(channelAlias.public, true),
      eq(channelAlias.app_id, app_id),
    ))
    .groupBy(channelAlias.id, versionAlias.id)
    .limit(1)
    .then(data => parseManifestEntries(c, data, 'channel'))

  return Promise.all([channel, appVersions])
    .then(([channelData, versionData]) => ({ versionData, channelData }))
    .catch((e) => {
      throw e
    })
}

export function requestInfosPostgresLiteV2(
  c: Context,
  app_id: string,
  version_name: string,
  drizzleCient: ReturnType<typeof getDrizzleClientD1>,
) {
  const { versionAlias, channelAlias } = getAliasV2()

  const appVersions = drizzleCient
    .select({
      id: versionAlias.id,
    })
    .from(versionAlias)
    .where(or(eq(versionAlias.name, version_name), eq(versionAlias.app_id, app_id)))
    .limit(1)
    .then(data => data.at(0))

  const channel = drizzleCient
    .select({
      version: {
        id: sql<number>`${versionAlias.id}`.as('vid'),
        name: sql<string>`${versionAlias.name}`.as('vname'),
        checksum: sql<string | null>`${versionAlias.checksum}`.as('vchecksum'),
        session_key: sql<string | null>`${versionAlias.session_key}`.as('vsession_key'),
        storage_provider: sql<string>`${versionAlias.storage_provider}`.as('vstorage_provider'),
        external_url: sql<string | null>`${versionAlias.external_url}`.as('vexternal_url'),
        min_update_version: sql<string | null>`${versionAlias.min_update_version}`.as('vminUpdateVersion'),
        r2_path: sql`${versionAlias.r2_path}`.mapWith(versionAlias.r2_path).as('vr2_path'),
      },
      channels: {
        id: channelAlias.id,
        name: channelAlias.name,
        app_id: channelAlias.app_id,
        public: channelAlias.public,
      },
      manifestEntries: sql<{ file_name: string, file_hash: string, s3_path: string }[]>`json_group_array(json_object(
        'file_name', ${schemaV2.manifest.file_name},
        'file_hash', ${schemaV2.manifest.file_hash},
        's3_path', ${schemaV2.manifest.s3_path}
      ))`,
    })
    .from(channelAlias)
    .innerJoin(versionAlias, eq(channelAlias.version, versionAlias.id))
    .leftJoin(schemaV2.manifest, eq(schemaV2.manifest.app_version_id, versionAlias.id))
    .where(and(
      eq(channelAlias.public, true),
      eq(channelAlias.app_id, app_id),
    ))
    .groupBy(channelAlias.id, versionAlias.id)
    .limit(1)
    .then(data => parseManifestEntries(c, data, 'channel'))

  return Promise.all([channel, appVersions])
    .then(([channelData, versionData]) => ({ versionData, channelData }))
    .catch((e) => {
      throw e
    })
}
