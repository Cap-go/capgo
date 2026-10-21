<script setup lang="ts">
import type { StripeElements } from '@stripe/stripe-js'
import type { BillingCard } from '~/services/stripe'
import { useDark } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconLock from '~icons/heroicons/lock-closed'
import BillingModal from '~/components/billing/BillingModal.vue'
import { createCardSetupIntent, getInvoicePaymentIntent, getStripeJs, saveDefaultPaymentMethod } from '~/services/stripe'

const props = defineProps<{
  orgId: string
  // setup: save a new default card. invoice: pay the open invoice with a new card (saved as default).
  mode: 'setup' | 'invoice'
  amountLabel?: string
}>()

const emit = defineEmits<{
  close: []
  saved: [card: BillingCard | null]
}>()

const { t } = useI18n()
const isDark = useDark()
const container = ref<HTMLElement | null>(null)
const isLoading = ref(true)
const isSubmitting = ref(false)
const isComplete = ref(false)
const errorMessage = ref('')
let elements: StripeElements | null = null
let publishableKey = ''
let disposed = false

const title = computed(() => props.mode === 'invoice' ? t('billing-pay-invoice-title') : t('billing-card-title'))
const description = computed(() => props.mode === 'invoice'
  ? t('billing-pay-invoice-desc', { amount: props.amountLabel ?? '' })
  : t('billing-card-desc'))
const submitLabel = computed(() => props.mode === 'invoice'
  ? t('billing-pay-amount', { amount: props.amountLabel ?? '' })
  : t('billing-save-card'))

onMounted(async () => {
  try {
    const secret = props.mode === 'invoice'
      ? await getInvoicePaymentIntent(props.orgId)
      : await createCardSetupIntent(props.orgId)
    publishableKey = secret.publishableKey
    const stripe = await getStripeJs(publishableKey)
    if (!stripe)
      throw new Error('Stripe.js failed to load')
    if (disposed || !container.value)
      return
    elements = stripe.elements({
      clientSecret: secret.clientSecret,
      appearance: {
        theme: isDark.value ? 'night' : 'stripe',
        variables: { colorPrimary: '#2563eb', borderRadius: '8px' },
      },
    })
    const paymentElement = elements.create('payment', { layout: 'tabs' })
    paymentElement.on('change', (event) => {
      isComplete.value = event.complete
      errorMessage.value = ''
    })
    paymentElement.mount(container.value)
  }
  catch (error) {
    console.error('Cannot load card form', error)
    errorMessage.value = t('billing-stripe-load-error')
  }
  finally {
    isLoading.value = false
  }
})

onBeforeUnmount(() => {
  disposed = true
  elements?.getElement('payment')?.destroy()
  elements = null
})

async function submit() {
  if (!elements || isSubmitting.value)
    return
  const stripe = await getStripeJs(publishableKey)
  if (!stripe)
    return
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    // Cards finish in place (3DS included); redirect methods come back to this page.
    const confirmParams = { return_url: globalThis.location.href }
    let intentId: string | undefined
    if (props.mode === 'invoice') {
      const { error, paymentIntent } = await stripe.confirmPayment({ elements, confirmParams, redirect: 'if_required' })
      if (error || paymentIntent?.status !== 'succeeded') {
        errorMessage.value = error?.message ?? t('billing-payment-failed')
        return
      }
      intentId = paymentIntent.id
    }
    else {
      const { error, setupIntent } = await stripe.confirmSetup({ elements, confirmParams, redirect: 'if_required' })
      if (error || setupIntent?.status !== 'succeeded') {
        errorMessage.value = error?.message ?? t('billing-card-save-failed')
        return
      }
      intentId = setupIntent.id
    }
    const { card } = await saveDefaultPaymentMethod(props.orgId, intentId)
    toast.success(props.mode === 'invoice' ? t('billing-invoice-paid') : t('billing-card-saved'))
    emit('saved', card)
  }
  catch (error) {
    console.error('Card form submit failed', error)
    errorMessage.value = props.mode === 'invoice' ? t('billing-payment-failed') : t('billing-card-save-failed')
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BillingModal :title="title" :description="description" :busy="isSubmitting" @close="emit('close')">
    <form data-test="billing-card-form" @submit.prevent="submit">
      <div v-if="isLoading" class="flex justify-center py-10">
        <span class="d-loading d-loading-spinner d-loading-lg text-blue-500" />
      </div>
      <div ref="container" class="min-h-[1px]" data-test="billing-payment-element" />
      <p v-if="errorMessage" class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300" role="alert" data-test="billing-card-error">
        {{ errorMessage }}
      </p>
      <p class="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <IconLock class="h-4 w-4 shrink-0" />
        {{ t('billing-card-secure') }}
      </p>
      <div class="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" class="d-btn d-btn-ghost" :disabled="isSubmitting" @click="emit('close')">
          {{ t('button-cancel') }}
        </button>
        <button
          type="submit"
          class="d-btn d-btn-primary"
          :disabled="isLoading || isSubmitting || !isComplete"
          data-test="billing-card-submit"
        >
          <span v-if="isSubmitting" class="d-loading d-loading-spinner d-loading-sm" />
          {{ submitLabel }}
        </button>
      </div>
    </form>
  </BillingModal>
</template>
