<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import dayjs from 'dayjs'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import BanknotesIcon from '~icons/heroicons/banknotes'
import ScaleIcon from '~icons/heroicons/scale'
import { completeCreditTopUp, startCreditTopUp } from '~/services/stripe'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from '~/stores/organization'
import { useDisplayStore } from '~/stores/display'

const creditsV2Enabled = import.meta.env.VITE_FEATURE_CREDITS_V2

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const supabase = useSupabase()
const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)
const displayStore = useDisplayStore()

const transactions = ref<Database['public']['Tables']['usage_credit_transactions']['Row'][]>([])
const isLoadingTransactions = ref(false)
const loadError = ref<string | null>(null)
const creditUsdRate = ref(1)
const isStartingCheckout = ref(false)
const isCompletingTopUp = ref(false)
const isProcessingCheckout = computed(() => isStartingCheckout.value || isCompletingTopUp.value)

const creditTotal = computed(() => Number(currentOrganization.value?.credit_total ?? 0))
const creditAvailable = computed(() => Number(currentOrganization.value?.credit_available ?? 0))
const creditUsed = computed(() => Math.max(creditTotal.value - creditAvailable.value, 0))
const creditUsagePercent = computed(() => {
  if (creditTotal.value <= 0)
    return 0
  return Math.min(100, Math.round((creditUsed.value / creditTotal.value) * 100))
})
const creditNextExpiration = computed(() => {
  const expiresAt = currentOrganization.value?.credit_next_expiration
  return expiresAt ? dayjs(expiresAt).format('MMMM D, YYYY') : null
})
const hasCreditSummary = computed(() => creditTotal.value > 0 || creditAvailable.value > 0)

const creditUsedUsd = computed(() => creditUsed.value * creditUsdRate.value)
const creditsAvailableUsd = computed(() => creditAvailable.value * creditUsdRate.value)

