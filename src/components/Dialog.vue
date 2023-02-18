<script setup lang="ts">
import {
  kDialog,
  kDialogButton,
} from 'konsta/vue'
import type { ActionSheetOptionButton } from '~/stores/display'
import { useDisplayStore } from '~/stores/display'

const displayStore = useDisplayStore()
const close = (item: ActionSheetOptionButton | undefined) => {
  displayStore.showDialog = false
  if (item) {
    if (item.role === 'cancel')
      displayStore.dialogCanceled = true
    item?.handler && item.handler()
  }
}
</script>

<template>
  <k-dialog
    :opened="displayStore.showDialog"
    @backdropclick="close(undefined)"
  >
    <template #title>
      <span class="text-black dark:text-white">{{ displayStore.dialogOption?.header }}</span>
    </template>
    {{ displayStore.dialogOption?.message }}

    <template #buttons>
      <k-dialog-button v-for="(item, i) in displayStore.dialogOption?.buttons" :key="i" @click="close(item)">
        <span :class="{ 'text-black dark:text-white': item.role !== 'cancel' }">{{ item.text }}</span>
      </k-dialog-button>
    </template>
  </k-dialog>
</template>

<style scoped>

</style>
