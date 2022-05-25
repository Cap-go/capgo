<script setup lang="ts">
import {
  IonHeader,
  IonToolbar,
} from '@ionic/vue'

defineProps({
  text: { type: String, default: '' },
  color: { type: String, default: '' },
})

</script>

<template>
  <ion-header collapse="fade">
    <ion-toolbar :class="color">
      <p class="text-white text-center">
        {{ text }}
      </p>
    </ion-toolbar>
  </ion-header>
</template>
