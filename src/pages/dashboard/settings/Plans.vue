<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  kSegmented,
  kSegmentedButton,
} from 'konsta/vue'
import { computed, ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { openCheckout } from '~/services/stripe'
import { useMainStore } from '~/stores/main'
import { findBestPlan, getCurrentPlanName, getPlanUsagePercent, getPlans, getTotalStats } from '~/services/supabase'
import { useLogSnag } from '~/services/logsnag'
import { openChat, sendMessage } from '~/services/crips'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'
const openSupport = () => {
  sendMessage('I need a custom plan')
  openChat()
}

const { t } = useI18n()
const plans = ref<Database['public']['Tables']['plans']['Row'][]>([])
const displayPlans = computed(() => {
  return plans.value.filter(plan => plan.stripe_id !== 'free')
})
const stats = ref({
  mau: 0,
  storage: 0,
  bandwidth: 0,
} as Database['public']['Functions']['get_total_stats_v2']['Returns'][0])
const planSuggest = ref('')
const planCurrrent = ref('')
const planPercent = ref(0)
const snag = useLogSnag()
const isLoading = ref(false)
const segmentVal = ref<'m' | 'y'>('y')
const isYearly = computed(() => segmentVal.value === 'y')
const route = useRoute()
const main = useMainStore()
const displayStore = useDisplayStore()

const planFeatures = (plan: Database['public']['Tables']['plans']['Row']) => [
  `${plan.mau.toLocaleString()} ${t('mau')}`,
  `${plan.storage.toLocaleString()} ${t('plan-storage')}`,
  `${plan.bandwidth.toLocaleString()} ${t('plan-bandwidth')}`,
  plan.abtest ? t('plan-abtest') : false,
  plan.progressive_deploy ? t('plan-progressive-deploy') : false,
].filter(Boolean)

const convertKey = (key: string) => {
  const keySplit = key.split('.')
  if (keySplit.length === 3)
    return `plan-${keySplit[1]}`
  return key
}
const currentPlanSuggest = computed(() => plans.value.find(plan => plan.name === planSuggest.value))
const currentPlan = computed(() => plans.value.find(plan => plan.name === planCurrrent.value))

const openChangePlan = (planId: string) => {
  // get the current url
  if (planId)
    openCheckout(planId, window.location.href, window.location.href, isYearly.value)
}
const showToastMessage = async (message: string) => {
  displayStore.messageToast.push(message)
}

const getPrice = (plan: Database['public']['Tables']['plans']['Row'], t: 'm' | 'y'): number => {
  return plan[t === 'm' ? 'price_m' : 'price_y']
}

const getSale = (plan: Database['public']['Tables']['plans']['Row']): string => {
  return `- ${100 - Math.round(plan.price_y * 100 / (plan.price_m * 12))} %`
}

const getUsages = async () => {
  // get aapp_stats
  if (!main.user?.id)
    return
  const date_id = new Date().toISOString().slice(0, 7)
  stats.value = await getTotalStats(main.user?.id, date_id)
  await findBestPlan(stats.value).then(res => planSuggest.value = res)
}

const loadData = async () => {
  isLoading.value = true
  await getPlans().then((pls) => {
    plans.value.length = 0
    plans.value.push(...pls)
  })
  await getUsages()

  if (main.user?.id) {
    const date_id = new Date().toISOString().slice(0, 7)
    await getCurrentPlanName(main.user?.id).then(res => planCurrrent.value = res)
    await getPlanUsagePercent(main.user?.id, date_id).then(res => planPercent.value = res)
  }
  isLoading.value = false
}

watch(
  () => plans.value,
  (myPlan, prevMyPlan) => {
    if (myPlan && !prevMyPlan) {
      loadData()
      // reGenerate annotations
      isLoading.value = false
    }
    else if (prevMyPlan && !myPlan) {
      isLoading.value = true
    }
  })

watchEffect(async () => {
  if (route.path === '/dashboard/settings/plans') {
    // if session_id is in url params show modal success plan setup
    if (route.query.session_id) {
      showToastMessage(t('usage-success'))
    }
    else if (main.user?.id) {
      loadData()
      snag.publish({
        channel: 'usage',
        event: 'User visit',
        icon: '💳',
        tags: {
          'user-id': main.user?.id,
        },
        notify: false,
      }).catch()
    }
  }
})
const hightLights = computed(() => ([
  {
    label: 'Current',
    value: currentPlan.value?.name,
  },
  {
    label: 'Usage',
    value: `${planPercent.value.toLocaleString()} %`,
  },
  {
    label: 'Best plan',
    value: currentPlanSuggest.value?.name,
  },
]))
</script>

<template>
  <div v-if="!isLoading" class="h-full overflow-y-scroll bg-white dark:bg-gray-800 max-h-fit">
    <div class="px-4 pt-6 mx-auto max-w-7xl sm:px-6 lg:px-8">
      <div class="sm:flex sm:flex-col sm:align-center">
        <h1 class="text-5xl font-extrabold text-gray-900 dark:text-white sm:text-center">
          {{ t('plan-pricing-plans') }}
        </h1>
        <p class="mt-5 text-xl text-gray-700 dark:text-white sm:text-center">
          {{ t('plan-desc') }}<br>
        </p>
      </div>
      <div class="relative mt-6 mb-12 lg:mt-12 lg:max-w-5xl lg:mx-auto">
        <div class="absolute -inset-px bg-gradient-to-r from-cyan-500 to-purple-500 rounded-xl" />

        <div class="relative flex flex-col items-stretch overflow-hidden text-center bg-black md:flex-row md:text-left rounded-xl bg-opacity-90">
          <template v-for="s, i in hightLights" :key="i">
            <div v-if="i > 0" class="w-full h-px md:h-auto md:w-px bg-gradient-to-r from-cyan-500 to-purple-500 shrink-0" />

            <div class="flex flex-col items-center w-full p-5 group sm:px-7 lg:px-6 lg:py-4 ">
              <span class="text-center">
                <p class="text-3xl font-bold text-white lg:mt-3 lg:order-2 font-pj">
                  {{ s.value }}
                </p>
                <h3 class="mt-5 text-sm font-bold tracking-widest text-gray-400 uppercase lg:mt-0 lg:order-1 font-pj">
                  {{ s.label }}
                </h3>
              </span>
            </div>
          </template>
        </div>
      </div>
      <div class="mx-auto mt-4 md:w-1/4">
        <k-segmented outline class="dark:text-gray-300 dark:bg-black">
          <k-segmented-button
            class="h-10"
            :active="segmentVal === 'm'"
            @click="() => (segmentVal = 'm')"
          >
            {{ t('monthly') }}
          </k-segmented-button>
          <k-segmented-button
            class="h-10"
            :active="segmentVal === 'y'"
            @click="() => (segmentVal = 'y')"
          >
            {{ t('yearly') }}
          </k-segmented-button>
        </k-segmented>
      </div>
      <div class="mt-6 space-y-4 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-6 lg:max-w-4xl lg:mx-auto xl:max-w-none xl:mx-0 xl:grid-cols-4">
        <div v-for="p in displayPlans" :key="p.id" class="border border-gray-200 divide-y divide-gray-200 rounded-lg shadow-sm" :class="p.name === currentPlan?.name ? 'border-4 border-muted-blue-600' : ''">
          <div class="p-6">
            <h2 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
              {{ p.name }}
            </h2>
            <p class="mt-4 text-sm text-gray-500 dark:text-gray-100">
              {{ t(convertKey(p.description)) }}
            </p>
            <p class="mt-8">
              <span class="text-4xl font-extrabold text-gray-900 dark:text-white">€{{ getPrice(p, segmentVal) }}</span>
              <span class="text-base font-medium text-gray-500 dark:text-gray-100">/{{ isYearly ? 'yr' : 'mo' }}</span>
            </p>
            <span v-if="isYearly" class="ml-3 text-md font-semibold text-white px-1.5 bg-emerald-500 rounded-full"> {{ getSale(p) }} </span>
            <button v-if="p.stripe_id !== 'free'" class="block w-full py-2 mt-8 text-sm font-semibold text-center text-white bg-gray-800 border border-gray-800 rounded-md dark:bg-white dark:text-black hover:bg-gray-900 dark:hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-gray-500 disabled:dark:bg-gray-400" :disabled="currentPlan?.name === p.name" @click="openChangePlan(p.stripe_id)">
              {{ t('plan-buy') }} {{ p.name }}
            </button>
          </div>
          <div class="px-6 pt-6 pb-8">
            <h3 class="text-xs font-medium tracking-wide text-gray-900 uppercase dark:text-white">
              {{ t('plan-whats-included') }}
            </h3>
            <ul role="list" class="mt-6 space-y-4">
              <li v-for="(f, index) in planFeatures(p)" :key="index" class="flex space-x-3">
                <svg class="flex-shrink-0 w-5 h-5 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span class="text-sm text-gray-500 dark:text-gray-100">{{ f }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <section class="py-12 sm:py-16 lg:py-20">
        <div class="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div class="max-w-2xl mx-auto text-center">
            <h2 class="text-3xl font-bold text-white-900 sm:text-4xl xl:text-5xl font-pj dark:text-white">
              {{ t('need-more-contact-us') }}
            </h2>
          </div>

          <div class="relative max-w-5xl mx-auto mt-8 md:mt-16">
            <div class="absolute -inset-4">
              <div class="w-full h-full mx-auto opacity-30 blur-lg filter rounded-2xl" style="background: linear-gradient(90deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%)" />
            </div>

            <div class="relative overflow-hidden bg-gray-900 rounded-2xl">
              <div class="px-16 py-8 sm:px-8 lg:px-16 lg:py-14">
                <div class="md:flex md:items-center md:space-x-4 lg:space-x-6">
                  <div class="grid grid-cols-1 gap-y-3 sm:grid-cols-2 gap-x-12 xl:gap-x-24">
                    <div>
                      <ul class="space-y-3 text-base font-medium text-white font-pj">
                        <li class="flex items-center">
                          <svg class="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {{ t('unlimited-updates') }}
                        </li>

                        <li class="flex items-center">
                          <svg class="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {{ t('bigger-app-size') }}
                        </li>

                        <li class="flex items-center">
                          <svg class="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {{ t('more-version-storage') }}
                        </li>
                      </ul>
                    </div>

                    <div>
                      <ul class="space-y-3 text-base font-medium text-white font-pj">
                        <li class="flex items-center">
                          <svg class="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {{ t('custom-domain') }}
                        </li>

                        <li class="flex items-center">
                          <svg class="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {{ t('special-api-access') }}
                        </li>

                        <li class="flex items-center">
                          <svg class="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {{ t('bulk-upload') }}
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div class="block md:hidden lg:block">
                    <div class="hidden lg:block">
                      <svg class="w-4 h-auto text-gray-600" viewBox="0 0 16 123" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 11)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 46)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 81)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 116)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 18)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 53)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 88)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 123)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 25)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 60)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 95)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 32)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 67)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 102)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 39)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 74)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 109)" />
                      </svg>
                    </div>

                    <div class="block mt-10 md:hidden">
                      <svg class="w-auto h-4 text-gray-600" viewBox="0 0 172 16" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 11 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 46 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 81 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 116 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 151 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 18 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 53 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 88 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 123 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 158 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 25 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 60 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 95 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 130 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 165 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 32 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 67 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 102 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 137 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 172 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 39 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 74 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 109 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 144 1)" />
                      </svg>
                    </div>
                  </div>

                  <div class="mt-10 md:mt-0">
                    <a
                      href="#"
                      title="Get quote now"
                      class="inline-flex items-center justify-center p-6 mt-5 text-base font-bold text-gray-900 transition-all duration-200 bg-white border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white font-pj hover:bg-opacity-90"
                      role="button"
                      @click="openSupport()"
                    >
                      Get quote now
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
        </route>

