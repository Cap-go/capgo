<script setup lang="ts">
import { onUnmounted, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import arrowBack from '~icons/ion/arrow-back?width=2em&height=2em'
import IconLoader from '~icons/lucide/loader-2'
import { pushEvent } from '~/services/posthog'
import { getLocalConfig, isLocal, useSupabase } from '~/services/supabase'
import { sendEvent } from '~/services/tracking'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps<{
  onboarding: boolean
  appId: string
}>()
const emit = defineEmits(['done', 'closeStep'])
const displayStore = useDisplayStore()
const isLoading = ref(false)
const step = ref(0)
const clicked = ref(0)
const buildId = ref<string>()
const realtimeListener = ref(false)
const pollTimer = ref<number | null>(null)
const initialCount = ref<number | null>(null)
const supabase = useSupabase()
const main = useMainStore()
const { t } = useI18n()
const organizationStore = useOrganizationStore()
const dialogStore = useDialogV2Store()

interface Step {
  title: string
  command?: string
  subtitle: string
}

const config = getLocalConfig()
const localCommand = isLocal(config.supaHost) ? ` --supa-host ${config.supaHost} --supa-anon ${config.supaKey}` : ``
const steps = ref<Step[]>([
  {
    title: t('build-step-request-build'),
    command: `npx @capgo/cli@latest build request -a [APIKEY] --platform ios${localCommand}`,
    subtitle: t('build-step-request-subtitle'),
  },
  {
    title: t('build-step-wait'),
    command: '',
    subtitle: t('build-step-wait-subtitle'),
  },
])

function stepToName(stepNumber: number): string {
  switch (stepNumber) {
    case 0:
      return 'request-build'
    case 1:
      return 'wait-for-build'
    case 2:
      return 'build-completed'
    default:
      return 'unknown-step'
  }
}

function setLog() {
  console.log('setLog', props.onboarding, main.user?.id, step.value)
  if (props.onboarding && main.user?.id) {
    sendEvent({
      channel: 'onboarding-build',
      event: `onboarding-build-step-${stepToName(step.value)}`,
      icon: '🏗️',
      user_id: organizationStore.currentOrganization?.gid,
      notify: false,
    }).catch()
    pushEvent(`user:onboarding-build-${stepToName(step.value)}`, config.supaHost)
  }
  if (step.value === 2) {
    emit('done')
  }
}

function clearWatchers() {
  if (pollTimer.value !== null) {
    console.log('clear poll timer', pollTimer.value)
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }
}

function scrollToElement(id: string) {
  const el = document.getElementById(id)
  console.log('el', el)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' })
  }
}

async function copyToast(allowed: boolean, id: string, text?: string) {
  if (!allowed || !text)
    return
  try {
    await navigator.clipboard.writeText(text)
    console.log('displayStore.messageToast', displayStore.messageToast)
    toast.success(t('copied-to-clipboard'))
  }
  catch (err) {
    console.error('Failed to copy: ', err)
    dialogStore.openDialog({
      title: t('cannot-copy'),
      description: text,
      buttons: [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
      ],
    })
    await dialogStore.onDialogDismiss()
  }
  clicked.value += 1
  if (!realtimeListener.value || clicked.value === 3) {
    step.value += 1
    clicked.value = 0
    realtimeListener.value = false
    clearWatchers()
    scrollToElement(id)
    setLog()
  }
}

async function addNewApiKey() {
  const newApiKey = crypto.randomUUID()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    console.log('Not logged in, cannot regenerate API key')
    return
  }
  const { error } = await supabase
    .from('apikeys')
    .upsert({ user_id: user.id, key: newApiKey, mode: 'all', name: '' })
    .select()

  if (error)
    throw error
}

async function getKey(retry = true): Promise<void> {
  isLoading.value = true
  if (!main?.user?.id)
    return
  const { data, error } = await supabase
    .from('apikeys')
    .select()
    .eq('user_id', main?.user?.id)
    .eq('mode', 'all')

  if (typeof data !== 'undefined' && data !== null && !error) {
    if (data.length === 0) {
      await addNewApiKey()
      return getKey(false)
    }
    steps.value[0].command = steps.value[0].command?.replace('[APIKEY]', data[0].key ?? '')
  }
  else if (retry && main?.user?.id) {
    return getKey(false)
  }

  isLoading.value = false
}

async function getBuildRequestsCount(): Promise<number> {
  const orgId = organizationStore.currentOrganization?.gid
  if (!orgId || !props.appId)
    return 0
  const { count, error } = await supabase
    .from('build_requests')
    .select('id', { count: 'exact', head: true })
    .eq('owner_org', orgId)
    .eq('app_id', props.appId)

  if (error)
    return 0
  return count ?? 0
}

