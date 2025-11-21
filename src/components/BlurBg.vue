<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
  background: {
    type: String,
    default: 'linear-gradient(90deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%)',
  },
  mini: {
    type: Boolean,
    default: false,
  },
})
const style = computed(() => ({ background: props.background }))
</script>

<template>
  <div>
    <div class="relative lg:mx-auto lg:max-w-5xl" :class="{ 'mt-12 lg:mt-20': !props.mini, 'mt-6 lg:mt-12': props.mini }">
      <div class="absolute -inset-2">
        <div class="mx-auto w-full h-full rounded-lg opacity-30 blur-lg" :style="style" />
      </div>

      <div class="absolute -inset-px from-cyan-500 to-purple-500 rounded-xl bg-linear-to-r" />

      <div class="flex overflow-hidden relative flex-col items-stretch text-center bg-white rounded-xl md:flex-row md:text-left dark:bg-black/90">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.blur-lg {
  --tw-brightness: ;
  --tw-contrast: ;
  --tw-grayscale: ;
  --tw-hue-rotate: ;
  --tw-invert: ;
  --tw-saturate: ;
  --tw-sepia: ;
  --tw-drop-shadow: ;
}
</style>
