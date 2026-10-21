<script setup lang="ts">
/**
 * TrialCardPrompt Component
 *
 * Asks trial organizations to save a card right after an activation milestone:
 * the first device that installed an update, or the first successful native build.
 * Saving a card only stores it on the Stripe customer (SetupIntent); the trial keeps
 * running and nothing is charged. When the trial ends, checkout offers the saved card.
 *
 * Visibility conditions:
 * - Stripe billing is enabled and external purchase flows are allowed
 * - The organization is on trial (not paying, trial_left > 0)
 * - The user can manage org billing (org.update_billing)
 * - An app of the organization reached a milestone the user was not asked about yet
 * - The Stripe customer has no card on file
 */

import type { TrialCardMilestone } from '~/utils/trialCardPrompt'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import IconCheckCircle from '~icons/heroicons/check-circle'
import IconLock from '~icons/heroicons/lock-closed'
import BillingModal from '~/components/billing/BillingModal.vue'
import CardFormModal from '~/components/billing/CardFormModal.vue'
import { isNativeAppStoreContext } from '~/services/nativeCompliance'
import { checkPermissions } from '~/services/permissions'
import { pushEvent } from '~/services/posthog'
import { getBillingCard } from '~/services/stripe'
import { getLocalConfig, stripeEnabled } from '~/services/supabase'
import { isPendingOrganizationInvite, useOrganizationStore } from '~/stores/organization'
import {
  getReachedTrialCardMilestones,
  markTrialCardMilestonesHandled,
  pickTrialCardMilestone,
  readHandledTrialCardMilestones,
} from '~/utils/trialCardPrompt'

const { t } = useI18n()
const route = useRoute()
const organizationStore = useOrganizationStore()
const config = getLocalConfig()
const hideExternalPurchaseFlows = isNativeAppStoreContext()

interface ActivePrompt {
  // Pinned when shown so switching organization while it is open cannot misattribute it.
  orgId: string
  milestone: TrialCardMilestone
  reached: TrialCardMilestone[]
  trialDaysLeft: number
}

const prompt = ref<ActivePrompt | null>(null)
const step = ref<'ask' | 'card' | null>(null)
let lookupRun = 0

const currentOrg = computed(() => organizationStore.currentOrganization)
const orgId = computed(() => {
  const org = currentOrg.value
  if (!org || isPendingOrganizationInvite(org))
    return ''
  return org.gid
})
const isTrial = computed(() => {
  const org = currentOrg.value
  return !!org && !org.paying && (org.trial_left ?? 0) > 0
})
const reachedMilestones = computed(() => orgId.value ? getReachedTrialCardMilestones(organizationStore.getAppsByOrgId(orgId.value)) : [])
// Onboarding pages run their own success flow; ask once the user lands on the dashboard.
const isOnboardingRoute = computed(() => route.path === '/onboarding' || route.path.startsWith('/onboarding/') || /^\/app\/new\/?$/.test(route.path))
const pendingMilestone = computed(() => {
  if (!orgId.value || !isTrial.value || isOnboardingRoute.value)
    return null
  return pickTrialCardMilestone(reachedMilestones.value, readHandledTrialCardMilestones(orgId.value))
})

function track(event: string) {
  if (!prompt.value)
    return
  pushEvent(event, config.supaHost, {
    org_id: prompt.value.orgId,
    milestone: prompt.value.milestone,
    trial_days_left: prompt.value.trialDaysLeft,
  })
}

watch([orgId, pendingMilestone, () => !!stripeEnabled.value], async ([id, pending, enabled]) => {
  const run = ++lookupRun
  if (step.value)
    return
  if (!id || !pending || !enabled || hideExternalPurchaseFlows)
    return
  if (!await checkPermissions('org.update_billing', { orgId: id }) || run !== lookupRun)
    return
  let hasCard: boolean
  try {
    hasCard = !!(await getBillingCard(id)).card
  }
  catch (error) {
    // Billing unavailable for this org (no customer, region not configured): skip quietly.
    console.error('Cannot check trial card on file', error)
    return
  }
  if (run !== lookupRun)
    return
  // Every milestone reached so far counts as asked: one prompt per new milestone, not a backlog.
  const reached = reachedMilestones.value.map(entry => entry.milestone)
  if (hasCard) {
    markTrialCardMilestonesHandled(id, reached)
    return
  }
  prompt.value = { orgId: id, milestone: pending, reached, trialDaysLeft: currentOrg.value?.trial_left ?? 0 }
  step.value = 'ask'
  track('trial_card_prompt_shown')
}, { immediate: true })

const title = computed(() => prompt.value?.milestone === 'builder' ? t('trial-card-prompt-title-builder') : t('trial-card-prompt-title-ota'))

function close(event: string) {
  track(event)
  if (prompt.value)
    markTrialCardMilestonesHandled(prompt.value.orgId, prompt.value.reached)
  step.value = null
  prompt.value = null
}

function dismiss() {
  close(step.value === 'card' ? 'trial_card_prompt_card_closed' : 'trial_card_prompt_dismissed')
}

function addCard() {
  track('trial_card_prompt_add_clicked')
  step.value = 'card'
}

function onCardSaved() {
  close('trial_card_prompt_card_saved')
}
</script>

<template>
  <BillingModal
    v-if="step === 'ask'"
    :title="title"
    @close="dismiss"
  >
    <div v-if="prompt" class="flex items-start gap-3">
      <IconCheckCircle class="mt-0.5 h-6 w-6 shrink-0 text-green-500" aria-hidden="true" />
      <div class="space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
        <p>{{ t('trial-card-prompt-message') }}</p>
        <p class="font-medium">
          {{ t('trial-card-prompt-no-charge', { days: prompt.trialDaysLeft }) }}
        </p>
      </div>
    </div>
    <p class="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      <IconLock class="h-4 w-4 shrink-0" />
      {{ t('billing-card-secure') }}
    </p>
    <div class="mt-6 flex flex-wrap justify-end gap-2">
      <button type="button" class="d-btn d-btn-ghost" data-test="trial-card-prompt-later" @click="dismiss">
        {{ t('trial-card-prompt-later') }}
      </button>
      <button type="button" class="d-btn d-btn-primary" data-test="trial-card-prompt-add" @click="addCard">
        {{ t('trial-card-prompt-add') }}
      </button>
    </div>
  </BillingModal>
  <CardFormModal
    v-else-if="step === 'card' && prompt"
    :org-id="prompt.orgId"
    mode="setup"
    @close="dismiss"
    @saved="onCardSaved"
  />
</template>
