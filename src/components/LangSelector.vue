<script setup lang="ts">
import { changeLanguage, getEmoji } from '~/services/i18n'
import { availableLocales, i18n, languages } from '~/modules/i18n'

const dropdown = ref<HTMLElement | null>(null)
onClickOutside(dropdown, () => closeDropdown())
function closeDropdown() {
  if (dropdown.value) {
    dropdown.value.removeAttribute('open')
  }
}
</script>

<template>
  <div ref="dropdown" class="dropdown">
    <button tabindex="0" class="m-1 btn btn-outline btn-sm text-slate-800 dark:text-white">
      {{ getEmoji(i18n.global.locale.value) }} {{ languages[i18n.global.locale.value as keyof typeof languages] }} <svg class="w-4 h-4 ml-2" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
    </button>
    <ul tabindex="0" class="dropdown-content menu dark:bg-base-100 bg-white rounded-box z-[1] w-52 p-2 shadow">
      <li v-for="locale in availableLocales" :key="locale" @click="changeLanguage(locale)">
        <span class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white" :class="{ 'bg-gray-100 text-gray-600 dark:text-gray-300 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-900': locale === i18n.global.locale.value }">{{ getEmoji(locale) }} {{ languages[locale as keyof typeof languages] }}</span>
      </li>
    </ul>
  </div>
</template>
