<script setup lang="ts">
import { IonIcon, toastController } from '@ionic/vue'
import { ref, watchEffect } from 'vue'
import copy from 'copy-text-to-clipboard'
import { useRoute, useRouter } from 'vue-router'
import { arrowBack, copyOutline } from 'ionicons/icons'
import { useI18n } from 'vue-i18n'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import { useMainStore } from '~/stores/main'

const props = defineProps<{
  onboarding: boolean
}>()

const route = useRoute()
const isLoading = ref(false)
const step = ref(1)
const supabase = useSupabase()
const auth = supabase.auth.user()
const app = ref<definitions['apikeys']>()
const router = useRouter()
const main = useMainStore()
const { t } = useI18n()

const copyToast = async (text: string, stepNb: number) => {
  copy(text)
  const toast = await toastController
    .create({
      message: 'Copied to clipboard',
      duration: 2000,
    })
  step.value = stepNb + 1
  await toast.present()
}
const getKey = async (retry = true): Promise<void> => {
  isLoading.value = true
  const { data } = await supabase
    .from<definitions['apikeys']>('apikeys')
    .select()
    .eq('user_id', auth?.id).eq('mode', 'all').single()
  if (data)
    app.value = data

  else if (retry && auth?.id)
    return getKey(false)

  isLoading.value = false
}

watchEffect(async () => {
  if (route.path === '/app/home')
    await getKey()
})
</script>

