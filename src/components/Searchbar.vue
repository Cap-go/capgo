<script setup lang="ts">
import debounce from 'lodash.debounce'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps({
  searchIcon: { type: String as any, default: '' },
})

const emit = defineEmits(['searchInput', 'filterButtonClick'])

const { t } = useI18n()

const searchInput = ref('')
watch(searchInput, debounce(() => {
  console.log('Send API request')
  emit('searchInput', searchInput.value)
}, 500))
const click = () => {
  emit('filterButtonClick', null)
}
</script>

<template>
  <div class="pr-3 max-sm:w-full form-control">
    <input v-model="searchInput" type="text" :placeholder="t('search')" class="input input-bordered">
  </div>
  <button v-if="searchIcon" class="btn" @click="click()">
    <span v-html="searchIcon" />
  </button>
</template>
