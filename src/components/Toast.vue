<script setup lang="ts">
import { watch } from 'vue'
import { useDisplayStore } from '~/stores/display'

const displayStore = useDisplayStore()
watch(displayStore.messageToast, (val) => {
  console.log('messageToast', val)
  setTimeout(() => {
    displayStore.messageToast.shift()
  }, displayStore.durationToast)
})
</script>

<template>
  <div class="toast toast-end">
    <div v-for="(item, i) in displayStore.messageToast" :key="i" class="alert alert-info">
      <div>
        <span>{{ item }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>

</style>
