export function parseUploadChannels(channel: string | null | undefined): string[] {
  if (!channel)
    return []

  const channels = channel
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  return Array.from(new Set(channels))
}

export function formatUploadChannels(channels: readonly string[]): string {
  return channels.join(', ')
}

export function getChannelsToAssignByChecksum(
  channels: readonly string[],
  currentChecksum: string,
  remoteChecksums: ReadonlyMap<string, string | null | undefined>,
): { channelsAlreadyCurrent: string[], channelsToAssign: string[] } {
  const channelsAlreadyCurrent: string[] = []
  const channelsToAssign: string[] = []

  for (const channel of channels) {
    if (remoteChecksums.get(channel) === currentChecksum) {
      channelsAlreadyCurrent.push(channel)
      continue
    }

    channelsToAssign.push(channel)
  }

  return { channelsAlreadyCurrent, channelsToAssign }
}
