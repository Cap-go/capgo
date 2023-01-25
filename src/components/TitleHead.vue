<script setup lang="ts">
import { kNavbar, kNavbarBackLink } from 'konsta/vue'
import { useRouter } from 'vue-router'
import debounce from 'lodash.debounce'
import { ref, watch } from 'vue'
import Searchbar from '~/components/Searchbar.vue'

const props = defineProps({
  defaultBack: { type: String, default: '/app' },
  noBack: { type: Boolean, default: false },
  color: { type: String, default: 'default' },
  title: { type: String, default: '' },
  big: { type: Boolean, default: false },
  plusIcon: { type: String as any, default: '' },
  search: { type: Boolean, default: false },
  searchPlaceholder: { type: String, default: '' },
  searchIcon: { type: String as any, default: '' },
})
const emit = defineEmits(['searchInput', 'plusClick', 'searchButtonClick'])
const searchInput = ref('')
watch(searchInput, debounce(() => {
  console.log('Send API request')
  emit('searchInput', searchInput.value)
}, 500))
const router = useRouter()
const onSearchButtonClick = (val: string | undefined) => {
  emit('searchButtonClick', null)
}
const back = () => {
  if (window.history.length > 2)
    router.back()
  else
    router.push(props.defaultBack)
}
</script>

<template>
  <k-navbar
    class="sticky top-0 md:hidden"
    :subnavbar-class="`flex-col ${searchIcon ? '!h-16' : ''}`"
  >
    <template #left>
      <div v-if="!noBack">
        <k-navbar-back-link text="Back" @click="back()" />
      </div>
    </template>
    <template #title>
      {{ title }}
    </template>
    <template #subnavbar>
      <k-navbar
        v-if="search"
        class="sticky top-0"
        inner-class="!h-16"
        right-class="w-full pt-1"
      >
        <template #right>
          <Searchbar v-if="search" :search-icon="searchIcon" :search-placeholder="searchPlaceholder" @filter-button-click="onSearchButtonClick" />
        </template>
      </k-navbar>
    </template>
  </k-navbar>
  <div class="hidden md:block">
    <div class="hidden navbar bg-base-100 md:flex">
      <div class="flex-1">
        <a class="text-xl normal-case btn btn-ghost">{{ title }}</a>
      </div>
      <div class="navbar-end">
        <Searchbar v-if="search" :search-icon="searchIcon" :search-placeholder="searchPlaceholder" @filter-button-click="onSearchButtonClick" />
      </div>
    </div>
  </div>
</template>
