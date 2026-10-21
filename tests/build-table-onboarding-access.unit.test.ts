// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import BuildTable from '../src/components/tables/BuildTable.vue'

const mocks = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('../src/services/capgoApi', () => ({ invokeCapgoApi: mocks.api }))
vi.mock('../src/services/date', () => ({ formatDate: () => '' }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../src/stores/dialogv2', () => ({ useDialogV2Store: () => ({}) }))
vi.mock('../src/stores/organization', () => ({ useOrganizationStore: () => ({ currentOrganization: { gid: 'fixture-org' }, getOrgByAppId: () => ({ paying: true }), awaitInitialLoad: async () => {} }) }))
vi.mock('../src/services/supabase', () => ({ useSupabase: () => ({
  from: () => {
    const query: any = { then: (resolve: (data: unknown) => void) => resolve({ data: [], count: 0, error: null }) }
    for (const method of ['select', 'eq', 'order', 'range'])
      query[method] = () => query
    return query
  },
}) }))
vi.mock('../src/components/dashboard/BuilderIntroduction.vue', () => ({ default: { render: () => h('div', { 'data-test': 'intro' }) } }))

const cleanups: Array<() => void> = []
function mount() {
  const appId = ref('com.example.first')
  const host = document.createElement('div')
  const app = createApp(defineComponent({ setup: () => () => h(BuildTable, { appId: appId.value }) }))
  app.component('StepsBuild', { render: () => h('div', { 'data-test': 'commands' }) })
  app.component('DataTable', { render: () => h('div', { 'data-test': 'table' }) })
  app.mount(host)
  cleanups.push(() => app.unmount())
  return { host, appId }
}

beforeEach(() => vi.resetAllMocks())
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

describe('builds page checklist activation access', () => {
  it('shows the presentation after the backend permits activation', async () => {
    mocks.api.mockResolvedValue({ data: { canEnable: true }, error: null })
    const { host } = mount()
    await vi.waitFor(() => expect(host.querySelector('[data-test="intro"]')).not.toBeNull())
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith('app/com.example.first/onboarding/builder', { method: 'GET' })
  })

  it.each([false, 'error'])('preserves the setup commands when access is %s', async (access) => {
    mocks.api.mockResolvedValue(access === 'error' ? { data: null, error: new Error('Unavailable') } : { data: { canEnable: false }, error: null })
    const { host } = mount()
    await vi.waitFor(() => expect(host.querySelector('[data-test="commands"]')).not.toBeNull())
    expect(host.querySelector('[data-test="intro"]')).toBeNull()
  })

  it('ignores an older app permission response after switching apps', async () => {
    let resolveFirst!: (value: unknown) => void
    mocks.api.mockImplementation((path: string) => path.includes('com.example.first') ? new Promise(resolve => resolveFirst = resolve) : Promise.resolve({ data: { canEnable: false }, error: null }))
    const { host, appId } = mount()
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledOnce())
    appId.value = 'com.example.second'
    await nextTick()
    await vi.waitFor(() => expect(host.querySelector('[data-test="commands"]')).not.toBeNull())
    resolveFirst({ data: { canEnable: true }, error: null })
    await nextTick()
    expect(host.querySelector('[data-test="intro"]')).toBeNull()
  })
})
