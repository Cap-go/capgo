import cryptoRandomString from 'crypto-random-string'
import * as semver from 'semver'
import type { Context } from '@hono/hono'
import { and, eq, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { isAllowedActionOrg } from './supabase.ts'
import type { AppInfos } from './types.ts'
import type { Database } from './supabase.types.ts'
import { sendNotifOrg } from './notifications.ts'
import type { ManifestEntry } from './downloadUrl.ts'
import { getBundleUrl, getManifestUrl } from './downloadUrl.ts'
import { logsnag } from './logsnag.ts'
import { appIdToUrl } from './conversion.ts'
import * as schema from './postgress_schema.ts'
import type { DeviceWithoutCreatedAt } from './stats.ts'
import { createStatsBandwidth, createStatsMau, createStatsVersion, sendStatsAndDevice } from './stats.ts'
import { closeClient, getDrizzleClient, getPgClient } from './pg.ts'
import { saveStoreInfoCF } from './cloudflare.ts'

function resToVersion(plugin_version: string, signedURL: string, version: Database['public']['Tables']['app_versions']['Row'], manifest: ManifestEntry[]) {
  const res: {
    version: string
    url: string
    session_key?: string
    checksum?: string | null
    manifest?: ManifestEntry[]
  } = {
    version: version.name,
    url: signedURL,
  }
  if (semver.gte(plugin_version, '4.13.0'))
    res.session_key = version.session_key || ''
  if (semver.gte(plugin_version, '4.4.0'))
    res.checksum = version.checksum
  if (semver.gte(plugin_version, '6.2.0') && manifest.length > 0)
    res.manifest = manifest
  return res
}

async function requestInfosPostgres(
  platform: string,
  app_id: string,
  device_id: string,
  version_name: string,
  defaultChannel: string,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
) {
  const appVersions = drizzleCient
    .select({
      id: schema.app_versions.id,
    })
    .from(schema.app_versions)
    .where(or(eq(schema.app_versions.name, version_name), eq(schema.app_versions.app_id, app_id)))
    .limit(1)
    .then(data => data.at(0))

  const versionAlias = alias(schema.app_versions, 'version')
  const secondVersionAlias = alias(schema.app_versions, 'second_version')

  const deviceOverwrite = drizzleCient
    .select({
      device_id: schema.devices_override.device_id,
      app_id: schema.devices_override.app_id,
      version: {
        id: versionAlias.id,
        name: versionAlias.name,
        checksum: versionAlias.checksum,
        session_key: versionAlias.session_key,
        bucket_id: versionAlias.bucket_id,
        storage_provider: versionAlias.storage_provider,
        external_url: versionAlias.external_url,
        min_update_version: versionAlias.min_update_version,
        r2_path: sql`${versionAlias.r2_path}`.mapWith(versionAlias.r2_path).as('vr2_path'),
        manifest: sql`${versionAlias.manifest}`.mapWith(versionAlias.manifest).as('vmanifest'),
      },
    })
    .from(schema.devices_override)
    .innerJoin(versionAlias, eq(schema.devices_override.version, versionAlias.id))
    .where(and(eq(schema.devices_override.device_id, device_id), eq(schema.devices_override.app_id, app_id)))
    .limit(1)
    .then(data => data.at(0))

  const channelDeviceReq = drizzleCient
    .select({
      channel_devices: {
        device_id: schema.channel_devices.device_id,
        app_id: sql<string>`${schema.channel_devices.app_id}`.as('cd_app_id'),
      },
      version: {
        id: sql<number>`${versionAlias.id}`.as('vid'),
        name: sql<string>`${versionAlias.name}`.as('vname'),
        checksum: sql<string | null>`${versionAlias.checksum}`.as('vchecksum'),
        session_key: sql<string | null>`${versionAlias.session_key}`.as('vsession_key'),
        bucket_id: sql<string | null>`${versionAlias.bucket_id}`.as('vbucket_id'),
        storage_provider: sql<string>`${versionAlias.storage_provider}`.as('vstorage_provider'),
        external_url: sql<string | null>`${versionAlias.external_url}`.as('vexternal_url'),
        min_update_version: sql<string | null>`${versionAlias.min_update_version}`.as('vminUpdateVersion'),
        r2_path: sql`${versionAlias.r2_path}`.mapWith(versionAlias.r2_path).as('vr2_path'),
        manifest: sql`${versionAlias.manifest}`.mapWith(versionAlias.manifest).as('vmanifest'),
      },
      secondVersion: {
        id: sql<number>`${secondVersionAlias.id}`.as('svid'),
        name: sql<string>`${secondVersionAlias.name}`.as('svname'),
        checksum: sql<string | null>`${secondVersionAlias.checksum}`.as('svchecksum'),
        session_key: sql<string | null>`${secondVersionAlias.session_key}`.as('svsession_key'),
        bucket_id: sql<string | null>`${secondVersionAlias.bucket_id}`.as('svbucket_id'),
        storage_provider: sql<string>`${secondVersionAlias.storage_provider}`.as('svstorage_provider'),
        external_url: sql<string | null>`${secondVersionAlias.external_url}`.as('svexternal_url'),
        min_update_version: sql<string | null>`${secondVersionAlias.min_update_version}`.as('svminUpdateVersion'),
        r2_path: sql`${secondVersionAlias.r2_path}`.mapWith(secondVersionAlias.r2_path).as('svr2_path'),
        manifest: sql`${versionAlias.manifest}`.mapWith(versionAlias.manifest).as('vmanifest'),
      },
      channels: {
        id: schema.channels.id,
        name: schema.channels.name,
        app_id: schema.channels.app_id,
        allow_dev: schema.channels.allow_dev,
        allow_emulator: schema.channels.allow_emulator,
        disable_auto_update_under_native: schema.channels.disable_auto_update_under_native,
        disable_auto_update: schema.channels.disable_auto_update,
        ios: schema.channels.ios,
        android: schema.channels.android,
        secondary_version_percentage: schema.channels.secondary_version_percentage,
        enable_progressive_deploy: schema.channels.enable_progressive_deploy,
        enable_ab_testing: schema.channels.enable_ab_testing,
        allow_device_self_set: schema.channels.allow_device_self_set,
        public: schema.channels.public,
      },
    },
    )
    .from(schema.channel_devices)
    .innerJoin(schema.channels, eq(schema.channel_devices.channel_id, schema.channels.id))
    .innerJoin(versionAlias, eq(schema.channels.version, versionAlias.id))
    .leftJoin(secondVersionAlias, eq(schema.channels.second_version, secondVersionAlias.id))
    .where(and(eq(schema.channel_devices.device_id, device_id), eq(schema.channel_devices.app_id, app_id)))
  const channelDevice = channelDeviceReq
    .limit(1)
    .then(data => data.at(0))

  // v => version
  // sv => secondversion
  const channel = drizzleCient
    .select({
      version: {
        id: sql<number>`${versionAlias.id}`.as('vid'),
        name: sql<string>`${versionAlias.name}`.as('vname'),
        checksum: sql<string | null>`${versionAlias.checksum}`.as('vchecksum'),
        session_key: sql<string | null>`${versionAlias.session_key}`.as('vsession_key'),
        bucket_id: sql<string | null>`${versionAlias.bucket_id}`.as('vbucket_id'),
        storage_provider: sql<string>`${versionAlias.storage_provider}`.as('vstorage_provider'),
        external_url: sql<string | null>`${versionAlias.external_url}`.as('vexternal_url'),
        min_update_version: sql<string | null>`${versionAlias.min_update_version}`.as('vminUpdateVersion'),
        r2_path: sql`${versionAlias.r2_path}`.mapWith(versionAlias.r2_path).as('vr2_path'),
        manifest: sql`${versionAlias.manifest}`.mapWith(versionAlias.manifest).as('vmanifest'),
      },
      secondVersion: {
        id: sql<number>`${secondVersionAlias.id}`.as('svid'),
        name: sql<string>`${secondVersionAlias.name}`.as('svname'),
        checksum: sql<string | null>`${secondVersionAlias.checksum}`.as('svchecksum'),
        session_key: sql<string | null>`${secondVersionAlias.session_key}`.as('svsession_key'),
        bucket_id: sql<string | null>`${secondVersionAlias.bucket_id}`.as('svbucket_id'),
        storage_provider: sql<string>`${secondVersionAlias.storage_provider}`.as('svstorage_provider'),
        external_url: sql<string | null>`${secondVersionAlias.external_url}`.as('svexternal_url'),
        min_update_version: sql<string | null>`${secondVersionAlias.min_update_version}`.as('svminUpdateVersion'),
        r2_path: sql`${secondVersionAlias.r2_path}`.mapWith(secondVersionAlias.r2_path).as('svr2_path'),
        manifest: sql`${versionAlias.manifest}`.mapWith(versionAlias.manifest).as('vmanifest'),
      },
      channels: {
        id: schema.channels.id,
        name: schema.channels.name,
        app_id: schema.channels.app_id,
        allow_dev: schema.channels.allow_dev,
        allow_emulator: schema.channels.allow_emulator,
        disable_auto_update_under_native: schema.channels.disable_auto_update_under_native,
        disable_auto_update: schema.channels.disable_auto_update,
        ios: schema.channels.ios,
        android: schema.channels.android,
        secondary_version_percentage: schema.channels.secondary_version_percentage,
        enable_progressive_deploy: schema.channels.enable_progressive_deploy,
        enable_ab_testing: schema.channels.enable_ab_testing,
        allow_device_self_set: schema.channels.allow_device_self_set,
        public: schema.channels.public,
      },
    })
    .from(schema.channels)
    .innerJoin(versionAlias, eq(schema.channels.version, versionAlias.id))
    .leftJoin(secondVersionAlias, eq(schema.channels.second_version, secondVersionAlias.id))
    .where(!defaultChannel
      ? and(
        eq(schema.channels.public, true),
        eq(schema.channels.app_id, app_id),
        eq(platform === 'android' ? schema.channels.android : schema.channels.ios, true),
      )
      : and (
        eq(schema.channels.app_id, app_id),
        eq(schema.channels.name, defaultChannel),
      ),
    )
    .limit(1)
    .then(data => data.at(0))

  // promise all
  const [devicesOverride, channelOverride, channelData, versionData] = await Promise.all([deviceOverwrite, channelDevice, channel, appVersions])
  return { versionData, channelData, channelOverride, devicesOverride }
}

async function getAppOwnerPostgres(
  appId: string,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
): Promise<{ owner_org: string, orgs: { created_by: string, id: string } } | null> {
  try {
    const appOwner = await drizzleCient
      .select({
        owner_org: schema.apps.owner_org,
        orgs: {
          created_by: schema.orgs.created_by,
          id: schema.orgs.id,
        },
      })
      .from(schema.apps)
      .where(eq(schema.apps.app_id, appId))
      .innerJoin(alias(schema.orgs, 'orgs'), eq(schema.apps.owner_org, schema.orgs.id))
      .limit(1)
      .then(data => data[0])

    return appOwner
  }
  catch (e: any) {
    console.error('getAppOwnerPostgres', e)
    return null
  }
}

export async function updateWithPG(c: Context, body: AppInfos, drizzleCient: ReturnType<typeof getDrizzleClient>) {
  const LogSnag = logsnag(c)
  const id = cryptoRandomString({ length: 10 })
  try {
    console.log(id, 'body', body, new Date().toISOString())
    let {
      version_name,
      version_build,
    } = body
    const {
      platform,
      app_id,
      device_id,
      version_os,
      plugin_version = '2.3.3',
      custom_id,
      defaultChannel,
      is_emulator = false,
      is_prod = true,
    } = body
    // if version_build is not semver, then make it semver
    const coerce = semver.coerce(version_build, { includePrerelease: true })
    const appOwner = await getAppOwnerPostgres(app_id, drizzleCient)
    if (!appOwner) {
      if (app_id) {
        await saveStoreInfoCF(c, {
          app_id,
          onprem: true,
          capacitor: true,
          capgo: true,
        })
      }
      console.log(id, 'App not found', app_id, new Date().toISOString())
      return c.json({
        message: 'App not found',
        error: 'app_not_found',
      }, 200)
    }
    await createStatsMau(c, device_id, app_id) // TODO: see if anaylytics got too expensive or not. Then keep it or move it back to same place as createStatsBandwidth
    if (coerce) {
      version_build = coerce.version
    }
    else {
      // get app owner with app_id
      const sent = await sendNotifOrg(c, 'user:semver_issue', {
        current_app_id: app_id,
        current_device_id: device_id,
        current_version_id: version_build,
        current_app_id_url: appIdToUrl(app_id),
      }, appOwner.owner_org, app_id, '0 0 * * 1', 'red')
      if (sent) {
        await LogSnag.track({
          channel: 'updates',
          event: 'semver issue',
          icon: '⚠️',
          user_id: appOwner.owner_org,
          notify: false,
        }).catch()
      }
      return c.json({
        message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number`,
        error: 'semver_error',
      }, 400)
    }
    // if plugin_version is < 4 send notif to alert
    if (semver.lt(plugin_version, '5.0.0')) {
      const sent = await sendNotifOrg(c, 'user:plugin_issue', {
        current_app_id: app_id,
        current_device_id: device_id,
        current_version_id: version_build,
        current_app_id_url: appIdToUrl(app_id),
      }, appOwner.owner_org, app_id, '0 0 * * 1', 'red')
      if (sent) {
        await LogSnag.track({
          channel: 'updates',
          event: 'plugin issue',
          icon: '⚠️',
          user_id: appOwner.owner_org,
          notify: false,
        } as any).catch()
      }
    }
    version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name
    if (!app_id || !device_id || !version_build || !version_name || !platform) {
      return c.json({
        message: 'Cannot find device_id or appi_id',
        error: 'missing_info',
      }, 400)
    }

    console.log(id, 'vals', platform, app_id, device_id, custom_id, version_build, is_emulator, is_prod, plugin_version, version_name, new Date().toISOString())

    const device: DeviceWithoutCreatedAt = {
      app_id,
      device_id,
      plugin_version,
      version: 0,
      custom_id,
      is_emulator,
      is_prod,
      version_build,
      os_version: version_os,
      platform: platform as Database['public']['Enums']['platform_os'],
      updated_at: new Date().toISOString(),
    }

    const requestedInto = await requestInfosPostgres(platform, app_id, device_id, version_name, defaultChannel, drizzleCient)

    const { versionData, channelOverride, devicesOverride } = requestedInto
    let { channelData } = requestedInto

    if (!versionData) {
      console.log('No version data found')
      return c.json({
        message: 'Couldn\'t find version data',
        error: 'no-version_data',
      }, 200)
    }

    if (!channelData && !channelOverride && !devicesOverride) {
      console.log(id, 'Cannot get channel or override', app_id, 'no default channel', new Date().toISOString())
      if (versionData)
        await sendStatsAndDevice(c, device, [{ action: 'NoChannelOrOverride', versionId: versionData.id }])

      return c.json({
        message: 'no default channel or override',
        error: 'no_channel',
      }, 200)
    }

    // Trigger only if the channel is overwriten but the version is not
    if (channelOverride && !devicesOverride)
      channelData = channelOverride

    if (!channelData) {
      return c.json({
        message: 'channel data still null',
        error: 'null_channel_data',
      }, 200)
    }

    let enableAbTesting: boolean = channelData.channels.enable_ab_testing
    const enableProgressiveDeploy: boolean = channelData.channels.enable_progressive_deploy
    // let enableAbTesting: boolean = (channelOverride?.channel_id as any)?.enableAbTesting || channelData?.enableAbTesting

    const enableSecondVersion = enableAbTesting || enableProgressiveDeploy

    let version = devicesOverride?.version || channelOverride?.version || channelData.version
    const secondVersion = enableSecondVersion ? (channelData.secondVersion) : undefined
    // const secondVersion: Database['public']['Tables']['app_versions']['Row'] | undefined = (enableSecondVersion ? channelData? : undefined) as any as Database['public']['Tables']['app_versions']['Row'] | undefined

    const planValid = await isAllowedActionOrg(c, appOwner.orgs.id)
    device.version = versionData ? versionData.id : version.id

    if (enableAbTesting || enableProgressiveDeploy) {
      if (secondVersion && secondVersion?.name !== 'unknown') {
        const secondVersionPercentage: number = channelData.channels.secondary_version_percentage // ((channelOverride?.channel_id as any)?.secondaryVersionPercentage || channelData?.secondaryVersionPercentage) ?? 0

        if (secondVersion.name === version_name || version.name === 'unknown' || secondVersionPercentage === 1) {
          version = secondVersion
        }
        else if (secondVersionPercentage === 0) { /* empty (do nothing) */ }
        else if (version.name !== version_name) {
          const randomChange = Math.random()

          if (randomChange < secondVersionPercentage)
            version = secondVersion
        }
      }
      else {
        enableAbTesting = false
      }
    }

    // TODO: find better solution to check if device is from apple or google, currently not qworking in netlify-egde
    // const xForwardedFor = headers['x-forwarded-for'] || ''
    // // console.log('xForwardedFor', xForwardedFor)
    // const ip = xForwardedFor.split(',')[1]
    // console.log('IP', ip)
    // check if version is created_at more than 4 hours
    // const isOlderEnought = (new Date(version.created_at || Date.now()).getTime() + 4 * 60 * 60 * 1000) < Date.now()

    // if (xForwardedFor && device_id !== defaultDeviceID && !isOlderEnought && await invalidIp(ip)) {
    //   console.log('invalid ip', xForwardedFor, ip)
    //   return c.json({
    //     message: `invalid ip ${xForwardedFor} ${JSON.stringify(headers)}`,
    //     error: 'invalid_ip',
    //   }, 400)
    // }

    if (!planValid) {
      console.log(id, 'Cannot update, upgrade plan to continue to update', app_id)
      await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
      return c.json({
        message: 'Cannot update, upgrade plan to continue to update',
        error: 'need_plan_upgrade',
      }, 200)
    }

    if (!version.bucket_id && !version.external_url && !version.r2_path) {
      console.log(id, 'Cannot get bundle', app_id, version)
      await sendStatsAndDevice(c, device, [{ action: 'missingBundle' }])
      return c.json({
        message: 'Cannot get bundle',
        error: 'no_bundle',
      }, 200)
    }

    // console.log('signedURL', device_id, signedURL, version_name, version.name)
    if (version_name === version.name) {
      console.log(id, 'No new version available', device_id, version_name, version.name, new Date().toISOString())
      await sendStatsAndDevice(c, device, [{ action: 'noNew' }])
      return c.json({
        message: 'No new version available',
      }, 200)
    }

    if (!devicesOverride && channelData) {
    // console.log('check disableAutoUpdateToMajor', device_id)
      if (!channelData.channels.ios && platform === 'ios') {
        console.log(id, 'Cannot update, ios is disabled', device_id, new Date().toISOString())
        await sendStatsAndDevice(c, device, [{ action: 'disablePlatformIos' }])
        return c.json({
          message: 'Cannot update, ios it\'s disabled',
          error: 'disabled_platform_ios',
          version: version.name,
          old: version_name,
        }, 200)
      }
      if (!channelData.channels.android && platform === 'android') {
        console.log(id, 'Cannot update, android is disabled', device_id, new Date().toISOString())
        await sendStatsAndDevice(c, device, [{ action: 'disablePlatformAndroid' }])
        console.log(id, 'sendStats', new Date().toISOString())
        return c.json({
          message: 'Cannot update, android is disabled',
          error: 'disabled_platform_android',
          version: version.name,
          old: version_name,
        }, 200)
      }
      if (channelData.channels.disable_auto_update === 'major' && semver.major(version.name) > semver.major(version_name)) {
        console.log(id, 'Cannot upgrade major version', device_id, new Date().toISOString())
        await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateToMajor' }])
        return c.json({
          major: true,
          message: 'Cannot upgrade major version',
          error: 'disable_auto_update_to_major',
          version: version.name,
          old: version_name,
        }, 200)
      }

      if (!channelData.channels.allow_device_self_set && !channelData.channels.public) {
        console.log(id, 'Cannot update via a private channel', device_id, new Date().toISOString())
        await sendStatsAndDevice(c, device, [{ action: 'cannotUpdateViaPrivateChannel' }])
        return c.json({
          message: 'Cannot update via a private channel. Please ensure your defaultChannel has "Allow devices to self associate" set to true',
          error: 'cannot_update_via_private_channel',
        }, 200)
      }

      if (channelData.channels.disable_auto_update === 'minor' && semver.minor(version.name) > semver.minor(version_name)) {
        console.log(id, 'Cannot upgrade minor version', device_id, new Date().toISOString())
        await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateToMinor' }])
        return c.json({
          major: true,
          message: 'Cannot upgrade minor version',
          error: 'disable_auto_update_to_minor',
          version: version.name,
          old: version_name,
        }, 200)
      }

      console.log(version.name, version_name)
      if (channelData.channels.disable_auto_update === 'patch' && !(
        semver.patch(version.name) > semver.patch(version_name)
        && semver.major(version.name) === semver.major(version_name)
        && semver.minor(version.name) === semver.minor(version_name)
      )) {
        console.log(id, 'Cannot upgrade patch version', device_id, new Date().toISOString())
        await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateToPatch' }])
        return c.json({
          major: true,
          message: 'Cannot upgrade patch version',
          error: 'disable_auto_update_to_patch',
          version: version.name,
          old: version_name,
          aaa: `${semver.patch(version.name)}, ${semver.patch(version_name)}`,
        }, 200)
      }

      if (channelData.channels.disable_auto_update === 'version_number') {
        const minUpdateVersion = version.min_update_version

        // The channel is misconfigured
        if (minUpdateVersion === null) {
          console.log(id, 'Channel is misconfigured', channelData.channels.name, new Date().toISOString())
          await sendStatsAndDevice(c, device, [{ action: 'channelMisconfigured' }])
          return c.json({
            message: `Channel ${channelData.channels.name} is misconfigured`,
            error: 'misconfigured_channel',
            version: version.name,
            old: version_name,
          }, 200)
        }

        // Check if the minVersion is greater then the current version
        if (semver.gt(minUpdateVersion, version_name)) {
          console.log(id, 'Cannot upgrade, metadata > current version', device_id, minUpdateVersion, version_name, new Date().toISOString())
          await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateMetadata' }])
          return c.json({
            major: true,
            message: 'Cannot upgrade version, min update version > current version',
            error: 'disable_auto_update_to_metadata',
            version: version.name,
            old: version_name,
          }, 200)
        }
      }

      // console.log(id, 'check disableAutoUpdateUnderNative', device_id)
      if (channelData.channels.disable_auto_update_under_native && semver.lt(version.name, version_build)) {
        console.log(id, 'Cannot revert under native version', device_id, new Date().toISOString())
        await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateUnderNative' }])
        return c.json({
          message: 'Cannot revert under native version',
          error: 'disable_auto_update_under_native',
          version: version.name,
          old: version_name,
        }, 200)
      }

      if (!channelData.channels.allow_dev && !is_prod) {
        console.log(id, 'Cannot update dev build is disabled', device_id, new Date().toISOString())
        await sendStatsAndDevice(c, device, [{ action: 'disableDevBuild' }])
        return c.json({
          message: 'Cannot update, dev build is disabled',
          error: 'disable_dev_build',
          version: version.name,
          old: version_name,
        }, 200)
      }
      if (!channelData.channels.allow_emulator && is_emulator) {
        console.log(id, 'Cannot update emulator is disabled', device_id, new Date().toISOString())
        await sendStatsAndDevice(c, device, [{ action: 'disableEmulator' }])
        return c.json({
          message: 'Cannot update, emulator is disabled',
          error: 'disable_emulator',
          version: version.name,
          old: version_name,
        }, 200)
      }
    }
    let signedURL = version.external_url || ''
    let manifest: ManifestEntry[] = []
    if ((version.bucket_id || version.r2_path) && !version.external_url) {
      const res = await getBundleUrl(c, appOwner.orgs.created_by, { app_id, ...version })
      if (res) {
        signedURL = res.url
        // only count the size of the bundle if it's not external
        await createStatsBandwidth(c, device_id, app_id, res.size)
      }
      if (semver.gte(plugin_version, '6.2.0')) {
        manifest = await getManifestUrl(c, { app_id, ...version })
      }
    }
    //  check signedURL and if it's url
    if (!signedURL && (!signedURL.startsWith('http://') || !signedURL.startsWith('https://'))) {
      console.log(id, 'Cannot get bundle signedURL', signedURL, app_id, new Date().toISOString())
      await sendStatsAndDevice(c, device, [{ action: 'cannotGetBundle' }])
      return c.json({
        message: 'Cannot get bundle',
        error: 'no_bundle',
      }, 200)
    }
    // console.log(id, 'save stats', device_id)
    await createStatsVersion(c, version.id, app_id, 'get')
    await sendStatsAndDevice(c, device, [{ action: 'get' }])
    console.log(id, 'New version available', app_id, version.name, signedURL, new Date().toISOString())
    return c.json(resToVersion(plugin_version, signedURL, version as any, manifest), 200)
  }
  catch (e) {
    console.error('e', e)
    return c.json({
      message: `Error unknow ${JSON.stringify(e)}`,
      error: 'unknow_error',
    }, 500)
  }
}

export async function update(c: Context, body: AppInfos) {
  const pgClient = getPgClient(c)
  let res
  try {
    res = await updateWithPG(c, body, getDrizzleClient(pgClient as any))
  }
  catch (e) {
    console.error('update', e)
    return c.json({
      message: `Error unknow ${JSON.stringify(e)}`,
      error: 'unknow_error',
    }, 500)
  }
  closeClient(c, pgClient)
  return res
}
