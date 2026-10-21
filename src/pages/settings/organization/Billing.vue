<script setup lang="ts">
import type { BillingCard, BillingInvoice, BillingOverview, BillingSubscription } from '~/services/stripe'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconDownload from '~icons/heroicons/arrow-down-tray'
import IconCard from '~icons/heroicons/credit-card'
import IconExclamationTriangle from '~icons/heroicons/exclamation-triangle'
import CancelPlanModal from '~/components/billing/CancelPlanModal.vue'
import CardFormModal from '~/components/billing/CardFormModal.vue'
import RbacPermissionOnlyModal from '~/components/RbacPermissionOnlyModal.vue'
import { formatLocalDate } from '~/services/date'
import { isNativeAppStoreContext } from '~/services/nativeCompliance'
import { checkPermissions } from '~/services/permissions'
import { formatStripeAmount, getBillingOverview, payOpenInvoice, resumeSubscription } from '~/services/stripe'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const router = useRouter()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)
displayStore.NavTitle = t('billing-portal-tab')

const overview = ref<BillingOverview | null>(null)
const isLoading = ref(true)
const loadFailed = ref(false)
const isPaying = ref(false)
const isResuming = ref(false)
const showCardModal = ref<'setup' | 'invoice' | null>(null)
const showCancelModal = ref(false)
const permissionModal = ref<'org.read_billing' | 'org.update_billing' | null>(null)
let loadRun = 0

const orgId = computed(() => currentOrganization.value?.gid ?? '')
const card = computed(() => overview.value?.card ?? null)
const subscription = computed(() => overview.value?.subscription ?? null)
const openInvoice = computed(() => overview.value?.openInvoice ?? null)
const invoices = computed(() => overview.value?.invoices ?? [])
const openInvoiceAmount = computed(() => openInvoice.value ? formatStripeAmount(openInvoice.value.amountDue, openInvoice.value.currency) : '')

const subscriptionLine = computed(() => {
  const sub = subscription.value
  if (!sub)
    return t('billing-no-subscription')
  const endDate = formatLocalDate(sub.cancelAt ?? sub.currentPeriodEnd)
  if (sub.cancelAtPeriodEnd || sub.cancelAt)
    return t('billing-subscription-ends', { date: endDate })
  if (sub.status === 'past_due' || sub.status === 'unpaid')
    return t('billing-subscription-past-due')
  return endDate ? t('billing-subscription-renews', { date: endDate }) : t('billing-subscription-active')
})

function brandLabel(value: BillingCard) {
  return value.brand.charAt(0).toUpperCase() + value.brand.slice(1)
}

function invoiceStatusClass(status: BillingInvoice['status']) {
  if (status === 'paid')
    return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300'
  if (status === 'open')
    return 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-200'
  return 'bg-slate-50 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300'
}

async function loadOverview() {
  const run = ++loadRun
  const id = orgId.value
  overview.value = null
  loadFailed.value = false
  if (!id)
    return
  isLoading.value = true
  if (!await checkPermissions('org.read_billing', { orgId: id })) {
    if (run === loadRun) {
      permissionModal.value = 'org.read_billing'
      isLoading.value = false
    }
    return
  }
  try {
    const data = await getBillingOverview(id)
    if (run === loadRun)
      overview.value = data
  }
  catch (error) {
    console.error('Cannot load billing overview', error)
    if (run === loadRun)
      loadFailed.value = true
  }
  finally {
    if (run === loadRun)
      isLoading.value = false
  }
}

async function requireUpdateBilling() {
  if (orgId.value && await checkPermissions('org.update_billing', { orgId: orgId.value }))
    return true
  permissionModal.value = 'org.update_billing'
  return false
}

async function openCardForm() {
  if (await requireUpdateBilling())
    showCardModal.value = 'setup'
}

async function openCancel() {
  if (await requireUpdateBilling())
    showCancelModal.value = true
}

