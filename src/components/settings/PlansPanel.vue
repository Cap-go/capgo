<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type {
  SegmentChangeEventDetail,
} from '@ionic/vue'
import {
  IonLabel, IonSegment, IonSegmentButton, toastController,
} from '@ionic/vue'
import { computed, ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { CapacitorCrispWeb } from '~/services/crisp-web'
import { openCheckout } from '~/services/stripe'
import { useMainStore } from '~/stores/main'
import type { Stats } from '~/services/plans'
import type { definitions } from '~/types/supabase'
import { findBestPlan, getCurrentPlanName, getPlans, useSupabase } from '~/services/supabase'
import { useLogSnag } from '~/services/logsnag'

const crisp = new CapacitorCrispWeb()
const openSupport = () => {
  crisp.sendMessage({ value: 'I need a custom plan' })
  crisp.openMessenger()
}

const { t } = useI18n()
const daysInCurrentMonth = () => new Date().getDate()
const plans = ref<definitions['plans'][]>([])
const displayPlans = computed(() => {
  return plans.value.filter(plan => plan.stripe_id !== 'free')
})
const stats = ref({
  max_app: 0,
  max_channel: 0,
  max_version: 0,
  max_shared: 0,
  max_update: 0,
  max_device: 0,
} as Stats)
const planSuggest = ref('')
const planCurrrent = ref('')
const datas = ref({
  mau: [] as number[],
  storage: [] as number[],
  bandwidth: [] as number[],
})
const snag = useLogSnag()
const supabase = useSupabase()
const isLoading = ref(false)
const segmentVal = ref<'m' | 'y'>('m')
const isYearly = computed(() => segmentVal.value === 'y')
const route = useRoute()
const main = useMainStore()

const planFeatures = (plan: definitions['plans']) => [
  `${plan.mau.toLocaleString()} ${t('plan.mau')}`,
  `${plan.storage.toLocaleString()} ${t('plan.storage')}`,
  `${plan.bandwidth.toLocaleString()} ${t('plan.bandwidth')}`,
  plan.abtest ? t('plan.abtest') : false,
  plan.progressive_deploy ? t('plan.progressive_deploy') : false,
].filter(Boolean)

const currentPlanSuggest = computed(() => plans.value.find(plan => plan.name === planSuggest.value))
const currentPlan = computed(() => plans.value.find(plan => plan.name === planCurrrent.value))

interface SegmentCustomEvent extends CustomEvent {
  target: HTMLIonSegmentElement
  detail: SegmentChangeEventDetail
}
const segmentChanged = (e: SegmentCustomEvent) => {
  segmentVal.value = e.detail.value === 'y' ? 'y' : 'm'
}

const openChangePlan = (planId: string) => {
  if (planId)
    openCheckout(planId)
}
const showToastMessage = async (message: string) => {
  const toast = await toastController
    .create({
      position: 'middle',
      message,
      duration: 4000,
    })
  await toast.present()
}

const getPrice = (plan: definitions['plans'], t: 'm' | 'y'): number => {
  return plan[t === 'm' ? 'price_m' : 'price_y']
}

const getUsages = async () => {
  // get aapp_stats
  const date_id = new Date().toISOString().slice(0, 7)
  const { data: oldStats, error: errorOldStats } = await supabase
    .rpc<Stats>('get_max_stats', { userid: main.user?.id, dateid: date_id })
    .single()
  const { data, error } = await supabase
    .from<definitions['app_stats']>('app_stats')
    .select()
    .eq('user_id', main.user?.id)
    .like('date_id', `${date_id}%`)
  if (oldStats && !errorOldStats)
    stats.value = oldStats

  if (data && !error) {
    datas.value.mau = new Array(daysInCurrentMonth() + 1).fill(0)
    datas.value.storage = new Array(daysInCurrentMonth() + 1).fill(0)
    datas.value.bandwidth = new Array(daysInCurrentMonth() + 1).fill(0)
    data.forEach((item: definitions['app_stats']) => {
      if (item.date_id.length > 7) {
        const dayNumber = Number(item.date_id.slice(8))
        datas.value.mau[dayNumber] += item.devices || 0
        datas.value.storage[dayNumber] += item.version_size ? item.version_size / 1024 / 1024 / 1024 : 0
        datas.value.bandwidth[dayNumber] += item.bandwidth ? item.bandwidth / 1024 / 1024 / 1024 : 0
      }
    })
  }
}

const loadData = async () => {
  isLoading.value = true
  await getPlans().then((pls) => {
    plans.value.length = 0
    plans.value.push(...pls)
  })
  await getUsages()
  await findBestPlan(stats.value).then(res => planSuggest.value = res)
  if (main.auth?.id)
    await getCurrentPlanName(main.auth?.id).then(res => planCurrrent.value = res)
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
    else if (prevMyPlan && !myPlan) { isLoading.value = true }
  })

