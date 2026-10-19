<script setup lang="ts">
/**
 * TrialCardPrompt Component
 *
 * Optional modal asking trial orgs to add a card. Payment happens inside the
 * modal with Stripe Embedded Checkout; checkout keeps the remaining trial
 * days, so nothing is charged before the trial ends. Falls back to the hosted
 * checkout page when the org's Stripe account has no publishable key.
 *
 * Visibility conditions:
 * - Stripe billing is enabled and external purchase flows are allowed
 * - The user can manage org billing (org.update_billing)
 * - The org is in trial, not paying, with enough trial left for checkout to
 *   keep it
 * - One of the org's own apps (not the onboarding demo app) has had real
 *   devices, the moment when most orgs decide to buy
 * - Each moment (activated, mid-trial, trial ending) shows once per org
 */

import type { StripeEmbeddedCheckout } from '@stripe/stripe-js'
import type { Database } from '~/types/supabase.types'
import type { TrialCardPromptMoment } from '~/utils/trialCardPrompt'
import { loadStripe } from '@stripe/stripe-js/pure'
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconCheck from '~icons/heroicons/check'
import IconCreditCard from '~icons/heroicons/credit-card'
import IconXMark from '~icons/heroicons/x-mark'
import { formatNumber, getFormatLocale } from '~/services/formatLocale'
import { isNativeAppStoreContext } from '~/services/nativeCompliance'
import { checkPermissions } from '~/services/permissions'
import { pushEvent } from '~/services/posthog'
import { createEmbeddedCheckoutSession, openBlank } from '~/services/stripe'
import { getLocalConfig, stripeEnabled, useSupabase } from '~/services/supabase'
import { sendEvent } from '~/services/tracking'
import { useMainStore } from '~/stores/main'
import { isPendingOrganizationInvite, useOrganizationStore } from '~/stores/organization'
import {
  getTrialCardPromptMoment,
  getTrialEndDate,
  markTrialCardPromptShown,
  readTrialCardPromptState,
  TRIAL_CARD_PROMPT_MIN_DAYS_LEFT,
  writeTrialCardPromptState,
} from '~/utils/trialCardPrompt'

type Plan = Database['public']['Tables']['plans']['Row']

// Enterprise needs the MAU slider of the Plans page.
const MODAL_PLAN_NAMES = ['Solo', 'Maker', 'Team']

const { t } = useI18n()
const router = useRouter()
const supabase = useSupabase()
const main = useMainStore()
const organizationStore = useOrganizationStore()
const config = getLocalConfig()
const hideExternalPurchaseFlows = isNativeAppStoreContext()

const moment = ref<TrialCardPromptMoment | null>(null)
const realAppIds = ref<Set<string>>(new Set())
const canManageBilling = ref(false)
const selectedPlanName = ref('')
const isYearly = ref(false)
const step = ref<'offer' | 'loading' | 'payment'>('offer')
const checkoutContainer = useTemplateRef<HTMLElement>('checkoutContainer')
let embeddedCheckout: StripeEmbeddedCheckout | null = null
let lookupRun = 0

const currentOrg = computed(() => organizationStore.currentOrganization)
const orgId = computed(() => {
  const org = currentOrg.value
  if (!org || isPendingOrganizationInvite(org))
    return ''
  return org.gid
})
const trialDaysLeft = computed(() => currentOrg.value?.trial_left ?? 0)
const isEligibleTrial = computed(() => !!currentOrg.value && !currentOrg.value.paying && trialDaysLeft.value >= TRIAL_CARD_PROMPT_MIN_DAYS_LEFT)

watch([orgId, isEligibleTrial, () => !!stripeEnabled.value], async ([id, eligible, enabled]) => {
  const run = ++lookupRun
  closeModal()
  canManageBilling.value = false
  realAppIds.value = new Set()
  if (!id || !eligible || !enabled || hideExternalPurchaseFlows)
    return
  if (!await checkPermissions('org.update_billing', { orgId: id }) || run !== lookupRun)
    return
  // need_onboarding marks the onboarding demo app, whose stats are seeded.
  const { data, error } = await supabase
    .from('apps')
    .select('app_id')
    .eq('owner_org', id)
    .eq('need_onboarding', false)
  if (run !== lookupRun)
    return
  if (error) {
    console.error('Cannot load apps for the trial card prompt', error)
    return
  }
  realAppIds.value = new Set(data.map(app => app.app_id))
  canManageBilling.value = true
}, { immediate: true })

// Last 30 days of the org's own apps, as loaded for the dashboard.
const realUsage = computed(() => main.dashboardByapp
  .filter(usage => realAppIds.value.has(usage.app_id))
  .reduce((total, usage) => ({ mau: total.mau + usage.mau, updates: total.updates + usage.get }), { mau: 0, updates: 0 }))
const hasRealDevices = computed(() => realUsage.value.mau > 0)

const plans = computed(() => MODAL_PLAN_NAMES
  .map(name => main.plans.find(plan => plan.name === name))
  .filter((plan): plan is Plan => !!plan?.stripe_id))
