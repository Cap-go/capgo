// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import BuilderIntroduction from '../src/components/dashboard/BuilderIntroduction.vue'

const mocks = vi.hoisted(() => ({ api: vi.fn(), update: vi.fn(), push: vi.fn() }))
vi.mock('../src/services/capgoApi', () => ({ invokeCapgoApi: mocks.api }))
vi.mock('../src/stores/organization', () => ({ useOrganizationStore: () => ({ updateAppOnboarding: mocks.update }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('../src/components/dashboard/BuilderPresentationModal.vue', () => ({ default: defineComponent({
  emits: ['start'],
  setup: (_props, { emit }) => () => h('button', { onClick: () => emit('start') }, 'Start'),
}) }))

it('retains a successful activation after leaving the page without navigating back', async () => {
  let resolveRequest!: (value: unknown) => void
  mocks.api.mockImplementation(() => new Promise(resolve => resolveRequest = resolve))
  const host = document.createElement('div')
  const app = createApp(BuilderIntroduction, { appId: 'com.example.builder' })
  app.mount(host)
  host.querySelector('button')!.click()
  expect(mocks.api).toHaveBeenCalledExactlyOnceWith('app/com.example.builder/onboarding/builder', { method: 'POST' })
  app.unmount()
  const onboarding = { setup: { todo_list_version: 4, selected_path: 'builder' } }
  resolveRequest({ data: { onboarding }, error: null })
  await nextTick()
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith('com.example.builder', onboarding)
  expect(mocks.push).not.toHaveBeenCalled()
})