function formatCredits(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function formatDate(value: string) {
  return dayjs(value).format('MMM D, YYYY HH:mm')
}

function transactionLabel(type: Database['public']['Enums']['credit_transaction_type']) {
  switch (type) {
    case 'grant':
      return t('credit-transaction-grant')
    case 'purchase':
      return t('credit-transaction-purchase')
    case 'manual_grant':
      return t('credit-transaction-manual_grant')
    case 'deduction':
      return t('credit-transaction-deduction')
    case 'expiry':
      return t('credit-transaction-expiry')
    case 'refund':
      return t('credit-transaction-refund')
    default:
      return type
  }
}

async function loadTransactions() {
  if (!creditsV2Enabled) {
    transactions.value = []
    return
  }

  const orgId = currentOrganization.value?.gid
  if (!orgId) {
    transactions.value = []
    return
  }

  isLoadingTransactions.value = true
  loadError.value = null

  const { data, error } = await supabase
    .from('usage_credit_transactions')
    .select('*')
    .eq('org_id', orgId)
    .order('occurred_at', { ascending: false })

  console.log('Loaded usage credit transactions:', data, error)

  if (error) {
    console.error('Failed to load usage credit transactions', error)
    loadError.value = error.message
    transactions.value = []
  }
  else {
    transactions.value = data ?? []
  }

  isLoadingTransactions.value = false
}

async function handleBuyCredits() {
  if (!currentOrganization.value?.gid)
  return
try {
    isStartingCheckout.value = true
    await startCreditTopUp(currentOrganization.value.gid)
  }
  catch (error) {
    console.error('Failed to initiate credit checkout', error)
  }
  finally {
    isStartingCheckout.value = false
  }
}

async function handleCreditCheckoutReturn() {
  if (!creditsV2Enabled)
    return
  if (isCompletingTopUp.value)
    return
  const checkoutStatusRaw = route.query.creditCheckout
  const checkoutStatus = Array.isArray(checkoutStatusRaw) ? checkoutStatusRaw[0] : checkoutStatusRaw
  if (!checkoutStatus) {
    return
  }

  const newQuery = { ...route.query }
  if (checkoutStatus !== 'success') {
    delete newQuery.creditCheckout
    delete newQuery.session_id
    await router.replace({ query: newQuery })
    return
  }
  const sessionIdRaw = route.query.session_id
  const sessionIdParam = Array.isArray(sessionIdRaw) ? sessionIdRaw[0] : sessionIdRaw
  if (typeof sessionIdParam !== 'string' || !sessionIdParam) {
    delete newQuery.creditCheckout
    delete newQuery.session_id
    await router.replace({ query: newQuery })
    return
  }
  if (!currentOrganization.value?.gid)
    return

  isCompletingTopUp.value = true
  try {
    await completeCreditTopUp(currentOrganization.value.gid, sessionIdParam)
    toast.success('Credits added successfully')
    await organizationStore.fetchOrganizations()
    await Promise.allSettled([loadTransactions()])
  }
  catch (error) {
    console.error('Failed to finalize credit top-up', error)
  }
  finally {
    isCompletingTopUp.value = false
    delete newQuery.creditCheckout
    delete newQuery.session_id
    await router.replace({ query: newQuery })
  }
}

onMounted(async () => {
  if (!creditsV2Enabled) {
    router.replace('/settings/organization/')
    return
  }
  displayStore.NavTitle = t('credits')
  await organizationStore.awaitInitialLoad()
  await Promise.allSettled([loadTransactions()])
  await handleCreditCheckoutReturn()
})

watch(() => currentOrganization.value?.gid, async (newOrgId, oldOrgId) => {
  if (!creditsV2Enabled)
    return
  if (!newOrgId || newOrgId === oldOrgId)
    return
  await Promise.allSettled([loadTransactions()])
  await handleCreditCheckoutReturn()
})
</script>

<template>
  <div class="space-y-8 px-4 pt-6 mx-auto max-w-7xl lg:px-8 sm:px-6">
    <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div class="flex h-full flex-col justify-between rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <ScaleIcon class="h-4 w-4" />
              {{ t('credits-balance') }}
            </div>
            <div class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              {{ formatCredits(creditAvailable) }} <span class="font-medium text-gray-900 dark:text-white">/ {{ formatCredits(creditTotal) }}</span>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('credits-available') }}
            </p>
          </div>
          <div v-if="creditNextExpiration" class="text-right">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {{ t('credits-next-expiration') }}
            </div>
            <div class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
              {{ creditNextExpiration }}
            </div>
          </div>
        </div>
        <div class="mt-6">
          <div class="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{{ t('credits-used-in-period') }}</span>
            <span class="font-medium text-gray-900 dark:text-white">{{ formatCredits(creditUsed) }}</span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-300"
              :style="{ width: `${creditUsagePercent}%` }"
            />
          </div>
          <p v-if="!hasCreditSummary" class="mt-4 text-sm text-gray-500 dark:text-gray-400">
            {{ t('no-credits-available') }}
          </p>
        </div>
      </div>

      <div class="flex h-full flex-col justify-between rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div>
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <BanknotesIcon class="h-4 w-4" />
            {{ t('credits-used-dollars') }}
          </div>
          <div class="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
            {{ formatCurrency(creditUsedUsd) }}
          </div>
          <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {{ t('credits-used-dollars-description') }}
          </p>
        </div>
        <div class="mt-6">
          <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{{ t('credits-available') }}</span>
            <span class="font-medium text-gray-900 dark:text-white">
              {{ formatCurrency(creditsAvailableUsd) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-3xl border border-blue-500 p-6 text-white shadow-lg">
      <div class="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <h3 class="text-2xl font-semibold">
            {{ t('credits-cta-title') }}
          </h3>
          <p class="mt-2 max-w-xl text-sm opacity-90">
            {{ t('credits-cta-description') }}
          </p>
        </div>
        <button
          type="button"
          :class="{ 'opacity-75 pointer-events-none': isProcessingCheckout }"
          class="inline-flex w-full sm:w-auto py-2 px-3 sm:py-2.5 sm:px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-sm sm:text-base font-semibold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
          @click="handleBuyCredits"
        >
          <Spinner v-if="isProcessingCheckout" size="w-4 h-4" class="mr-2" color="white" />
          <span>{{ t('buy-credits') }}</span>
        </button>
      </div>
    </div>

    <div class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div class="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          {{ t('credits-transactions') }}
        </h2>
      </div>
      <div class="px-6 py-4">
        <div v-if="loadError" class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          {{ t('credits-load-error') }}
        </div>
        <div v-else-if="isLoadingTransactions" class="flex items-center justify-center py-12">
          <Spinner size="w-6 h-6" class="text-blue-500" />
        </div>
        <div v-else-if="transactions.length === 0" class="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
          {{ t('credits-empty-state') }}
        </div>
        <div v-else class="-mx-4 overflow-x-auto sm:mx-0">
          <table class="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
            <thead class="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th scope="col" class="px-4 py-3">
                  {{ t('credit-transaction-occurred-at') }}
                </th>
                <th scope="col" class="px-4 py-3">
                  {{ t('credit-transaction-type') }}
                </th>
                <th scope="col" class="px-4 py-3">
                  {{ t('credit-transaction-description') }}
                </th>
                <th scope="col" class="px-4 py-3 text-right">
                  {{ t('credit-transaction-amount') }}
                </th>
                <th scope="col" class="px-4 py-3 text-right">
                  {{ t('credit-transaction-balance') }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="transaction in transactions"
                :key="transaction.id"
                class="transition hover:bg-gray-50 dark:hover:bg-gray-700/60"
              >
                <td class="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-200">
                  {{ formatDate(transaction.occurred_at) }}
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-200">
                  {{ transactionLabel(transaction.transaction_type) }}
                </td>
                <td class="px-4 py-3 text-gray-600 dark:text-gray-300">
                  {{ transaction.description ?? '—' }}
                </td>
                <td
                  class="whitespace-nowrap px-4 py-3 text-right font-semibold"
                  :class="transaction.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'"
                >
                  {{ transaction.amount >= 0 ? '+' : '' }}{{ formatCredits(transaction.amount) }}
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-200">
                  {{ transaction.balance_after !== null ? formatCredits(transaction.balance_after) : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
