<script setup lang="ts">
import {
  kActions,
  kActionsButton,
  kActionsGroup,
  kActionsLabel,
} from 'konsta/vue'
import type { ActionSheetOptionButton } from '~/stores/display'
import { useDisplayStore } from '~/stores/display'

const displayStore = useDisplayStore()
const close = (item: ActionSheetOptionButton | undefined) => {
  if (item?.selected)
    return
  displayStore.showActionSheet = false
  if (item) {
    if (item.role === 'cancel')
      displayStore.actionSheetCanceled = true
    item?.handler && item.handler()
  }
}
</script>

<template>
  <k-actions
    :opened="displayStore.showActionSheet"
    @backdropclick="close(undefined)"
  >
    <k-actions-group>
      <k-actions-label v-if="displayStore.actionSheetOption?.header">
        {{ displayStore.actionSheetOption.header }}
      </k-actions-label>
      <k-actions-button v-for="(item, index) in displayStore.actionSheetOption?.buttons" :id="item.id" :key="index" :class="{ 'dark:!bg-white !bg-neutral-800': item.selected }" @click="close(item)">
        {{ item.text }}
      </k-actions-button>
    </k-actions-group>
  </k-actions>
</template>

<style scoped>

</style>
