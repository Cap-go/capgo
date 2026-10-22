<script setup lang="ts">
import type { BillingSubscription, CancelReason } from '~/services/stripe'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import BillingModal from '~/components/billing/BillingModal.vue'
import { CANCEL_REASONS, cancelSubscriptionWithReason } from '~/services/stripe'

const props = defineProps<{
  orgId: string
  planName?: string
}>()

const emit = defineEmits<{
  close: []
  canceled: [subscription: BillingSubscription | null]
}>()

const { t } = useI18n()
const reason = ref<CancelReason | ''>('')
const comment = ref('')
const isSubmitting = ref(false)
const MAX_COMMENT = 1000

// "Other" asks for a short explanation so the reason stays actionable.
const needsComment = computed(() => reason.value === 'other')
const canSubmit = computed(() => !!reason.value && (!needsComment.value || comment.value.trim().length > 0) && !isSubmitting.value)

async function submit() {
  if (!canSubmit.value || !reason.value)
    return
  isSubmitting.value = true
  try {
    const { subscription } = await cancelSubscriptionWithReason(props.orgId, reason.value, comment.value.trim())
    toast.success(t('billing-cancel-success'))
    emit('canceled', subscription)
  }
  catch (error) {
    console.error('Cannot cancel subscription', error)
    toast.error(t('billing-cancel-error'))
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BillingModal
    :title="t('billing-cancel-title')"
    :description="props.planName ? t('billing-cancel-desc-plan', { plan: props.planName }) : t('billing-cancel-desc')"
    :busy="isSubmitting"
    @close="emit('close')"
  >
    <form data-test="cancel-plan-form" @submit.prevent="submit">
      <fieldset>
        <legend class="mb-3 text-sm font-medium text-slate-900 dark:text-white">
          {{ t('billing-cancel-reason-label') }}
        </legend>
        <div class="grid gap-2 sm:grid-cols-2">
          <label
            v-for="value in CANCEL_REASONS"
            :key="value"
            class="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors"
            :class="reason === value
              ? 'border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-100'
              : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600'"
            :data-test="`cancel-reason-${value}`"
          >
            <input v-model="reason" type="radio" name="cancel-reason" :value="value" class="d-radio d-radio-sm d-radio-primary">
            <span>{{ t(`billing-cancel-reason-${value}`) }}</span>
          </label>
        </div>
      </fieldset>

      <label class="mt-5 block">
        <span class="text-sm font-medium text-slate-900 dark:text-white">
          {{ needsComment ? t('billing-cancel-comment-required') : t('billing-cancel-comment-label') }}
        </span>
        <textarea
          v-model="comment"
          class="d-textarea d-textarea-bordered mt-2 w-full text-sm"
          rows="3"
          :maxlength="MAX_COMMENT"
          :placeholder="t('billing-cancel-comment-placeholder')"
          data-test="cancel-comment"
        />
      </label>

      <p class="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        {{ t('billing-cancel-period-end-note') }}
      </p>

      <div class="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" class="d-btn d-btn-ghost" :disabled="isSubmitting" @click="emit('close')">
          {{ t('billing-cancel-keep-plan') }}
        </button>
        <button type="submit" class="d-btn d-btn-error text-white" :disabled="!canSubmit" data-test="cancel-plan-confirm">
          <span v-if="isSubmitting" class="d-loading d-loading-spinner d-loading-sm" />
          {{ t('billing-cancel-confirm') }}
        </button>
      </div>
    </form>
  </BillingModal>
</template>