async function refreshOrganization() {
  const id = orgId.value
  await organizationStore.fetchOrganizations()
  if (id)
    organizationStore.setCurrentOrganization(id)
}

async function payNow() {
  if (!await requireUpdateBilling() || isPaying.value)
    return
  // No saved card: go straight to the card form.
  if (!card.value) {
    showCardModal.value = 'invoice'
    return
  }
  isPaying.value = true
  try {
    const result = await payOpenInvoice(orgId.value)
    if (result.status === 'paid') {
      toast.success(t('billing-invoice-paid'))
      await Promise.all([loadOverview(), refreshOrganization()])
      return
    }
    toast.error(result.message || t('billing-payment-failed'))
    showCardModal.value = 'invoice'
  }
  catch (error) {
    console.error('Cannot pay invoice', error)
    toast.error(t('billing-payment-failed'))
  }
  finally {
    isPaying.value = false
  }
}

async function resume() {
  if (!await requireUpdateBilling() || isResuming.value)
    return
  isResuming.value = true
  try {
    await resumeSubscription(orgId.value)
    toast.success(t('billing-resume-success'))
    await Promise.all([loadOverview(), refreshOrganization()])
  }
  catch (error) {
    console.error('Cannot resume subscription', error)
    toast.error(t('billing-resume-error'))
  }
  finally {
    isResuming.value = false
  }
}

async function onCardSaved() {
  const mode = showCardModal.value
  showCardModal.value = null
  await loadOverview()
  if (mode === 'invoice')
    await refreshOrganization()
}

async function onCanceled(sub: BillingSubscription | null) {
  showCancelModal.value = false
  if (overview.value)
    overview.value = { ...overview.value, subscription: sub }
  await refreshOrganization()
}

watch(orgId, () => {
  permissionModal.value = null
  void loadOverview()
})

onMounted(async () => {
  if (isNativeAppStoreContext()) {
    await router.replace('/settings/organization/usage')
    return
  }
  await organizationStore.awaitInitialLoad()
  await loadOverview()
})
</script>

