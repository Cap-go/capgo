<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import copy from 'copy-text-to-clipboard'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  kFab,
} from 'konsta/vue'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import { useLogSnag } from '~/services/logsnag'
import { pushEvent } from '~/services/crips'
import { useDisplayStore } from '~/stores/display'
import arrowBack from '~icons/ion/arrow-back?width=1em&height=1em'

const props = defineProps<{
  onboarding: boolean
}>()
const emit = defineEmits(['done'])

const displayStore = useDisplayStore()
const route = useRoute()
const isLoading = ref(false)
const step = ref(0)
const clicked = ref(0)
const appId = ref<string>()
const realtimeListener = ref(false)
const mySubscription = ref()
const supabase = useSupabase()
const router = useRouter()
const main = useMainStore()
const { t } = useI18n()
const snag = useLogSnag()

const steps = ref([
  {
    title: t('log-to-the-capgo-cli'),
    command: 'npx --yes @capgo/cli@latest login [APIKEY]',
    subtitle: '',
  },
  {
    title: t('add-your-app-to-your'),
    command: 'npx --yes @capgo/cli@latest add',
    subtitle: `${t('into-your-app-folder')}`,
  },
  {
    title: t('install-the-capacito'),
    command: 'npm i @capgo/capacitor-updater',
    subtitle: t('in-your-project-fold'),
  },
  {
    title: t('add-this-code-to-you'),
    command: `import { CapacitorUpdater } from '@capgo/capacitor-updater'
CapacitorUpdater.notifyAppReady()`,
    subtitle: t('in-your-main-file'),
  },
  {
    title: t('build-your-app-and-s'),
    command: 'npm run build && npx cap sync',
    subtitle: '',
  },
  {
    title: t('build-your-code-and-'),
    command: 'npx --yes @capgo/cli@latest upload',
    subtitle: '',
  },
  {
    title: t('test-your-update-in-'),
    command: 'https://capgo.app/blog/update-your-capacitor-apps-seamlessly-using-capacitor-updater/#receive-a-live-update-on-a-device',
    subtitle: t('open-this-link-to-le'),
  },
  {
    title: t('discover-your-dashbo'),
    command: '',
    subtitle: t('this-page-will-self-'),
  },
])
const setLog = () => {
  if (props.onboarding && main.user?.id) {
    snag.publish({
      channel: 'onboarding',
      event: `step-${step.value}`,
      icon: '👶',
      tags: {
        'user-id': main.user.id,
      },
      notify: false,
    }).catch()
    pushEvent({ name: `user:step-${step.value}`, color: 'blue' })
    if (step.value === 4)
      pushEvent({ name: 'user:onboarding-done', color: 'green' })
    // TODO add emailing on onboarding done to send blog article versioning
  }
}
const scrollToElement = (id: string) => {
  // Get the element with the id
  const el = document.getElementById(id)
  console.log('el', el)
  if (el) {
    // Use el.scrollIntoView() to instantly scroll to the element
    el.scrollIntoView({ behavior: 'smooth' })
  }
}

