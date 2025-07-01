<script setup lang="ts">
import { useI18n } from 'petite-vue-i18n'
import { ref, watchEffect } from 'vue'
import { toast } from 'vue-sonner'
import arrowBack from '~icons/ion/arrow-back?width=2em&height=2em'
import { pushEvent } from '~/services/posthog'
import { getLocalConfig, isLocal, useSupabase } from '~/services/supabase'
import { sendEvent } from '~/services/tracking'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps<{
  onboarding: boolean
}>()
const emit = defineEmits(['done', 'closeStep'])
const displayStore = useDisplayStore()
const isLoading = ref(false)
const step = ref(0)
const clicked = ref(0)
const appId = ref<string>()
const realtimeListener = ref(false)
const mySubscription = ref()
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
    title: t('init-capgo-in-your-a'),
    command: `npx @capgo/cli@latest i [APIKEY]${localCommand}`,
    subtitle: '',
  },
  {
    title: t('discover-your-dashbo'),
    command: '',
    subtitle: t('this-page-will-self-'),
  },
])
function setLog() {
  if (props.onboarding && main.user?.id) {
    sendEvent({
      channel: 'onboarding-v2',
      event: `onboarding-step-${step.value}`,
      icon: '👶',
      user_id: organizationStore.currentOrganization?.gid,
      notify: false,
    }).catch()
    pushEvent(`user:step-${step.value}`, config.supaHost)

    if (step.value === 2) {
      pushEvent('user:onboarding-done', config.supaHost)
    }
  }
  if (step.value === 2) {
    emit('done', appId.value)
  }
}
function scrollToElement(id: string) {
  // Get the element with the id
  const el = document.getElementById(id)
  console.log('el', el)
  if (el) {
    // Use el.scrollIntoView() to instantly scroll to the element
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
    // Display a modal with the copied key
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
    if (mySubscription.value)
      mySubscription.value.unsubscribe()
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

watchEffect(async () => {
  if (step.value === 1 && !realtimeListener.value) {
    console.log('watch app change step 1')
    realtimeListener.value = true
    await organizationStore.awaitInitialLoad()
    mySubscription.value = supabase
      .channel('table-db-changes')
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'apps',
          filtr: `owner_org=eq.${organizationStore.currentOrganization?.gid}`,
        },
        (payload) => {
          console.log('Change received step 1!', payload)
          step.value += 1
          appId.value = payload.new.id ?? ''
          realtimeListener.value = false
          mySubscription.value.unsubscribe()
          setLog()
        },
      )
      .subscribe()
  }
})

watchEffect(async () => {
  await getKey()
})
</script>

<template>
  <section class="h-full py-12 overflow-y-auto max-h-fit bg-gray-50 dark:bg-gray-900 lg:py-20 sm:py-16">
    <div class="px-4 mx-auto max-w-7xl lg:px-8 sm:px-6">
      <div class="flex items-center justify-items-center place-content-center">
        <button v-if="!onboarding" class="bg-gray-800 btn btn-outline mr-6" @click="emit('closeStep')">
          <arrowBack />
        </button>
        <div v-if="props.onboarding" class="text-center">
          <h2 class="text-3xl font-bold text-gray-900 font-pj sm:text-4xl xl:text-5xl dark:text-gray-50">
            {{ t('start-using-capgo') }} <span class="font-prompt">Capgo</span> !
          </h2>
          <p class="mx-auto mt-6 text-lg font-normal text-gray-600 font-pj dark:text-gray-200">
            {{ t('add-your-first-app-t') }}
          </p>
          <p class="mx-auto mt-2 font-normal text-md font-pj text-muted-blue-300 dark:text-muted-blue-50">
            {{ t('pro-tip-you-can-copy') }} <span class="text-pumpkin-orange-900">{{ t('commands') }}</span> {{ t('by-clicking-on-them') }}
          </p>
        </div>

        <div v-else class="text-center">
          <h2 class="text-3xl font-bold text-gray-900 font-pj sm:text-4xl xl:text-5xl dark:text-gray-50">
            {{ t('add-another-app') }}
          </h2>
        </div>
      </div>

      <div class="max-w-4xl mx-auto mt-12 sm:px-10">
        <template v-for="(s, i) in steps" :key="i">
          <div v-if="i > 0" class="w-1 h-10 mx-auto bg-gray-200" :class="[step !== i ? 'opacity-30' : '']" />

          <div :class="[step !== i ? 'opacity-30' : '']" class="relative p-5 overflow-hidden bg-white border border-gray-200 rounded-2xl">
            <div class="flex items-start sm:items-center">
              <div class="inline-flex items-center justify-center text-xl font-bold text-white shrink-0 font-pj h-14 w-14 rounded-xl bg-muted-blue-800">
                <template v-if="i + 1 !== steps.length">
                  {{ i + 1 }}
                </template>
                <template v-else>
                  🚀
                </template>
              </div>
              <div class="ml-6 text-xl font-medium text-gray-900 font-pj">
                {{ s.title }}<br>
                <span class="text-sm">{{ s.subtitle }}</span>
                <div class="p-3 rounded-lg" :class="{ 'dark:bg-black bg-gray-100': s.command }">
                  <code v-if="s.command" :id="`step_command_${i}`" class="block text-lg break-all whitespace-pre-wrap cursor-pointer text-pumpkin-orange-700" @click="copyToast(step === i, `step_command_${i}`, s.command)">
                    {{ s.command }}
                    <i-ion-copy-outline class="text-muted-blue-300" />
                  </code>
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