<template>
  <section class="py-12 bg-gray-50 sm:py-16 lg:py-20">
    <div class="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
      <div v-if="props.onboarding" class="text-center">
        <h2 class="text-3xl font-bold text-gray-900 sm:text-4xl xl:text-5xl font-pj">
          {{ t('start-using-capgo') }}
        </h2>
        <p class="mx-auto mt-6 text-lg font-normal text-gray-600 font-pj">
          {{ t('add-your-first-app-t') }}
        </p>
        <p class="mx-auto mt-2 text-md font-normal text-muted-blue-300 font-pj">
          {{ t('pro-tip-you-can-copy') }} <span class="text-pumpkin-orange-900">{{ t('commands') }}</span> {{ t('by-clicking-on-them') }}
        </p>
      </div>

      <div v-else class="text-center">
        <h2 class="text-3xl font-bold text-gray-900 sm:text-4xl xl:text-5xl font-pj">
          {{ t('add-another-app') }}
        </h2>
      </div>

      <div class="max-w-2xl mx-auto mt-12 sm:px-10">
        <div class="relative">
          <div :class="[step < 1 ? 'opacity-30' : '']" class=" relative p-5 overflow-hidden bg-white border border-gray-200 rounded-2xl">
            <div class="flex items-start sm:items-center">
              <div class="inline-flex items-center justify-center flex-shrink-0 text-xl font-bold text-white bg-muted-blue-800 w-14 h-14 rounded-xl font-pj">
                1
              </div>
              <p class="ml-6 text-xl font-medium text-gray-900 font-pj">
                {{ t('copy-your') }}{{ ' ' }}
                <span v-if="app" class="cursor-pointer text-pumpkin-orange-700 font-bold" @click="copyToast(app!.key, 1)">
                  {{ t('api-key') }}<IonIcon :icon="copyOutline" class="text-muted-blue-800 ml-2" />
                </span>
                <span v-else class="text-pumpkin-orange-700 font-bold">
                  {{ t('api-key') }}
                </span>
                <br>
                <span class="text-sm">{{ t('your-api-key') }} {{ app?.key }}</span>
              </p>
            </div>
          </div>
        </div>

        <div class="bg-gray-200 w-1 h-10 mx-auto" />

        <div :class="[step < 2 ? 'opacity-30' : '']" class="relative p-5 overflow-hidden bg-white border border-gray-200 rounded-2xl">
          <div class="flex items-start sm:items-center">
            <div class="inline-flex items-center justify-center flex-shrink-0 text-xl font-bold text-white bg-muted-blue-800 w-14 h-14 rounded-xl font-pj">
              2
            </div>
            <p class="ml-6 text-xl font-medium text-gray-900 font-pj">
              {{ t('log-to-the-capgo-cli') }}<br>
              <code class="text-pumpkin-orange-700 text-lg cursor-pointer" @click="copyToast(`npx @capgo/cli@latest login ${app!.key}`, 2)">npx @capgo/cli@latest login
                <span class="font-bold">[{{ t('api-key') }}]</span>{{ ' ' }}
                <IonIcon :icon="copyOutline" class="text-muted-blue-800" />
              </code>
            </p>
          </div>
        </div>

        <div class="bg-gray-200 w-1 h-10 mx-auto" />

        <div :class="[step < 3 ? 'opacity-30' : '']" class="relative p-5 overflow-hidden bg-white border border-gray-200 rounded-2xl">
          <div class="flex items-start sm:items-center">
            <div class="inline-flex items-center justify-center flex-shrink-0 text-xl font-bold text-white bg-muted-blue-800 w-14 h-14 rounded-xl font-pj">
              3
            </div>
            <p class="ml-6 text-xl font-medium text-gray-900 font-pj">
              {{ t('add-your-app-to-your') }}<br>
              <code class="text-pumpkin-orange-700 text-lg cursor-pointer" @click="copyToast('npx @capgo/cli@latest add [appId]', 3)">npx @capgo/cli@latest add [appId] <IonIcon :icon="copyOutline" class="text-muted-blue-800" /></code>
              <br>
              <span class="text-sm">{{ t('app-id-example') }}: com.example.app</span>
            </p>
          </div>
        </div>

        <div class="bg-gray-200 w-1 h-10 mx-auto" />

        <div :class="[step < 4 ? 'opacity-30' : '']" class="relative p-5 overflow-hidden bg-white border border-gray-200 rounded-2xl">
          <div class="flex items-start sm:items-center">
            <div class="inline-flex items-center justify-center flex-shrink-0 text-xl font-bold text-white bg-muted-blue-800 w-14 h-14 rounded-xl font-pj">
              4
            </div>
            <p class="ml-6 text-xl font-medium text-gray-900 font-pj">
              {{ t('build-your-code-and-') }}<br>
              <code class="text-pumpkin-orange-700 text-lg cursor-pointer" @click="copyToast(`npx @capgo/cli@latest upload --channel production`, 4)">npx @capgo/cli@latest upload --channel production <IonIcon :icon="copyOutline" class="text-muted-blue-800" /></code>
            </p>
          </div>
        </div>

        <div class="bg-gray-200 w-1 h-10 mx-auto" />

        <div class="relative pb-24">
          <div :class="[step < 5 ? 'opacity-30' : '']" class="relative p-5 overflow-hidden bg-white border border-gray-200 rounded-2xl">
            <div class="flex items-start sm:items-center">
              <div class="inline-flex items-center justify-center flex-shrink-0 text-xl font-bold text-white bg-muted-blue-800 w-14 h-14 rounded-xl font-pj">
                🚀
              </div>
              <p class="ml-6 text-xl font-medium text-gray-900 font-pj">
                {{ t('discover-your-dashbo') }}<br>
                <a href="/app/home" class="text-pumpkin-orange-700 text-lg cursor-pointer">{{ t('refresh-this-page') }}</a>
              </p>
            </div>
          </div>
        </div>
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
  <a
    title="Go back"
    href="/app/home"
    class="fixed z-90 bottom-10 right-8 bg-blue-600 w-20 h-20 rounded-full drop-shadow-lg flex justify-center items-center text-white text-4xl hover:bg-muted-blue-700 hover:drop-shadow-2xl focus:border-muted-blue-100 focus:border-2"
  >
    <IonIcon :icon="arrowBack" />
  </a>
</template>