const copyToast = async (text: string, allowed: boolean, id: string) => {
  if (!allowed)
    return
  copy(text)
  displayStore.messageToast.push(t('copied-to-clipboard'))
  clicked.value += 1
  if (!realtimeListener.value || clicked.value === 3) {
    setLog()
    step.value += 1
    clicked.value = 0
    realtimeListener.value = false
    if (mySubscription.value)
      mySubscription.value.unsubscribe()
    scrollToElement(id)
  }
}
const getKey = async (retry = true): Promise<void> => {
  isLoading.value = true
  const { data } = await supabase
    .from('apikeys')
    .select()
    .eq('user_id', main.user?.id).eq('mode', 'all')
  if (data)
    steps.value[0].command = `npx --yes @capgo/cli@latest login ${data[0].key}`

  else if (retry && main.user?.id)
    return getKey(false)

  isLoading.value = false
}
watchEffect(async () => {
  if (step.value === 1 && !realtimeListener.value) {
    // console.log('watch app change step 1')
    realtimeListener.value = true
    mySubscription.value = supabase
      .channel('table-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'apps',
          filter: `user_id=eq.${main.user?.id}`,
        },
        (payload) => {
        // console.log('Change received step 1!', payload)
          setLog()
          step.value += 1
          appId.value = payload.new.id || ''
          realtimeListener.value = false
          mySubscription.value.unsubscribe()
        },
      )
      .subscribe()
  }
  else if (step.value === 4 && !realtimeListener.value) {
    // console.log('watch app change step 4')
    realtimeListener.value = true
    mySubscription.value = supabase
      .channel('table-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'app_versions',
          filter: `app_id=eq.${appId.value}`,
        },
        (payload) => {
        // console.log('Change received step 1!', payload)
          setLog()
          step.value += 1
          realtimeListener.value = false
          mySubscription.value.unsubscribe()
          emit('done')
        },
      )
      .subscribe()
  }
})

watchEffect(async () => {
  if (route.path === '/app/home')
    await getKey()
})
</script>

<template>
  <section class="h-full py-12 overflow-y-scroll bg-gray-50 sm:py-16 lg:py-20 max-h-fit">
    <div class="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
      <div v-if="props.onboarding" class="text-center">
        <h2 class="text-3xl font-bold text-gray-900 sm:text-4xl xl:text-5xl font-pj">
          {{ t('start-using-capgo') }}
        </h2>
        <p class="mx-auto mt-6 text-lg font-normal text-gray-600 font-pj">
          {{ t('add-your-first-app-t') }}
        </p>
        <p class="mx-auto mt-2 font-normal text-md text-muted-blue-300 font-pj">
          {{ t('pro-tip-you-can-copy') }} <span class="text-pumpkin-orange-900">{{ t('commands') }}</span> {{ t('by-clicking-on-them') }}
        </p>
      </div>

      <div v-else class="text-center">
        <h2 class="text-3xl font-bold text-gray-900 sm:text-4xl xl:text-5xl font-pj">
          {{ t('add-another-app') }}
        </h2>
      </div>

      <div class="max-w-2xl mx-auto mt-12 sm:px-10">
        <template v-for="(s, i) in steps" :key="i">
          <div v-if="i > 0" class="w-1 h-10 mx-auto bg-gray-200" />

          <div :class="[step !== i ? 'opacity-30' : '']" class="relative p-5 overflow-hidden bg-white border border-gray-200 rounded-2xl">
            <div class="flex items-start sm:items-center">
              <div class="inline-flex items-center justify-center flex-shrink-0 text-xl font-bold text-white bg-muted-blue-800 w-14 h-14 rounded-xl font-pj">
                <template v-if="i < 7">
                  {{ i + 1 }}
                </template>
                <template v-else>
                  🚀
                </template>
              </div>
              <p class="ml-6 text-xl font-medium text-gray-900 font-pj">
                {{ s.title }}<br>
                <code v-if="s.command" :id="`step_command_${i}`" class="text-lg cursor-pointer text-pumpkin-orange-700" @click="copyToast(s.command, step === i, `step_command_${i}`)">
                  {{ s.command }}
                  <i-ion-copy-outline class="text-muted-blue-800" />
                </code>
                <br v-if="s.command">
                <span class="text-sm">{{ s.subtitle }}</span>
              </p>
            </div>
          </div>
        </template>
        <div v-if="onboarding" class="text-center">
          <button
            class="mx-auto font-bold text-pumpkin-orange-500"
            @click="main.logout().then(() => router.replace('/login'))"
          >
            {{ t("account.logout") }}
          </button>
        </div>
      </div>
    </div>
  </section>
  <k-fab class="fixed z-20 right-4-safe bottom-4-safe" @click="emit('done')">
    <template #icon>
      <component :is="arrowBack" />
    </template>
  </k-fab>
</template>
