// @vitest-environment happy-dom

import type { App } from 'vue'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, onMounted, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '../messages/en.json'
import ChannelTable from '../src/components/tables/ChannelTable.vue'
import { useDialogV2Store } from '../src/stores/dialogv2'

const state = vi.hoisted(() => ({
  rows: [] as any[],
  failed: false,
  canCreate: true,
  inserts: [] as any[],
  delayedApp: '',
  delayedResponse: null as Promise<unknown> | null,
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@formkit/vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { FormKit: defineComponent({
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup: (props, { emit }) => () => h('input', {
      value: props.modelValue,
      onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
    }),
  }) }
})
vi.mock('~/stores/main', () => ({ useMainStore: () => ({ user: { id: 'preview-user' } }) }))
vi.mock('~/stores/organization', async () => {
  const { defineStore } = await import('pinia')
  const { ref } = await import('vue')
  return { useOrganizationStore: defineStore('channel-test-org', () => ({ currentOrganization: ref({ gid: 'preview-org' }) })) }
})
vi.mock('~/services/permissions', () => ({
  checkPermissions: async (permission: string) => permission === 'app.create_channel' ? state.canCreate : true,
}))
vi.mock('~/components/dashboard/ChannelIntroduction.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({
    props: ['canCreate'],
    emits: ['create'],
    setup: (props, { emit }) => () => h('section', { 'data-test': 'channel-introduction' }, [
      props.canCreate ? h('button', { 'data-test': 'create-channel', 'onClick': () => emit('create') }, 'Create') : null,
    ]),
  }) }
})
vi.mock('~/services/supabase', () => ({
  useSupabase: () => ({
    from(table: string) {
      let appId = ''
      let search = ''
      let insert: any[] | undefined
      const query: any = {
        select: () => query,
        eq: (column: string, value: string) => { if (column === 'app_id') appId = value; return query },
        order: () => query,
        range: () => query,
        like: (_column: string, value: string) => { search = value.slice(1, -1); return query },
        insert: (rows: any[]) => { insert = rows; return query },
        maybeSingle: async () => ({ data: { default_upload_channel: null } }),
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          if (table === 'channels' && appId === state.delayedApp && state.delayedResponse)
            return state.delayedResponse.then(resolve, reject)
          if (insert) {
            state.inserts.push(...insert)
            state.rows.push(...insert.map((row, index) => ({ ...row, id: index + 1 })))
          }
          const rows = state.rows.filter(row => !search || row.name.includes(search))
          return Promise.resolve(table === 'channels'
            ? { data: state.failed ? null : rows, count: state.failed ? null : rows.length }
            : { data: [] }).then(resolve, reject)
        },
      }
      return query
    },
  }),
}))

let app: App | undefined
let container: HTMLElement
let tableEmit: (event: string, value?: unknown) => void
let dialog: ReturnType<typeof useDialogV2Store>
let currentAppId = ref('')

async function settle() {
  for (let i = 0; i < 12; i++)
    await nextTick()
}

async function mountTable(appId = 'com.example.channels') {
  container = document.createElement('div')
  document.body.append(container)
  const target = document.createElement('div')
  target.id = 'dialog-v2-content'
  document.body.append(target)
  const pinia = createPinia()
  currentAppId = ref(appId)
  app = createApp({ setup: () => () => h(ChannelTable, { appId: currentAppId.value }) })
  app.use(pinia)
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
  app.component('DataTable', defineComponent({
    props: ['isLoading', 'elementList', 'showAdd'],
    emits: ['reload', 'update:search'],
    setup(props, { emit }) {
      tableEmit = emit
      onMounted(() => emit('reload'))
      return () => h('div', { 'data-test': 'channel-table', 'data-loading': props.isLoading }, props.elementList.map((row: any) => row.name).join(', '))
    },
  }))
  app.mount(container)
  dialog = useDialogV2Store(pinia)
  await settle()
}

beforeEach(() => {
  state.rows = []
  state.inserts = []
  state.failed = false
  state.canCreate = true
  state.delayedApp = ''
  state.delayedResponse = null
})
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
})

