<script setup lang="ts">
/**
 * TrialCardPrompt Component
 *
 * Optional, dismissible ask to add a card during the free trial. Checkout
 * keeps the remaining trial days, so nothing is charged before the trial ends.
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

import type { TrialCardPromptMoment } from '~/utils/trialCardPrompt'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import IconCreditCard from '~icons/heroicons/credit-card'
import { getFormatLocale } from '~/services/formatLocale'
import { isNativeAppStoreContext } from '~/services/nativeCompliance'
import { checkPermissions } from '~/services/permissions'
import { pushEvent } from '~/services/posthog'
import { getLocalConfig, stripeEnabled, useSupabase } from '~/services/supabase'
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
  moment.value = null
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

const hasRealDevices = computed(() => main.dashboardByapp.some(usage => usage.mau > 0 && realAppIds.value.has(usage.app_id)))

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
  moment.value = next
  pushEvent('trial_card_prompt_shown', config.supaHost, { org_id: id, moment: next, trial_days_left: daysLeft })
}, { immediate: true })

const trialEndLabel = computed(() => getTrialEndDate(trialDaysLeft.value).toLocaleDateString(getFormatLocale(), { month: 'long', day: 'numeric' }))
const title = computed(() => moment.value ? t(`trial-card-prompt-${moment.value}-title`) : '')

function trackAction(action: 'clicked' | 'dismissed') {
  pushEvent(`trial_card_prompt_${action}`, config.supaHost, {
    org_id: orgId.value,
    moment: moment.value ?? '',
    trial_days_left: trialDaysLeft.value,
  })
}

function dismiss() {
  trackAction('dismissed')
  moment.value = null
}

async function addCard() {
  trackAction('clicked')
  moment.value = null
  await router.push('/settings/organization/plans')
}
</script>

<template>
  <aside
    v-if="moment"
    class="relative z-20 flex w-full shrink-0 flex-col gap-2 border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-slate-900 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-slate-100"
    role="status"
    data-test="trial-card-prompt"
  >
    <div class="flex min-w-0 items-center gap-3">
      <IconCreditCard class="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
      <div class="min-w-0">
        <p class="text-sm font-semibold">
          {{ title }}
        </p>
        <p class="text-xs text-slate-700 dark:text-slate-300">
          {{ t('trial-card-prompt-detail', { date: trialEndLabel }) }}
        </p>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <button
        type="button"
        class="d-btn d-btn-sm d-btn-ghost"
        data-test="trial-card-prompt-dismiss"
        @click="dismiss"
      >
        {{ t('trial-card-prompt-dismiss') }}
      </button>
      <button
        type="button"
        class="d-btn d-btn-sm d-btn-primary"
        data-test="trial-card-prompt-add-card"
        @click="addCard"
      >
        {{ t('trial-card-prompt-cta') }}
      </button>
    </div>
  </aside>
</template>