// The plan the org's usage fits (same source as the Plans page suggestion).
const recommendedPlanName = computed(() => plans.value.find(plan => plan.name === main.bestPlan)?.name ?? plans.value.at(-1)?.name ?? '')
const selectedPlan = computed(() => plans.value.find(plan => plan.name === selectedPlanName.value))

watch([canManageBilling, hasRealDevices, trialDaysLeft], ([canManage, hasDevices, daysLeft]) => {
  const id = orgId.value
  if (!canManage || !id || moment.value)
    return
  const state = readTrialCardPromptState(id)
  const next = getTrialCardPromptMoment({
    trialDaysLeft: daysLeft,
    paying: !!currentOrg.value?.paying,
    hasRealDevices: hasDevices,
    state,
  })
  if (!next)
    return
  writeTrialCardPromptState(id, markTrialCardPromptShown(state, next))
  selectedPlanName.value = recommendedPlanName.value
  isYearly.value = false
  step.value = 'offer'
  moment.value = next
  pushEvent('trial_card_prompt_shown', config.supaHost, { org_id: id, moment: next, trial_days_left: daysLeft })
}, { immediate: true })

const trialEndLabel = computed(() => getTrialEndDate(trialDaysLeft.value).toLocaleDateString(getFormatLocale(), { month: 'long', day: 'numeric' }))
const title = computed(() => moment.value ? t(`trial-card-prompt-${moment.value}-title`) : '')
const benefits = computed(() => [
  t('trial-card-prompt-benefit-no-charge', { date: trialEndLabel.value }),
  t('trial-card-prompt-benefit-keep-trial', { days: trialDaysLeft.value }),
  t('trial-card-prompt-benefit-no-interruption'),
  t('trial-card-prompt-benefit-cancel', { date: trialEndLabel.value }),
])

function hasYearlyDiscount(plan: Plan) {
  return plan.price_y > 0 && Math.round(plan.price_y / 12) < plan.price_m
}

function monthlyPrice(plan: Plan) {
  return isYearly.value && hasYearlyDiscount(plan) ? Math.round(plan.price_y / 12) : plan.price_m
}

