<script setup lang="ts">
import {
  kButton,
  kToast,
} from 'konsta/vue'
import { useDisplayStore } from '~/stores/display'

const displayStore = useDisplayStore()
function closeAToast(i: number) {
  // delete messageToast as index i
  displayStore.messageToast.splice(i, 1)
}
</script>

<template>
  <k-toast v-for="(item, i) in displayStore.messageToast" :key="i" position="left" :opened="true">
    <template #button>
      <k-button clear inline @click="closeAToast(i)">
        Close
      </k-button>
    </template>
    <div class="shrink">
      {{ item }}
    </div>
  </k-toast>
</template>