async function getLatestBuildId(): Promise<string | undefined> {
  const orgId = organizationStore.currentOrganization?.gid
  if (!orgId || !props.appId)
    return undefined
  const { data, error } = await supabase
    .from('build_requests')
    .select('id, created_at')
    .eq('owner_org', orgId)
    .eq('app_id', props.appId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0)
    return undefined
  return `${data[0].id}`
}

watchEffect(async () => {
  if (step.value === 1 && !realtimeListener.value) {
    console.log('watch build change step 1 via polling')
    realtimeListener.value = true
    await organizationStore.awaitInitialLoad()

    try {
      initialCount.value = await getBuildRequestsCount()
    }
    catch {
      initialCount.value = 0
    }

    clearWatchers()

    pollTimer.value = window.setInterval(async () => {
      try {
        const current = await getBuildRequestsCount()
        if (initialCount.value !== null && current > initialCount.value) {
          const latestId = await getLatestBuildId()
          step.value += 1
          buildId.value = latestId ?? ''
          realtimeListener.value = false
          clearWatchers()
          setLog()
        }
      }
      catch (e) {
        console.warn('Polling build_requests failed', e)
      }
    }, 2000)
  }
})

watchEffect(async () => {
  await getKey()
})

onUnmounted(() => {
  clearWatchers()
})
</script>

<template>
  <section class="h-full py-12 overflow-y-auto max-h-fit lg:py-20 sm:py-16 bg-slate-100 dark:bg-slate-900">
    <div class="px-4 mx-auto max-w-7xl lg:px-8 sm:px-6">
      <div class="flex items-center justify-items-center place-content-center">
        <button v-if="!onboarding" class="bg-gray-800 text-white d-btn d-btn-outline mr-6" @click="emit('closeStep')">
          <arrowBack />
        </button>
        <div v-if="props.onboarding" class="text-center">
          <h2 class="text-3xl font-bold text-gray-900 font-pj sm:text-4xl xl:text-5xl dark:text-gray-50">
            {{ t('start-your-first-build') }}
          </h2>
          <p class="mx-auto mt-6 text-lg font-normal text-gray-600 font-pj dark:text-gray-200">
            {{ t('build-native-apps-with-cli') }}
          </p>
          <p class="mx-auto mt-2 font-normal text-md font-pj text-muted-blue-300 dark:text-muted-blue-50">
            {{ t('pro-tip-you-can-copy') }} <span class="text-pumpkin-orange-900">{{ t('commands') }}</span> {{ t('by-clicking-on-them') }}
          </p>
        </div>

        <div v-else class="text-center">
          <h2 class="text-3xl font-bold text-gray-900 font-pj sm:text-4xl xl:text-5xl dark:text-gray-50">
            {{ t('request-new-build') }}
          </h2>
        </div>
      </div>
      <div class="max-w-6xl mx-auto mt-12 sm:px-10">
        <template v-for="(s, i) in steps" :key="i">
          <div v-if="i > 0" class="w-1 h-10 mx-auto bg-gray-200" :class="[step !== i ? 'opacity-30' : '']" />

          <div :class="[step !== i ? 'opacity-30' : '']" class="relative p-5 overflow-hidden bg-white dark:border dark:border-gray-200 rounded-2xl">
            <div class="flex items-start gap-6">
              <div class="inline-flex items-center justify-center text-xl font-bold text-white shrink-0 font-pj h-14 w-14 rounded-xl bg-muted-blue-800">
                <template v-if="i + 1 !== steps.length">
                  {{ i + 1 }}
                </template>
                <template v-else-if="step === 1 && i === 1">
                  <div class="flex justify-center">
                    <IconLoader class="w-10 h-10 text-blue-500 animate-spin" />
                  </div>
                </template>
                <template v-else>
                  🚀
                </template>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-xl font-medium text-gray-900 font-pj">
                  {{ s.title }}<br>
                  <span class="text-sm">{{ s.subtitle }}</span>
                </div>
                <div v-if="s.command" class="relative mt-4 p-5 pr-16 rounded-lg bg-black group cursor-pointer" @click="copyToast(step === i, `step_command_${i}`, s.command)">
                  <code :id="`step_command_${i}`" class="block text-xl break-all whitespace-pre-wrap text-pumpkin-orange-700">
                    {{ s.command }}
                  </code>
                  <i-ion-copy-outline class="absolute top-5 right-5 text-muted-blue-300 w-6 h-6" />
                </div>
                <br v-if="s.command">
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>