function formatUsd(value: number) {
  return formatNumber(value, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function trackAction(action: 'clicked' | 'dismissed' | 'completed') {
  pushEvent(`trial_card_prompt_${action}`, config.supaHost, {
    org_id: orgId.value,
    moment: moment.value ?? '',
    trial_days_left: trialDaysLeft.value,
    plan_name: selectedPlan.value?.name ?? '',
    recurrence: isYearly.value ? 'year' : 'month',
  })
}

function destroyCheckout() {
  embeddedCheckout?.destroy()
  embeddedCheckout = null
}

function closeModal() {
  destroyCheckout()
  moment.value = null
  step.value = 'offer'
}

function dismiss() {
  if (!moment.value)
    return
  trackAction('dismissed')
  closeModal()
}

async function onCheckoutComplete() {
  trackAction('completed')
  closeModal()
  toast.success(t('trial-card-prompt-success', { date: trialEndLabel.value }))
  // Webhooks update stripe_info; refresh so the console reflects the new plan.
  await organizationStore.fetchOrganizations()
}

async function startPayment() {
  const plan = selectedPlan.value
  const id = orgId.value
  if (!plan?.stripe_id || !id || step.value !== 'offer')
    return
  const recurrence = isYearly.value && hasYearlyDiscount(plan)
  trackAction('clicked')
  step.value = 'loading'
  sendEvent({
    channel: 'usage',
    event: 'Checkout Started',
    org_id: id,
    tracking_version: 2,
    tags: {
      product_id: plan.stripe_id,
      plan_name: plan.name,
      recurrence: recurrence ? 'year' : 'month',
      checkout_source: 'trial_card_prompt',
      plan_price: recurrence ? plan.price_y : plan.price_m,
    },
  }).catch(() => {})
  try {
    const session = await createEmbeddedCheckoutSession(plan.stripe_id, recurrence, id, `${globalThis.location.origin}/settings/organization/plans`)
    if (!session)
      throw new Error('No checkout session')
    if (session.kind === 'hosted') {
      closeModal()
      await openBlank(session.url)
      return
    }
    const stripe = await loadStripe(session.publishableKey)
    if (!stripe)
      throw new Error('Stripe.js failed to load')
    step.value = 'payment'
    embeddedCheckout = await stripe.createEmbeddedCheckoutPage({
      clientSecret: session.clientSecret,
      onComplete: () => { void onCheckoutComplete() },
    })
    await nextTick()
    if (!checkoutContainer.value || !moment.value) {
      destroyCheckout()
      return
    }
    embeddedCheckout.mount(checkoutContainer.value)
  }
  catch (error) {
    console.error('Cannot start trial card checkout', error)
    destroyCheckout()
    step.value = 'offer'
    toast.error(t('trial-card-prompt-checkout-error'))
  }
}

function seeAllPlans() {
  closeModal()
  void router.push('/settings/organization/plans')
}

useEventListener(document, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape')
    dismiss()
})

onBeforeUnmount(destroyCheckout)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="moment"
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4"
      data-test="trial-card-prompt"
      @click.self="dismiss"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="trial-card-prompt-title"
        class="relative flex max-h-[95vh] w-full max-w-2xl flex-col overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-slate-800"
      >
        <button
          type="button"
          class="d-btn d-btn-sm d-btn-circle d-btn-ghost absolute right-3 top-3"
          :aria-label="t('trial-card-prompt-dismiss')"
          @click="dismiss"
        >
          <IconXMark class="h-5 w-5" aria-hidden="true" />
        </button>

        <div class="flex flex-col gap-5 p-6 sm:p-8">
          <header class="flex items-start gap-4 pr-8">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40">
              <IconCreditCard class="h-6 w-6 text-blue-600 dark:text-blue-300" aria-hidden="true" />
            </div>
            <div>
              <h2 id="trial-card-prompt-title" class="text-xl font-bold text-slate-900 dark:text-white">
                {{ title }}
              </h2>
              <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {{ t('trial-card-prompt-subtitle') }}
              </p>
            </div>
          </header>

          <p
            v-if="realUsage.mau > 0"
            class="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
            data-test="trial-card-prompt-usage"
          >
            {{ t('trial-card-prompt-usage', { mau: formatNumber(realUsage.mau), updates: formatNumber(realUsage.updates) }) }}
          </p>

          <template v-if="step !== 'payment'">
            <ul class="grid gap-2 sm:grid-cols-2">
              <li v-for="benefit in benefits" :key="benefit" class="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                {{ benefit }}
              </li>
            </ul>

            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-3">
                <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
                  {{ t('trial-card-prompt-choose-plan') }}
                </h3>
                <div class="flex items-center rounded-lg bg-slate-100 p-1 text-xs dark:bg-slate-700" role="group" :aria-label="t('trial-card-prompt-billing-period')">
                  <button
                    type="button"
                    class="rounded-md px-3 py-1 font-medium"
                    :class="!isYearly ? 'bg-white shadow-sm dark:bg-slate-600 dark:text-white' : 'text-slate-500 dark:text-slate-300'"
                    :aria-pressed="!isYearly"
                    @click="isYearly = false"
                  >
                    {{ t('monthly-plan') }}
                  </button>
                  <button
                    type="button"
                    class="rounded-md px-3 py-1 font-medium"
                    :class="isYearly ? 'bg-white shadow-sm dark:bg-slate-600 dark:text-white' : 'text-slate-500 dark:text-slate-300'"
                    :aria-pressed="isYearly"
                    @click="isYearly = true"
                  >
                    {{ t('yearly') }}
                  </button>
                </div>
              </div>
              <div class="grid gap-2 sm:grid-cols-3">
                <button
                  v-for="plan in plans"
                  :key="plan.name"
                  type="button"
                  class="relative flex flex-col items-start rounded-xl border-2 p-3 text-left transition-colors"
                  :class="plan.name === selectedPlanName ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-slate-200 hover:border-blue-300 dark:border-slate-600'"
                  :aria-pressed="plan.name === selectedPlanName"
                  :data-test="`trial-card-plan-${plan.name}`"
                  @click="selectedPlanName = plan.name"
                >
                  <span v-if="plan.name === recommendedPlanName" class="mb-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                    {{ t('trial-card-prompt-fits-usage') }}
                  </span>
                  <span class="font-semibold text-slate-900 dark:text-white">{{ plan.name }}</span>
                  <span class="text-sm text-slate-600 dark:text-slate-300">
                    {{ formatUsd(monthlyPrice(plan)) }}/{{ t('mo') }}
                  </span>
                  <span class="text-xs text-slate-500 dark:text-slate-400">
                    {{ t('trial-card-prompt-plan-mau', { mau: formatNumber(plan.mau) }) }}
                  </span>
                </button>
              </div>
            </div>

            <div class="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex items-center gap-2">
                <button type="button" class="d-btn d-btn-ghost" data-test="trial-card-prompt-dismiss" @click="dismiss">
                  {{ t('trial-card-prompt-dismiss') }}
                </button>
                <button type="button" class="d-btn d-btn-link px-0 text-sm" @click="seeAllPlans">
                  {{ t('trial-card-prompt-all-plans') }}
                </button>
              </div>
              <button
                type="button"
                class="d-btn d-btn-primary"
                :disabled="!selectedPlan || step === 'loading'"
                data-test="trial-card-prompt-add-card"
                @click="startPayment"
              >
                <span v-if="step === 'loading'" class="d-loading d-loading-spinner d-loading-sm" aria-hidden="true" />
                {{ t('trial-card-prompt-cta', { date: trialEndLabel }) }}
              </button>
            </div>
          </template>

          <template v-else>
            <p class="text-sm text-slate-600 dark:text-slate-300">
              {{ t('trial-card-prompt-payment-note', { plan: selectedPlan?.name ?? '', date: trialEndLabel }) }}
            </p>
            <div ref="checkoutContainer" class="min-h-[420px]" data-test="trial-card-prompt-checkout" />
            <button type="button" class="d-btn d-btn-ghost self-start" @click="dismiss">
              {{ t('trial-card-prompt-dismiss') }}
            </button>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>
