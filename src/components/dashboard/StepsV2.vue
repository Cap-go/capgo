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
    title: t('init-capgo-in-your-a'),
    command: 'npx --yes @capgo/cli@latest init [APIKEY]',
    subtitle: '',
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
const openExt = (url: string) => {
  window.open(url, '_blank')
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
    steps.value[0].command = `npx --yes @capgo/cli@latest init ${data[0].key}`

  else if (retry && main.user?.id)
    return getKey(false)

  isLoading.value = false
}
const watchLog = async () => {
  // console.log('watch log change step 2')
  realtimeListener.value = true
  mySubscription.value = supabase
    .channel('table-db-changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'stats',
        filter: `app_id=eq.${appId.value}`,
      },
      (payload) => {
        // console.log('Change received step 2!', payload)
        setLog()
        step.value += 1
        realtimeListener.value = false
        mySubscription.value.unsubscribe()
      },
    )
    .subscribe()
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
  <section class="h-full py-12 overflow-y-scroll bg-gray-50 dark:bg-gray-900 sm:py-16 lg:py-20 max-h-fit">
    <div class="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
      <div v-if="props.onboarding" class="text-center">
        <h2 class="text-3xl font-bold text-gray-900 dark:text-gray-50 sm:text-4xl xl:text-5xl font-pj">
          {{ t('start-using-capgo') }}
        </h2>
        <p class="mx-auto mt-6 text-lg font-normal text-gray-600 dark:text-gray-200 font-pj">
          {{ t('add-your-first-app-t') }}
        </p>
        <p class="mx-auto mt-2 font-normal text-md text-muted-blue-300 dark:text-muted-blue-50 font-pj">
          {{ t('pro-tip-you-can-copy') }} <span class="text-pumpkin-orange-900">{{ t('commands') }}</span> {{ t('by-clicking-on-them') }}
        </p>
      </div>

      <div v-else class="text-center">
        <h2 class="text-3xl font-bold text-gray-900 dark:text-gray-50 sm:text-4xl xl:text-5xl font-pj">
          {{ t('add-another-app') }}
        </h2>
      </div>

      <div class="max-w-2xl mx-auto mt-12 sm:px-10">
        <template v-for="(s, i) in steps" :key="i">
          <div v-if="i > 0" class="w-1 h-10 mx-auto bg-gray-200" :class="[step !== i ? 'opacity-30' : '']" />

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
              <div class="ml-6 text-xl font-medium text-gray-900 font-pj">
                {{ s.title }}<br>
                <span class="text-sm">{{ s.subtitle }}</span>
                <div class="p-3 rounded-lg" :class="{ 'bg-black': s.command }">
                  <code v-if="s.command" :id="`step_command_${i}`" class="text-lg cursor-pointer text-pumpkin-orange-700" @click="copyToast(s.command, step === i, `step_command_${i}`)">
                    {{ s.command }}
                    <i-ion-copy-outline class="text-muted-blue-300" />
                  </code>
                  <button v-else-if="s.link" class="relative inline-flex mr-2 items-center text-gray-500 bg-white border border-gray-300 focus:outline-none hover:bg-gray-100 focus:ring-4 focus:ring-gray-200 font-medium rounded-lg text-sm px-3 py-1.5 dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:hover:bg-gray-700 dark:hover:border-gray-600 dark:focus:ring-gray-700" @click="openExt(s.link)">
                    {{ t('open') }}
                  </button>
                </div>
                <br v-if="s.command">
              </div>
            </div>
          </div>
        </template>
        <div v-if="onboarding" class="text-center">
          <button
            class="mx-auto font-bold text-pumpkin-orange-500"
            @click="main.logout().then(() => router.replace('/login'))"
          >
            {{ t("logout") }}
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
