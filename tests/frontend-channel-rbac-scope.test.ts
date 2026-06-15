import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))

async function readRepoFile(path: string) {
  return await readFile(`${repoRoot}${path}`, 'utf8')
}

describe('frontend channel RBAC scope regressions', () => {
  it.concurrent('checks channel settings updates at channel scope', async () => {
    const source = await readRepoFile('src/pages/app/[app].channel.[channel].vue')

    const permission = 'channel.update_settings'
    expect(source).toContain(`checkPermissions('${permission}', { appId: packageId.value, channelId: id.value })`)
    expect(source).not.toContain(`checkPermissions('${permission}', { appId: packageId.value })`)
  })

  it.concurrent('uses row-scoped channel permissions in the channel table actions', async () => {
    const source = await readRepoFile('src/components/tables/ChannelTable.vue')

    const permission = 'channel.delete'
    const oldSettingsGuard = `disabled: (elem: Element) => !${'canPromoteChannel'}.value[elem.id]`
    expect(source).toContain(`checkPermissions('${permission}', { appId: props.appId, channelId: row.id })`)
    expect(source).toContain(`checkPermissions('${permission}', { appId: props.appId, channelId: one.id })`)
    expect(source).toContain('disabled: (elem: Element) => !canReadChannel.value[elem.id]')
    expect(source).toContain('visible: (elem: Element) => !!canDeleteChannel.value[elem.id]')
    expect(source).not.toContain(`checkPermissions('${permission}', { appId: props.appId })`)
    expect(source).not.toContain(oldSettingsGuard)
  })
})
