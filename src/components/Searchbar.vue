<script setup lang="ts">
import debounce from 'lodash.debounce'
import { ref, watch } from 'vue'

defineProps({
  searchIcon: { type: String as any, default: '' },
  searchPlaceholder: { type: String, default: '' },
})

const emit = defineEmits(['searchInput', 'filterButtonClick'])

const searchInput = ref('')
watch(searchInput, debounce(() => {
  emit('searchInput', searchInput.value)
}, 500))
const click = () => {
  emit('filterButtonClick', null)
}
</script>

<template>
  <div class="max-sm:w-full form-control pr-3">
    <input v-model="searchInput" type="text" :placeholder="searchPlaceholder" class="input input-bordered">
  </div>
  <button v-if="searchIcon" class="btn" @click="click()">
    <span v-html="searchIcon" />
  </button>
</template>
