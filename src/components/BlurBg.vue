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
  <div class="relative lg:mx-auto lg:max-w-5xl" :class="{ 'mt-12 lg:mt-20': !props.mini, 'mt-6 lg:mt-12': props.mini }">
    <div class="absolute -inset-2">
      <div class="w-full h-full mx-auto rounded-lg opacity-30 blur-lg" :style="style" />
    </div>

    <div class="absolute rounded-xl from-cyan-500 to-purple-500 bg-gradient-to-r -inset-px" />

    <div class="relative flex flex-col items-stretch overflow-hidden text-center bg-white rounded-xl dark:bg-black dark:bg-opacity-90 md:flex-row md:text-left">
      <slot />
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
