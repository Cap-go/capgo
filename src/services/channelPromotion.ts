import type { Permission } from '~/services/permissions'
import { checkPermissions } from '~/services/permissions'

export interface ChannelPromotionTarget {
  id: number
  name: string
}

export type ChannelPromotionPermissionChecker = (
  permission: Permission,
  scope: { appId: string, channelId: number },
) => Promise<boolean>

export async function findChannelsWithoutPromotionPermission(
  appId: string,
  channels: ChannelPromotionTarget[],
  permissionChecker: ChannelPromotionPermissionChecker = checkPermissions,
) {
  const channelPermissions = await Promise.all(channels.map(async (channel) => {
    try {
      const allowed = await permissionChecker('channel.promote_bundle', { appId, channelId: channel.id })
      return { channel, allowed }
    }
    catch {
      return { channel, allowed: false }
    }
  }))

  return channelPermissions
    .filter(({ allowed }) => !allowed)
    .map(({ channel }) => channel)
}

export function formatChannelPromotionTargets(channels: ChannelPromotionTarget[]) {
  return channels.map(channel => channel.name).join(', ')
}
