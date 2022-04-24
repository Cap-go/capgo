<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { RefresherCustomEvent } from '@ionic/vue'
import {
  IonBackButton, IonButtons, IonContent, IonHeader, IonItem, IonItemDivider, IonLabel,
  IonList, IonPage, IonRefresher, IonRefresherContent, IonTitle, IonToolbar,
} from '@ionic/vue'
import { computed, reactive, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import type { definitions } from '~/types/supabase'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const isLoading = ref(true)
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
    name: 'free',
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
    name: 'solo',
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
    name: 'maker',
    apps: 3,
    channels: 10,
    updates: 25000,
    versions: 10,
    sharedChannels: 10,
    abtest: false,
    progressiveDeploy: false,
  },
  team: {
    id: 'prod_LQIzm2NGzayzXi',
    name: 'team',
    apps: 10,
    channels: 50,
    updates: 250000,
    versions: 1000,
    sharedChannels: 1000,
    abtest: true,
    progressiveDeploy: true,
  },
}
const currentPlanSuggest = computed<Plan>(() => {
  const plansList = Object.values(plans)
  return plansList.find(plan => usage.apps < plan.apps
    && usage.channels < plan.channels
    && usage.versions < plan.versions
    && usage.sharedChannels < plan.sharedChannels
    && usage.updates < plan.updates) || plansList[plansList.length - 1]
})

const openPortal = async() => {
  console.log('openPortal')
  const session = supabase.auth.session()
  if (!session)
    return
  try {
    const res = await fetch('https://capgo.app/api/stripe_portal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': session.access_token,
      },
    })
    console.log('res', res)
  // window.open('https://dashboard.stripe.com/test/subscriptions/sub_LQIzm2NGzayzXi', '_blank')
  }
  catch (error) {
    console.error(error)
  }
}

const currentPlan = computed<Plan>(() => {
  const plansList = Object.values(plans)
  return plansList.find(plan => myPlan.value?.product_id === plan.id) || plansList[0]
})

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
            <a href="https://capgo.app/pricing" class="!text-pumpkin-orange-500 font-bold inline" target="_blank">{{ currentPlanSuggest.name }}</a>
          </ion-label>
        </ion-item-divider>
        <ion-item-divider>
          <ion-label>
            {{ t('your-current-plan-is') }}
            <div class="!text-pumpkin-orange-500 font-bold inline" target="_blank" @click="openPortal">
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
    </IonContent>
  </IonPage>
</template>