describe('Channels page empty state', () => {
  it('shows the introduction after an empty read without automatically opening creation or writing data', async () => {
    await mountTable()
    expect(container.querySelector('[data-test="channel-introduction"]')).not.toBeNull()
    expect(dialog.showDialog).toBe(false)
    expect(state.inserts).toEqual([])
  })

  it('keeps the regular table when channels exist', async () => {
    state.rows = [{ id: 1, name: 'production' }]
    await mountTable()
    expect(container.querySelector('[data-test="channel-introduction"]')).toBeNull()
    expect(container.textContent).toContain('production')
  })

  it('does not mistake an empty search result for an app without channels', async () => {
    state.rows = [{ id: 1, name: 'production' }]
    await mountTable()
    tableEmit('update:search', 'missing')
    await nextTick()
    tableEmit('reload')
    await settle()
    expect(container.querySelector('[data-test="channel-introduction"]')).toBeNull()
    expect(dialog.showDialog).toBe(false)
  })

  it('does not treat a failed read as an empty app and ends the loading state', async () => {
    state.failed = true
    await mountTable()
    expect(container.querySelector('[data-test="channel-introduction"]')).toBeNull()
    expect(container.querySelector('[data-test="channel-table"]')?.getAttribute('data-loading')).toBe('false')
    expect(dialog.showDialog).toBe(false)
  })

  it('keeps a filtered zero count from showing the introduction before clearing search reloads', async () => {
    state.rows = [{ id: 1, name: 'production' }]
    await mountTable()
    tableEmit('update:search', 'missing')
    await nextTick()
    tableEmit('reload')
    await settle()
    tableEmit('update:search', '')
    await settle()
    expect(container.querySelector('[data-test="channel-introduction"]')).toBeNull()
    tableEmit('reload')
    await settle()
    expect(container.textContent).toContain('production')
  })

  it('ignores an obsolete empty response after switching to a populated app', async () => {
    let finishOldRequest!: (response: unknown) => void
    state.delayedApp = 'com.example.empty'
    state.delayedResponse = new Promise(resolve => finishOldRequest = resolve)
    await mountTable(state.delayedApp)
    state.rows = [{ id: 1, name: 'production' }]
    currentAppId.value = 'com.example.populated'
    await settle()
    expect(container.textContent).toContain('production')
    finishOldRequest({ data: [], count: 0 })
    await settle()
    expect(container.querySelector('[data-test="channel-introduction"]')).toBeNull()
    expect(container.textContent).toContain('production')
    expect(container.querySelector('[data-test="channel-table"]')?.getAttribute('data-loading')).toBe('false')
  })

  it('lets readers view the introduction without offering channel creation', async () => {
    state.canCreate = false
    await mountTable()
    expect(container.querySelector('[data-test="channel-introduction"]')).not.toBeNull()
    expect(container.querySelector('[data-test="create-channel"]')).toBeNull()
    expect(dialog.showDialog).toBe(false)
  })

  it('opens the existing creation dialog only after the explicit action', async () => {
    await mountTable()
    container.querySelector<HTMLButtonElement>('[data-test="create-channel"]')!.click()
    await settle()
    expect(dialog.showDialog).toBe(true)
    expect(dialog.dialogOptions.title).toBe('Create channel')
    expect(state.inserts).toEqual([])
  })

  it('replaces the introduction with the channel table after creating a channel', async () => {
    await mountTable()
    container.querySelector<HTMLButtonElement>('[data-test="create-channel"]')!.click()
    await settle()
    const input = document.querySelector<HTMLInputElement>('#dialog-v2-content input')!
    input.value = 'beta'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await dialog.dialogOptions.buttons!.find(button => button.role === 'primary')!.handler!()
    await settle()
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({ name: 'beta', app_id: 'com.example.channels' })
    expect(container.querySelector('[data-test="channel-introduction"]')).toBeNull()
    expect(container.querySelector<HTMLElement>('[data-test="channel-table"]')!.style.display).not.toBe('none')
    expect(container.textContent).toContain('beta')
  })
})
