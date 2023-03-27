<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import copy from 'copy-text-to-clipboard'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  kFab,
} from 'konsta/vue'
import { toast } from 'sonner'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import { useLogSnag } from '~/services/logsnag'
import { pushEvent } from '~/services/crips'
import arrowBack from '~icons/ion/arrow-back?width=1em&height=1em'

const props = defineProps<{
  onboarding: boolean
}>()
const emit = defineEmits(['done'])

const route = useRoute()
const isLoading = ref(false)
const step = ref(0)
const clicked = ref(0)
const appId = ref<string>()
const realtimeListener = ref(false)
const mySubscription = ref()
const supabase = useSupabase()
const main = useMainStore()
const { t } = useI18n()
const snag = useLogSnag()

interface Step {
  title: string
  command?: string
  subtitle: string
  link?: string
}

const simpleStep: Step[] = [
  {
    title: t('init-capgo-in-your-a'),
    command: 'npx --yes @capgo/cli@latest init [APIKEY]',
    subtitle: '',
    link: '',
  },
  {
    title: t('discover-your-dashbo'),
    command: '',
    subtitle: t('this-page-will-self-'),
  },
]
const steps = ref(simpleStep)
const setLog = () => {
  if (props.onboarding && main.user?.id) {
    snag.publish({
      channel: 'onboarding-v2',
      event: `onboarding-step-${step.value}`,
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
const openExt = (url?: string) => {
  if (url)
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

const copyToast = async (allowed: boolean, id: string, text?: string) => {
  if (!allowed || !text)
    return
  copy(text)
  toast.success(t('copied-to-clipboard'))
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
    steps.value[0].command = steps.value[0].command?.replace('[APIKEY]', data[0].key || '')

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
})

watchEffect(async () => {
  if (route.path === '/app/home')
    await getKey()
})
</script>

<template>
  <section class="h-full max-h-fit overflow-y-scroll bg-gray-50 py-12 dark:bg-gray-900 lg:py-20 sm:py-16">
    <div class="mx-auto max-w-7xl px-4 lg:px-8 sm:px-6">
      <div v-if="props.onboarding" class="text-center">
        <h2 class="font-pj text-3xl font-bold text-gray-900 sm:text-4xl xl:text-5xl dark:text-gray-50">
          {{ t('start-using-capgo') }}
        </h2>
        <p class="font-pj mx-auto mt-6 text-lg font-normal text-gray-600 dark:text-gray-200">
          {{ t('add-your-first-app-t') }}
        </p>
        <p class="text-md font-pj mx-auto mt-2 font-normal text-muted-blue-300 dark:text-muted-blue-50">
          {{ t('pro-tip-you-can-copy') }} <span class="text-pumpkin-orange-900">{{ t('commands') }}</span> {{ t('by-clicking-on-them') }}
        </p>
      </div>

      <div v-else class="text-center">
        <h2 class="font-pj text-3xl font-bold text-gray-900 sm:text-4xl xl:text-5xl dark:text-gray-50">
          {{ t('add-another-app') }}
        </h2>
      </div>

      <!-- show toggle for simpleMode -->
      <!-- <div class="flex flex-col items-center justify-center mt-4">
        <label class="block mb-2 text-sm text-gray-900 capitalize dark:text-gray-50 font-pj">
          {{ t('old-onboarding-mode') }}
        </label>
        <Toggle
          :value="stepMode !== 'simple'"
          @change="changeMode()"
        />
      </div> -->
      <div class="mx-auto mt-12 max-w-2xl sm:px-10">
        <template v-for="(s, i) in steps" :key="i">
          <div v-if="i > 0" class="mx-auto h-10 w-1 bg-gray-200" :class="[step !== i ? 'opacity-30' : '']" />

          <div :class="[step !== i ? 'opacity-30' : '']" class="relative overflow-hidden border border-gray-200 rounded-2xl bg-white p-5">
            <div class="flex items-start sm:items-center">
              <div class="font-pj h-14 w-14 inline-flex flex-shrink-0 items-center justify-center rounded-xl bg-muted-blue-800 text-xl font-bold text-white">
                <template v-if="i + 1 !== steps.length">
                  {{ i + 1 }}
                </template>
                <template v-else>
                  🚀
                </template>
              </div>
              <div class="font-pj ml-6 text-xl font-medium text-gray-900">
                {{ s.title }}<br>
                <span class="text-sm">{{ s.subtitle }}</span>
                <div class="rounded-lg p-3" :class="{ 'bg-black': s.command }">
                  <code v-if="s.command" :id="`step_command_${i}`" class="cursor-pointer text-lg text-pumpkin-orange-700" @click="copyToast(step === i, `step_command_${i}`, s.command)">
                    {{ s.command }}
                    <i-ion-copy-outline class="text-muted-blue-300" />
                  </code>
                  <button v-else-if="s.link" class="relative mr-2 inline-flex items-center border border-gray-300 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-500 dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-100 dark:text-white focus:outline-none focus:ring-4 focus:ring-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-700" @click="openExt(s.link)">
                    {{ t('open') }}
                  </button>
                </div>
                <br v-if="s.command">
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </section>
  <k-fab v-if="!onboarding" class="right-4-safe bottom-4-safe fixed z-20" @click="emit('done')">
    <template #icon>
      <component :is="arrowBack" />
    </template>
  </k-fab>
</template>
