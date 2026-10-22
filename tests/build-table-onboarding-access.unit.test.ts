// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import BuildTable from '../src/components/tables/BuildTable.vue'

interface BuildResponse { data: any[], count: number | null, error: { message: string } | null }
const mocks = vi.hoisted(() => ({ api: vi.fn(), builds: [] as any[], countFailure: false, delayed: {} as Record<string, Promise<BuildResponse>> }))
vi.mock('../src/services/capgoApi', () => ({ invokeCapgoApi: mocks.api }))
vi.mock('../src/services/date', () => ({ formatDate: () => '' }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('../src/stores/dialogv2', () => ({ useDialogV2Store: () => ({}) }))
vi.mock('../src/stores/organization', () => ({ useOrganizationStore: () => ({ currentOrganization: { gid: 'fixture-org' }, getOrgByAppId: () => ({ paying: true }), awaitInitialLoad: async () => {} }) }))
vi.mock('../src/services/supabase', () => ({ useSupabase: () => ({
  from: () => {
    let appId = ''
    let head = false
    const query: any = {
      then: (resolve: (data: unknown) => void, reject: (error: unknown) => void) => {
        const response = mocks.delayed[appId] ?? Promise.resolve({ data: mocks.builds, count: head && mocks.countFailure ? null : mocks.builds.length, error: head && mocks.countFailure ? { message: 'Count unavailable' } : null })
        return response.then(resolve, reject)
      },
      select: (_columns: string, options?: { head?: boolean }) => {
        head = options?.head === true
        return query
      },
      eq: (column: string, value: string) => {
        if (column === 'app_id')
          appId = value
        return query
      },
    }
    for (const method of ['order', 'range'])
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
  app.component('DataTable', defineComponent({
    props: { isLoading: Boolean, elementList: { type: Array, default: () => [] }, total: Number },
    setup: props => () => h('div', { 'data-test': 'table', 'data-loading': String(props.isLoading), 'data-count': props.elementList.length, 'data-total': props.total }),
  }))
  app.mount(host)
  cleanups.push(() => app.unmount())
  return { host, appId }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.builds = []
  mocks.countFailure = false
  mocks.delayed = {}
})
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
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()
    expect(host.querySelector('[data-test="intro"]')).toBeNull()
  })

  it('shows existing builds while the permission check is still pending', async () => {
    let resolveAccess!: (value: unknown) => void
    mocks.api.mockImplementation(() => new Promise(resolve => resolveAccess = resolve))
    mocks.builds = [{ builder_job_id: null, platform: 'ios' }]
    const { host } = mount()
    await vi.waitFor(() => {
      const table = host.querySelector('[data-test="table"]')!
      expect(table.getAttribute('data-count')).toBe('1')
      expect(table.getAttribute('data-loading')).toBe('false')
    })
    resolveAccess({ data: { canEnable: true }, error: null })
    await nextTick()
    expect(host.querySelector('[data-test="intro"]')).toBeNull()
  })

  it('keeps an empty app loading until the access result chooses its setup view', async () => {
    let resolveAccess!: (value: unknown) => void
    mocks.api.mockImplementation(() => new Promise(resolve => resolveAccess = resolve))
    const { host } = mount()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(host.querySelector('[data-test="table"]')?.getAttribute('data-loading')).toBe('true')
    expect(host.querySelector('[data-test="commands"]')).toBeNull()
    resolveAccess({ data: { canEnable: false }, error: null })
    await vi.waitFor(() => expect(host.querySelector('[data-test="commands"]')).not.toBeNull())
  })

  it('leaves the loading state when counts fail for an empty app', async () => {
    mocks.countFailure = true
    mocks.api.mockResolvedValue({ data: { canEnable: true }, error: null })
    const { host } = mount()
    await vi.waitFor(() => expect(host.querySelector('[data-test="table"]')?.getAttribute('data-loading')).toBe('false'))
    expect(host.querySelector('[data-test="intro"]')).toBeNull()
  })

  it('discards previous-app rows and counts that arrive after the next app has loaded', async () => {
    let resolveFirst!: (value: BuildResponse) => void
    mocks.delayed['com.example.first'] = new Promise(resolve => resolveFirst = resolve)
    mocks.api.mockResolvedValue({ data: { canEnable: true }, error: null })
    const { host, appId } = mount()
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledOnce())
    mocks.builds = [{ builder_job_id: null, platform: 'ios' }]
    appId.value = 'com.example.second'
    await vi.waitFor(() => expect(host.querySelector('[data-test="table"]')?.getAttribute('data-count')).toBe('1'))
    resolveFirst({ data: [], count: 0, error: null })
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()
    expect(host.querySelector('[data-test="intro"]')).toBeNull()
    expect(host.querySelector('[data-test="table"]')?.getAttribute('data-count')).toBe('1')
    expect(host.querySelector('[data-test="table"]')?.getAttribute('data-loading')).toBe('false')
  })

  it('clears the previous pagination total when the new app load fails', async () => {
    mocks.api.mockResolvedValue({ data: { canEnable: true }, error: null })
    mocks.builds = [{ builder_job_id: null, platform: 'ios' }]
    const { host, appId } = mount()
    await vi.waitFor(() => expect(host.querySelector('[data-test="table"]')?.getAttribute('data-total')).toBe('1'))
    mocks.delayed['com.example.second'] = Promise.resolve({ data: [], count: null, error: { message: 'Unavailable' } })
    appId.value = 'com.example.second'
    await vi.waitFor(() => {
      expect(host.querySelector('[data-test="table"]')?.getAttribute('data-loading')).toBe('false')
      expect(host.querySelector('[data-test="table"]')?.getAttribute('data-count')).toBe('0')
      expect(host.querySelector('[data-test="table"]')?.getAttribute('data-total')).toBe('0')
    })
  })
})