watchEffect(async () => {
  if (route.path === '/dashboard/settings/plans') {
    // if session_id is in url params show modal success plan setup
    if (route.query.session_id) {
      showToastMessage(t('usage.success'))
      if (main.user?.id) {
        snag.publish({
          channel: 'usage',
          event: 'User subscribe',
          icon: '📊',
          tags: {
            'user-id': main.user?.id,
          },
          notify: false,
        }).catch()
      }
    }
    else if (main.user?.id) {
      loadData()
      snag.publish({
        channel: 'usage',
        event: 'User visit',
        icon: '📊',
        tags: {
          'user-id': main.user?.id,
        },
        notify: false,
      }).catch()
    }
  }
})
</script>

<template>
  <div v-if="!isLoading" class="bg-white dark:bg-gray-800">
    <div class="max-w-7xl mx-auto pt-6 px-4 sm:px-6 lg:px-8">
      <div class="sm:flex sm:flex-col sm:align-center">
        <h1 class="text-5xl font-extrabold text-gray-900 dark:text-white sm:text-center">
          {{ t('plan.pricing-plans') }}
        </h1>
        <p class="mt-5 text-xl text-gray-700 dark:text-white  sm:text-center">
          {{ t('plan.desc') }}<br>
          Your are a <span class="underline font-bold">{{ currentPlan?.name }}</span> {{ t('plan-member') }}<br>
          {{ t('the') }} <span class="underline font-bold">{{ currentPlanSuggest?.name }}</span> {{ t('plan-is-the-best-pla') }}
        </p>

        <IonSegment :value="segmentVal" class="sm:w-max-80 mx-auto mt-6 sm:mt-8 dark:text-gray-500 dark:bg-black" mode="ios" @ion-change="segmentChanged($event)">
          <IonSegmentButton class="h-10" value="m">
            <IonLabel>{{ t('plan.monthly-billing') }}</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton class="h-10" value="y">
            <IonLabel>{{ t('plan.yearly-billing') }}</IonLabel>
          </IonSegmentButton>
        </IonSegment>
      </div>
      <div class="mt-12 space-y-4 sm:mt-16 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-6 lg:max-w-4xl lg:mx-auto xl:max-w-none xl:mx-0 xl:grid-cols-4">
        <div v-for="p in displayPlans" :key="p.id" class="border border-gray-200 rounded-lg shadow-sm divide-y divide-gray-200" :class="p.name === currentPlan?.name ? 'border-4 border-muted-blue-600' : ''">
          <div class="p-6">
            <h2 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">
              {{ p.name }}
            </h2>
            <p class="mt-4 text-sm text-gray-500 dark:text-gray-100">
              {{ t(p.description) }}
            </p>
            <p class="mt-8">
              <span class="text-4xl font-extrabold text-gray-900 dark:text-white">€{{ getPrice(p, segmentVal) }}</span>
              <span class="text-base font-medium text-gray-500 dark:text-gray-100">/{{ isYearly ? 'yr' : 'mo' }}</span>
            </p>
            <button v-if="p.stripe_id !== 'free'" class="mt-8 block w-full bg-gray-800 dark:bg-white border border-gray-800 rounded-md py-2 text-sm font-semibold text-white dark:text-black text-center hover:bg-gray-900 dark:hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-gray-500 disabled:dark:bg-gray-400" :disabled="currentPlan?.name === p.name" @click="openChangePlan(p.stripe_id)">
              {{ t('plan.buy') }} {{ p.name }}
            </button>
          </div>
          <div class="pt-6 pb-8 px-6">
            <h3 class="text-xs font-medium text-gray-900 dark:text-white tracking-wide uppercase">
              {{ t('plan.whats-included') }}
            </h3>
            <ul role="list" class="mt-6 space-y-4">
              <li v-for="(f, index) in planFeatures(p)" :key="index" class="flex space-x-3">
                <svg class="flex-shrink-0 h-5 w-5 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
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
                      class="
                                    rounded-xl
                                    p-6
                                    inline-flex
                                    items-center
                                    justify-center
                                    mt-5
                                    text-base
                                    font-bold
                                    text-gray-900
                                    transition-all
                                    duration-200
                                    bg-white
                                    border border-transparent
                                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white
                                    font-pj
                                    hover:bg-opacity-90
                                "
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
