<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { RefresherCustomEvent, SegmentChangeEventDetail } from '@ionic/vue'
import {
  IonContent,
  IonItem,
  IonItemDivider,
  IonLabel, IonList, IonPage, IonRefresher,
  IonRefresherContent, IonSegment, IonSegmentButton,
  isPlatform, toastController,
} from '@ionic/vue'
import { computed, ref, watchEffect, watch } from 'vue'
import { useRoute } from 'vue-router'
import { openCheckout } from '~/services/stripe'
import { useMainStore } from '~/stores/main'
import TitleHead from '~/components/TitleHead.vue'
import type { PlanRes, Stats } from '~/services/plans'
import Spinner from '~/components/Spinner.vue'
import { definitions } from '~/types/supabase'
import { useSupabase } from '~/services/supabase'

const { t } = useI18n()
const supabase = useSupabase()
const isLoading = ref(false)
const isMobile = isPlatform('capacitor')
const segmentVal = ref<'m' | 'y'>('m')
const isYearly = computed(() => segmentVal.value === 'y')
const route = useRoute()
const main = useMainStore()

const getStat = (name: string): number => {
  console.log('getStat', name)
  return main.myPlan?.stats[name as keyof Stats] || 0
}

const planFeatures = (plan: definitions['plans']) => [
  plan.app > 1 ? `${plan.app} ${t('plan.applications')}` : `${plan.app} ${t('plan.application')}`,
  plan.channel > 1 ? `${plan.channel} ${t('plan.channels')}` : `${plan.channel} ${t('plan.channel')}`,
  plan.version > 1 ? `${plan.version} ${t('plan.versions')}` : `${plan.version} ${t('plan.version')}`,
  plan.shared > 1 ? `${plan.shared} ${t('plan.shared_channels')}` : `${plan.shared} ${t('plan.shared_channel')}`,
  plan.update > 1 ? `${plan.update} ${t('plan.updates')}` : `${plan.update} ${t('plan.update')}`,
  plan.abtest ? t('plan.abtest') : false,
  plan.progressive_deploy ? t('plan.progressive_deploy') : false,
].filter(Boolean)

const currentPlanSuggest = computed(() => main.myPlan?.AllPlans.find(plan => plan.name === main.myPlan?.planSuggest))

const currentPlan = computed(() => main.myPlan?.AllPlans.find(plan => plan.name === main.myPlan?.plan))

const getCurrentPlanSuggestStat = (name: string): number => {
  const key = name.replace('max_', '')
  console.log('getCurrentPlanSuggestStat', key)
  return currentPlanSuggest.value ? currentPlanSuggest?.value[key as keyof definitions['plans']] as number : 0
}

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

const formatName = (name: string): string => {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace('max_', '')
}

const stats = (): keyof Stats => {
  // get keys of Stats interface
  if (!main.myPlan?.stats) {
    return [] as unknown as keyof Stats
  }
  const res: keyof Stats = Object.keys(main.myPlan?.stats).filter(key => key !== 'max_device') as unknown as keyof Stats
  return res
}

const getPrice = (plan: definitions['plans'], t: 'm' | 'y'): number => {
  return plan[t === 'm' ? 'price_m' : 'price_y']
}
const getPercentage = (val: number, total: number) => {
  return Math.floor((val * 100) / total)
}
const getBarColorClass = (name: string) => {
  switch (name) {
    case 'max_app':
      return 'bg-emerald-700 text-emerald-100'
    case 'max_channel':
      return 'bg-azure-700 text-azure-100'
    case 'max_version':
      return 'bg-rose-700 text-rose-100'
    case 'max_shared':
      return 'bg-vista-blue-700 text-vista-blue-100'
    case 'max_update':
      return 'bg-pumpkin-orange-700 text-pumpkin-orange-100'
  }
}

watch(
  () => main.myPlan,
  (myPlan, prevMyPlan) => {
    if (!prevMyPlan && myPlan) {
      isLoading.value = false
    } else if (prevMyPlan && !myPlan) {
      isLoading.value = true
    }
  }
)

watchEffect(async () => {
  if (route.path === '/app/usage') {
    // if session_id is in url params show modal success plan setup
    route.query.session_id && showToastMessage(t('usage.success'))
  }
})

