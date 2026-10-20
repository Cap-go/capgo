<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from '~/stores/organization'
import { getAppGettingStartedPath } from '~/utils/onboardingRedirect'
import BuilderPresentationModal from './BuilderPresentationModal.vue'

const props = defineProps<{
  appId?: string
  entitlement?: 'plan' | 'trial' | null
}>()

const { t } = useI18n()
const router = useRouter()
const supabase = useSupabase()
const organizationStore = useOrganizationStore()
const starting = ref(false)
const failed = ref(false)
let disposed = false
onUnmounted(() => disposed = true)

async function startBuilder() {
  if (!props.appId || starting.value)
    return
  const appId = props.appId
  starting.value = true
  failed.value = false
  try {
    const { data, error } = await supabase.rpc('enable_builder_onboarding', { p_app_id: appId })
    if (error || data === null)
      throw error ?? new Error('Missing Builder checklist')
    if (disposed)
      return
    organizationStore.updateAppOnboarding(appId, data)
    await router.push(`${getAppGettingStartedPath(appId)}?path=builder`)
  }
  catch {
    if (!disposed)
      failed.value = true
  }
  finally {
    starting.value = false
  }
}
</script>

<template>
  <section class="mx-auto w-full max-w-[960px] px-4 pb-6 sm:px-0" data-test="builder-introduction">
    <header class="mb-5">
      <h2 class="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
        {{ t(entitlement === 'plan' ? 'builder-promo-banner-title' : 'builder-intro-heading') }}
      </h2>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
        {{ t(entitlement === 'plan' ? 'builder-promo-banner-subtitle' : 'builder-intro-description') }}
      </p>
    </header>

    <BuilderPresentationModal
      open
      embedded
      :app-id="appId"
      :start-action="appId ? 'emit' : 'none'"
      :starting="starting"
      @start="startBuilder"
    />

    <p v-if="failed" role="alert" class="mt-4 text-sm text-red-600 dark:text-red-400">
      {{ t('builder-intro-start-error') }}
    </p>

    <a href="https://capgo.app/native-build/" target="_blank" rel="noopener noreferrer" class="mt-4 inline-flex min-h-8 items-center text-xs font-medium text-azure-600 underline-offset-4 hover:underline dark:text-azure-400">
      {{ t('builder-intro-learn-more') }} →
    </a>
  </section>
</template>
