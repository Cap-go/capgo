<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ disabled?: boolean, loading?: boolean }>()
defineEmits<{ click: [] }>()
const { t } = useI18n()
</script>

<template>
  <button
    type="button"
    data-test="google-sign-in"
    :disabled="disabled || loading"
    :aria-busy="loading ? 'true' : 'false'"
    class="google-sign-in inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#747775] bg-white px-4 py-3 text-sm text-[#1f1f1f] transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#747775] disabled:pointer-events-none disabled:opacity-60"
    @click="$emit('click')"
  >
    <Spinner v-if="loading" size="w-5 h-5" color="fill-current" />
    <img v-else src="/icons/google-g.png" class="h-5 w-5 object-contain" alt="" aria-hidden="true">
    <span>{{ t('sign-in-with-google') }}</span>
  </button>
</template>

<style scoped>
@font-face {
  font-family: 'Google Sans Sign In';
  src: url('/fonts/google-sans/GoogleSans-Medium-Latin.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
.google-sign-in {
  font-family: 'Google Sans Sign In', sans-serif;
  font-weight: 500;
}
</style>
