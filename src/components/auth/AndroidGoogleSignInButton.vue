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
    class="google-sign-in inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#747775] bg-white px-4 py-3 text-sm text-[#1f1f1f] transition-colors hover:bg-[#f2f2f2] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#747775] disabled:pointer-events-none disabled:opacity-60"
    @click="$emit('click')"
  >
    <Spinner v-if="loading" size="w-5 h-5" color="fill-current" />
    <span v-else class="relative h-5 w-5 shrink-0 overflow-hidden" aria-hidden="true">
      <img src="/auth/google-sign-in.png" alt="" width="40" height="40" class="absolute -left-2.5 -top-2.5 h-10 w-10 max-w-none">
    </span>
    <span>{{ t('sign-in-with-google') }}</span>
  </button>
</template>

<style scoped>
@font-face {
  font-family: 'Google Sans';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url(/fonts/google-sans/latin-ext-medium.woff2) format('woff2');
  unicode-range:
    U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F,
    U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF;
}

@font-face {
  font-family: 'Google Sans';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url(/fonts/google-sans/latin-medium.woff2) format('woff2');
  unicode-range:
    U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC,
    U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

.google-sign-in {
  font-family: 'Google Sans', sans-serif;
  font-weight: 500;
}
</style>