const refreshData = async (evt: RefresherCustomEvent | null = null) => {
  isLoading.value = true
  try {
    // await getAllMax()
    console.log('refreshData')
    const res = await supabase.functions.invoke<PlanRes>('payment_status', {})
    if (res.data)
      main.myPlan = res.data
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
    <TitleHead :title="t('usage.title')" default-back="/app/account" />
    <IonContent :fullscreen="true">
      <TitleHead :title="t('usage.title')" big default-back="/app/account" />
      <IonRefresher slot="fixed" @ion-refresh="refreshData($event)">
        <IonRefresherContent />
      </IonRefresher>
      <div v-if="isLoading" class="flex justify-center">
        <Spinner />
      </div>
      <IonList v-if="!isLoading">
        <IonItemDivider v-if="currentPlanSuggest">
          <IonLabel>
            {{ t('your-current-suggested-plan-is') }}
            <a href="https://capgo.app/pricing" class="!text-pumpkin-orange-500 font-bold inline cursor-pointer" target="_blank">{{ currentPlanSuggest.name }}</a>
          </IonLabel>
        </IonItemDivider>
        <IonItemDivider v-if="currentPlan">
          <IonLabel>
            {{ t('your-current-plan-is') }}
            <div class="!text-pumpkin-orange-500 font-bold inline" target="_blank">
              {{ currentPlan.name }}
            </div>
          </IonLabel>
        </IonItemDivider>
        <IonItem v-for="s in stats()" :key="s">
          <p class="w-40 first-letter:uppercase">
            {{ formatName(s) }}
          </p>
          <div class="w-30">
            <p :class="getBarColorClass(s)" class=" rounded text-center">
              {{ getStat(s) }}
            </p>
          </div>
          <div class="ml-3 w-full md:w-1/2 bg-gray-200 rounded-full dark:bg-gray-700">
            <div :class="getBarColorClass(s)" class="min-h-4 text-xs font-medium text-center p-0.5 leading-none rounded-full" :style="{ width: `${getPercentage(getStat(s), getCurrentPlanSuggestStat(s))}%` }">
              {{ getPercentage(getStat(s), getCurrentPlanSuggestStat(s)) < 10 ? '' : `${getPercentage(getStat(s), getCurrentPlanSuggestStat(s))}%` }}
            </div>
          </div>
        </IonItem>
      </IonList>
      <div v-if="!isMobile && !isLoading" class="bg-white dark:bg-gray-900">
        <div class="max-w-7xl mx-auto py-24 px-4 sm:px-6 lg:px-8">
          <div class="sm:flex sm:flex-col sm:align-center">
            <h1 class="text-5xl font-extrabold text-gray-900 dark:text-gray-100 sm:text-center">
              {{ t('plan.pricing-plans') }}
            </h1>
            <p class="mt-5 text-xl text-gray-500 sm:text-center">
              {{ t('plan.desc') }}
            </p>
            <IonSegment :value="segmentVal" class="sm:w-max-80 mx-auto mt-6 sm:mt-8" mode="ios" @ion-change="segmentChanged($event)">
              <IonSegmentButton class="h-10" value="m">
                <IonLabel>{{ t('plan.monthly-billing') }}</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton class="h-10" value="y">
                <IonLabel>{{ t('plan.yearly-billing') }}</IonLabel>
              </IonSegmentButton>
            </IonSegment>
          </div>
          <div class="mt-12 space-y-4 sm:mt-16 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-6 lg:max-w-4xl lg:mx-auto xl:max-w-none xl:mx-0 xl:grid-cols-4">
            <div v-for="p in main.myPlan?.AllPlans" :key="p.id" class="border border-gray-200 rounded-lg shadow-sm divide-y divide-gray-200">
              <div class="p-6">
                <h2 class="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100">
                  {{ p.name }}
                </h2>
                <p class="mt-4 text-sm text-gray-500">
                  {{ t(p.description) }}
                </p>
                <p class="mt-8">
                  <span class="text-4xl font-extrabold text-gray-900 dark:text-gray-100">€{{ getPrice(p, segmentVal) }}</span>
                  <span class="text-base font-medium text-gray-500">/{{ isYearly ? 'yr' : 'mo' }}</span>
                </p>
                <div v-if="p.stripe_id !== 'free'" class="mt-8 block w-full bg-gray-800 border border-gray-800 rounded-md py-2 text-sm font-semibold text-white text-center hover:bg-gray-900" @click="openChangePlan(p.stripe_id)">
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
