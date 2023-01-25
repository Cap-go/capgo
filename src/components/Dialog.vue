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
      Dialog Title
    </template>
    Dialog is a type of modal window that appears in front of app content to
    provide critical information, or prompt for a decision to be made.

    <template #buttons>
      <k-dialog-button v-for="(item, i) in displayStore.dialogOption?.buttons" :key="i" @click="close(item)">
        {{ item.text }}
      </k-dialog-button>
    </template>
  </k-dialog>
</template>

<style scoped>

</style>