<template>
  <div class="relative h-full pb-8 overflow-y-auto">
    <div class="mx-auto flex max-w-4xl flex-col gap-6 px-4 pt-6 sm:px-6">
      <header>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          {{ t('billing-page-title') }}
        </h1>
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {{ t('billing-page-desc') }}
        </p>
      </header>

      <div v-if="isLoading" class="flex justify-center py-16">
        <span class="d-loading d-loading-spinner d-loading-lg text-blue-500" />
      </div>

      <div v-else-if="loadFailed" class="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200" data-test="billing-load-error">
        <p>{{ t('billing-load-error') }}</p>
        <button type="button" class="d-btn d-btn-sm d-btn-outline mt-3" @click="loadOverview">
          {{ t('retry') }}
        </button>
      </div>

      <template v-else-if="overview">
        <section
          v-if="openInvoice"
          class="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100"
          data-test="billing-open-invoice"
        >
          <div class="flex items-start gap-3">
            <IconExclamationTriangle class="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p class="text-sm font-semibold">
                {{ t('billing-open-invoice-title', { amount: openInvoiceAmount }) }}
              </p>
              <p class="text-xs text-amber-900/80 dark:text-amber-200/80">
                {{ t('past-due-banner-detail') }}
              </p>
            </div>
          </div>
          <button type="button" class="d-btn d-btn-sm d-btn-warning text-black" :disabled="isPaying" data-test="billing-pay-now" @click="payNow">
            <span v-if="isPaying" class="d-loading d-loading-spinner d-loading-xs" />
            {{ t('past-due-banner-pay-now') }}
          </button>
        </section>

        <div class="grid gap-6 md:grid-cols-2">
          <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-800/60" data-test="billing-subscription">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {{ t('billing-subscription-heading') }}
            </h2>
            <p class="mt-3 text-base font-medium text-slate-900 dark:text-white">
              {{ subscriptionLine }}
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <router-link to="/settings/organization/plans" class="d-btn d-btn-sm d-btn-primary">
                {{ subscription ? t('billing-change-plan') : t('billing-choose-plan') }}
              </router-link>
              <button
                v-if="subscription && (subscription.cancelAtPeriodEnd || subscription.cancelAt)"
                type="button"
                class="d-btn d-btn-sm d-btn-outline"
                :disabled="isResuming"
                data-test="billing-resume"
                @click="resume"
              >
                <span v-if="isResuming" class="d-loading d-loading-spinner d-loading-xs" />
                {{ t('billing-resume') }}
              </button>
              <button
                v-else-if="subscription"
                type="button"
                class="d-btn d-btn-sm d-btn-ghost text-slate-600 hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400"
                data-test="billing-cancel"
                @click="openCancel"
              >
                {{ t('cancel-plan') }}
              </button>
            </div>
          </section>

          <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-800/60" data-test="billing-payment-method">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {{ t('billing-payment-method-heading') }}
            </h2>
            <div v-if="card" class="mt-3 flex items-center gap-3">
              <span class="flex h-10 w-14 items-center justify-center rounded-md bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                <IconCard class="h-5 w-5" />
              </span>
              <div>
                <p class="text-base font-medium text-slate-900 dark:text-white">
                  {{ brandLabel(card) }} •••• {{ card.last4 }}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ t('billing-card-expires', { month: String(card.expMonth).padStart(2, '0'), year: card.expYear }) }}
                </p>
              </div>
            </div>
            <p v-else class="mt-3 text-sm text-slate-600 dark:text-slate-300">
              {{ t('billing-no-card') }}
            </p>
            <button type="button" class="d-btn d-btn-sm d-btn-outline mt-4" data-test="billing-update-card" @click="openCardForm">
              {{ card ? t('billing-update-card') : t('billing-add-card') }}
            </button>
          </section>
        </div>

        <section class="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-800/60" data-test="billing-invoices">
          <h2 class="border-b border-slate-100 px-5 py-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:text-slate-400">
            {{ t('billing-invoices-heading') }}
          </h2>
          <p v-if="!invoices.length" class="px-5 py-6 text-sm text-slate-600 dark:text-slate-300">
            {{ t('billing-no-invoices') }}
          </p>
          <ul v-else class="divide-y divide-slate-100 dark:divide-white/10">
            <li v-for="invoice in invoices" :key="invoice.id" class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
              <span class="w-28 shrink-0 text-slate-900 dark:text-white">{{ formatLocalDate(invoice.created) }}</span>
              <span class="min-w-0 flex-1 truncate text-slate-500 dark:text-slate-400">{{ invoice.number ?? invoice.id }}</span>
              <span class="w-24 text-right font-medium text-slate-900 tabular-nums dark:text-white">{{ formatStripeAmount(invoice.total, invoice.currency) }}</span>
              <span class="inline-flex w-24 justify-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset" :class="invoiceStatusClass(invoice.status)">
                {{ t(`billing-invoice-status-${invoice.status ?? 'void'}`) }}
              </span>
              <a
                v-if="invoice.pdfUrl"
                :href="invoice.pdfUrl"
                class="d-btn d-btn-ghost d-btn-xs gap-1"
                :aria-label="t('billing-download-invoice')"
                download
              >
                <IconDownload class="h-4 w-4" />
                PDF
              </a>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <CardFormModal
      v-if="showCardModal"
      :org-id="orgId"
      :mode="showCardModal"
      :amount-label="openInvoiceAmount"
      @close="showCardModal = null"
      @saved="onCardSaved"
    />
    <CancelPlanModal
      v-if="showCancelModal"
      :org-id="orgId"
      @close="showCancelModal = false"
      @canceled="onCanceled"
    />
    <RbacPermissionOnlyModal
      v-if="permissionModal"
      :title="t('billing-access-required')"
      :permission="permissionModal"
      @close="permissionModal = null"
    />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
