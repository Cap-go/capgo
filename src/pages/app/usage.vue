<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { RefresherCustomEvent, SegmentChangeEventDetail } from '@ionic/vue'
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonItemDivider, IonLabel, IonList, IonPage, IonRefresher, IonRefresherContent, IonSegment,
  IonSegmentButton, IonTitle, IonToolbar, isPlatform,
} from '@ionic/vue'
import { computed, reactive, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import type { definitions } from '~/types/supabase'
import { useSupabase } from '~/services/supabase'
import { openCheckout } from '~/services/stripe'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const isLoading = ref(true)
const isMobile = isPlatform('capacitor')
const segmentVal = ref('monthly')
const isYearly = computed(() => segmentVal.value === 'yearly')
const myPlan = ref<definitions['stripe_info']>()
const route = useRoute()
const supabase = useSupabase()
const main = useMainStore()
const auth = supabase.auth.user()

interface PastDl {
  app_id: string
  maxdownload: number
}

interface Plan {
  id: string
  name: string
  description: string
  price: {
    monthly: number
    yearly: number
  }
  apps: number
  channels: number
  updates: number
  versions: number
  sharedChannels: number
  abtest: boolean
  progressiveDeploy: boolean
}
const usage = reactive({
  apps: 0,
  channels: 0,
  versions: 0,
  sharedChannels: 0,
  updates: 0,
})

const plans: Record<string, Plan> = {
  free: {
    id: '',
    name: 'Free',
    description: t('plan.free.desc'),
    price: {
      monthly: 0,
      yearly: 0,
    },
    apps: 1,
    channels: 1,
    updates: 500,
    versions: 10,
    sharedChannels: 0,
    abtest: false,
    progressiveDeploy: false,
  },
  solo: {
    id: 'prod_LQIzwwVu6oMmAz',
    name: 'Solo',
    description: t('plan.solo.desc'),
    price: {
      monthly: 14,
      yearly: 146,
    },
    apps: 1,
    channels: 2,
    updates: 2500,
    versions: 10,
    sharedChannels: 0,
    abtest: false,
    progressiveDeploy: false,
  },
  maker: {
    id: 'prod_LQIzozukEwDZDM',
    name: 'Maker',
    description: t('plan.maker.desc'),
    price: {
      monthly: 39,
      yearly: 389,
    },
    apps: 3,
    channels: 10,
    updates: 25000,
    versions: 100,
    sharedChannels: 10,
    abtest: false,
    progressiveDeploy: false,
  },
  team: {
    id: 'prod_LQIzm2NGzayzXi',
    name: 'Team',
    description: t('plan.team.desc'),
    price: {
      monthly: 99,
      yearly: 998,
    },
    apps: 10,
    channels: 50,
    updates: 250000,
    versions: 1000,
    sharedChannels: 1000,
    abtest: true,
    progressiveDeploy: true,
  },
}
const planList = computed(() => Object.values(plans))
const planFeatures = (plan: Plan) => [
  plan.apps > 1 ? `${plan.apps} ${t('plan.applications')}` : `${plan.apps} ${t('plan.application')}`,
  plan.channels > 1 ? `${plan.channels} ${t('plan.channels')}` : `${plan.channels} ${t('plan.channel')}`,
  plan.versions > 1 ? `${plan.versions} ${t('plan.versions')}` : `${plan.versions} ${t('plan.version')}`,
  plan.sharedChannels > 1 ? `${plan.sharedChannels} ${t('plan.shared_channels')}` : `${plan.sharedChannels} ${t('plan.shared_channel')}`,
  plan.updates > 1 ? `${plan.updates} ${t('plan.updates')}` : `${plan.updates} ${t('plan.update')}`,
  plan.abtest ? t('plan.abtest') : false,
  plan.progressiveDeploy ? t('plan.progressive_deploy') : false,
].filter(Boolean)

const currentPlanSuggest = computed<Plan>(() => {
  return planList.value.find(plan => usage.apps < plan.apps
    && usage.channels < plan.channels
    && usage.versions < plan.versions
    && usage.sharedChannels < plan.sharedChannels
    && usage.updates < plan.updates) || planList.value[planList.value.length - 1]
})

const currentPlan = computed<Plan>(() => {
  return planList.value.find(plan => myPlan.value?.product_id === plan.id) || planList.value[0]
})

interface SegmentCustomEvent extends CustomEvent {
  target: HTMLIonSegmentElement
  detail: SegmentChangeEventDetail
}
const segmentChanged = (e: SegmentCustomEvent) => {
  segmentVal.value = e.detail.value || 'monthly'
}

const getMyApps = async() => {
  const { data } = await supabase
    .from<definitions['apps']>('apps')
    .select()
    .eq('user_id', auth?.id)
  if (data && data.length)
    usage.apps = data.length
}

const getMyPlan = async() => {
  console.log('user', supabase.auth.user(), supabase.auth.session())
  if (!main.user?.customer_id)
    return
  const { data } = await supabase
    .from<definitions['stripe_info']>('stripe_info')
    .select()
    .eq('customer_id', main.user?.customer_id)
  if (data && data.length)
    myPlan.value = data[0]
}

const getMaxChannel = async() => {
  const { data, error } = await supabase.rpc<number>('get_max_channel', { userid: auth?.id })
  if (error)
    usage.channels = 0
  else
    usage.channels = Number(data)
}

const getMaxShared = async() => {
  const { data, error } = await supabase.rpc<number>('get_max_shared', { userid: auth?.id })
  if (error)
    usage.sharedChannels = 0
  else
    usage.sharedChannels = Number(data)
}

const getMaxVersion = async() => {
  const { data, error } = await supabase.rpc<number>('get_max_version', { userid: auth?.id })
  if (error)
    usage.versions = 0
  else
    usage.versions = Number(data)
}

const openChangePlan = (planId: string) => {
  if (planId)
    openCheckout(planId)
}

const getMaxDownload = async() => {
  const { data, error } = await supabase.rpc<PastDl>('get_dl_by_month', { userid: auth?.id, pastmonth: 0 })
  if (error)
    usage.updates = 0
  if (data && data.length) {
    const max = data.reduce((acc, cur) => {
      if (cur.maxdownload > acc)
        return cur.maxdownload
      return acc
    }, 0)
    usage.updates = max
  }
}
const stats = () => {
  const res = Object.keys(usage)
  return res
}

const getPercentage = (val: number, total: number) => {
  return Math.floor((val * 100) / total)
}
const getBarColorClass = (name: string) => {
  switch (name) {
    case 'apps':
      return 'bg-emerald-700 text-emerald-100'
    case 'channels':
      return 'bg-azure-700 text-azure-100'
    case 'versions':
      return 'bg-rose-700 text-rose-100'
    case 'sharedChannels':
      return 'bg-vista-blue-700 text-vista-blue-100'
    case 'updates':
      return 'bg-pumpkin-orange-700 text-pumpkin-orange-100'
  }
}

watchEffect(async() => {
  if (route.path === '/app/usage') {
    isLoading.value = true
    await Promise.all([
      getMyApps(),
      getMaxChannel(),
      getMaxShared(),
      getMaxVersion(),
      getMaxDownload(),
      getMyPlan(),
    ])
    isLoading.value = false
  }
})

const refreshData = async(evt: RefresherCustomEvent | null = null) => {
  isLoading.value = true
  try {
    await getMyApps()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
  evt?.target?.complete()
}
</script>
<template>
  <IonPage>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/app/account" />
        </ion-buttons>
        <IonTitle>{{ t('usage.title') }}</IonTitle>
      </ion-toolbar>
    </ion-header>
    <IonContent :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refreshData($event)">
        <ion-refresher-content />
      </ion-refresher>
      <ion-list v-if="!isLoading">
        <ion-item-divider>
          <ion-label>
            {{ t('your-current-suggested-plan-is') }}
            <a href="https://capgo.app/pricing" class="!text-pumpkin-orange-500 font-bold inline cursor-pointer" target="_blank">{{ currentPlanSuggest.name }}</a>
          </ion-label>
        </ion-item-divider>
        <ion-item-divider>
          <ion-label>
            {{ t('your-current-plan-is') }}
            <div class="!text-pumpkin-orange-500 font-bold inline" target="_blank">
              {{ currentPlan.name }}
            </div>
          </ion-label>
        </ion-item-divider>
        <IonItem v-for="s in stats()" :key="s">
          <p class="w-40 first-letter:uppercase">
            {{ s.replace(/([a-z])([A-Z])/g, '$1 $2') }}
          </p>
          <div class="w-30">
            <p :class="getBarColorClass(s)" class=" rounded text-center">
              {{ usage[s] }}
            </p>
          </div>
          <div class="ml-3 w-full md:w-1/2 bg-gray-200 rounded-full dark:bg-gray-700">
            <div :class="getBarColorClass(s)" class="min-h-4 text-xs font-medium text-center p-0.5 leading-none rounded-full" :style="{ width: `${getPercentage(usage[s], currentPlanSuggest[s])}%` }">
              {{ getPercentage(usage[s], currentPlanSuggest[s]) < 10 ? '' : `${getPercentage(usage[s], currentPlanSuggest[s])}%` }}
            </div>
          </div>
        </IonItem>
      </ion-list>
      <div v-if="!isMobile" class="bg-white dark:bg-gray-900">
        <div class="max-w-7xl mx-auto py-24 px-4 sm:px-6 lg:px-8">
          <div class="sm:flex sm:flex-col sm:align-center">
            <h1 class="text-5xl font-extrabold text-gray-900 dark:text-gray-100 sm:text-center">
              {{ t('plan.pricing-plans') }}
            </h1>
            <p class="mt-5 text-xl text-gray-500 sm:text-center">
              {{ t('plan.desc') }}
            </p>
            <ion-segment :value="segmentVal" class="sm:w-max-80 mx-auto mt-6 sm:mt-8" mode="ios" @ionChange="segmentChanged($event)">
              <ion-segment-button class="h-10" value="monthly">
                <ion-label>{{ t('plan.monthly-billing') }}</ion-label>
              </ion-segment-button>
              <ion-segment-button class="h-10" value="yearly">
                <ion-label>{{ t('plan.yearly-billing') }}</ion-label>
              </ion-segment-button>
            </ion-segment>
          </div>
          <div class="mt-12 space-y-4 sm:mt-16 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-6 lg:max-w-4xl lg:mx-auto xl:max-w-none xl:mx-0 xl:grid-cols-4">
            <div v-for="p in planList" :key="p.id" class="border border-gray-200 rounded-lg shadow-sm divide-y divide-gray-200">
              <div class="p-6">
                <h2 class="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100">
                  {{ p.name }}
                </h2>
                <p class="mt-4 text-sm text-gray-500">
                  {{ p.description }}
                </p>
                <p class="mt-8">
                  <span class="text-4xl font-extrabold text-gray-900 dark:text-gray-100">${{ p.price[segmentVal] }}</span>
                  <span class="text-base font-medium text-gray-500">/{{ isYearly ? 'yr' : 'mo' }}</span>
                </p>
                <div v-if="p.id" class="mt-8 block w-full bg-gray-800 border border-gray-800 rounded-md py-2 text-sm font-semibold text-white text-center hover:bg-gray-900" @click="openChangePlan(p.id)">
                  {{ t('plan.buy') }} {{ p.name }}
                </div>
              </div>
              <div class="pt-6 pb-8 px-6">
                <h3 class="text-xs font-medium text-gray-900 dark:text-gray-100 tracking-wide uppercase">
                  {{ t('plan.whats-included') }}
                </h3>
                <ul role="list" class="mt-6 space-y-4">
                  <li v-for="(f, index) in planFeatures(p)" :key="index" class="flex space-x-3">
                    <svg class="flex-shrink-0 h-5 w-5 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span class="text-sm text-gray-500">{{ f }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>
