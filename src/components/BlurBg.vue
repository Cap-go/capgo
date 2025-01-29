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
  rotate: {
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
        <div class="w-full h-full mx-auto rounded-lg opacity-30 blur-lg animate_rotate" :style="style" />
      </div>

      <div class="absolute rounded-xl from-cyan-500 to-purple-500 bg-linear-to-r -inset-px" />

      <div class="relative flex flex-col items-stretch overflow-hidden text-center bg-white rounded-xl dark:bg-black/90 md:flex-row md:text-left">
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

.animate_rotate {
  --tw-brightness: ;
  --tw-contrast: ;
  --tw-grayscale: ;
  --tw-hue-rotate: ;
  --tw-invert: ;
  --tw-saturate: ;
  --tw-sepia: ;
  --tw-drop-shadow: ;
  animation: rotate 4s linear infinite;
}

/* Rotating gradient background animation */
/* @WcaleNieWolny: */
/* I am deeply sorry for this code */
/* This abomination is a result of my desperation */
/* Please, I beg, forgive me */
/* Words cannot even try to explain what I feel right now */

@keyframes rotate {
  0% {
      background: linear-gradient(0deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.027777777777777776% {
      background: linear-gradient(0.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.05555555555555555% {
      background: linear-gradient(0.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.08333333333333333% {
      background: linear-gradient(0.30000000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.1111111111111111% {
      background: linear-gradient(0.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.1388888888888889% {
      background: linear-gradient(0.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.16666666666666666% {
      background: linear-gradient(0.6000000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.19444444444444442% {
      background: linear-gradient(0.7000000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.2222222222222222% {
      background: linear-gradient(0.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.25% {
      background: linear-gradient(0.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.2777777777777778% {
      background: linear-gradient(1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.3055555555555555% {
      background: linear-gradient(1.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.3333333333333333% {
      background: linear-gradient(1.2000000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.3611111111111111% {
      background: linear-gradient(1.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.38888888888888884% {
      background: linear-gradient(1.4000000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.41666666666666663% {
      background: linear-gradient(1.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.4444444444444444% {
      background: linear-gradient(1.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.4722222222222222% {
      background: linear-gradient(1.7000000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.5% {
      background: linear-gradient(1.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.5277777777777778% {
      background: linear-gradient(1.9000000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.5555555555555556% {
      background: linear-gradient(2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.5833333333333333% {
      background: linear-gradient(2.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.611111111111111% {
      background: linear-gradient(2.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.6388888888888888% {
      background: linear-gradient(2.3000000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.6666666666666666% {
      background: linear-gradient(2.4000000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.6944444444444444% {
      background: linear-gradient(2.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.7222222222222222% {
      background: linear-gradient(2.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.75% {
      background: linear-gradient(2.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.7777777777777777% {
      background: linear-gradient(2.8000000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.8055555555555555% {
      background: linear-gradient(2.9000000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.8333333333333333% {
      background: linear-gradient(3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.861111111111111% {
      background: linear-gradient(3.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.8888888888888888% {
      background: linear-gradient(3.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.9166666666666666% {
      background: linear-gradient(3.3000000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.9444444444444444% {
      background: linear-gradient(3.4000000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    0.9722222222222222% {
      background: linear-gradient(3.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1% {
      background: linear-gradient(3.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.0277777777777777% {
      background: linear-gradient(3.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.0555555555555556% {
      background: linear-gradient(3.8000000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.0833333333333333% {
      background: linear-gradient(3.9000000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.1111111111111112% {
      background: linear-gradient(4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.1388888888888888% {
      background: linear-gradient(4.1000000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.1666666666666665% {
      background: linear-gradient(4.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.1944444444444444% {
      background: linear-gradient(4.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.222222222222222% {
      background: linear-gradient(4.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.25% {
      background: linear-gradient(4.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.2777777777777777% {
      background: linear-gradient(4.6000000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.3055555555555556% {
      background: linear-gradient(4.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.3333333333333333% {
      background: linear-gradient(4.800000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.361111111111111% {
      background: linear-gradient(4.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.3888888888888888% {
      background: linear-gradient(5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.4166666666666665% {
      background: linear-gradient(5.1000000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.4444444444444444% {
      background: linear-gradient(5.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.472222222222222% {
      background: linear-gradient(5.300000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.5% {
      background: linear-gradient(5.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.5277777777777777% {
      background: linear-gradient(5.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.5555555555555554% {
      background: linear-gradient(5.6000000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.5833333333333333% {
      background: linear-gradient(5.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.611111111111111% {
      background: linear-gradient(5.800000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.6388888888888888% {
      background: linear-gradient(5.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.6666666666666665% {
      background: linear-gradient(6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.6944444444444444% {
      background: linear-gradient(6.1000000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.722222222222222% {
      background: linear-gradient(6.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.75% {
      background: linear-gradient(6.300000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.7777777777777777% {
      background: linear-gradient(6.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.8055555555555554% {
      background: linear-gradient(6.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.8333333333333333% {
      background: linear-gradient(6.6000000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.861111111111111% {
      background: linear-gradient(6.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.8888888888888888% {
      background: linear-gradient(6.800000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.9166666666666665% {
      background: linear-gradient(6.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.9444444444444444% {
      background: linear-gradient(7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    1.972222222222222% {
      background: linear-gradient(7.1000000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2% {
      background: linear-gradient(7.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.0277777777777777% {
      background: linear-gradient(7.300000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.0555555555555554% {
      background: linear-gradient(7.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.083333333333333% {
      background: linear-gradient(7.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.111111111111111% {
      background: linear-gradient(7.6000000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.138888888888889% {
      background: linear-gradient(7.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.1666666666666665% {
      background: linear-gradient(7.800000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.194444444444444% {
      background: linear-gradient(7.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.2222222222222223% {
      background: linear-gradient(8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.25% {
      background: linear-gradient(8.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.2777777777777777% {
      background: linear-gradient(8.200000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.3055555555555554% {
      background: linear-gradient(8.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.333333333333333% {
      background: linear-gradient(8.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.361111111111111% {
      background: linear-gradient(8.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.388888888888889% {
      background: linear-gradient(8.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.4166666666666665% {
      background: linear-gradient(8.700000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.444444444444444% {
      background: linear-gradient(8.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.472222222222222% {
      background: linear-gradient(8.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.5% {
      background: linear-gradient(9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.5277777777777777% {
      background: linear-gradient(9.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.5555555555555554% {
      background: linear-gradient(9.200000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.583333333333333% {
      background: linear-gradient(9.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.611111111111111% {
      background: linear-gradient(9.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.638888888888889% {
      background: linear-gradient(9.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.6666666666666665% {
      background: linear-gradient(9.600000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.694444444444444% {
      background: linear-gradient(9.700000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.722222222222222% {
      background: linear-gradient(9.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.75% {
      background: linear-gradient(9.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.7777777777777777% {
      background: linear-gradient(10deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.8055555555555554% {
      background: linear-gradient(10.100000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.833333333333333% {
      background: linear-gradient(10.200000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.861111111111111% {
      background: linear-gradient(10.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.888888888888889% {
      background: linear-gradient(10.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.9166666666666665% {
      background: linear-gradient(10.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.944444444444444% {
      background: linear-gradient(10.600000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    2.972222222222222% {
      background: linear-gradient(10.700000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3% {
      background: linear-gradient(10.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.0277777777777777% {
      background: linear-gradient(10.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.0555555555555554% {
      background: linear-gradient(11deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.083333333333333% {
      background: linear-gradient(11.100000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.1111111111111107% {
      background: linear-gradient(11.200000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.138888888888889% {
      background: linear-gradient(11.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.1666666666666665% {
      background: linear-gradient(11.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.194444444444444% {
      background: linear-gradient(11.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.222222222222222% {
      background: linear-gradient(11.600000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.25% {
      background: linear-gradient(11.700000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.2777777777777777% {
      background: linear-gradient(11.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.3055555555555554% {
      background: linear-gradient(11.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.333333333333333% {
      background: linear-gradient(12deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.3611111111111107% {
      background: linear-gradient(12.100000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.388888888888889% {
      background: linear-gradient(12.200000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.4166666666666665% {
      background: linear-gradient(12.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.444444444444444% {
      background: linear-gradient(12.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.472222222222222% {
      background: linear-gradient(12.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.5% {
      background: linear-gradient(12.600000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.5277777777777777% {
      background: linear-gradient(12.700000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.5555555555555554% {
      background: linear-gradient(12.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.583333333333333% {
      background: linear-gradient(12.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.6111111111111107% {
      background: linear-gradient(13deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.638888888888889% {
      background: linear-gradient(13.100000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.6666666666666665% {
      background: linear-gradient(13.200000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.694444444444444% {
      background: linear-gradient(13.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.722222222222222% {
      background: linear-gradient(13.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.75% {
      background: linear-gradient(13.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.7777777777777777% {
      background: linear-gradient(13.600000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.8055555555555554% {
      background: linear-gradient(13.700000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.833333333333333% {
      background: linear-gradient(13.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.8611111111111107% {
      background: linear-gradient(13.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.888888888888889% {
      background: linear-gradient(14deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.9166666666666665% {
      background: linear-gradient(14.100000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.944444444444444% {
      background: linear-gradient(14.200000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    3.972222222222222% {
      background: linear-gradient(14.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4% {
      background: linear-gradient(14.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.027777777777778% {
      background: linear-gradient(14.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.055555555555555% {
      background: linear-gradient(14.600000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.083333333333333% {
      background: linear-gradient(14.700000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.111111111111111% {
      background: linear-gradient(14.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.138888888888888% {
      background: linear-gradient(14.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.166666666666666% {
      background: linear-gradient(15deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.194444444444445% {
      background: linear-gradient(15.100000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.222222222222222% {
      background: linear-gradient(15.200000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.25% {
      background: linear-gradient(15.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.277777777777778% {
      background: linear-gradient(15.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.305555555555555% {
      background: linear-gradient(15.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.333333333333333% {
      background: linear-gradient(15.600000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.361111111111111% {
      background: linear-gradient(15.700000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.388888888888888% {
      background: linear-gradient(15.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.416666666666666% {
      background: linear-gradient(15.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.444444444444445% {
      background: linear-gradient(16deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.472222222222222% {
      background: linear-gradient(16.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.5% {
      background: linear-gradient(16.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.527777777777778% {
      background: linear-gradient(16.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.555555555555555% {
      background: linear-gradient(16.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.583333333333333% {
      background: linear-gradient(16.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.611111111111111% {
      background: linear-gradient(16.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.638888888888888% {
      background: linear-gradient(16.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.666666666666666% {
      background: linear-gradient(16.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.694444444444444% {
      background: linear-gradient(16.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.722222222222222% {
      background: linear-gradient(17deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.75% {
      background: linear-gradient(17.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.777777777777778% {
      background: linear-gradient(17.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.805555555555555% {
      background: linear-gradient(17.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.833333333333333% {
      background: linear-gradient(17.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.861111111111111% {
      background: linear-gradient(17.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.888888888888888% {
      background: linear-gradient(17.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.916666666666666% {
      background: linear-gradient(17.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.944444444444444% {
      background: linear-gradient(17.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    4.972222222222222% {
      background: linear-gradient(17.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5% {
      background: linear-gradient(18deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.027777777777778% {
      background: linear-gradient(18.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.055555555555555% {
      background: linear-gradient(18.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.083333333333333% {
      background: linear-gradient(18.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.111111111111111% {
      background: linear-gradient(18.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.138888888888888% {
      background: linear-gradient(18.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.166666666666666% {
      background: linear-gradient(18.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.194444444444444% {
      background: linear-gradient(18.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.222222222222222% {
      background: linear-gradient(18.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.25% {
      background: linear-gradient(18.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.277777777777778% {
      background: linear-gradient(19deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.305555555555555% {
      background: linear-gradient(19.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.333333333333333% {
      background: linear-gradient(19.200000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.361111111111111% {
      background: linear-gradient(19.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.388888888888888% {
      background: linear-gradient(19.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.416666666666666% {
      background: linear-gradient(19.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.444444444444444% {
      background: linear-gradient(19.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.472222222222222% {
      background: linear-gradient(19.700000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.5% {
      background: linear-gradient(19.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.527777777777778% {
      background: linear-gradient(19.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.555555555555555% {
      background: linear-gradient(20deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.583333333333333% {
      background: linear-gradient(20.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.611111111111111% {
      background: linear-gradient(20.200000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.638888888888888% {
      background: linear-gradient(20.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.666666666666666% {
      background: linear-gradient(20.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.694444444444444% {
      background: linear-gradient(20.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.722222222222222% {
      background: linear-gradient(20.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.75% {
      background: linear-gradient(20.700000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.777777777777778% {
      background: linear-gradient(20.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.805555555555555% {
      background: linear-gradient(20.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.833333333333333% {
      background: linear-gradient(21deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.861111111111111% {
      background: linear-gradient(21.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.888888888888888% {
      background: linear-gradient(21.200000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.916666666666666% {
      background: linear-gradient(21.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.944444444444444% {
      background: linear-gradient(21.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    5.972222222222222% {
      background: linear-gradient(21.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6% {
      background: linear-gradient(21.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.027777777777778% {
      background: linear-gradient(21.700000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.055555555555555% {
      background: linear-gradient(21.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.083333333333333% {
      background: linear-gradient(21.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.111111111111111% {
      background: linear-gradient(22deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.138888888888888% {
      background: linear-gradient(22.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.166666666666666% {
      background: linear-gradient(22.200000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.194444444444444% {
      background: linear-gradient(22.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.222222222222221% {
      background: linear-gradient(22.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.25% {
      background: linear-gradient(22.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.277777777777778% {
      background: linear-gradient(22.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.305555555555555% {
      background: linear-gradient(22.700000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.333333333333333% {
      background: linear-gradient(22.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.361111111111111% {
      background: linear-gradient(22.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.388888888888888% {
      background: linear-gradient(23deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.416666666666666% {
      background: linear-gradient(23.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.444444444444444% {
      background: linear-gradient(23.200000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.472222222222221% {
      background: linear-gradient(23.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.5% {
      background: linear-gradient(23.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.527777777777778% {
      background: linear-gradient(23.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.555555555555555% {
      background: linear-gradient(23.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.583333333333333% {
      background: linear-gradient(23.700000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.611111111111111% {
      background: linear-gradient(23.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.638888888888888% {
      background: linear-gradient(23.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.666666666666666% {
      background: linear-gradient(24deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.694444444444444% {
      background: linear-gradient(24.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.722222222222221% {
      background: linear-gradient(24.200000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.75% {
      background: linear-gradient(24.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.777777777777778% {
      background: linear-gradient(24.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.805555555555555% {
      background: linear-gradient(24.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.833333333333333% {
      background: linear-gradient(24.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.861111111111111% {
      background: linear-gradient(24.700000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.888888888888888% {
      background: linear-gradient(24.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.916666666666666% {
      background: linear-gradient(24.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.944444444444444% {
      background: linear-gradient(25deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    6.972222222222221% {
      background: linear-gradient(25.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7% {
      background: linear-gradient(25.200000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.027777777777778% {
      background: linear-gradient(25.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.055555555555555% {
      background: linear-gradient(25.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.083333333333333% {
      background: linear-gradient(25.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.111111111111111% {
      background: linear-gradient(25.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.138888888888888% {
      background: linear-gradient(25.700000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.166666666666666% {
      background: linear-gradient(25.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.194444444444444% {
      background: linear-gradient(25.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.222222222222221% {
      background: linear-gradient(26deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.25% {
      background: linear-gradient(26.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.277777777777778% {
      background: linear-gradient(26.200000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.305555555555555% {
      background: linear-gradient(26.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.333333333333333% {
      background: linear-gradient(26.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.361111111111111% {
      background: linear-gradient(26.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.388888888888888% {
      background: linear-gradient(26.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.416666666666666% {
      background: linear-gradient(26.700000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.444444444444444% {
      background: linear-gradient(26.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.472222222222221% {
      background: linear-gradient(26.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.5% {
      background: linear-gradient(27deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.527777777777778% {
      background: linear-gradient(27.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.555555555555555% {
      background: linear-gradient(27.200000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.583333333333333% {
      background: linear-gradient(27.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.611111111111111% {
      background: linear-gradient(27.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.638888888888888% {
      background: linear-gradient(27.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.666666666666666% {
      background: linear-gradient(27.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.694444444444444% {
      background: linear-gradient(27.700000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.722222222222221% {
      background: linear-gradient(27.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.75% {
      background: linear-gradient(27.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.777777777777778% {
      background: linear-gradient(28deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.805555555555555% {
      background: linear-gradient(28.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.833333333333333% {
      background: linear-gradient(28.200000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.861111111111111% {
      background: linear-gradient(28.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.888888888888888% {
      background: linear-gradient(28.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.916666666666666% {
      background: linear-gradient(28.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.944444444444444% {
      background: linear-gradient(28.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    7.972222222222221% {
      background: linear-gradient(28.700000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8% {
      background: linear-gradient(28.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.027777777777777% {
      background: linear-gradient(28.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.055555555555555% {
      background: linear-gradient(29deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.083333333333332% {
      background: linear-gradient(29.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.11111111111111% {
      background: linear-gradient(29.200000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.13888888888889% {
      background: linear-gradient(29.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.166666666666666% {
      background: linear-gradient(29.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.194444444444445% {
      background: linear-gradient(29.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.222222222222221% {
      background: linear-gradient(29.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.25% {
      background: linear-gradient(29.700000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.277777777777777% {
      background: linear-gradient(29.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.305555555555555% {
      background: linear-gradient(29.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.333333333333332% {
      background: linear-gradient(30deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.36111111111111% {
      background: linear-gradient(30.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.38888888888889% {
      background: linear-gradient(30.200000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.416666666666666% {
      background: linear-gradient(30.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.444444444444445% {
      background: linear-gradient(30.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.472222222222221% {
      background: linear-gradient(30.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.5% {
      background: linear-gradient(30.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.527777777777777% {
      background: linear-gradient(30.700000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.555555555555555% {
      background: linear-gradient(30.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.583333333333332% {
      background: linear-gradient(30.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.61111111111111% {
      background: linear-gradient(31deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.63888888888889% {
      background: linear-gradient(31.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.666666666666666% {
      background: linear-gradient(31.200000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.694444444444445% {
      background: linear-gradient(31.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.722222222222221% {
      background: linear-gradient(31.400000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.75% {
      background: linear-gradient(31.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.777777777777777% {
      background: linear-gradient(31.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.805555555555555% {
      background: linear-gradient(31.700000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.833333333333332% {
      background: linear-gradient(31.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.86111111111111% {
      background: linear-gradient(31.900000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.88888888888889% {
      background: linear-gradient(32deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.916666666666666% {
      background: linear-gradient(32.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.944444444444445% {
      background: linear-gradient(32.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    8.972222222222221% {
      background: linear-gradient(32.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9% {
      background: linear-gradient(32.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.027777777777777% {
      background: linear-gradient(32.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.055555555555555% {
      background: linear-gradient(32.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.083333333333332% {
      background: linear-gradient(32.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.11111111111111% {
      background: linear-gradient(32.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.138888888888888% {
      background: linear-gradient(32.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.166666666666666% {
      background: linear-gradient(33deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.194444444444445% {
      background: linear-gradient(33.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.222222222222221% {
      background: linear-gradient(33.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.25% {
      background: linear-gradient(33.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.277777777777777% {
      background: linear-gradient(33.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.305555555555555% {
      background: linear-gradient(33.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.333333333333332% {
      background: linear-gradient(33.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.36111111111111% {
      background: linear-gradient(33.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.388888888888888% {
      background: linear-gradient(33.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.416666666666666% {
      background: linear-gradient(33.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.444444444444445% {
      background: linear-gradient(34deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.472222222222221% {
      background: linear-gradient(34.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.5% {
      background: linear-gradient(34.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.527777777777777% {
      background: linear-gradient(34.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.555555555555555% {
      background: linear-gradient(34.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.583333333333332% {
      background: linear-gradient(34.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.61111111111111% {
      background: linear-gradient(34.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.638888888888888% {
      background: linear-gradient(34.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.666666666666666% {
      background: linear-gradient(34.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.694444444444445% {
      background: linear-gradient(34.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.722222222222221% {
      background: linear-gradient(35deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.75% {
      background: linear-gradient(35.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.777777777777777% {
      background: linear-gradient(35.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.805555555555555% {
      background: linear-gradient(35.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.833333333333332% {
      background: linear-gradient(35.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.86111111111111% {
      background: linear-gradient(35.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.888888888888888% {
      background: linear-gradient(35.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.916666666666666% {
      background: linear-gradient(35.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.944444444444445% {
      background: linear-gradient(35.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    9.972222222222221% {
      background: linear-gradient(35.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10% {
      background: linear-gradient(36deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.027777777777777% {
      background: linear-gradient(36.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.055555555555555% {
      background: linear-gradient(36.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.083333333333332% {
      background: linear-gradient(36.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.11111111111111% {
      background: linear-gradient(36.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.138888888888888% {
      background: linear-gradient(36.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.166666666666666% {
      background: linear-gradient(36.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.194444444444445% {
      background: linear-gradient(36.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.222222222222221% {
      background: linear-gradient(36.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.25% {
      background: linear-gradient(36.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.277777777777777% {
      background: linear-gradient(37deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.305555555555555% {
      background: linear-gradient(37.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.333333333333332% {
      background: linear-gradient(37.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.36111111111111% {
      background: linear-gradient(37.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.388888888888888% {
      background: linear-gradient(37.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.416666666666666% {
      background: linear-gradient(37.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.444444444444445% {
      background: linear-gradient(37.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.472222222222221% {
      background: linear-gradient(37.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.5% {
      background: linear-gradient(37.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.527777777777777% {
      background: linear-gradient(37.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.555555555555555% {
      background: linear-gradient(38deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.583333333333332% {
      background: linear-gradient(38.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.61111111111111% {
      background: linear-gradient(38.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.638888888888888% {
      background: linear-gradient(38.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.666666666666666% {
      background: linear-gradient(38.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.694444444444445% {
      background: linear-gradient(38.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.722222222222221% {
      background: linear-gradient(38.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.75% {
      background: linear-gradient(38.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.777777777777777% {
      background: linear-gradient(38.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.805555555555555% {
      background: linear-gradient(38.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.833333333333332% {
      background: linear-gradient(39deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.86111111111111% {
      background: linear-gradient(39.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.888888888888888% {
      background: linear-gradient(39.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.916666666666666% {
      background: linear-gradient(39.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.944444444444445% {
      background: linear-gradient(39.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    10.972222222222221% {
      background: linear-gradient(39.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11% {
      background: linear-gradient(39.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.027777777777777% {
      background: linear-gradient(39.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.055555555555555% {
      background: linear-gradient(39.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.083333333333332% {
      background: linear-gradient(39.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.11111111111111% {
      background: linear-gradient(40deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.138888888888888% {
      background: linear-gradient(40.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.166666666666666% {
      background: linear-gradient(40.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.194444444444445% {
      background: linear-gradient(40.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.222222222222221% {
      background: linear-gradient(40.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.25% {
      background: linear-gradient(40.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.277777777777777% {
      background: linear-gradient(40.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.305555555555555% {
      background: linear-gradient(40.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.333333333333332% {
      background: linear-gradient(40.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.36111111111111% {
      background: linear-gradient(40.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.388888888888888% {
      background: linear-gradient(41deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.416666666666666% {
      background: linear-gradient(41.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.444444444444445% {
      background: linear-gradient(41.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.472222222222221% {
      background: linear-gradient(41.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.5% {
      background: linear-gradient(41.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.527777777777777% {
      background: linear-gradient(41.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.555555555555555% {
      background: linear-gradient(41.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.583333333333332% {
      background: linear-gradient(41.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.61111111111111% {
      background: linear-gradient(41.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.638888888888888% {
      background: linear-gradient(41.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.666666666666666% {
      background: linear-gradient(42deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.694444444444445% {
      background: linear-gradient(42.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.722222222222221% {
      background: linear-gradient(42.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.75% {
      background: linear-gradient(42.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.777777777777777% {
      background: linear-gradient(42.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.805555555555555% {
      background: linear-gradient(42.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.833333333333332% {
      background: linear-gradient(42.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.86111111111111% {
      background: linear-gradient(42.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.888888888888888% {
      background: linear-gradient(42.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.916666666666666% {
      background: linear-gradient(42.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.944444444444445% {
      background: linear-gradient(43deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    11.972222222222221% {
      background: linear-gradient(43.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12% {
      background: linear-gradient(43.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.027777777777777% {
      background: linear-gradient(43.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.055555555555555% {
      background: linear-gradient(43.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.083333333333332% {
      background: linear-gradient(43.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.11111111111111% {
      background: linear-gradient(43.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.138888888888888% {
      background: linear-gradient(43.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.166666666666666% {
      background: linear-gradient(43.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.194444444444445% {
      background: linear-gradient(43.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.222222222222221% {
      background: linear-gradient(44deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.25% {
      background: linear-gradient(44.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.277777777777777% {
      background: linear-gradient(44.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.305555555555555% {
      background: linear-gradient(44.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.333333333333332% {
      background: linear-gradient(44.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.36111111111111% {
      background: linear-gradient(44.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.388888888888888% {
      background: linear-gradient(44.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.416666666666666% {
      background: linear-gradient(44.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.444444444444443% {
      background: linear-gradient(44.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.472222222222221% {
      background: linear-gradient(44.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.5% {
      background: linear-gradient(45deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.527777777777777% {
      background: linear-gradient(45.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.555555555555555% {
      background: linear-gradient(45.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.583333333333332% {
      background: linear-gradient(45.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.61111111111111% {
      background: linear-gradient(45.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.638888888888888% {
      background: linear-gradient(45.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.666666666666666% {
      background: linear-gradient(45.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.694444444444443% {
      background: linear-gradient(45.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.722222222222221% {
      background: linear-gradient(45.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.75% {
      background: linear-gradient(45.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.777777777777777% {
      background: linear-gradient(46deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.805555555555555% {
      background: linear-gradient(46.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.833333333333332% {
      background: linear-gradient(46.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.86111111111111% {
      background: linear-gradient(46.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.888888888888888% {
      background: linear-gradient(46.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.916666666666666% {
      background: linear-gradient(46.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.944444444444443% {
      background: linear-gradient(46.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    12.972222222222221% {
      background: linear-gradient(46.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13% {
      background: linear-gradient(46.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.027777777777777% {
      background: linear-gradient(46.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.055555555555555% {
      background: linear-gradient(47deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.083333333333332% {
      background: linear-gradient(47.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.11111111111111% {
      background: linear-gradient(47.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.138888888888888% {
      background: linear-gradient(47.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.166666666666666% {
      background: linear-gradient(47.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.194444444444443% {
      background: linear-gradient(47.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.222222222222221% {
      background: linear-gradient(47.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.25% {
      background: linear-gradient(47.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.277777777777777% {
      background: linear-gradient(47.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.305555555555555% {
      background: linear-gradient(47.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.333333333333332% {
      background: linear-gradient(48deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.36111111111111% {
      background: linear-gradient(48.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.388888888888888% {
      background: linear-gradient(48.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.416666666666666% {
      background: linear-gradient(48.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.444444444444443% {
      background: linear-gradient(48.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.472222222222221% {
      background: linear-gradient(48.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.5% {
      background: linear-gradient(48.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.527777777777777% {
      background: linear-gradient(48.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.555555555555555% {
      background: linear-gradient(48.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.583333333333332% {
      background: linear-gradient(48.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.61111111111111% {
      background: linear-gradient(49deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.638888888888888% {
      background: linear-gradient(49.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.666666666666666% {
      background: linear-gradient(49.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.694444444444443% {
      background: linear-gradient(49.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.722222222222221% {
      background: linear-gradient(49.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.75% {
      background: linear-gradient(49.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.777777777777777% {
      background: linear-gradient(49.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.805555555555555% {
      background: linear-gradient(49.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.833333333333332% {
      background: linear-gradient(49.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.86111111111111% {
      background: linear-gradient(49.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.888888888888888% {
      background: linear-gradient(50deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.916666666666666% {
      background: linear-gradient(50.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.944444444444443% {
      background: linear-gradient(50.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    13.972222222222221% {
      background: linear-gradient(50.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14% {
      background: linear-gradient(50.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.027777777777777% {
      background: linear-gradient(50.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.055555555555555% {
      background: linear-gradient(50.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.083333333333332% {
      background: linear-gradient(50.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.11111111111111% {
      background: linear-gradient(50.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.138888888888888% {
      background: linear-gradient(50.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.166666666666666% {
      background: linear-gradient(51deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.194444444444443% {
      background: linear-gradient(51.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.222222222222221% {
      background: linear-gradient(51.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.25% {
      background: linear-gradient(51.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.277777777777777% {
      background: linear-gradient(51.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.305555555555555% {
      background: linear-gradient(51.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.333333333333332% {
      background: linear-gradient(51.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.36111111111111% {
      background: linear-gradient(51.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.388888888888888% {
      background: linear-gradient(51.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.416666666666666% {
      background: linear-gradient(51.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.444444444444443% {
      background: linear-gradient(52deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.472222222222221% {
      background: linear-gradient(52.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.5% {
      background: linear-gradient(52.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.527777777777777% {
      background: linear-gradient(52.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.555555555555555% {
      background: linear-gradient(52.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.583333333333332% {
      background: linear-gradient(52.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.61111111111111% {
      background: linear-gradient(52.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.638888888888888% {
      background: linear-gradient(52.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.666666666666666% {
      background: linear-gradient(52.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.694444444444443% {
      background: linear-gradient(52.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.722222222222221% {
      background: linear-gradient(53deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.75% {
      background: linear-gradient(53.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.777777777777777% {
      background: linear-gradient(53.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.805555555555555% {
      background: linear-gradient(53.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.833333333333332% {
      background: linear-gradient(53.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.86111111111111% {
      background: linear-gradient(53.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.888888888888888% {
      background: linear-gradient(53.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.916666666666666% {
      background: linear-gradient(53.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.944444444444443% {
      background: linear-gradient(53.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    14.972222222222221% {
      background: linear-gradient(53.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15% {
      background: linear-gradient(54deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.027777777777777% {
      background: linear-gradient(54.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.055555555555555% {
      background: linear-gradient(54.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.083333333333332% {
      background: linear-gradient(54.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.11111111111111% {
      background: linear-gradient(54.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.138888888888888% {
      background: linear-gradient(54.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.166666666666666% {
      background: linear-gradient(54.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.194444444444443% {
      background: linear-gradient(54.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.222222222222221% {
      background: linear-gradient(54.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.25% {
      background: linear-gradient(54.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.277777777777777% {
      background: linear-gradient(55deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.305555555555555% {
      background: linear-gradient(55.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.333333333333332% {
      background: linear-gradient(55.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.36111111111111% {
      background: linear-gradient(55.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.388888888888888% {
      background: linear-gradient(55.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.416666666666666% {
      background: linear-gradient(55.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.444444444444443% {
      background: linear-gradient(55.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.472222222222221% {
      background: linear-gradient(55.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.5% {
      background: linear-gradient(55.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.527777777777777% {
      background: linear-gradient(55.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.555555555555555% {
      background: linear-gradient(56deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.583333333333332% {
      background: linear-gradient(56.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.61111111111111% {
      background: linear-gradient(56.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.638888888888888% {
      background: linear-gradient(56.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.666666666666666% {
      background: linear-gradient(56.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.694444444444443% {
      background: linear-gradient(56.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.722222222222221% {
      background: linear-gradient(56.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.75% {
      background: linear-gradient(56.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.777777777777777% {
      background: linear-gradient(56.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.805555555555555% {
      background: linear-gradient(56.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.833333333333332% {
      background: linear-gradient(57deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.86111111111111% {
      background: linear-gradient(57.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.888888888888888% {
      background: linear-gradient(57.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.916666666666666% {
      background: linear-gradient(57.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.944444444444443% {
      background: linear-gradient(57.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    15.972222222222221% {
      background: linear-gradient(57.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16% {
      background: linear-gradient(57.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.02777777777778% {
      background: linear-gradient(57.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.055555555555554% {
      background: linear-gradient(57.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.083333333333332% {
      background: linear-gradient(57.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.11111111111111% {
      background: linear-gradient(58deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.13888888888889% {
      background: linear-gradient(58.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.166666666666664% {
      background: linear-gradient(58.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.194444444444443% {
      background: linear-gradient(58.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.22222222222222% {
      background: linear-gradient(58.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.25% {
      background: linear-gradient(58.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.27777777777778% {
      background: linear-gradient(58.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.305555555555554% {
      background: linear-gradient(58.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.333333333333332% {
      background: linear-gradient(58.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.36111111111111% {
      background: linear-gradient(58.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.38888888888889% {
      background: linear-gradient(59deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.416666666666664% {
      background: linear-gradient(59.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.444444444444443% {
      background: linear-gradient(59.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.47222222222222% {
      background: linear-gradient(59.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.5% {
      background: linear-gradient(59.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.52777777777778% {
      background: linear-gradient(59.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.555555555555554% {
      background: linear-gradient(59.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.583333333333332% {
      background: linear-gradient(59.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.61111111111111% {
      background: linear-gradient(59.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.63888888888889% {
      background: linear-gradient(59.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.666666666666664% {
      background: linear-gradient(60deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.694444444444443% {
      background: linear-gradient(60.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.72222222222222% {
      background: linear-gradient(60.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.75% {
      background: linear-gradient(60.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.77777777777778% {
      background: linear-gradient(60.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.805555555555554% {
      background: linear-gradient(60.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.833333333333332% {
      background: linear-gradient(60.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.86111111111111% {
      background: linear-gradient(60.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.88888888888889% {
      background: linear-gradient(60.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.916666666666664% {
      background: linear-gradient(60.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.944444444444443% {
      background: linear-gradient(61deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    16.97222222222222% {
      background: linear-gradient(61.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17% {
      background: linear-gradient(61.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.02777777777778% {
      background: linear-gradient(61.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.055555555555554% {
      background: linear-gradient(61.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.083333333333332% {
      background: linear-gradient(61.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.11111111111111% {
      background: linear-gradient(61.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.13888888888889% {
      background: linear-gradient(61.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.166666666666664% {
      background: linear-gradient(61.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.194444444444443% {
      background: linear-gradient(61.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.22222222222222% {
      background: linear-gradient(62deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.25% {
      background: linear-gradient(62.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.27777777777778% {
      background: linear-gradient(62.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.305555555555554% {
      background: linear-gradient(62.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.333333333333332% {
      background: linear-gradient(62.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.36111111111111% {
      background: linear-gradient(62.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.38888888888889% {
      background: linear-gradient(62.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.416666666666664% {
      background: linear-gradient(62.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.444444444444443% {
      background: linear-gradient(62.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.47222222222222% {
      background: linear-gradient(62.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.5% {
      background: linear-gradient(63deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.52777777777778% {
      background: linear-gradient(63.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.555555555555554% {
      background: linear-gradient(63.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.583333333333332% {
      background: linear-gradient(63.300000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.61111111111111% {
      background: linear-gradient(63.400000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.63888888888889% {
      background: linear-gradient(63.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.666666666666664% {
      background: linear-gradient(63.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.694444444444443% {
      background: linear-gradient(63.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.72222222222222% {
      background: linear-gradient(63.800000000000004deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.75% {
      background: linear-gradient(63.900000000000006deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.77777777777778% {
      background: linear-gradient(64deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.805555555555554% {
      background: linear-gradient(64.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.833333333333332% {
      background: linear-gradient(64.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.86111111111111% {
      background: linear-gradient(64.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.88888888888889% {
      background: linear-gradient(64.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.916666666666664% {
      background: linear-gradient(64.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.944444444444443% {
      background: linear-gradient(64.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    17.97222222222222% {
      background: linear-gradient(64.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18% {
      background: linear-gradient(64.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.027777777777775% {
      background: linear-gradient(64.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.055555555555554% {
      background: linear-gradient(65deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.083333333333332% {
      background: linear-gradient(65.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.11111111111111% {
      background: linear-gradient(65.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.13888888888889% {
      background: linear-gradient(65.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.166666666666664% {
      background: linear-gradient(65.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.194444444444443% {
      background: linear-gradient(65.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.22222222222222% {
      background: linear-gradient(65.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.25% {
      background: linear-gradient(65.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.277777777777775% {
      background: linear-gradient(65.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.305555555555554% {
      background: linear-gradient(65.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.333333333333332% {
      background: linear-gradient(66deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.36111111111111% {
      background: linear-gradient(66.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.38888888888889% {
      background: linear-gradient(66.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.416666666666664% {
      background: linear-gradient(66.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.444444444444443% {
      background: linear-gradient(66.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.47222222222222% {
      background: linear-gradient(66.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.5% {
      background: linear-gradient(66.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.527777777777775% {
      background: linear-gradient(66.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.555555555555554% {
      background: linear-gradient(66.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.583333333333332% {
      background: linear-gradient(66.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.61111111111111% {
      background: linear-gradient(67deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.63888888888889% {
      background: linear-gradient(67.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.666666666666664% {
      background: linear-gradient(67.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.694444444444443% {
      background: linear-gradient(67.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.72222222222222% {
      background: linear-gradient(67.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.75% {
      background: linear-gradient(67.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.777777777777775% {
      background: linear-gradient(67.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.805555555555554% {
      background: linear-gradient(67.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.833333333333332% {
      background: linear-gradient(67.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.86111111111111% {
      background: linear-gradient(67.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.88888888888889% {
      background: linear-gradient(68deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.916666666666664% {
      background: linear-gradient(68.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.944444444444443% {
      background: linear-gradient(68.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    18.97222222222222% {
      background: linear-gradient(68.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19% {
      background: linear-gradient(68.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.027777777777775% {
      background: linear-gradient(68.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.055555555555554% {
      background: linear-gradient(68.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.083333333333332% {
      background: linear-gradient(68.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.11111111111111% {
      background: linear-gradient(68.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.13888888888889% {
      background: linear-gradient(68.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.166666666666664% {
      background: linear-gradient(69deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.194444444444443% {
      background: linear-gradient(69.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.22222222222222% {
      background: linear-gradient(69.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.25% {
      background: linear-gradient(69.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.277777777777775% {
      background: linear-gradient(69.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.305555555555554% {
      background: linear-gradient(69.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.333333333333332% {
      background: linear-gradient(69.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.36111111111111% {
      background: linear-gradient(69.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.38888888888889% {
      background: linear-gradient(69.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.416666666666664% {
      background: linear-gradient(69.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.444444444444443% {
      background: linear-gradient(70deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.47222222222222% {
      background: linear-gradient(70.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.5% {
      background: linear-gradient(70.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.527777777777775% {
      background: linear-gradient(70.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.555555555555554% {
      background: linear-gradient(70.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.583333333333332% {
      background: linear-gradient(70.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.61111111111111% {
      background: linear-gradient(70.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.63888888888889% {
      background: linear-gradient(70.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.666666666666664% {
      background: linear-gradient(70.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.694444444444443% {
      background: linear-gradient(70.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.72222222222222% {
      background: linear-gradient(71deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.75% {
      background: linear-gradient(71.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.777777777777775% {
      background: linear-gradient(71.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.805555555555554% {
      background: linear-gradient(71.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.833333333333332% {
      background: linear-gradient(71.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.86111111111111% {
      background: linear-gradient(71.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.88888888888889% {
      background: linear-gradient(71.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.916666666666664% {
      background: linear-gradient(71.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.944444444444443% {
      background: linear-gradient(71.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    19.97222222222222% {
      background: linear-gradient(71.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20% {
      background: linear-gradient(72deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.027777777777775% {
      background: linear-gradient(72.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.055555555555554% {
      background: linear-gradient(72.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.083333333333332% {
      background: linear-gradient(72.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.11111111111111% {
      background: linear-gradient(72.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.13888888888889% {
      background: linear-gradient(72.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.166666666666664% {
      background: linear-gradient(72.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.194444444444443% {
      background: linear-gradient(72.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.22222222222222% {
      background: linear-gradient(72.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.25% {
      background: linear-gradient(72.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.277777777777775% {
      background: linear-gradient(73deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.305555555555554% {
      background: linear-gradient(73.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.333333333333332% {
      background: linear-gradient(73.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.36111111111111% {
      background: linear-gradient(73.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.38888888888889% {
      background: linear-gradient(73.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.416666666666664% {
      background: linear-gradient(73.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.444444444444443% {
      background: linear-gradient(73.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.47222222222222% {
      background: linear-gradient(73.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.5% {
      background: linear-gradient(73.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.527777777777775% {
      background: linear-gradient(73.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.555555555555554% {
      background: linear-gradient(74deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.583333333333332% {
      background: linear-gradient(74.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.61111111111111% {
      background: linear-gradient(74.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.63888888888889% {
      background: linear-gradient(74.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.666666666666664% {
      background: linear-gradient(74.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.694444444444443% {
      background: linear-gradient(74.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.72222222222222% {
      background: linear-gradient(74.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.75% {
      background: linear-gradient(74.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.777777777777775% {
      background: linear-gradient(74.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.805555555555554% {
      background: linear-gradient(74.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.833333333333332% {
      background: linear-gradient(75deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.86111111111111% {
      background: linear-gradient(75.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.88888888888889% {
      background: linear-gradient(75.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.916666666666664% {
      background: linear-gradient(75.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.944444444444443% {
      background: linear-gradient(75.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    20.97222222222222% {
      background: linear-gradient(75.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21% {
      background: linear-gradient(75.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.027777777777775% {
      background: linear-gradient(75.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.055555555555554% {
      background: linear-gradient(75.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.083333333333332% {
      background: linear-gradient(75.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.11111111111111% {
      background: linear-gradient(76deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.13888888888889% {
      background: linear-gradient(76.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.166666666666664% {
      background: linear-gradient(76.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.194444444444443% {
      background: linear-gradient(76.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.22222222222222% {
      background: linear-gradient(76.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.25% {
      background: linear-gradient(76.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.277777777777775% {
      background: linear-gradient(76.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.305555555555554% {
      background: linear-gradient(76.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.333333333333332% {
      background: linear-gradient(76.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.36111111111111% {
      background: linear-gradient(76.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.38888888888889% {
      background: linear-gradient(77deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.416666666666664% {
      background: linear-gradient(77.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.444444444444443% {
      background: linear-gradient(77.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.47222222222222% {
      background: linear-gradient(77.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.5% {
      background: linear-gradient(77.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.527777777777775% {
      background: linear-gradient(77.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.555555555555554% {
      background: linear-gradient(77.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.583333333333332% {
      background: linear-gradient(77.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.61111111111111% {
      background: linear-gradient(77.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.63888888888889% {
      background: linear-gradient(77.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.666666666666664% {
      background: linear-gradient(78deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.694444444444443% {
      background: linear-gradient(78.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.72222222222222% {
      background: linear-gradient(78.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.75% {
      background: linear-gradient(78.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.777777777777775% {
      background: linear-gradient(78.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.805555555555554% {
      background: linear-gradient(78.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.833333333333332% {
      background: linear-gradient(78.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.86111111111111% {
      background: linear-gradient(78.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.88888888888889% {
      background: linear-gradient(78.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.916666666666664% {
      background: linear-gradient(78.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.944444444444443% {
      background: linear-gradient(79deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    21.97222222222222% {
      background: linear-gradient(79.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22% {
      background: linear-gradient(79.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.027777777777775% {
      background: linear-gradient(79.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.055555555555554% {
      background: linear-gradient(79.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.083333333333332% {
      background: linear-gradient(79.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.11111111111111% {
      background: linear-gradient(79.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.13888888888889% {
      background: linear-gradient(79.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.166666666666664% {
      background: linear-gradient(79.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.194444444444443% {
      background: linear-gradient(79.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.22222222222222% {
      background: linear-gradient(80deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.25% {
      background: linear-gradient(80.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.277777777777775% {
      background: linear-gradient(80.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.305555555555554% {
      background: linear-gradient(80.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.333333333333332% {
      background: linear-gradient(80.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.36111111111111% {
      background: linear-gradient(80.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.38888888888889% {
      background: linear-gradient(80.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.416666666666664% {
      background: linear-gradient(80.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.444444444444443% {
      background: linear-gradient(80.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.47222222222222% {
      background: linear-gradient(80.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.5% {
      background: linear-gradient(81deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.527777777777775% {
      background: linear-gradient(81.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.555555555555554% {
      background: linear-gradient(81.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.583333333333332% {
      background: linear-gradient(81.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.61111111111111% {
      background: linear-gradient(81.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.63888888888889% {
      background: linear-gradient(81.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.666666666666664% {
      background: linear-gradient(81.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.694444444444443% {
      background: linear-gradient(81.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.72222222222222% {
      background: linear-gradient(81.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.75% {
      background: linear-gradient(81.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.777777777777775% {
      background: linear-gradient(82deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.805555555555554% {
      background: linear-gradient(82.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.833333333333332% {
      background: linear-gradient(82.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.86111111111111% {
      background: linear-gradient(82.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.88888888888889% {
      background: linear-gradient(82.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.916666666666664% {
      background: linear-gradient(82.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.944444444444443% {
      background: linear-gradient(82.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    22.97222222222222% {
      background: linear-gradient(82.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23% {
      background: linear-gradient(82.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.027777777777775% {
      background: linear-gradient(82.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.055555555555554% {
      background: linear-gradient(83deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.083333333333332% {
      background: linear-gradient(83.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.11111111111111% {
      background: linear-gradient(83.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.13888888888889% {
      background: linear-gradient(83.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.166666666666664% {
      background: linear-gradient(83.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.194444444444443% {
      background: linear-gradient(83.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.22222222222222% {
      background: linear-gradient(83.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.25% {
      background: linear-gradient(83.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.277777777777775% {
      background: linear-gradient(83.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.305555555555554% {
      background: linear-gradient(83.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.333333333333332% {
      background: linear-gradient(84deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.36111111111111% {
      background: linear-gradient(84.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.38888888888889% {
      background: linear-gradient(84.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.416666666666664% {
      background: linear-gradient(84.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.444444444444443% {
      background: linear-gradient(84.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.47222222222222% {
      background: linear-gradient(84.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.5% {
      background: linear-gradient(84.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.527777777777775% {
      background: linear-gradient(84.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.555555555555554% {
      background: linear-gradient(84.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.583333333333332% {
      background: linear-gradient(84.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.61111111111111% {
      background: linear-gradient(85deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.63888888888889% {
      background: linear-gradient(85.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.666666666666664% {
      background: linear-gradient(85.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.694444444444443% {
      background: linear-gradient(85.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.72222222222222% {
      background: linear-gradient(85.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.75% {
      background: linear-gradient(85.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.777777777777775% {
      background: linear-gradient(85.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.805555555555554% {
      background: linear-gradient(85.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.833333333333332% {
      background: linear-gradient(85.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.86111111111111% {
      background: linear-gradient(85.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.88888888888889% {
      background: linear-gradient(86deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.916666666666664% {
      background: linear-gradient(86.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.944444444444443% {
      background: linear-gradient(86.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    23.97222222222222% {
      background: linear-gradient(86.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24% {
      background: linear-gradient(86.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.027777777777775% {
      background: linear-gradient(86.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.055555555555554% {
      background: linear-gradient(86.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.083333333333332% {
      background: linear-gradient(86.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.11111111111111% {
      background: linear-gradient(86.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.13888888888889% {
      background: linear-gradient(86.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.166666666666664% {
      background: linear-gradient(87deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.194444444444443% {
      background: linear-gradient(87.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.22222222222222% {
      background: linear-gradient(87.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.25% {
      background: linear-gradient(87.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.277777777777775% {
      background: linear-gradient(87.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.305555555555554% {
      background: linear-gradient(87.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.333333333333332% {
      background: linear-gradient(87.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.36111111111111% {
      background: linear-gradient(87.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.38888888888889% {
      background: linear-gradient(87.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.416666666666664% {
      background: linear-gradient(87.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.444444444444443% {
      background: linear-gradient(88deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.47222222222222% {
      background: linear-gradient(88.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.5% {
      background: linear-gradient(88.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.527777777777775% {
      background: linear-gradient(88.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.555555555555554% {
      background: linear-gradient(88.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.583333333333332% {
      background: linear-gradient(88.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.61111111111111% {
      background: linear-gradient(88.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.63888888888889% {
      background: linear-gradient(88.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.666666666666664% {
      background: linear-gradient(88.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.694444444444443% {
      background: linear-gradient(88.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.72222222222222% {
      background: linear-gradient(89deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.75% {
      background: linear-gradient(89.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.777777777777775% {
      background: linear-gradient(89.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.805555555555554% {
      background: linear-gradient(89.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.833333333333332% {
      background: linear-gradient(89.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.86111111111111% {
      background: linear-gradient(89.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.888888888888886% {
      background: linear-gradient(89.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.916666666666664% {
      background: linear-gradient(89.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.944444444444443% {
      background: linear-gradient(89.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    24.97222222222222% {
      background: linear-gradient(89.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25% {
      background: linear-gradient(90deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.027777777777775% {
      background: linear-gradient(90.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.055555555555554% {
      background: linear-gradient(90.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.083333333333332% {
      background: linear-gradient(90.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.11111111111111% {
      background: linear-gradient(90.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.138888888888886% {
      background: linear-gradient(90.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.166666666666664% {
      background: linear-gradient(90.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.194444444444443% {
      background: linear-gradient(90.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.22222222222222% {
      background: linear-gradient(90.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.25% {
      background: linear-gradient(90.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.277777777777775% {
      background: linear-gradient(91deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.305555555555554% {
      background: linear-gradient(91.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.333333333333332% {
      background: linear-gradient(91.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.36111111111111% {
      background: linear-gradient(91.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.388888888888886% {
      background: linear-gradient(91.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.416666666666664% {
      background: linear-gradient(91.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.444444444444443% {
      background: linear-gradient(91.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.47222222222222% {
      background: linear-gradient(91.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.5% {
      background: linear-gradient(91.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.527777777777775% {
      background: linear-gradient(91.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.555555555555554% {
      background: linear-gradient(92deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.583333333333332% {
      background: linear-gradient(92.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.61111111111111% {
      background: linear-gradient(92.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.638888888888886% {
      background: linear-gradient(92.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.666666666666664% {
      background: linear-gradient(92.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.694444444444443% {
      background: linear-gradient(92.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.72222222222222% {
      background: linear-gradient(92.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.75% {
      background: linear-gradient(92.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.777777777777775% {
      background: linear-gradient(92.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.805555555555554% {
      background: linear-gradient(92.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.833333333333332% {
      background: linear-gradient(93deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.86111111111111% {
      background: linear-gradient(93.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.888888888888886% {
      background: linear-gradient(93.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.916666666666664% {
      background: linear-gradient(93.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.944444444444443% {
      background: linear-gradient(93.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    25.97222222222222% {
      background: linear-gradient(93.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26% {
      background: linear-gradient(93.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.027777777777775% {
      background: linear-gradient(93.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.055555555555554% {
      background: linear-gradient(93.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.083333333333332% {
      background: linear-gradient(93.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.11111111111111% {
      background: linear-gradient(94deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.138888888888886% {
      background: linear-gradient(94.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.166666666666664% {
      background: linear-gradient(94.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.194444444444443% {
      background: linear-gradient(94.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.22222222222222% {
      background: linear-gradient(94.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.25% {
      background: linear-gradient(94.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.277777777777775% {
      background: linear-gradient(94.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.305555555555554% {
      background: linear-gradient(94.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.333333333333332% {
      background: linear-gradient(94.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.36111111111111% {
      background: linear-gradient(94.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.388888888888886% {
      background: linear-gradient(95deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.416666666666664% {
      background: linear-gradient(95.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.444444444444443% {
      background: linear-gradient(95.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.47222222222222% {
      background: linear-gradient(95.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.5% {
      background: linear-gradient(95.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.527777777777775% {
      background: linear-gradient(95.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.555555555555554% {
      background: linear-gradient(95.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.583333333333332% {
      background: linear-gradient(95.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.61111111111111% {
      background: linear-gradient(95.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.638888888888886% {
      background: linear-gradient(95.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.666666666666664% {
      background: linear-gradient(96deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.694444444444443% {
      background: linear-gradient(96.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.72222222222222% {
      background: linear-gradient(96.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.75% {
      background: linear-gradient(96.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.777777777777775% {
      background: linear-gradient(96.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.805555555555554% {
      background: linear-gradient(96.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.833333333333332% {
      background: linear-gradient(96.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.86111111111111% {
      background: linear-gradient(96.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.888888888888886% {
      background: linear-gradient(96.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.916666666666664% {
      background: linear-gradient(96.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.944444444444443% {
      background: linear-gradient(97deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    26.97222222222222% {
      background: linear-gradient(97.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27% {
      background: linear-gradient(97.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.027777777777775% {
      background: linear-gradient(97.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.055555555555554% {
      background: linear-gradient(97.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.083333333333332% {
      background: linear-gradient(97.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.11111111111111% {
      background: linear-gradient(97.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.138888888888886% {
      background: linear-gradient(97.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.166666666666664% {
      background: linear-gradient(97.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.194444444444443% {
      background: linear-gradient(97.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.22222222222222% {
      background: linear-gradient(98deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.25% {
      background: linear-gradient(98.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.277777777777775% {
      background: linear-gradient(98.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.305555555555554% {
      background: linear-gradient(98.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.333333333333332% {
      background: linear-gradient(98.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.36111111111111% {
      background: linear-gradient(98.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.388888888888886% {
      background: linear-gradient(98.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.416666666666664% {
      background: linear-gradient(98.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.444444444444443% {
      background: linear-gradient(98.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.47222222222222% {
      background: linear-gradient(98.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.5% {
      background: linear-gradient(99deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.527777777777775% {
      background: linear-gradient(99.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.555555555555554% {
      background: linear-gradient(99.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.583333333333332% {
      background: linear-gradient(99.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.61111111111111% {
      background: linear-gradient(99.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.638888888888886% {
      background: linear-gradient(99.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.666666666666664% {
      background: linear-gradient(99.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.694444444444443% {
      background: linear-gradient(99.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.72222222222222% {
      background: linear-gradient(99.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.75% {
      background: linear-gradient(99.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.777777777777775% {
      background: linear-gradient(100deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.805555555555554% {
      background: linear-gradient(100.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.833333333333332% {
      background: linear-gradient(100.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.86111111111111% {
      background: linear-gradient(100.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.888888888888886% {
      background: linear-gradient(100.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.916666666666664% {
      background: linear-gradient(100.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.944444444444443% {
      background: linear-gradient(100.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    27.97222222222222% {
      background: linear-gradient(100.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28% {
      background: linear-gradient(100.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.027777777777775% {
      background: linear-gradient(100.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.055555555555554% {
      background: linear-gradient(101deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.083333333333332% {
      background: linear-gradient(101.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.11111111111111% {
      background: linear-gradient(101.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.138888888888886% {
      background: linear-gradient(101.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.166666666666664% {
      background: linear-gradient(101.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.194444444444443% {
      background: linear-gradient(101.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.22222222222222% {
      background: linear-gradient(101.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.25% {
      background: linear-gradient(101.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.277777777777775% {
      background: linear-gradient(101.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.305555555555554% {
      background: linear-gradient(101.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.333333333333332% {
      background: linear-gradient(102deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.36111111111111% {
      background: linear-gradient(102.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.388888888888886% {
      background: linear-gradient(102.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.416666666666664% {
      background: linear-gradient(102.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.444444444444443% {
      background: linear-gradient(102.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.47222222222222% {
      background: linear-gradient(102.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.5% {
      background: linear-gradient(102.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.527777777777775% {
      background: linear-gradient(102.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.555555555555554% {
      background: linear-gradient(102.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.583333333333332% {
      background: linear-gradient(102.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.61111111111111% {
      background: linear-gradient(103deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.638888888888886% {
      background: linear-gradient(103.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.666666666666664% {
      background: linear-gradient(103.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.694444444444443% {
      background: linear-gradient(103.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.72222222222222% {
      background: linear-gradient(103.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.75% {
      background: linear-gradient(103.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.777777777777775% {
      background: linear-gradient(103.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.805555555555554% {
      background: linear-gradient(103.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.833333333333332% {
      background: linear-gradient(103.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.86111111111111% {
      background: linear-gradient(103.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.888888888888886% {
      background: linear-gradient(104deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.916666666666664% {
      background: linear-gradient(104.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.944444444444443% {
      background: linear-gradient(104.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    28.97222222222222% {
      background: linear-gradient(104.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29% {
      background: linear-gradient(104.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.027777777777775% {
      background: linear-gradient(104.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.055555555555554% {
      background: linear-gradient(104.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.083333333333332% {
      background: linear-gradient(104.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.11111111111111% {
      background: linear-gradient(104.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.138888888888886% {
      background: linear-gradient(104.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.166666666666664% {
      background: linear-gradient(105deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.194444444444443% {
      background: linear-gradient(105.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.22222222222222% {
      background: linear-gradient(105.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.25% {
      background: linear-gradient(105.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.277777777777775% {
      background: linear-gradient(105.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.305555555555554% {
      background: linear-gradient(105.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.333333333333332% {
      background: linear-gradient(105.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.36111111111111% {
      background: linear-gradient(105.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.388888888888886% {
      background: linear-gradient(105.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.416666666666664% {
      background: linear-gradient(105.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.444444444444443% {
      background: linear-gradient(106deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.47222222222222% {
      background: linear-gradient(106.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.5% {
      background: linear-gradient(106.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.527777777777775% {
      background: linear-gradient(106.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.555555555555554% {
      background: linear-gradient(106.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.583333333333332% {
      background: linear-gradient(106.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.61111111111111% {
      background: linear-gradient(106.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.638888888888886% {
      background: linear-gradient(106.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.666666666666664% {
      background: linear-gradient(106.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.694444444444443% {
      background: linear-gradient(106.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.72222222222222% {
      background: linear-gradient(107deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.75% {
      background: linear-gradient(107.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.777777777777775% {
      background: linear-gradient(107.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.805555555555554% {
      background: linear-gradient(107.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.833333333333332% {
      background: linear-gradient(107.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.86111111111111% {
      background: linear-gradient(107.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.888888888888886% {
      background: linear-gradient(107.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.916666666666664% {
      background: linear-gradient(107.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.944444444444443% {
      background: linear-gradient(107.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    29.97222222222222% {
      background: linear-gradient(107.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30% {
      background: linear-gradient(108deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.027777777777775% {
      background: linear-gradient(108.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.055555555555554% {
      background: linear-gradient(108.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.083333333333332% {
      background: linear-gradient(108.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.11111111111111% {
      background: linear-gradient(108.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.138888888888886% {
      background: linear-gradient(108.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.166666666666664% {
      background: linear-gradient(108.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.194444444444443% {
      background: linear-gradient(108.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.22222222222222% {
      background: linear-gradient(108.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.25% {
      background: linear-gradient(108.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.277777777777775% {
      background: linear-gradient(109deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.305555555555554% {
      background: linear-gradient(109.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.333333333333332% {
      background: linear-gradient(109.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.36111111111111% {
      background: linear-gradient(109.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.388888888888886% {
      background: linear-gradient(109.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.416666666666664% {
      background: linear-gradient(109.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.444444444444443% {
      background: linear-gradient(109.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.47222222222222% {
      background: linear-gradient(109.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.5% {
      background: linear-gradient(109.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.527777777777775% {
      background: linear-gradient(109.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.555555555555554% {
      background: linear-gradient(110deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.583333333333332% {
      background: linear-gradient(110.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.61111111111111% {
      background: linear-gradient(110.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.638888888888886% {
      background: linear-gradient(110.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.666666666666664% {
      background: linear-gradient(110.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.694444444444443% {
      background: linear-gradient(110.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.72222222222222% {
      background: linear-gradient(110.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.75% {
      background: linear-gradient(110.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.777777777777775% {
      background: linear-gradient(110.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.805555555555554% {
      background: linear-gradient(110.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.833333333333332% {
      background: linear-gradient(111deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.86111111111111% {
      background: linear-gradient(111.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.888888888888886% {
      background: linear-gradient(111.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.916666666666664% {
      background: linear-gradient(111.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.944444444444443% {
      background: linear-gradient(111.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    30.97222222222222% {
      background: linear-gradient(111.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31% {
      background: linear-gradient(111.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.027777777777775% {
      background: linear-gradient(111.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.055555555555554% {
      background: linear-gradient(111.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.083333333333332% {
      background: linear-gradient(111.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.11111111111111% {
      background: linear-gradient(112deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.138888888888886% {
      background: linear-gradient(112.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.166666666666664% {
      background: linear-gradient(112.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.194444444444443% {
      background: linear-gradient(112.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.22222222222222% {
      background: linear-gradient(112.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.25% {
      background: linear-gradient(112.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.277777777777775% {
      background: linear-gradient(112.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.305555555555554% {
      background: linear-gradient(112.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.333333333333332% {
      background: linear-gradient(112.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.36111111111111% {
      background: linear-gradient(112.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.388888888888886% {
      background: linear-gradient(113deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.416666666666664% {
      background: linear-gradient(113.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.444444444444443% {
      background: linear-gradient(113.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.47222222222222% {
      background: linear-gradient(113.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.5% {
      background: linear-gradient(113.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.527777777777775% {
      background: linear-gradient(113.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.555555555555554% {
      background: linear-gradient(113.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.583333333333332% {
      background: linear-gradient(113.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.61111111111111% {
      background: linear-gradient(113.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.638888888888886% {
      background: linear-gradient(113.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.666666666666664% {
      background: linear-gradient(114deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.694444444444443% {
      background: linear-gradient(114.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.72222222222222% {
      background: linear-gradient(114.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.75% {
      background: linear-gradient(114.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.777777777777775% {
      background: linear-gradient(114.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.805555555555554% {
      background: linear-gradient(114.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.833333333333332% {
      background: linear-gradient(114.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.86111111111111% {
      background: linear-gradient(114.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.888888888888886% {
      background: linear-gradient(114.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.916666666666664% {
      background: linear-gradient(114.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.944444444444443% {
      background: linear-gradient(115deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    31.97222222222222% {
      background: linear-gradient(115.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32% {
      background: linear-gradient(115.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.02777777777778% {
      background: linear-gradient(115.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.05555555555556% {
      background: linear-gradient(115.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.08333333333333% {
      background: linear-gradient(115.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.11111111111111% {
      background: linear-gradient(115.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.138888888888886% {
      background: linear-gradient(115.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.166666666666664% {
      background: linear-gradient(115.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.19444444444444% {
      background: linear-gradient(115.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.22222222222222% {
      background: linear-gradient(116deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.25% {
      background: linear-gradient(116.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.27777777777778% {
      background: linear-gradient(116.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.30555555555556% {
      background: linear-gradient(116.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.33333333333333% {
      background: linear-gradient(116.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.36111111111111% {
      background: linear-gradient(116.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.388888888888886% {
      background: linear-gradient(116.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.416666666666664% {
      background: linear-gradient(116.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.44444444444444% {
      background: linear-gradient(116.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.47222222222222% {
      background: linear-gradient(116.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.5% {
      background: linear-gradient(117deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.52777777777778% {
      background: linear-gradient(117.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.55555555555556% {
      background: linear-gradient(117.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.58333333333333% {
      background: linear-gradient(117.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.61111111111111% {
      background: linear-gradient(117.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.638888888888886% {
      background: linear-gradient(117.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.666666666666664% {
      background: linear-gradient(117.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.69444444444444% {
      background: linear-gradient(117.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.72222222222222% {
      background: linear-gradient(117.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.75% {
      background: linear-gradient(117.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.77777777777778% {
      background: linear-gradient(118deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.80555555555556% {
      background: linear-gradient(118.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.83333333333333% {
      background: linear-gradient(118.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.86111111111111% {
      background: linear-gradient(118.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.888888888888886% {
      background: linear-gradient(118.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.916666666666664% {
      background: linear-gradient(118.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.94444444444444% {
      background: linear-gradient(118.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    32.97222222222222% {
      background: linear-gradient(118.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33% {
      background: linear-gradient(118.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.02777777777778% {
      background: linear-gradient(118.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.05555555555556% {
      background: linear-gradient(119deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.08333333333333% {
      background: linear-gradient(119.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.11111111111111% {
      background: linear-gradient(119.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.138888888888886% {
      background: linear-gradient(119.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.166666666666664% {
      background: linear-gradient(119.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.19444444444444% {
      background: linear-gradient(119.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.22222222222222% {
      background: linear-gradient(119.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.25% {
      background: linear-gradient(119.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.27777777777778% {
      background: linear-gradient(119.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.30555555555556% {
      background: linear-gradient(119.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.33333333333333% {
      background: linear-gradient(120deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.36111111111111% {
      background: linear-gradient(120.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.388888888888886% {
      background: linear-gradient(120.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.416666666666664% {
      background: linear-gradient(120.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.44444444444444% {
      background: linear-gradient(120.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.47222222222222% {
      background: linear-gradient(120.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.5% {
      background: linear-gradient(120.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.52777777777778% {
      background: linear-gradient(120.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.55555555555556% {
      background: linear-gradient(120.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.58333333333333% {
      background: linear-gradient(120.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.61111111111111% {
      background: linear-gradient(121deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.638888888888886% {
      background: linear-gradient(121.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.666666666666664% {
      background: linear-gradient(121.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.69444444444444% {
      background: linear-gradient(121.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.72222222222222% {
      background: linear-gradient(121.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.75% {
      background: linear-gradient(121.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.77777777777778% {
      background: linear-gradient(121.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.80555555555556% {
      background: linear-gradient(121.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.83333333333333% {
      background: linear-gradient(121.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.86111111111111% {
      background: linear-gradient(121.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.888888888888886% {
      background: linear-gradient(122deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.916666666666664% {
      background: linear-gradient(122.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.94444444444444% {
      background: linear-gradient(122.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    33.97222222222222% {
      background: linear-gradient(122.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34% {
      background: linear-gradient(122.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.02777777777778% {
      background: linear-gradient(122.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.05555555555556% {
      background: linear-gradient(122.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.08333333333333% {
      background: linear-gradient(122.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.11111111111111% {
      background: linear-gradient(122.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.138888888888886% {
      background: linear-gradient(122.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.166666666666664% {
      background: linear-gradient(123deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.19444444444444% {
      background: linear-gradient(123.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.22222222222222% {
      background: linear-gradient(123.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.25% {
      background: linear-gradient(123.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.27777777777778% {
      background: linear-gradient(123.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.30555555555556% {
      background: linear-gradient(123.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.33333333333333% {
      background: linear-gradient(123.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.36111111111111% {
      background: linear-gradient(123.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.388888888888886% {
      background: linear-gradient(123.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.416666666666664% {
      background: linear-gradient(123.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.44444444444444% {
      background: linear-gradient(124deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.47222222222222% {
      background: linear-gradient(124.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.5% {
      background: linear-gradient(124.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.52777777777778% {
      background: linear-gradient(124.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.55555555555556% {
      background: linear-gradient(124.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.58333333333333% {
      background: linear-gradient(124.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.61111111111111% {
      background: linear-gradient(124.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.638888888888886% {
      background: linear-gradient(124.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.666666666666664% {
      background: linear-gradient(124.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.69444444444444% {
      background: linear-gradient(124.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.72222222222222% {
      background: linear-gradient(125deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.75% {
      background: linear-gradient(125.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.77777777777778% {
      background: linear-gradient(125.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.80555555555556% {
      background: linear-gradient(125.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.83333333333333% {
      background: linear-gradient(125.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.86111111111111% {
      background: linear-gradient(125.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.888888888888886% {
      background: linear-gradient(125.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.916666666666664% {
      background: linear-gradient(125.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.94444444444444% {
      background: linear-gradient(125.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    34.97222222222222% {
      background: linear-gradient(125.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35% {
      background: linear-gradient(126deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.02777777777778% {
      background: linear-gradient(126.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.05555555555556% {
      background: linear-gradient(126.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.08333333333333% {
      background: linear-gradient(126.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.11111111111111% {
      background: linear-gradient(126.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.138888888888886% {
      background: linear-gradient(126.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.166666666666664% {
      background: linear-gradient(126.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.19444444444444% {
      background: linear-gradient(126.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.22222222222222% {
      background: linear-gradient(126.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.25% {
      background: linear-gradient(126.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.27777777777778% {
      background: linear-gradient(127deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.30555555555556% {
      background: linear-gradient(127.10000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.33333333333333% {
      background: linear-gradient(127.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.36111111111111% {
      background: linear-gradient(127.30000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.388888888888886% {
      background: linear-gradient(127.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.416666666666664% {
      background: linear-gradient(127.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.44444444444444% {
      background: linear-gradient(127.60000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.47222222222222% {
      background: linear-gradient(127.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.5% {
      background: linear-gradient(127.80000000000001deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.52777777777778% {
      background: linear-gradient(127.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.55555555555556% {
      background: linear-gradient(128deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.58333333333333% {
      background: linear-gradient(128.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.61111111111111% {
      background: linear-gradient(128.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.638888888888886% {
      background: linear-gradient(128.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.666666666666664% {
      background: linear-gradient(128.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.69444444444444% {
      background: linear-gradient(128.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.72222222222222% {
      background: linear-gradient(128.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.75% {
      background: linear-gradient(128.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.77777777777778% {
      background: linear-gradient(128.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.80555555555555% {
      background: linear-gradient(128.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.83333333333333% {
      background: linear-gradient(129deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.86111111111111% {
      background: linear-gradient(129.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.888888888888886% {
      background: linear-gradient(129.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.916666666666664% {
      background: linear-gradient(129.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.94444444444444% {
      background: linear-gradient(129.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    35.97222222222222% {
      background: linear-gradient(129.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36% {
      background: linear-gradient(129.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.02777777777778% {
      background: linear-gradient(129.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.05555555555555% {
      background: linear-gradient(129.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.08333333333333% {
      background: linear-gradient(129.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.11111111111111% {
      background: linear-gradient(130deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.138888888888886% {
      background: linear-gradient(130.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.166666666666664% {
      background: linear-gradient(130.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.19444444444444% {
      background: linear-gradient(130.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.22222222222222% {
      background: linear-gradient(130.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.25% {
      background: linear-gradient(130.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.27777777777778% {
      background: linear-gradient(130.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.30555555555555% {
      background: linear-gradient(130.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.33333333333333% {
      background: linear-gradient(130.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.36111111111111% {
      background: linear-gradient(130.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.388888888888886% {
      background: linear-gradient(131deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.416666666666664% {
      background: linear-gradient(131.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.44444444444444% {
      background: linear-gradient(131.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.47222222222222% {
      background: linear-gradient(131.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.5% {
      background: linear-gradient(131.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.52777777777778% {
      background: linear-gradient(131.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.55555555555555% {
      background: linear-gradient(131.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.58333333333333% {
      background: linear-gradient(131.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.61111111111111% {
      background: linear-gradient(131.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.638888888888886% {
      background: linear-gradient(131.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.666666666666664% {
      background: linear-gradient(132deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.69444444444444% {
      background: linear-gradient(132.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.72222222222222% {
      background: linear-gradient(132.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.75% {
      background: linear-gradient(132.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.77777777777778% {
      background: linear-gradient(132.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.80555555555555% {
      background: linear-gradient(132.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.83333333333333% {
      background: linear-gradient(132.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.86111111111111% {
      background: linear-gradient(132.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.888888888888886% {
      background: linear-gradient(132.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.916666666666664% {
      background: linear-gradient(132.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.94444444444444% {
      background: linear-gradient(133deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    36.97222222222222% {
      background: linear-gradient(133.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37% {
      background: linear-gradient(133.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.02777777777778% {
      background: linear-gradient(133.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.05555555555555% {
      background: linear-gradient(133.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.08333333333333% {
      background: linear-gradient(133.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.11111111111111% {
      background: linear-gradient(133.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.138888888888886% {
      background: linear-gradient(133.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.166666666666664% {
      background: linear-gradient(133.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.19444444444444% {
      background: linear-gradient(133.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.22222222222222% {
      background: linear-gradient(134deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.25% {
      background: linear-gradient(134.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.27777777777778% {
      background: linear-gradient(134.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.30555555555555% {
      background: linear-gradient(134.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.33333333333333% {
      background: linear-gradient(134.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.36111111111111% {
      background: linear-gradient(134.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.388888888888886% {
      background: linear-gradient(134.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.416666666666664% {
      background: linear-gradient(134.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.44444444444444% {
      background: linear-gradient(134.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.47222222222222% {
      background: linear-gradient(134.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.5% {
      background: linear-gradient(135deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.52777777777778% {
      background: linear-gradient(135.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.55555555555555% {
      background: linear-gradient(135.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.58333333333333% {
      background: linear-gradient(135.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.61111111111111% {
      background: linear-gradient(135.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.638888888888886% {
      background: linear-gradient(135.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.666666666666664% {
      background: linear-gradient(135.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.69444444444444% {
      background: linear-gradient(135.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.72222222222222% {
      background: linear-gradient(135.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.75% {
      background: linear-gradient(135.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.77777777777778% {
      background: linear-gradient(136deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.80555555555555% {
      background: linear-gradient(136.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.83333333333333% {
      background: linear-gradient(136.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.86111111111111% {
      background: linear-gradient(136.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.888888888888886% {
      background: linear-gradient(136.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.916666666666664% {
      background: linear-gradient(136.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.94444444444444% {
      background: linear-gradient(136.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    37.97222222222222% {
      background: linear-gradient(136.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38% {
      background: linear-gradient(136.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.02777777777778% {
      background: linear-gradient(136.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.05555555555555% {
      background: linear-gradient(137deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.08333333333333% {
      background: linear-gradient(137.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.11111111111111% {
      background: linear-gradient(137.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.138888888888886% {
      background: linear-gradient(137.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.166666666666664% {
      background: linear-gradient(137.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.19444444444444% {
      background: linear-gradient(137.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.22222222222222% {
      background: linear-gradient(137.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.25% {
      background: linear-gradient(137.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.27777777777778% {
      background: linear-gradient(137.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.30555555555555% {
      background: linear-gradient(137.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.33333333333333% {
      background: linear-gradient(138deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.36111111111111% {
      background: linear-gradient(138.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.388888888888886% {
      background: linear-gradient(138.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.416666666666664% {
      background: linear-gradient(138.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.44444444444444% {
      background: linear-gradient(138.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.47222222222222% {
      background: linear-gradient(138.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.5% {
      background: linear-gradient(138.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.52777777777778% {
      background: linear-gradient(138.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.55555555555555% {
      background: linear-gradient(138.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.58333333333333% {
      background: linear-gradient(138.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.61111111111111% {
      background: linear-gradient(139deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.638888888888886% {
      background: linear-gradient(139.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.666666666666664% {
      background: linear-gradient(139.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.69444444444444% {
      background: linear-gradient(139.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.72222222222222% {
      background: linear-gradient(139.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.75% {
      background: linear-gradient(139.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.77777777777778% {
      background: linear-gradient(139.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.80555555555555% {
      background: linear-gradient(139.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.83333333333333% {
      background: linear-gradient(139.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.86111111111111% {
      background: linear-gradient(139.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.888888888888886% {
      background: linear-gradient(140deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.916666666666664% {
      background: linear-gradient(140.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.94444444444444% {
      background: linear-gradient(140.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    38.97222222222222% {
      background: linear-gradient(140.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39% {
      background: linear-gradient(140.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.02777777777778% {
      background: linear-gradient(140.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.05555555555555% {
      background: linear-gradient(140.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.08333333333333% {
      background: linear-gradient(140.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.11111111111111% {
      background: linear-gradient(140.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.138888888888886% {
      background: linear-gradient(140.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.166666666666664% {
      background: linear-gradient(141deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.19444444444444% {
      background: linear-gradient(141.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.22222222222222% {
      background: linear-gradient(141.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.25% {
      background: linear-gradient(141.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.27777777777778% {
      background: linear-gradient(141.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.30555555555555% {
      background: linear-gradient(141.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.33333333333333% {
      background: linear-gradient(141.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.36111111111111% {
      background: linear-gradient(141.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.388888888888886% {
      background: linear-gradient(141.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.416666666666664% {
      background: linear-gradient(141.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.44444444444444% {
      background: linear-gradient(142deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.47222222222222% {
      background: linear-gradient(142.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.5% {
      background: linear-gradient(142.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.52777777777778% {
      background: linear-gradient(142.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.55555555555555% {
      background: linear-gradient(142.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.58333333333333% {
      background: linear-gradient(142.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.61111111111111% {
      background: linear-gradient(142.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.638888888888886% {
      background: linear-gradient(142.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.666666666666664% {
      background: linear-gradient(142.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.69444444444444% {
      background: linear-gradient(142.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.72222222222222% {
      background: linear-gradient(143deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.75% {
      background: linear-gradient(143.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.77777777777778% {
      background: linear-gradient(143.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.80555555555555% {
      background: linear-gradient(143.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.83333333333333% {
      background: linear-gradient(143.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.86111111111111% {
      background: linear-gradient(143.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.888888888888886% {
      background: linear-gradient(143.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.916666666666664% {
      background: linear-gradient(143.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.94444444444444% {
      background: linear-gradient(143.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    39.97222222222222% {
      background: linear-gradient(143.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40% {
      background: linear-gradient(144deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.02777777777778% {
      background: linear-gradient(144.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.05555555555555% {
      background: linear-gradient(144.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.08333333333333% {
      background: linear-gradient(144.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.11111111111111% {
      background: linear-gradient(144.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.138888888888886% {
      background: linear-gradient(144.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.166666666666664% {
      background: linear-gradient(144.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.19444444444444% {
      background: linear-gradient(144.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.22222222222222% {
      background: linear-gradient(144.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.25% {
      background: linear-gradient(144.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.27777777777778% {
      background: linear-gradient(145deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.30555555555555% {
      background: linear-gradient(145.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.33333333333333% {
      background: linear-gradient(145.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.36111111111111% {
      background: linear-gradient(145.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.388888888888886% {
      background: linear-gradient(145.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.416666666666664% {
      background: linear-gradient(145.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.44444444444444% {
      background: linear-gradient(145.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.47222222222222% {
      background: linear-gradient(145.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.5% {
      background: linear-gradient(145.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.52777777777778% {
      background: linear-gradient(145.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.55555555555555% {
      background: linear-gradient(146deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.58333333333333% {
      background: linear-gradient(146.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.61111111111111% {
      background: linear-gradient(146.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.638888888888886% {
      background: linear-gradient(146.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.666666666666664% {
      background: linear-gradient(146.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.69444444444444% {
      background: linear-gradient(146.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.72222222222222% {
      background: linear-gradient(146.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.75% {
      background: linear-gradient(146.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.77777777777778% {
      background: linear-gradient(146.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.80555555555555% {
      background: linear-gradient(146.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.83333333333333% {
      background: linear-gradient(147deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.86111111111111% {
      background: linear-gradient(147.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.888888888888886% {
      background: linear-gradient(147.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.916666666666664% {
      background: linear-gradient(147.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.94444444444444% {
      background: linear-gradient(147.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    40.97222222222222% {
      background: linear-gradient(147.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41% {
      background: linear-gradient(147.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.02777777777778% {
      background: linear-gradient(147.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.05555555555555% {
      background: linear-gradient(147.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.08333333333333% {
      background: linear-gradient(147.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.11111111111111% {
      background: linear-gradient(148deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.138888888888886% {
      background: linear-gradient(148.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.166666666666664% {
      background: linear-gradient(148.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.19444444444444% {
      background: linear-gradient(148.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.22222222222222% {
      background: linear-gradient(148.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.25% {
      background: linear-gradient(148.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.27777777777778% {
      background: linear-gradient(148.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.30555555555555% {
      background: linear-gradient(148.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.33333333333333% {
      background: linear-gradient(148.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.36111111111111% {
      background: linear-gradient(148.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.388888888888886% {
      background: linear-gradient(149deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.416666666666664% {
      background: linear-gradient(149.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.44444444444444% {
      background: linear-gradient(149.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.47222222222222% {
      background: linear-gradient(149.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.5% {
      background: linear-gradient(149.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.52777777777778% {
      background: linear-gradient(149.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.55555555555555% {
      background: linear-gradient(149.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.58333333333333% {
      background: linear-gradient(149.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.61111111111111% {
      background: linear-gradient(149.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.638888888888886% {
      background: linear-gradient(149.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.666666666666664% {
      background: linear-gradient(150deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.69444444444444% {
      background: linear-gradient(150.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.72222222222222% {
      background: linear-gradient(150.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.75% {
      background: linear-gradient(150.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.77777777777778% {
      background: linear-gradient(150.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.80555555555555% {
      background: linear-gradient(150.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.83333333333333% {
      background: linear-gradient(150.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.86111111111111% {
      background: linear-gradient(150.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.888888888888886% {
      background: linear-gradient(150.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.916666666666664% {
      background: linear-gradient(150.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.94444444444444% {
      background: linear-gradient(151deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    41.97222222222222% {
      background: linear-gradient(151.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42% {
      background: linear-gradient(151.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.02777777777778% {
      background: linear-gradient(151.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.05555555555555% {
      background: linear-gradient(151.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.08333333333333% {
      background: linear-gradient(151.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.11111111111111% {
      background: linear-gradient(151.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.138888888888886% {
      background: linear-gradient(151.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.166666666666664% {
      background: linear-gradient(151.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.19444444444444% {
      background: linear-gradient(151.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.22222222222222% {
      background: linear-gradient(152deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.25% {
      background: linear-gradient(152.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.27777777777778% {
      background: linear-gradient(152.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.30555555555555% {
      background: linear-gradient(152.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.33333333333333% {
      background: linear-gradient(152.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.36111111111111% {
      background: linear-gradient(152.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.388888888888886% {
      background: linear-gradient(152.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.416666666666664% {
      background: linear-gradient(152.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.44444444444444% {
      background: linear-gradient(152.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.47222222222222% {
      background: linear-gradient(152.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.5% {
      background: linear-gradient(153deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.52777777777778% {
      background: linear-gradient(153.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.55555555555555% {
      background: linear-gradient(153.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.58333333333333% {
      background: linear-gradient(153.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.61111111111111% {
      background: linear-gradient(153.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.638888888888886% {
      background: linear-gradient(153.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.666666666666664% {
      background: linear-gradient(153.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.69444444444444% {
      background: linear-gradient(153.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.72222222222222% {
      background: linear-gradient(153.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.75% {
      background: linear-gradient(153.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.77777777777778% {
      background: linear-gradient(154deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.80555555555555% {
      background: linear-gradient(154.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.83333333333333% {
      background: linear-gradient(154.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.86111111111111% {
      background: linear-gradient(154.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.888888888888886% {
      background: linear-gradient(154.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.916666666666664% {
      background: linear-gradient(154.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.94444444444444% {
      background: linear-gradient(154.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    42.97222222222222% {
      background: linear-gradient(154.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43% {
      background: linear-gradient(154.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.02777777777778% {
      background: linear-gradient(154.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.05555555555555% {
      background: linear-gradient(155deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.08333333333333% {
      background: linear-gradient(155.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.11111111111111% {
      background: linear-gradient(155.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.138888888888886% {
      background: linear-gradient(155.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.166666666666664% {
      background: linear-gradient(155.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.19444444444444% {
      background: linear-gradient(155.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.22222222222222% {
      background: linear-gradient(155.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.25% {
      background: linear-gradient(155.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.27777777777778% {
      background: linear-gradient(155.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.30555555555555% {
      background: linear-gradient(155.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.33333333333333% {
      background: linear-gradient(156deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.36111111111111% {
      background: linear-gradient(156.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.388888888888886% {
      background: linear-gradient(156.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.416666666666664% {
      background: linear-gradient(156.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.44444444444444% {
      background: linear-gradient(156.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.47222222222222% {
      background: linear-gradient(156.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.5% {
      background: linear-gradient(156.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.52777777777778% {
      background: linear-gradient(156.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.55555555555555% {
      background: linear-gradient(156.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.58333333333333% {
      background: linear-gradient(156.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.61111111111111% {
      background: linear-gradient(157deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.638888888888886% {
      background: linear-gradient(157.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.666666666666664% {
      background: linear-gradient(157.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.69444444444444% {
      background: linear-gradient(157.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.72222222222222% {
      background: linear-gradient(157.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.75% {
      background: linear-gradient(157.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.77777777777778% {
      background: linear-gradient(157.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.80555555555555% {
      background: linear-gradient(157.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.83333333333333% {
      background: linear-gradient(157.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.86111111111111% {
      background: linear-gradient(157.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.888888888888886% {
      background: linear-gradient(158deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.916666666666664% {
      background: linear-gradient(158.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.94444444444444% {
      background: linear-gradient(158.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    43.97222222222222% {
      background: linear-gradient(158.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44% {
      background: linear-gradient(158.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.02777777777778% {
      background: linear-gradient(158.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.05555555555555% {
      background: linear-gradient(158.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.08333333333333% {
      background: linear-gradient(158.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.11111111111111% {
      background: linear-gradient(158.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.138888888888886% {
      background: linear-gradient(158.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.166666666666664% {
      background: linear-gradient(159deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.19444444444444% {
      background: linear-gradient(159.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.22222222222222% {
      background: linear-gradient(159.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.25% {
      background: linear-gradient(159.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.27777777777778% {
      background: linear-gradient(159.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.30555555555555% {
      background: linear-gradient(159.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.33333333333333% {
      background: linear-gradient(159.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.36111111111111% {
      background: linear-gradient(159.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.388888888888886% {
      background: linear-gradient(159.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.416666666666664% {
      background: linear-gradient(159.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.44444444444444% {
      background: linear-gradient(160deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.47222222222222% {
      background: linear-gradient(160.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.5% {
      background: linear-gradient(160.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.52777777777778% {
      background: linear-gradient(160.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.55555555555555% {
      background: linear-gradient(160.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.58333333333333% {
      background: linear-gradient(160.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.61111111111111% {
      background: linear-gradient(160.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.638888888888886% {
      background: linear-gradient(160.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.666666666666664% {
      background: linear-gradient(160.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.69444444444444% {
      background: linear-gradient(160.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.72222222222222% {
      background: linear-gradient(161deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.75% {
      background: linear-gradient(161.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.77777777777778% {
      background: linear-gradient(161.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.80555555555555% {
      background: linear-gradient(161.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.83333333333333% {
      background: linear-gradient(161.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.86111111111111% {
      background: linear-gradient(161.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.888888888888886% {
      background: linear-gradient(161.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.916666666666664% {
      background: linear-gradient(161.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.94444444444444% {
      background: linear-gradient(161.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    44.97222222222222% {
      background: linear-gradient(161.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45% {
      background: linear-gradient(162deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.02777777777778% {
      background: linear-gradient(162.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.05555555555555% {
      background: linear-gradient(162.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.08333333333333% {
      background: linear-gradient(162.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.11111111111111% {
      background: linear-gradient(162.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.138888888888886% {
      background: linear-gradient(162.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.166666666666664% {
      background: linear-gradient(162.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.19444444444444% {
      background: linear-gradient(162.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.22222222222222% {
      background: linear-gradient(162.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.25% {
      background: linear-gradient(162.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.27777777777778% {
      background: linear-gradient(163deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.30555555555555% {
      background: linear-gradient(163.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.33333333333333% {
      background: linear-gradient(163.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.36111111111111% {
      background: linear-gradient(163.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.388888888888886% {
      background: linear-gradient(163.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.416666666666664% {
      background: linear-gradient(163.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.44444444444444% {
      background: linear-gradient(163.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.47222222222222% {
      background: linear-gradient(163.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.5% {
      background: linear-gradient(163.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.52777777777778% {
      background: linear-gradient(163.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.55555555555555% {
      background: linear-gradient(164deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.58333333333333% {
      background: linear-gradient(164.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.61111111111111% {
      background: linear-gradient(164.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.638888888888886% {
      background: linear-gradient(164.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.666666666666664% {
      background: linear-gradient(164.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.69444444444444% {
      background: linear-gradient(164.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.72222222222222% {
      background: linear-gradient(164.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.75% {
      background: linear-gradient(164.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.77777777777778% {
      background: linear-gradient(164.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.80555555555555% {
      background: linear-gradient(164.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.83333333333333% {
      background: linear-gradient(165deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.86111111111111% {
      background: linear-gradient(165.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.888888888888886% {
      background: linear-gradient(165.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.916666666666664% {
      background: linear-gradient(165.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.94444444444444% {
      background: linear-gradient(165.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    45.97222222222222% {
      background: linear-gradient(165.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46% {
      background: linear-gradient(165.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.02777777777778% {
      background: linear-gradient(165.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.05555555555555% {
      background: linear-gradient(165.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.08333333333333% {
      background: linear-gradient(165.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.11111111111111% {
      background: linear-gradient(166deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.138888888888886% {
      background: linear-gradient(166.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.166666666666664% {
      background: linear-gradient(166.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.19444444444444% {
      background: linear-gradient(166.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.22222222222222% {
      background: linear-gradient(166.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.25% {
      background: linear-gradient(166.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.27777777777778% {
      background: linear-gradient(166.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.30555555555555% {
      background: linear-gradient(166.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.33333333333333% {
      background: linear-gradient(166.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.36111111111111% {
      background: linear-gradient(166.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.388888888888886% {
      background: linear-gradient(167deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.416666666666664% {
      background: linear-gradient(167.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.44444444444444% {
      background: linear-gradient(167.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.47222222222222% {
      background: linear-gradient(167.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.5% {
      background: linear-gradient(167.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.52777777777778% {
      background: linear-gradient(167.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.55555555555555% {
      background: linear-gradient(167.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.58333333333333% {
      background: linear-gradient(167.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.61111111111111% {
      background: linear-gradient(167.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.638888888888886% {
      background: linear-gradient(167.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.666666666666664% {
      background: linear-gradient(168deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.69444444444444% {
      background: linear-gradient(168.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.72222222222222% {
      background: linear-gradient(168.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.75% {
      background: linear-gradient(168.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.77777777777778% {
      background: linear-gradient(168.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.80555555555555% {
      background: linear-gradient(168.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.83333333333333% {
      background: linear-gradient(168.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.86111111111111% {
      background: linear-gradient(168.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.888888888888886% {
      background: linear-gradient(168.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.916666666666664% {
      background: linear-gradient(168.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.94444444444444% {
      background: linear-gradient(169deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    46.97222222222222% {
      background: linear-gradient(169.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47% {
      background: linear-gradient(169.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.02777777777778% {
      background: linear-gradient(169.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.05555555555555% {
      background: linear-gradient(169.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.08333333333333% {
      background: linear-gradient(169.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.11111111111111% {
      background: linear-gradient(169.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.138888888888886% {
      background: linear-gradient(169.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.166666666666664% {
      background: linear-gradient(169.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.19444444444444% {
      background: linear-gradient(169.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.22222222222222% {
      background: linear-gradient(170deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.25% {
      background: linear-gradient(170.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.27777777777778% {
      background: linear-gradient(170.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.30555555555555% {
      background: linear-gradient(170.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.33333333333333% {
      background: linear-gradient(170.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.36111111111111% {
      background: linear-gradient(170.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.388888888888886% {
      background: linear-gradient(170.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.416666666666664% {
      background: linear-gradient(170.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.44444444444444% {
      background: linear-gradient(170.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.47222222222222% {
      background: linear-gradient(170.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.5% {
      background: linear-gradient(171deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.52777777777778% {
      background: linear-gradient(171.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.55555555555555% {
      background: linear-gradient(171.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.58333333333333% {
      background: linear-gradient(171.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.61111111111111% {
      background: linear-gradient(171.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.638888888888886% {
      background: linear-gradient(171.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.666666666666664% {
      background: linear-gradient(171.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.69444444444444% {
      background: linear-gradient(171.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.72222222222222% {
      background: linear-gradient(171.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.75% {
      background: linear-gradient(171.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.77777777777778% {
      background: linear-gradient(172deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.80555555555555% {
      background: linear-gradient(172.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.83333333333333% {
      background: linear-gradient(172.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.86111111111111% {
      background: linear-gradient(172.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.888888888888886% {
      background: linear-gradient(172.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.916666666666664% {
      background: linear-gradient(172.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.94444444444444% {
      background: linear-gradient(172.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    47.97222222222222% {
      background: linear-gradient(172.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48% {
      background: linear-gradient(172.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.02777777777778% {
      background: linear-gradient(172.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.05555555555555% {
      background: linear-gradient(173deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.08333333333333% {
      background: linear-gradient(173.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.11111111111111% {
      background: linear-gradient(173.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.138888888888886% {
      background: linear-gradient(173.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.166666666666664% {
      background: linear-gradient(173.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.19444444444444% {
      background: linear-gradient(173.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.22222222222222% {
      background: linear-gradient(173.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.25% {
      background: linear-gradient(173.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.27777777777778% {
      background: linear-gradient(173.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.30555555555555% {
      background: linear-gradient(173.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.33333333333333% {
      background: linear-gradient(174deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.36111111111111% {
      background: linear-gradient(174.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.388888888888886% {
      background: linear-gradient(174.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.416666666666664% {
      background: linear-gradient(174.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.44444444444444% {
      background: linear-gradient(174.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.47222222222222% {
      background: linear-gradient(174.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.5% {
      background: linear-gradient(174.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.52777777777778% {
      background: linear-gradient(174.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.55555555555555% {
      background: linear-gradient(174.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.58333333333333% {
      background: linear-gradient(174.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.61111111111111% {
      background: linear-gradient(175deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.638888888888886% {
      background: linear-gradient(175.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.666666666666664% {
      background: linear-gradient(175.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.69444444444444% {
      background: linear-gradient(175.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.72222222222222% {
      background: linear-gradient(175.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.75% {
      background: linear-gradient(175.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.77777777777778% {
      background: linear-gradient(175.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.80555555555555% {
      background: linear-gradient(175.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.83333333333333% {
      background: linear-gradient(175.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.86111111111111% {
      background: linear-gradient(175.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.888888888888886% {
      background: linear-gradient(176deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.916666666666664% {
      background: linear-gradient(176.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.94444444444444% {
      background: linear-gradient(176.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    48.97222222222222% {
      background: linear-gradient(176.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49% {
      background: linear-gradient(176.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.02777777777778% {
      background: linear-gradient(176.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.05555555555555% {
      background: linear-gradient(176.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.08333333333333% {
      background: linear-gradient(176.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.11111111111111% {
      background: linear-gradient(176.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.138888888888886% {
      background: linear-gradient(176.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.166666666666664% {
      background: linear-gradient(177deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.19444444444444% {
      background: linear-gradient(177.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.22222222222222% {
      background: linear-gradient(177.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.25% {
      background: linear-gradient(177.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.27777777777778% {
      background: linear-gradient(177.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.30555555555555% {
      background: linear-gradient(177.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.33333333333333% {
      background: linear-gradient(177.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.36111111111111% {
      background: linear-gradient(177.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.388888888888886% {
      background: linear-gradient(177.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.416666666666664% {
      background: linear-gradient(177.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.44444444444444% {
      background: linear-gradient(178deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.47222222222222% {
      background: linear-gradient(178.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.5% {
      background: linear-gradient(178.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.52777777777778% {
      background: linear-gradient(178.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.55555555555555% {
      background: linear-gradient(178.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.58333333333333% {
      background: linear-gradient(178.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.61111111111111% {
      background: linear-gradient(178.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.638888888888886% {
      background: linear-gradient(178.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.666666666666664% {
      background: linear-gradient(178.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.69444444444444% {
      background: linear-gradient(178.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.72222222222222% {
      background: linear-gradient(179deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.75% {
      background: linear-gradient(179.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.77777777777777% {
      background: linear-gradient(179.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.80555555555555% {
      background: linear-gradient(179.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.83333333333333% {
      background: linear-gradient(179.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.86111111111111% {
      background: linear-gradient(179.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.888888888888886% {
      background: linear-gradient(179.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.916666666666664% {
      background: linear-gradient(179.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.94444444444444% {
      background: linear-gradient(179.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    49.97222222222222% {
      background: linear-gradient(179.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50% {
      background: linear-gradient(180deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.02777777777777% {
      background: linear-gradient(180.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.05555555555555% {
      background: linear-gradient(180.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.08333333333333% {
      background: linear-gradient(180.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.11111111111111% {
      background: linear-gradient(180.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.138888888888886% {
      background: linear-gradient(180.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.166666666666664% {
      background: linear-gradient(180.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.19444444444444% {
      background: linear-gradient(180.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.22222222222222% {
      background: linear-gradient(180.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.25% {
      background: linear-gradient(180.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.27777777777777% {
      background: linear-gradient(181deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.30555555555555% {
      background: linear-gradient(181.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.33333333333333% {
      background: linear-gradient(181.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.36111111111111% {
      background: linear-gradient(181.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.388888888888886% {
      background: linear-gradient(181.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.416666666666664% {
      background: linear-gradient(181.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.44444444444444% {
      background: linear-gradient(181.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.47222222222222% {
      background: linear-gradient(181.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.5% {
      background: linear-gradient(181.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.52777777777777% {
      background: linear-gradient(181.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.55555555555555% {
      background: linear-gradient(182deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.58333333333333% {
      background: linear-gradient(182.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.61111111111111% {
      background: linear-gradient(182.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.638888888888886% {
      background: linear-gradient(182.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.666666666666664% {
      background: linear-gradient(182.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.69444444444444% {
      background: linear-gradient(182.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.72222222222222% {
      background: linear-gradient(182.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.75% {
      background: linear-gradient(182.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.77777777777777% {
      background: linear-gradient(182.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.80555555555555% {
      background: linear-gradient(182.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.83333333333333% {
      background: linear-gradient(183deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.86111111111111% {
      background: linear-gradient(183.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.888888888888886% {
      background: linear-gradient(183.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.916666666666664% {
      background: linear-gradient(183.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.94444444444444% {
      background: linear-gradient(183.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    50.97222222222222% {
      background: linear-gradient(183.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51% {
      background: linear-gradient(183.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.02777777777777% {
      background: linear-gradient(183.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.05555555555555% {
      background: linear-gradient(183.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.08333333333333% {
      background: linear-gradient(183.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.11111111111111% {
      background: linear-gradient(184deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.138888888888886% {
      background: linear-gradient(184.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.166666666666664% {
      background: linear-gradient(184.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.19444444444444% {
      background: linear-gradient(184.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.22222222222222% {
      background: linear-gradient(184.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.25% {
      background: linear-gradient(184.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.27777777777777% {
      background: linear-gradient(184.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.30555555555555% {
      background: linear-gradient(184.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.33333333333333% {
      background: linear-gradient(184.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.36111111111111% {
      background: linear-gradient(184.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.388888888888886% {
      background: linear-gradient(185deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.416666666666664% {
      background: linear-gradient(185.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.44444444444444% {
      background: linear-gradient(185.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.47222222222222% {
      background: linear-gradient(185.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.5% {
      background: linear-gradient(185.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.52777777777777% {
      background: linear-gradient(185.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.55555555555555% {
      background: linear-gradient(185.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.58333333333333% {
      background: linear-gradient(185.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.61111111111111% {
      background: linear-gradient(185.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.638888888888886% {
      background: linear-gradient(185.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.666666666666664% {
      background: linear-gradient(186deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.69444444444444% {
      background: linear-gradient(186.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.72222222222222% {
      background: linear-gradient(186.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.75% {
      background: linear-gradient(186.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.77777777777777% {
      background: linear-gradient(186.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.80555555555555% {
      background: linear-gradient(186.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.83333333333333% {
      background: linear-gradient(186.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.86111111111111% {
      background: linear-gradient(186.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.888888888888886% {
      background: linear-gradient(186.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.916666666666664% {
      background: linear-gradient(186.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.94444444444444% {
      background: linear-gradient(187deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    51.97222222222222% {
      background: linear-gradient(187.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52% {
      background: linear-gradient(187.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.02777777777777% {
      background: linear-gradient(187.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.05555555555555% {
      background: linear-gradient(187.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.08333333333333% {
      background: linear-gradient(187.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.11111111111111% {
      background: linear-gradient(187.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.138888888888886% {
      background: linear-gradient(187.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.166666666666664% {
      background: linear-gradient(187.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.19444444444444% {
      background: linear-gradient(187.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.22222222222222% {
      background: linear-gradient(188deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.25% {
      background: linear-gradient(188.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.27777777777777% {
      background: linear-gradient(188.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.30555555555555% {
      background: linear-gradient(188.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.33333333333333% {
      background: linear-gradient(188.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.36111111111111% {
      background: linear-gradient(188.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.388888888888886% {
      background: linear-gradient(188.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.416666666666664% {
      background: linear-gradient(188.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.44444444444444% {
      background: linear-gradient(188.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.47222222222222% {
      background: linear-gradient(188.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.5% {
      background: linear-gradient(189deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.52777777777777% {
      background: linear-gradient(189.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.55555555555555% {
      background: linear-gradient(189.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.58333333333333% {
      background: linear-gradient(189.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.61111111111111% {
      background: linear-gradient(189.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.638888888888886% {
      background: linear-gradient(189.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.666666666666664% {
      background: linear-gradient(189.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.69444444444444% {
      background: linear-gradient(189.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.72222222222222% {
      background: linear-gradient(189.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.75% {
      background: linear-gradient(189.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.77777777777777% {
      background: linear-gradient(190deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.80555555555555% {
      background: linear-gradient(190.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.83333333333333% {
      background: linear-gradient(190.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.86111111111111% {
      background: linear-gradient(190.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.888888888888886% {
      background: linear-gradient(190.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.916666666666664% {
      background: linear-gradient(190.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.94444444444444% {
      background: linear-gradient(190.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    52.97222222222222% {
      background: linear-gradient(190.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53% {
      background: linear-gradient(190.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.02777777777777% {
      background: linear-gradient(190.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.05555555555555% {
      background: linear-gradient(191deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.08333333333333% {
      background: linear-gradient(191.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.11111111111111% {
      background: linear-gradient(191.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.138888888888886% {
      background: linear-gradient(191.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.166666666666664% {
      background: linear-gradient(191.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.19444444444444% {
      background: linear-gradient(191.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.22222222222222% {
      background: linear-gradient(191.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.25% {
      background: linear-gradient(191.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.27777777777777% {
      background: linear-gradient(191.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.30555555555555% {
      background: linear-gradient(191.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.33333333333333% {
      background: linear-gradient(192deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.36111111111111% {
      background: linear-gradient(192.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.388888888888886% {
      background: linear-gradient(192.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.416666666666664% {
      background: linear-gradient(192.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.44444444444444% {
      background: linear-gradient(192.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.47222222222222% {
      background: linear-gradient(192.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.5% {
      background: linear-gradient(192.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.52777777777777% {
      background: linear-gradient(192.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.55555555555555% {
      background: linear-gradient(192.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.58333333333333% {
      background: linear-gradient(192.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.61111111111111% {
      background: linear-gradient(193deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.638888888888886% {
      background: linear-gradient(193.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.666666666666664% {
      background: linear-gradient(193.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.69444444444444% {
      background: linear-gradient(193.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.72222222222222% {
      background: linear-gradient(193.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.75% {
      background: linear-gradient(193.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.77777777777777% {
      background: linear-gradient(193.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.80555555555555% {
      background: linear-gradient(193.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.83333333333333% {
      background: linear-gradient(193.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.86111111111111% {
      background: linear-gradient(193.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.888888888888886% {
      background: linear-gradient(194deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.916666666666664% {
      background: linear-gradient(194.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.94444444444444% {
      background: linear-gradient(194.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    53.97222222222222% {
      background: linear-gradient(194.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54% {
      background: linear-gradient(194.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.02777777777777% {
      background: linear-gradient(194.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.05555555555555% {
      background: linear-gradient(194.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.08333333333333% {
      background: linear-gradient(194.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.11111111111111% {
      background: linear-gradient(194.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.138888888888886% {
      background: linear-gradient(194.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.166666666666664% {
      background: linear-gradient(195deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.19444444444444% {
      background: linear-gradient(195.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.22222222222222% {
      background: linear-gradient(195.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.25% {
      background: linear-gradient(195.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.27777777777777% {
      background: linear-gradient(195.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.30555555555555% {
      background: linear-gradient(195.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.33333333333333% {
      background: linear-gradient(195.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.36111111111111% {
      background: linear-gradient(195.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.388888888888886% {
      background: linear-gradient(195.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.416666666666664% {
      background: linear-gradient(195.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.44444444444444% {
      background: linear-gradient(196deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.47222222222222% {
      background: linear-gradient(196.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.5% {
      background: linear-gradient(196.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.52777777777777% {
      background: linear-gradient(196.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.55555555555555% {
      background: linear-gradient(196.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.58333333333333% {
      background: linear-gradient(196.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.61111111111111% {
      background: linear-gradient(196.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.638888888888886% {
      background: linear-gradient(196.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.666666666666664% {
      background: linear-gradient(196.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.69444444444444% {
      background: linear-gradient(196.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.72222222222222% {
      background: linear-gradient(197deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.75% {
      background: linear-gradient(197.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.77777777777777% {
      background: linear-gradient(197.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.80555555555555% {
      background: linear-gradient(197.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.83333333333333% {
      background: linear-gradient(197.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.86111111111111% {
      background: linear-gradient(197.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.888888888888886% {
      background: linear-gradient(197.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.916666666666664% {
      background: linear-gradient(197.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.94444444444444% {
      background: linear-gradient(197.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    54.97222222222222% {
      background: linear-gradient(197.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55% {
      background: linear-gradient(198deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.02777777777777% {
      background: linear-gradient(198.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.05555555555555% {
      background: linear-gradient(198.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.08333333333333% {
      background: linear-gradient(198.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.11111111111111% {
      background: linear-gradient(198.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.138888888888886% {
      background: linear-gradient(198.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.166666666666664% {
      background: linear-gradient(198.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.19444444444444% {
      background: linear-gradient(198.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.22222222222222% {
      background: linear-gradient(198.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.25% {
      background: linear-gradient(198.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.27777777777777% {
      background: linear-gradient(199deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.30555555555555% {
      background: linear-gradient(199.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.33333333333333% {
      background: linear-gradient(199.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.36111111111111% {
      background: linear-gradient(199.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.388888888888886% {
      background: linear-gradient(199.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.416666666666664% {
      background: linear-gradient(199.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.44444444444444% {
      background: linear-gradient(199.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.47222222222222% {
      background: linear-gradient(199.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.5% {
      background: linear-gradient(199.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.52777777777777% {
      background: linear-gradient(199.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.55555555555555% {
      background: linear-gradient(200deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.58333333333333% {
      background: linear-gradient(200.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.61111111111111% {
      background: linear-gradient(200.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.638888888888886% {
      background: linear-gradient(200.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.666666666666664% {
      background: linear-gradient(200.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.69444444444444% {
      background: linear-gradient(200.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.72222222222222% {
      background: linear-gradient(200.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.75% {
      background: linear-gradient(200.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.77777777777777% {
      background: linear-gradient(200.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.80555555555555% {
      background: linear-gradient(200.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.83333333333333% {
      background: linear-gradient(201deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.86111111111111% {
      background: linear-gradient(201.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.888888888888886% {
      background: linear-gradient(201.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.916666666666664% {
      background: linear-gradient(201.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.94444444444444% {
      background: linear-gradient(201.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    55.97222222222222% {
      background: linear-gradient(201.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56% {
      background: linear-gradient(201.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.02777777777777% {
      background: linear-gradient(201.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.05555555555555% {
      background: linear-gradient(201.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.08333333333333% {
      background: linear-gradient(201.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.11111111111111% {
      background: linear-gradient(202deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.138888888888886% {
      background: linear-gradient(202.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.166666666666664% {
      background: linear-gradient(202.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.19444444444444% {
      background: linear-gradient(202.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.22222222222222% {
      background: linear-gradient(202.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.25% {
      background: linear-gradient(202.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.27777777777777% {
      background: linear-gradient(202.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.30555555555555% {
      background: linear-gradient(202.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.33333333333333% {
      background: linear-gradient(202.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.36111111111111% {
      background: linear-gradient(202.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.388888888888886% {
      background: linear-gradient(203deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.416666666666664% {
      background: linear-gradient(203.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.44444444444444% {
      background: linear-gradient(203.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.47222222222222% {
      background: linear-gradient(203.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.5% {
      background: linear-gradient(203.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.52777777777777% {
      background: linear-gradient(203.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.55555555555555% {
      background: linear-gradient(203.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.58333333333333% {
      background: linear-gradient(203.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.61111111111111% {
      background: linear-gradient(203.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.638888888888886% {
      background: linear-gradient(203.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.666666666666664% {
      background: linear-gradient(204deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.69444444444444% {
      background: linear-gradient(204.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.72222222222222% {
      background: linear-gradient(204.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.75% {
      background: linear-gradient(204.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.77777777777777% {
      background: linear-gradient(204.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.80555555555555% {
      background: linear-gradient(204.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.83333333333333% {
      background: linear-gradient(204.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.86111111111111% {
      background: linear-gradient(204.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.888888888888886% {
      background: linear-gradient(204.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.916666666666664% {
      background: linear-gradient(204.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.94444444444444% {
      background: linear-gradient(205deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    56.97222222222222% {
      background: linear-gradient(205.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57% {
      background: linear-gradient(205.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.02777777777777% {
      background: linear-gradient(205.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.05555555555555% {
      background: linear-gradient(205.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.08333333333333% {
      background: linear-gradient(205.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.11111111111111% {
      background: linear-gradient(205.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.138888888888886% {
      background: linear-gradient(205.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.166666666666664% {
      background: linear-gradient(205.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.19444444444444% {
      background: linear-gradient(205.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.22222222222222% {
      background: linear-gradient(206deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.25% {
      background: linear-gradient(206.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.27777777777777% {
      background: linear-gradient(206.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.30555555555555% {
      background: linear-gradient(206.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.33333333333333% {
      background: linear-gradient(206.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.36111111111111% {
      background: linear-gradient(206.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.388888888888886% {
      background: linear-gradient(206.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.416666666666664% {
      background: linear-gradient(206.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.44444444444444% {
      background: linear-gradient(206.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.47222222222222% {
      background: linear-gradient(206.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.5% {
      background: linear-gradient(207deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.52777777777777% {
      background: linear-gradient(207.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.55555555555555% {
      background: linear-gradient(207.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.58333333333333% {
      background: linear-gradient(207.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.61111111111111% {
      background: linear-gradient(207.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.638888888888886% {
      background: linear-gradient(207.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.666666666666664% {
      background: linear-gradient(207.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.69444444444444% {
      background: linear-gradient(207.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.72222222222222% {
      background: linear-gradient(207.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.75% {
      background: linear-gradient(207.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.77777777777777% {
      background: linear-gradient(208deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.80555555555555% {
      background: linear-gradient(208.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.83333333333333% {
      background: linear-gradient(208.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.86111111111111% {
      background: linear-gradient(208.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.888888888888886% {
      background: linear-gradient(208.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.916666666666664% {
      background: linear-gradient(208.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.94444444444444% {
      background: linear-gradient(208.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    57.97222222222222% {
      background: linear-gradient(208.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58% {
      background: linear-gradient(208.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.02777777777777% {
      background: linear-gradient(208.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.05555555555555% {
      background: linear-gradient(209deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.08333333333333% {
      background: linear-gradient(209.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.11111111111111% {
      background: linear-gradient(209.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.138888888888886% {
      background: linear-gradient(209.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.166666666666664% {
      background: linear-gradient(209.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.19444444444444% {
      background: linear-gradient(209.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.22222222222222% {
      background: linear-gradient(209.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.25% {
      background: linear-gradient(209.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.27777777777777% {
      background: linear-gradient(209.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.30555555555555% {
      background: linear-gradient(209.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.33333333333333% {
      background: linear-gradient(210deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.36111111111111% {
      background: linear-gradient(210.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.388888888888886% {
      background: linear-gradient(210.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.416666666666664% {
      background: linear-gradient(210.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.44444444444444% {
      background: linear-gradient(210.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.47222222222222% {
      background: linear-gradient(210.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.5% {
      background: linear-gradient(210.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.52777777777777% {
      background: linear-gradient(210.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.55555555555555% {
      background: linear-gradient(210.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.58333333333333% {
      background: linear-gradient(210.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.61111111111111% {
      background: linear-gradient(211deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.638888888888886% {
      background: linear-gradient(211.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.666666666666664% {
      background: linear-gradient(211.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.69444444444444% {
      background: linear-gradient(211.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.72222222222222% {
      background: linear-gradient(211.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.75% {
      background: linear-gradient(211.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.77777777777777% {
      background: linear-gradient(211.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.80555555555555% {
      background: linear-gradient(211.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.83333333333333% {
      background: linear-gradient(211.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.86111111111111% {
      background: linear-gradient(211.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.888888888888886% {
      background: linear-gradient(212deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.916666666666664% {
      background: linear-gradient(212.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.94444444444444% {
      background: linear-gradient(212.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    58.97222222222222% {
      background: linear-gradient(212.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59% {
      background: linear-gradient(212.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.02777777777777% {
      background: linear-gradient(212.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.05555555555555% {
      background: linear-gradient(212.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.08333333333333% {
      background: linear-gradient(212.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.11111111111111% {
      background: linear-gradient(212.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.138888888888886% {
      background: linear-gradient(212.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.166666666666664% {
      background: linear-gradient(213deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.19444444444444% {
      background: linear-gradient(213.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.22222222222222% {
      background: linear-gradient(213.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.25% {
      background: linear-gradient(213.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.27777777777777% {
      background: linear-gradient(213.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.30555555555555% {
      background: linear-gradient(213.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.33333333333333% {
      background: linear-gradient(213.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.36111111111111% {
      background: linear-gradient(213.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.388888888888886% {
      background: linear-gradient(213.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.416666666666664% {
      background: linear-gradient(213.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.44444444444444% {
      background: linear-gradient(214deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.47222222222222% {
      background: linear-gradient(214.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.5% {
      background: linear-gradient(214.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.52777777777777% {
      background: linear-gradient(214.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.55555555555555% {
      background: linear-gradient(214.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.58333333333333% {
      background: linear-gradient(214.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.61111111111111% {
      background: linear-gradient(214.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.638888888888886% {
      background: linear-gradient(214.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.666666666666664% {
      background: linear-gradient(214.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.69444444444444% {
      background: linear-gradient(214.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.72222222222222% {
      background: linear-gradient(215deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.75% {
      background: linear-gradient(215.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.77777777777777% {
      background: linear-gradient(215.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.80555555555555% {
      background: linear-gradient(215.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.83333333333333% {
      background: linear-gradient(215.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.86111111111111% {
      background: linear-gradient(215.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.888888888888886% {
      background: linear-gradient(215.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.916666666666664% {
      background: linear-gradient(215.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.94444444444444% {
      background: linear-gradient(215.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    59.97222222222222% {
      background: linear-gradient(215.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60% {
      background: linear-gradient(216deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.02777777777777% {
      background: linear-gradient(216.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.05555555555555% {
      background: linear-gradient(216.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.08333333333333% {
      background: linear-gradient(216.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.11111111111111% {
      background: linear-gradient(216.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.138888888888886% {
      background: linear-gradient(216.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.166666666666664% {
      background: linear-gradient(216.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.19444444444444% {
      background: linear-gradient(216.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.22222222222222% {
      background: linear-gradient(216.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.25% {
      background: linear-gradient(216.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.27777777777777% {
      background: linear-gradient(217deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.30555555555555% {
      background: linear-gradient(217.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.33333333333333% {
      background: linear-gradient(217.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.36111111111111% {
      background: linear-gradient(217.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.388888888888886% {
      background: linear-gradient(217.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.416666666666664% {
      background: linear-gradient(217.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.44444444444444% {
      background: linear-gradient(217.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.47222222222222% {
      background: linear-gradient(217.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.5% {
      background: linear-gradient(217.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.52777777777777% {
      background: linear-gradient(217.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.55555555555555% {
      background: linear-gradient(218deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.58333333333333% {
      background: linear-gradient(218.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.61111111111111% {
      background: linear-gradient(218.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.638888888888886% {
      background: linear-gradient(218.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.666666666666664% {
      background: linear-gradient(218.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.69444444444444% {
      background: linear-gradient(218.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.72222222222222% {
      background: linear-gradient(218.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.75% {
      background: linear-gradient(218.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.77777777777777% {
      background: linear-gradient(218.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.80555555555555% {
      background: linear-gradient(218.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.83333333333333% {
      background: linear-gradient(219deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.86111111111111% {
      background: linear-gradient(219.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.888888888888886% {
      background: linear-gradient(219.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.916666666666664% {
      background: linear-gradient(219.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.94444444444444% {
      background: linear-gradient(219.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    60.97222222222222% {
      background: linear-gradient(219.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61% {
      background: linear-gradient(219.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.02777777777777% {
      background: linear-gradient(219.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.05555555555555% {
      background: linear-gradient(219.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.08333333333333% {
      background: linear-gradient(219.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.11111111111111% {
      background: linear-gradient(220deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.138888888888886% {
      background: linear-gradient(220.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.166666666666664% {
      background: linear-gradient(220.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.19444444444444% {
      background: linear-gradient(220.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.22222222222222% {
      background: linear-gradient(220.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.25% {
      background: linear-gradient(220.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.27777777777777% {
      background: linear-gradient(220.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.30555555555555% {
      background: linear-gradient(220.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.33333333333333% {
      background: linear-gradient(220.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.36111111111111% {
      background: linear-gradient(220.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.388888888888886% {
      background: linear-gradient(221deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.416666666666664% {
      background: linear-gradient(221.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.44444444444444% {
      background: linear-gradient(221.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.47222222222222% {
      background: linear-gradient(221.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.5% {
      background: linear-gradient(221.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.52777777777777% {
      background: linear-gradient(221.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.55555555555555% {
      background: linear-gradient(221.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.58333333333333% {
      background: linear-gradient(221.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.61111111111111% {
      background: linear-gradient(221.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.638888888888886% {
      background: linear-gradient(221.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.666666666666664% {
      background: linear-gradient(222deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.69444444444444% {
      background: linear-gradient(222.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.72222222222222% {
      background: linear-gradient(222.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.75% {
      background: linear-gradient(222.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.77777777777777% {
      background: linear-gradient(222.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.80555555555555% {
      background: linear-gradient(222.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.83333333333333% {
      background: linear-gradient(222.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.86111111111111% {
      background: linear-gradient(222.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.888888888888886% {
      background: linear-gradient(222.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.916666666666664% {
      background: linear-gradient(222.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.94444444444444% {
      background: linear-gradient(223deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    61.97222222222222% {
      background: linear-gradient(223.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62% {
      background: linear-gradient(223.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.02777777777777% {
      background: linear-gradient(223.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.05555555555555% {
      background: linear-gradient(223.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.08333333333333% {
      background: linear-gradient(223.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.11111111111111% {
      background: linear-gradient(223.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.138888888888886% {
      background: linear-gradient(223.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.166666666666664% {
      background: linear-gradient(223.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.19444444444444% {
      background: linear-gradient(223.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.22222222222222% {
      background: linear-gradient(224deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.25% {
      background: linear-gradient(224.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.27777777777777% {
      background: linear-gradient(224.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.30555555555555% {
      background: linear-gradient(224.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.33333333333333% {
      background: linear-gradient(224.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.36111111111111% {
      background: linear-gradient(224.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.388888888888886% {
      background: linear-gradient(224.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.416666666666664% {
      background: linear-gradient(224.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.44444444444444% {
      background: linear-gradient(224.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.47222222222222% {
      background: linear-gradient(224.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.5% {
      background: linear-gradient(225deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.52777777777777% {
      background: linear-gradient(225.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.55555555555555% {
      background: linear-gradient(225.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.58333333333333% {
      background: linear-gradient(225.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.61111111111111% {
      background: linear-gradient(225.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.638888888888886% {
      background: linear-gradient(225.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.666666666666664% {
      background: linear-gradient(225.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.69444444444444% {
      background: linear-gradient(225.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.72222222222222% {
      background: linear-gradient(225.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.75% {
      background: linear-gradient(225.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.77777777777777% {
      background: linear-gradient(226deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.80555555555555% {
      background: linear-gradient(226.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.83333333333333% {
      background: linear-gradient(226.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.86111111111111% {
      background: linear-gradient(226.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.888888888888886% {
      background: linear-gradient(226.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.916666666666664% {
      background: linear-gradient(226.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.94444444444444% {
      background: linear-gradient(226.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    62.97222222222222% {
      background: linear-gradient(226.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63% {
      background: linear-gradient(226.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.02777777777777% {
      background: linear-gradient(226.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.05555555555555% {
      background: linear-gradient(227deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.08333333333333% {
      background: linear-gradient(227.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.11111111111111% {
      background: linear-gradient(227.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.138888888888886% {
      background: linear-gradient(227.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.166666666666664% {
      background: linear-gradient(227.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.19444444444444% {
      background: linear-gradient(227.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.22222222222222% {
      background: linear-gradient(227.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.25% {
      background: linear-gradient(227.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.27777777777777% {
      background: linear-gradient(227.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.30555555555555% {
      background: linear-gradient(227.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.33333333333333% {
      background: linear-gradient(228deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.36111111111111% {
      background: linear-gradient(228.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.388888888888886% {
      background: linear-gradient(228.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.416666666666664% {
      background: linear-gradient(228.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.44444444444444% {
      background: linear-gradient(228.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.47222222222222% {
      background: linear-gradient(228.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.5% {
      background: linear-gradient(228.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.52777777777777% {
      background: linear-gradient(228.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.55555555555555% {
      background: linear-gradient(228.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.58333333333333% {
      background: linear-gradient(228.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.61111111111111% {
      background: linear-gradient(229deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.638888888888886% {
      background: linear-gradient(229.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.666666666666664% {
      background: linear-gradient(229.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.69444444444444% {
      background: linear-gradient(229.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.72222222222222% {
      background: linear-gradient(229.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.75% {
      background: linear-gradient(229.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.77777777777777% {
      background: linear-gradient(229.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.80555555555555% {
      background: linear-gradient(229.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.83333333333333% {
      background: linear-gradient(229.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.86111111111111% {
      background: linear-gradient(229.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.888888888888886% {
      background: linear-gradient(230deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.916666666666664% {
      background: linear-gradient(230.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.94444444444444% {
      background: linear-gradient(230.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    63.97222222222222% {
      background: linear-gradient(230.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64% {
      background: linear-gradient(230.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.02777777777777% {
      background: linear-gradient(230.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.05555555555556% {
      background: linear-gradient(230.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.08333333333333% {
      background: linear-gradient(230.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.11111111111111% {
      background: linear-gradient(230.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.13888888888889% {
      background: linear-gradient(230.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.16666666666666% {
      background: linear-gradient(231deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.19444444444444% {
      background: linear-gradient(231.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.22222222222221% {
      background: linear-gradient(231.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.25% {
      background: linear-gradient(231.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.27777777777777% {
      background: linear-gradient(231.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.30555555555556% {
      background: linear-gradient(231.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.33333333333333% {
      background: linear-gradient(231.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.36111111111111% {
      background: linear-gradient(231.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.38888888888889% {
      background: linear-gradient(231.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.41666666666666% {
      background: linear-gradient(231.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.44444444444444% {
      background: linear-gradient(232deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.47222222222221% {
      background: linear-gradient(232.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.5% {
      background: linear-gradient(232.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.52777777777777% {
      background: linear-gradient(232.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.55555555555556% {
      background: linear-gradient(232.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.58333333333333% {
      background: linear-gradient(232.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.61111111111111% {
      background: linear-gradient(232.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.63888888888889% {
      background: linear-gradient(232.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.66666666666666% {
      background: linear-gradient(232.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.69444444444444% {
      background: linear-gradient(232.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.72222222222221% {
      background: linear-gradient(233deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.75% {
      background: linear-gradient(233.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.77777777777777% {
      background: linear-gradient(233.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.80555555555556% {
      background: linear-gradient(233.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.83333333333333% {
      background: linear-gradient(233.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.86111111111111% {
      background: linear-gradient(233.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.88888888888889% {
      background: linear-gradient(233.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.91666666666666% {
      background: linear-gradient(233.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.94444444444444% {
      background: linear-gradient(233.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    64.97222222222221% {
      background: linear-gradient(233.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65% {
      background: linear-gradient(234deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.02777777777777% {
      background: linear-gradient(234.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.05555555555556% {
      background: linear-gradient(234.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.08333333333333% {
      background: linear-gradient(234.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.11111111111111% {
      background: linear-gradient(234.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.13888888888889% {
      background: linear-gradient(234.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.16666666666666% {
      background: linear-gradient(234.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.19444444444444% {
      background: linear-gradient(234.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.22222222222221% {
      background: linear-gradient(234.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.25% {
      background: linear-gradient(234.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.27777777777777% {
      background: linear-gradient(235deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.30555555555556% {
      background: linear-gradient(235.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.33333333333333% {
      background: linear-gradient(235.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.36111111111111% {
      background: linear-gradient(235.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.38888888888889% {
      background: linear-gradient(235.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.41666666666666% {
      background: linear-gradient(235.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.44444444444444% {
      background: linear-gradient(235.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.47222222222221% {
      background: linear-gradient(235.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.5% {
      background: linear-gradient(235.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.52777777777777% {
      background: linear-gradient(235.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.55555555555556% {
      background: linear-gradient(236deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.58333333333333% {
      background: linear-gradient(236.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.61111111111111% {
      background: linear-gradient(236.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.63888888888889% {
      background: linear-gradient(236.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.66666666666666% {
      background: linear-gradient(236.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.69444444444444% {
      background: linear-gradient(236.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.72222222222221% {
      background: linear-gradient(236.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.75% {
      background: linear-gradient(236.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.77777777777777% {
      background: linear-gradient(236.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.80555555555556% {
      background: linear-gradient(236.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.83333333333333% {
      background: linear-gradient(237deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.86111111111111% {
      background: linear-gradient(237.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.88888888888889% {
      background: linear-gradient(237.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.91666666666666% {
      background: linear-gradient(237.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.94444444444444% {
      background: linear-gradient(237.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    65.97222222222221% {
      background: linear-gradient(237.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66% {
      background: linear-gradient(237.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.02777777777777% {
      background: linear-gradient(237.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.05555555555556% {
      background: linear-gradient(237.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.08333333333333% {
      background: linear-gradient(237.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.11111111111111% {
      background: linear-gradient(238deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.13888888888889% {
      background: linear-gradient(238.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.16666666666666% {
      background: linear-gradient(238.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.19444444444444% {
      background: linear-gradient(238.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.22222222222221% {
      background: linear-gradient(238.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.25% {
      background: linear-gradient(238.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.27777777777777% {
      background: linear-gradient(238.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.30555555555556% {
      background: linear-gradient(238.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.33333333333333% {
      background: linear-gradient(238.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.36111111111111% {
      background: linear-gradient(238.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.38888888888889% {
      background: linear-gradient(239deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.41666666666666% {
      background: linear-gradient(239.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.44444444444444% {
      background: linear-gradient(239.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.47222222222221% {
      background: linear-gradient(239.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.5% {
      background: linear-gradient(239.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.52777777777777% {
      background: linear-gradient(239.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.55555555555556% {
      background: linear-gradient(239.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.58333333333333% {
      background: linear-gradient(239.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.61111111111111% {
      background: linear-gradient(239.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.63888888888889% {
      background: linear-gradient(239.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.66666666666666% {
      background: linear-gradient(240deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.69444444444444% {
      background: linear-gradient(240.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.72222222222221% {
      background: linear-gradient(240.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.75% {
      background: linear-gradient(240.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.77777777777777% {
      background: linear-gradient(240.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.80555555555556% {
      background: linear-gradient(240.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.83333333333333% {
      background: linear-gradient(240.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.86111111111111% {
      background: linear-gradient(240.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.88888888888889% {
      background: linear-gradient(240.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.91666666666666% {
      background: linear-gradient(240.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.94444444444444% {
      background: linear-gradient(241deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    66.97222222222221% {
      background: linear-gradient(241.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67% {
      background: linear-gradient(241.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.02777777777777% {
      background: linear-gradient(241.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.05555555555556% {
      background: linear-gradient(241.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.08333333333333% {
      background: linear-gradient(241.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.11111111111111% {
      background: linear-gradient(241.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.13888888888889% {
      background: linear-gradient(241.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.16666666666666% {
      background: linear-gradient(241.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.19444444444444% {
      background: linear-gradient(241.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.22222222222221% {
      background: linear-gradient(242deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.25% {
      background: linear-gradient(242.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.27777777777777% {
      background: linear-gradient(242.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.30555555555556% {
      background: linear-gradient(242.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.33333333333333% {
      background: linear-gradient(242.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.36111111111111% {
      background: linear-gradient(242.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.38888888888889% {
      background: linear-gradient(242.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.41666666666666% {
      background: linear-gradient(242.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.44444444444444% {
      background: linear-gradient(242.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.47222222222221% {
      background: linear-gradient(242.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.5% {
      background: linear-gradient(243deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.52777777777777% {
      background: linear-gradient(243.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.55555555555556% {
      background: linear-gradient(243.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.58333333333333% {
      background: linear-gradient(243.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.61111111111111% {
      background: linear-gradient(243.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.63888888888889% {
      background: linear-gradient(243.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.66666666666666% {
      background: linear-gradient(243.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.69444444444444% {
      background: linear-gradient(243.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.72222222222221% {
      background: linear-gradient(243.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.75% {
      background: linear-gradient(243.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.77777777777777% {
      background: linear-gradient(244deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.80555555555556% {
      background: linear-gradient(244.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.83333333333333% {
      background: linear-gradient(244.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.86111111111111% {
      background: linear-gradient(244.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.88888888888889% {
      background: linear-gradient(244.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.91666666666666% {
      background: linear-gradient(244.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.94444444444444% {
      background: linear-gradient(244.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    67.97222222222221% {
      background: linear-gradient(244.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68% {
      background: linear-gradient(244.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.02777777777777% {
      background: linear-gradient(244.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.05555555555556% {
      background: linear-gradient(245deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.08333333333333% {
      background: linear-gradient(245.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.11111111111111% {
      background: linear-gradient(245.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.13888888888889% {
      background: linear-gradient(245.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.16666666666666% {
      background: linear-gradient(245.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.19444444444444% {
      background: linear-gradient(245.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.22222222222221% {
      background: linear-gradient(245.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.25% {
      background: linear-gradient(245.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.27777777777777% {
      background: linear-gradient(245.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.30555555555556% {
      background: linear-gradient(245.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.33333333333333% {
      background: linear-gradient(246deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.36111111111111% {
      background: linear-gradient(246.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.38888888888889% {
      background: linear-gradient(246.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.41666666666666% {
      background: linear-gradient(246.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.44444444444444% {
      background: linear-gradient(246.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.47222222222221% {
      background: linear-gradient(246.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.5% {
      background: linear-gradient(246.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.52777777777777% {
      background: linear-gradient(246.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.55555555555556% {
      background: linear-gradient(246.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.58333333333333% {
      background: linear-gradient(246.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.61111111111111% {
      background: linear-gradient(247deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.63888888888889% {
      background: linear-gradient(247.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.66666666666666% {
      background: linear-gradient(247.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.69444444444444% {
      background: linear-gradient(247.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.72222222222221% {
      background: linear-gradient(247.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.75% {
      background: linear-gradient(247.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.77777777777777% {
      background: linear-gradient(247.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.80555555555556% {
      background: linear-gradient(247.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.83333333333333% {
      background: linear-gradient(247.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.86111111111111% {
      background: linear-gradient(247.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.88888888888889% {
      background: linear-gradient(248deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.91666666666666% {
      background: linear-gradient(248.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.94444444444444% {
      background: linear-gradient(248.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    68.97222222222221% {
      background: linear-gradient(248.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69% {
      background: linear-gradient(248.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.02777777777777% {
      background: linear-gradient(248.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.05555555555556% {
      background: linear-gradient(248.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.08333333333333% {
      background: linear-gradient(248.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.11111111111111% {
      background: linear-gradient(248.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.13888888888889% {
      background: linear-gradient(248.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.16666666666666% {
      background: linear-gradient(249deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.19444444444444% {
      background: linear-gradient(249.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.22222222222221% {
      background: linear-gradient(249.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.25% {
      background: linear-gradient(249.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.27777777777777% {
      background: linear-gradient(249.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.30555555555556% {
      background: linear-gradient(249.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.33333333333333% {
      background: linear-gradient(249.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.36111111111111% {
      background: linear-gradient(249.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.38888888888889% {
      background: linear-gradient(249.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.41666666666666% {
      background: linear-gradient(249.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.44444444444444% {
      background: linear-gradient(250deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.47222222222221% {
      background: linear-gradient(250.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.5% {
      background: linear-gradient(250.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.52777777777777% {
      background: linear-gradient(250.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.55555555555556% {
      background: linear-gradient(250.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.58333333333333% {
      background: linear-gradient(250.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.61111111111111% {
      background: linear-gradient(250.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.63888888888889% {
      background: linear-gradient(250.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.66666666666666% {
      background: linear-gradient(250.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.69444444444444% {
      background: linear-gradient(250.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.72222222222221% {
      background: linear-gradient(251deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.75% {
      background: linear-gradient(251.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.77777777777777% {
      background: linear-gradient(251.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.80555555555556% {
      background: linear-gradient(251.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.83333333333333% {
      background: linear-gradient(251.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.86111111111111% {
      background: linear-gradient(251.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.88888888888889% {
      background: linear-gradient(251.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.91666666666666% {
      background: linear-gradient(251.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.94444444444444% {
      background: linear-gradient(251.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    69.97222222222221% {
      background: linear-gradient(251.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70% {
      background: linear-gradient(252deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.02777777777777% {
      background: linear-gradient(252.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.05555555555556% {
      background: linear-gradient(252.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.08333333333333% {
      background: linear-gradient(252.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.11111111111111% {
      background: linear-gradient(252.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.13888888888889% {
      background: linear-gradient(252.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.16666666666666% {
      background: linear-gradient(252.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.19444444444444% {
      background: linear-gradient(252.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.22222222222221% {
      background: linear-gradient(252.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.25% {
      background: linear-gradient(252.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.27777777777777% {
      background: linear-gradient(253deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.30555555555556% {
      background: linear-gradient(253.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.33333333333333% {
      background: linear-gradient(253.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.36111111111111% {
      background: linear-gradient(253.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.38888888888889% {
      background: linear-gradient(253.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.41666666666666% {
      background: linear-gradient(253.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.44444444444444% {
      background: linear-gradient(253.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.47222222222221% {
      background: linear-gradient(253.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.5% {
      background: linear-gradient(253.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.52777777777777% {
      background: linear-gradient(253.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.55555555555556% {
      background: linear-gradient(254deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.58333333333333% {
      background: linear-gradient(254.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.61111111111111% {
      background: linear-gradient(254.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.63888888888889% {
      background: linear-gradient(254.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.66666666666666% {
      background: linear-gradient(254.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.69444444444444% {
      background: linear-gradient(254.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.72222222222221% {
      background: linear-gradient(254.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.75% {
      background: linear-gradient(254.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.77777777777777% {
      background: linear-gradient(254.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.80555555555556% {
      background: linear-gradient(254.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.83333333333333% {
      background: linear-gradient(255deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.86111111111111% {
      background: linear-gradient(255.10000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.88888888888889% {
      background: linear-gradient(255.20000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.91666666666666% {
      background: linear-gradient(255.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.94444444444444% {
      background: linear-gradient(255.4deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    70.97222222222221% {
      background: linear-gradient(255.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71% {
      background: linear-gradient(255.60000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.02777777777777% {
      background: linear-gradient(255.70000000000002deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.05555555555556% {
      background: linear-gradient(255.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.08333333333333% {
      background: linear-gradient(255.9deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.11111111111111% {
      background: linear-gradient(256deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.13888888888889% {
      background: linear-gradient(256.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.16666666666666% {
      background: linear-gradient(256.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.19444444444444% {
      background: linear-gradient(256.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.22222222222221% {
      background: linear-gradient(256.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.25% {
      background: linear-gradient(256.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.27777777777777% {
      background: linear-gradient(256.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.30555555555556% {
      background: linear-gradient(256.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.33333333333333% {
      background: linear-gradient(256.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.3611111111111% {
      background: linear-gradient(256.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.38888888888889% {
      background: linear-gradient(257deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.41666666666666% {
      background: linear-gradient(257.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.44444444444444% {
      background: linear-gradient(257.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.47222222222221% {
      background: linear-gradient(257.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.5% {
      background: linear-gradient(257.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.52777777777777% {
      background: linear-gradient(257.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.55555555555556% {
      background: linear-gradient(257.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.58333333333333% {
      background: linear-gradient(257.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.6111111111111% {
      background: linear-gradient(257.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.63888888888889% {
      background: linear-gradient(257.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.66666666666666% {
      background: linear-gradient(258deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.69444444444444% {
      background: linear-gradient(258.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.72222222222221% {
      background: linear-gradient(258.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.75% {
      background: linear-gradient(258.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.77777777777777% {
      background: linear-gradient(258.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.80555555555556% {
      background: linear-gradient(258.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.83333333333333% {
      background: linear-gradient(258.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.8611111111111% {
      background: linear-gradient(258.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.88888888888889% {
      background: linear-gradient(258.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.91666666666666% {
      background: linear-gradient(258.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.94444444444444% {
      background: linear-gradient(259deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    71.97222222222221% {
      background: linear-gradient(259.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72% {
      background: linear-gradient(259.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.02777777777777% {
      background: linear-gradient(259.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.05555555555556% {
      background: linear-gradient(259.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.08333333333333% {
      background: linear-gradient(259.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.1111111111111% {
      background: linear-gradient(259.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.13888888888889% {
      background: linear-gradient(259.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.16666666666666% {
      background: linear-gradient(259.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.19444444444444% {
      background: linear-gradient(259.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.22222222222221% {
      background: linear-gradient(260deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.25% {
      background: linear-gradient(260.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.27777777777777% {
      background: linear-gradient(260.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.30555555555556% {
      background: linear-gradient(260.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.33333333333333% {
      background: linear-gradient(260.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.3611111111111% {
      background: linear-gradient(260.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.38888888888889% {
      background: linear-gradient(260.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.41666666666666% {
      background: linear-gradient(260.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.44444444444444% {
      background: linear-gradient(260.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.47222222222221% {
      background: linear-gradient(260.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.5% {
      background: linear-gradient(261deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.52777777777777% {
      background: linear-gradient(261.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.55555555555556% {
      background: linear-gradient(261.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.58333333333333% {
      background: linear-gradient(261.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.6111111111111% {
      background: linear-gradient(261.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.63888888888889% {
      background: linear-gradient(261.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.66666666666666% {
      background: linear-gradient(261.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.69444444444444% {
      background: linear-gradient(261.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.72222222222221% {
      background: linear-gradient(261.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.75% {
      background: linear-gradient(261.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.77777777777777% {
      background: linear-gradient(262deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.80555555555556% {
      background: linear-gradient(262.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.83333333333333% {
      background: linear-gradient(262.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.8611111111111% {
      background: linear-gradient(262.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.88888888888889% {
      background: linear-gradient(262.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.91666666666666% {
      background: linear-gradient(262.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.94444444444444% {
      background: linear-gradient(262.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    72.97222222222221% {
      background: linear-gradient(262.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73% {
      background: linear-gradient(262.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.02777777777777% {
      background: linear-gradient(262.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.05555555555556% {
      background: linear-gradient(263deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.08333333333333% {
      background: linear-gradient(263.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.1111111111111% {
      background: linear-gradient(263.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.13888888888889% {
      background: linear-gradient(263.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.16666666666666% {
      background: linear-gradient(263.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.19444444444444% {
      background: linear-gradient(263.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.22222222222221% {
      background: linear-gradient(263.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.25% {
      background: linear-gradient(263.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.27777777777777% {
      background: linear-gradient(263.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.30555555555556% {
      background: linear-gradient(263.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.33333333333333% {
      background: linear-gradient(264deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.3611111111111% {
      background: linear-gradient(264.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.38888888888889% {
      background: linear-gradient(264.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.41666666666666% {
      background: linear-gradient(264.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.44444444444444% {
      background: linear-gradient(264.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.47222222222221% {
      background: linear-gradient(264.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.5% {
      background: linear-gradient(264.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.52777777777777% {
      background: linear-gradient(264.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.55555555555556% {
      background: linear-gradient(264.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.58333333333333% {
      background: linear-gradient(264.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.6111111111111% {
      background: linear-gradient(265deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.63888888888889% {
      background: linear-gradient(265.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.66666666666666% {
      background: linear-gradient(265.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.69444444444444% {
      background: linear-gradient(265.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.72222222222221% {
      background: linear-gradient(265.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.75% {
      background: linear-gradient(265.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.77777777777777% {
      background: linear-gradient(265.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.80555555555556% {
      background: linear-gradient(265.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.83333333333333% {
      background: linear-gradient(265.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.8611111111111% {
      background: linear-gradient(265.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.88888888888889% {
      background: linear-gradient(266deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.91666666666666% {
      background: linear-gradient(266.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.94444444444444% {
      background: linear-gradient(266.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    73.97222222222221% {
      background: linear-gradient(266.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74% {
      background: linear-gradient(266.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.02777777777777% {
      background: linear-gradient(266.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.05555555555556% {
      background: linear-gradient(266.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.08333333333333% {
      background: linear-gradient(266.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.1111111111111% {
      background: linear-gradient(266.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.13888888888889% {
      background: linear-gradient(266.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.16666666666666% {
      background: linear-gradient(267deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.19444444444444% {
      background: linear-gradient(267.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.22222222222221% {
      background: linear-gradient(267.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.25% {
      background: linear-gradient(267.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.27777777777777% {
      background: linear-gradient(267.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.30555555555556% {
      background: linear-gradient(267.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.33333333333333% {
      background: linear-gradient(267.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.3611111111111% {
      background: linear-gradient(267.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.38888888888889% {
      background: linear-gradient(267.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.41666666666666% {
      background: linear-gradient(267.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.44444444444444% {
      background: linear-gradient(268deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.47222222222221% {
      background: linear-gradient(268.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.5% {
      background: linear-gradient(268.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.52777777777777% {
      background: linear-gradient(268.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.55555555555556% {
      background: linear-gradient(268.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.58333333333333% {
      background: linear-gradient(268.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.6111111111111% {
      background: linear-gradient(268.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.63888888888889% {
      background: linear-gradient(268.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.66666666666666% {
      background: linear-gradient(268.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.69444444444444% {
      background: linear-gradient(268.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.72222222222221% {
      background: linear-gradient(269deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.75% {
      background: linear-gradient(269.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.77777777777777% {
      background: linear-gradient(269.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.80555555555556% {
      background: linear-gradient(269.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.83333333333333% {
      background: linear-gradient(269.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.8611111111111% {
      background: linear-gradient(269.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.88888888888889% {
      background: linear-gradient(269.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.91666666666666% {
      background: linear-gradient(269.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.94444444444444% {
      background: linear-gradient(269.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    74.97222222222221% {
      background: linear-gradient(269.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75% {
      background: linear-gradient(270deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.02777777777777% {
      background: linear-gradient(270.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.05555555555556% {
      background: linear-gradient(270.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.08333333333333% {
      background: linear-gradient(270.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.1111111111111% {
      background: linear-gradient(270.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.13888888888889% {
      background: linear-gradient(270.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.16666666666666% {
      background: linear-gradient(270.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.19444444444444% {
      background: linear-gradient(270.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.22222222222221% {
      background: linear-gradient(270.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.25% {
      background: linear-gradient(270.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.27777777777777% {
      background: linear-gradient(271deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.30555555555556% {
      background: linear-gradient(271.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.33333333333333% {
      background: linear-gradient(271.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.3611111111111% {
      background: linear-gradient(271.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.38888888888889% {
      background: linear-gradient(271.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.41666666666666% {
      background: linear-gradient(271.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.44444444444444% {
      background: linear-gradient(271.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.47222222222221% {
      background: linear-gradient(271.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.5% {
      background: linear-gradient(271.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.52777777777777% {
      background: linear-gradient(271.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.55555555555556% {
      background: linear-gradient(272deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.58333333333333% {
      background: linear-gradient(272.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.6111111111111% {
      background: linear-gradient(272.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.63888888888889% {
      background: linear-gradient(272.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.66666666666666% {
      background: linear-gradient(272.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.69444444444444% {
      background: linear-gradient(272.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.72222222222221% {
      background: linear-gradient(272.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.75% {
      background: linear-gradient(272.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.77777777777777% {
      background: linear-gradient(272.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.80555555555556% {
      background: linear-gradient(272.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.83333333333333% {
      background: linear-gradient(273deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.8611111111111% {
      background: linear-gradient(273.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.88888888888889% {
      background: linear-gradient(273.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.91666666666666% {
      background: linear-gradient(273.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.94444444444444% {
      background: linear-gradient(273.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    75.97222222222221% {
      background: linear-gradient(273.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76% {
      background: linear-gradient(273.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.02777777777777% {
      background: linear-gradient(273.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.05555555555556% {
      background: linear-gradient(273.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.08333333333333% {
      background: linear-gradient(273.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.1111111111111% {
      background: linear-gradient(274deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.13888888888889% {
      background: linear-gradient(274.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.16666666666666% {
      background: linear-gradient(274.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.19444444444444% {
      background: linear-gradient(274.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.22222222222221% {
      background: linear-gradient(274.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.25% {
      background: linear-gradient(274.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.27777777777777% {
      background: linear-gradient(274.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.30555555555556% {
      background: linear-gradient(274.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.33333333333333% {
      background: linear-gradient(274.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.3611111111111% {
      background: linear-gradient(274.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.38888888888889% {
      background: linear-gradient(275deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.41666666666666% {
      background: linear-gradient(275.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.44444444444444% {
      background: linear-gradient(275.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.47222222222221% {
      background: linear-gradient(275.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.5% {
      background: linear-gradient(275.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.52777777777777% {
      background: linear-gradient(275.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.55555555555556% {
      background: linear-gradient(275.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.58333333333333% {
      background: linear-gradient(275.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.6111111111111% {
      background: linear-gradient(275.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.63888888888889% {
      background: linear-gradient(275.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.66666666666666% {
      background: linear-gradient(276deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.69444444444444% {
      background: linear-gradient(276.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.72222222222221% {
      background: linear-gradient(276.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.75% {
      background: linear-gradient(276.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.77777777777777% {
      background: linear-gradient(276.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.80555555555556% {
      background: linear-gradient(276.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.83333333333333% {
      background: linear-gradient(276.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.8611111111111% {
      background: linear-gradient(276.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.88888888888889% {
      background: linear-gradient(276.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.91666666666666% {
      background: linear-gradient(276.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.94444444444444% {
      background: linear-gradient(277deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    76.97222222222221% {
      background: linear-gradient(277.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77% {
      background: linear-gradient(277.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.02777777777777% {
      background: linear-gradient(277.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.05555555555556% {
      background: linear-gradient(277.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.08333333333333% {
      background: linear-gradient(277.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.1111111111111% {
      background: linear-gradient(277.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.13888888888889% {
      background: linear-gradient(277.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.16666666666666% {
      background: linear-gradient(277.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.19444444444444% {
      background: linear-gradient(277.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.22222222222221% {
      background: linear-gradient(278deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.25% {
      background: linear-gradient(278.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.27777777777777% {
      background: linear-gradient(278.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.30555555555556% {
      background: linear-gradient(278.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.33333333333333% {
      background: linear-gradient(278.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.3611111111111% {
      background: linear-gradient(278.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.38888888888889% {
      background: linear-gradient(278.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.41666666666666% {
      background: linear-gradient(278.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.44444444444444% {
      background: linear-gradient(278.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.47222222222221% {
      background: linear-gradient(278.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.5% {
      background: linear-gradient(279deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.52777777777777% {
      background: linear-gradient(279.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.55555555555556% {
      background: linear-gradient(279.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.58333333333333% {
      background: linear-gradient(279.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.6111111111111% {
      background: linear-gradient(279.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.63888888888889% {
      background: linear-gradient(279.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.66666666666666% {
      background: linear-gradient(279.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.69444444444444% {
      background: linear-gradient(279.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.72222222222221% {
      background: linear-gradient(279.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.75% {
      background: linear-gradient(279.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.77777777777777% {
      background: linear-gradient(280deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.80555555555556% {
      background: linear-gradient(280.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.83333333333333% {
      background: linear-gradient(280.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.8611111111111% {
      background: linear-gradient(280.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.88888888888889% {
      background: linear-gradient(280.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.91666666666666% {
      background: linear-gradient(280.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.94444444444444% {
      background: linear-gradient(280.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    77.97222222222221% {
      background: linear-gradient(280.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78% {
      background: linear-gradient(280.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.02777777777777% {
      background: linear-gradient(280.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.05555555555556% {
      background: linear-gradient(281deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.08333333333333% {
      background: linear-gradient(281.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.1111111111111% {
      background: linear-gradient(281.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.13888888888889% {
      background: linear-gradient(281.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.16666666666666% {
      background: linear-gradient(281.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.19444444444444% {
      background: linear-gradient(281.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.22222222222221% {
      background: linear-gradient(281.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.25% {
      background: linear-gradient(281.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.27777777777777% {
      background: linear-gradient(281.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.30555555555556% {
      background: linear-gradient(281.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.33333333333333% {
      background: linear-gradient(282deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.3611111111111% {
      background: linear-gradient(282.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.38888888888889% {
      background: linear-gradient(282.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.41666666666666% {
      background: linear-gradient(282.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.44444444444444% {
      background: linear-gradient(282.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.47222222222221% {
      background: linear-gradient(282.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.5% {
      background: linear-gradient(282.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.52777777777777% {
      background: linear-gradient(282.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.55555555555556% {
      background: linear-gradient(282.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.58333333333333% {
      background: linear-gradient(282.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.6111111111111% {
      background: linear-gradient(283deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.63888888888889% {
      background: linear-gradient(283.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.66666666666666% {
      background: linear-gradient(283.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.69444444444444% {
      background: linear-gradient(283.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.72222222222221% {
      background: linear-gradient(283.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.75% {
      background: linear-gradient(283.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.77777777777777% {
      background: linear-gradient(283.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.80555555555556% {
      background: linear-gradient(283.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.83333333333333% {
      background: linear-gradient(283.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.8611111111111% {
      background: linear-gradient(283.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.88888888888889% {
      background: linear-gradient(284deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.91666666666666% {
      background: linear-gradient(284.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.94444444444444% {
      background: linear-gradient(284.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    78.97222222222221% {
      background: linear-gradient(284.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79% {
      background: linear-gradient(284.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.02777777777777% {
      background: linear-gradient(284.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.05555555555556% {
      background: linear-gradient(284.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.08333333333333% {
      background: linear-gradient(284.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.1111111111111% {
      background: linear-gradient(284.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.13888888888889% {
      background: linear-gradient(284.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.16666666666666% {
      background: linear-gradient(285deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.19444444444444% {
      background: linear-gradient(285.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.22222222222221% {
      background: linear-gradient(285.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.25% {
      background: linear-gradient(285.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.27777777777777% {
      background: linear-gradient(285.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.30555555555556% {
      background: linear-gradient(285.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.33333333333333% {
      background: linear-gradient(285.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.3611111111111% {
      background: linear-gradient(285.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.38888888888889% {
      background: linear-gradient(285.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.41666666666666% {
      background: linear-gradient(285.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.44444444444444% {
      background: linear-gradient(286deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.47222222222221% {
      background: linear-gradient(286.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.5% {
      background: linear-gradient(286.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.52777777777777% {
      background: linear-gradient(286.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.55555555555556% {
      background: linear-gradient(286.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.58333333333333% {
      background: linear-gradient(286.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.6111111111111% {
      background: linear-gradient(286.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.63888888888889% {
      background: linear-gradient(286.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.66666666666666% {
      background: linear-gradient(286.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.69444444444444% {
      background: linear-gradient(286.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.72222222222221% {
      background: linear-gradient(287deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.75% {
      background: linear-gradient(287.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.77777777777777% {
      background: linear-gradient(287.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.80555555555556% {
      background: linear-gradient(287.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.83333333333333% {
      background: linear-gradient(287.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.8611111111111% {
      background: linear-gradient(287.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.88888888888889% {
      background: linear-gradient(287.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.91666666666666% {
      background: linear-gradient(287.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.94444444444444% {
      background: linear-gradient(287.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    79.97222222222221% {
      background: linear-gradient(287.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80% {
      background: linear-gradient(288deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.02777777777777% {
      background: linear-gradient(288.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.05555555555556% {
      background: linear-gradient(288.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.08333333333333% {
      background: linear-gradient(288.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.1111111111111% {
      background: linear-gradient(288.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.13888888888889% {
      background: linear-gradient(288.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.16666666666666% {
      background: linear-gradient(288.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.19444444444444% {
      background: linear-gradient(288.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.22222222222221% {
      background: linear-gradient(288.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.25% {
      background: linear-gradient(288.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.27777777777777% {
      background: linear-gradient(289deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.30555555555556% {
      background: linear-gradient(289.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.33333333333333% {
      background: linear-gradient(289.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.3611111111111% {
      background: linear-gradient(289.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.38888888888889% {
      background: linear-gradient(289.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.41666666666666% {
      background: linear-gradient(289.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.44444444444444% {
      background: linear-gradient(289.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.47222222222221% {
      background: linear-gradient(289.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.5% {
      background: linear-gradient(289.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.52777777777777% {
      background: linear-gradient(289.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.55555555555556% {
      background: linear-gradient(290deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.58333333333333% {
      background: linear-gradient(290.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.6111111111111% {
      background: linear-gradient(290.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.63888888888889% {
      background: linear-gradient(290.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.66666666666666% {
      background: linear-gradient(290.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.69444444444444% {
      background: linear-gradient(290.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.72222222222221% {
      background: linear-gradient(290.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.75% {
      background: linear-gradient(290.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.77777777777777% {
      background: linear-gradient(290.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.80555555555556% {
      background: linear-gradient(290.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.83333333333333% {
      background: linear-gradient(291deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.8611111111111% {
      background: linear-gradient(291.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.88888888888889% {
      background: linear-gradient(291.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.91666666666666% {
      background: linear-gradient(291.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.94444444444444% {
      background: linear-gradient(291.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    80.97222222222221% {
      background: linear-gradient(291.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81% {
      background: linear-gradient(291.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.02777777777777% {
      background: linear-gradient(291.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.05555555555556% {
      background: linear-gradient(291.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.08333333333333% {
      background: linear-gradient(291.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.1111111111111% {
      background: linear-gradient(292deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.13888888888889% {
      background: linear-gradient(292.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.16666666666666% {
      background: linear-gradient(292.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.19444444444444% {
      background: linear-gradient(292.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.22222222222221% {
      background: linear-gradient(292.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.25% {
      background: linear-gradient(292.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.27777777777777% {
      background: linear-gradient(292.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.30555555555556% {
      background: linear-gradient(292.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.33333333333333% {
      background: linear-gradient(292.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.3611111111111% {
      background: linear-gradient(292.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.38888888888889% {
      background: linear-gradient(293deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.41666666666666% {
      background: linear-gradient(293.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.44444444444444% {
      background: linear-gradient(293.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.47222222222221% {
      background: linear-gradient(293.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.5% {
      background: linear-gradient(293.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.52777777777777% {
      background: linear-gradient(293.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.55555555555556% {
      background: linear-gradient(293.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.58333333333333% {
      background: linear-gradient(293.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.6111111111111% {
      background: linear-gradient(293.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.63888888888889% {
      background: linear-gradient(293.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.66666666666666% {
      background: linear-gradient(294deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.69444444444444% {
      background: linear-gradient(294.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.72222222222221% {
      background: linear-gradient(294.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.75% {
      background: linear-gradient(294.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.77777777777777% {
      background: linear-gradient(294.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.80555555555556% {
      background: linear-gradient(294.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.83333333333333% {
      background: linear-gradient(294.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.8611111111111% {
      background: linear-gradient(294.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.88888888888889% {
      background: linear-gradient(294.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.91666666666666% {
      background: linear-gradient(294.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.94444444444444% {
      background: linear-gradient(295deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    81.97222222222221% {
      background: linear-gradient(295.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82% {
      background: linear-gradient(295.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.02777777777777% {
      background: linear-gradient(295.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.05555555555556% {
      background: linear-gradient(295.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.08333333333333% {
      background: linear-gradient(295.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.1111111111111% {
      background: linear-gradient(295.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.13888888888889% {
      background: linear-gradient(295.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.16666666666666% {
      background: linear-gradient(295.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.19444444444444% {
      background: linear-gradient(295.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.22222222222221% {
      background: linear-gradient(296deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.25% {
      background: linear-gradient(296.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.27777777777777% {
      background: linear-gradient(296.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.30555555555556% {
      background: linear-gradient(296.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.33333333333333% {
      background: linear-gradient(296.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.3611111111111% {
      background: linear-gradient(296.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.38888888888889% {
      background: linear-gradient(296.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.41666666666666% {
      background: linear-gradient(296.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.44444444444444% {
      background: linear-gradient(296.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.47222222222221% {
      background: linear-gradient(296.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.5% {
      background: linear-gradient(297deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.52777777777777% {
      background: linear-gradient(297.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.55555555555556% {
      background: linear-gradient(297.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.58333333333333% {
      background: linear-gradient(297.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.6111111111111% {
      background: linear-gradient(297.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.63888888888889% {
      background: linear-gradient(297.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.66666666666666% {
      background: linear-gradient(297.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.69444444444444% {
      background: linear-gradient(297.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.72222222222221% {
      background: linear-gradient(297.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.75% {
      background: linear-gradient(297.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.77777777777777% {
      background: linear-gradient(298deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.80555555555556% {
      background: linear-gradient(298.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.83333333333333% {
      background: linear-gradient(298.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.8611111111111% {
      background: linear-gradient(298.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.88888888888889% {
      background: linear-gradient(298.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.91666666666666% {
      background: linear-gradient(298.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.94444444444444% {
      background: linear-gradient(298.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    82.97222222222221% {
      background: linear-gradient(298.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83% {
      background: linear-gradient(298.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.02777777777777% {
      background: linear-gradient(298.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.05555555555556% {
      background: linear-gradient(299deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.08333333333333% {
      background: linear-gradient(299.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.1111111111111% {
      background: linear-gradient(299.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.13888888888889% {
      background: linear-gradient(299.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.16666666666666% {
      background: linear-gradient(299.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.19444444444444% {
      background: linear-gradient(299.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.22222222222221% {
      background: linear-gradient(299.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.25% {
      background: linear-gradient(299.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.27777777777777% {
      background: linear-gradient(299.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.30555555555556% {
      background: linear-gradient(299.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.33333333333333% {
      background: linear-gradient(300deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.3611111111111% {
      background: linear-gradient(300.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.38888888888889% {
      background: linear-gradient(300.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.41666666666666% {
      background: linear-gradient(300.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.44444444444444% {
      background: linear-gradient(300.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.47222222222221% {
      background: linear-gradient(300.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.5% {
      background: linear-gradient(300.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.52777777777777% {
      background: linear-gradient(300.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.55555555555556% {
      background: linear-gradient(300.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.58333333333333% {
      background: linear-gradient(300.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.6111111111111% {
      background: linear-gradient(301deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.63888888888889% {
      background: linear-gradient(301.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.66666666666666% {
      background: linear-gradient(301.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.69444444444444% {
      background: linear-gradient(301.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.72222222222221% {
      background: linear-gradient(301.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.75% {
      background: linear-gradient(301.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.77777777777777% {
      background: linear-gradient(301.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.80555555555556% {
      background: linear-gradient(301.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.83333333333333% {
      background: linear-gradient(301.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.8611111111111% {
      background: linear-gradient(301.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.88888888888889% {
      background: linear-gradient(302deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.91666666666666% {
      background: linear-gradient(302.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.94444444444444% {
      background: linear-gradient(302.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    83.97222222222221% {
      background: linear-gradient(302.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84% {
      background: linear-gradient(302.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.02777777777777% {
      background: linear-gradient(302.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.05555555555556% {
      background: linear-gradient(302.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.08333333333333% {
      background: linear-gradient(302.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.1111111111111% {
      background: linear-gradient(302.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.13888888888889% {
      background: linear-gradient(302.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.16666666666666% {
      background: linear-gradient(303deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.19444444444444% {
      background: linear-gradient(303.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.22222222222221% {
      background: linear-gradient(303.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.25% {
      background: linear-gradient(303.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.27777777777777% {
      background: linear-gradient(303.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.30555555555556% {
      background: linear-gradient(303.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.33333333333333% {
      background: linear-gradient(303.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.3611111111111% {
      background: linear-gradient(303.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.38888888888889% {
      background: linear-gradient(303.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.41666666666666% {
      background: linear-gradient(303.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.44444444444444% {
      background: linear-gradient(304deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.47222222222221% {
      background: linear-gradient(304.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.5% {
      background: linear-gradient(304.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.52777777777777% {
      background: linear-gradient(304.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.55555555555556% {
      background: linear-gradient(304.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.58333333333333% {
      background: linear-gradient(304.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.6111111111111% {
      background: linear-gradient(304.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.63888888888889% {
      background: linear-gradient(304.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.66666666666666% {
      background: linear-gradient(304.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.69444444444444% {
      background: linear-gradient(304.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.72222222222221% {
      background: linear-gradient(305deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.75% {
      background: linear-gradient(305.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.77777777777777% {
      background: linear-gradient(305.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.80555555555556% {
      background: linear-gradient(305.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.83333333333333% {
      background: linear-gradient(305.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.8611111111111% {
      background: linear-gradient(305.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.88888888888889% {
      background: linear-gradient(305.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.91666666666666% {
      background: linear-gradient(305.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.94444444444444% {
      background: linear-gradient(305.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    84.97222222222221% {
      background: linear-gradient(305.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85% {
      background: linear-gradient(306deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.02777777777777% {
      background: linear-gradient(306.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.05555555555556% {
      background: linear-gradient(306.2deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.08333333333333% {
      background: linear-gradient(306.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.1111111111111% {
      background: linear-gradient(306.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.13888888888889% {
      background: linear-gradient(306.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.16666666666666% {
      background: linear-gradient(306.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.19444444444444% {
      background: linear-gradient(306.7deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.22222222222221% {
      background: linear-gradient(306.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.25% {
      background: linear-gradient(306.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.27777777777777% {
      background: linear-gradient(307deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.30555555555556% {
      background: linear-gradient(307.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.33333333333333% {
      background: linear-gradient(307.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.3611111111111% {
      background: linear-gradient(307.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.38888888888889% {
      background: linear-gradient(307.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.41666666666666% {
      background: linear-gradient(307.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.44444444444444% {
      background: linear-gradient(307.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.47222222222221% {
      background: linear-gradient(307.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.5% {
      background: linear-gradient(307.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.52777777777777% {
      background: linear-gradient(307.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.55555555555556% {
      background: linear-gradient(308deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.58333333333333% {
      background: linear-gradient(308.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.6111111111111% {
      background: linear-gradient(308.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.63888888888889% {
      background: linear-gradient(308.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.66666666666666% {
      background: linear-gradient(308.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.69444444444444% {
      background: linear-gradient(308.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.72222222222221% {
      background: linear-gradient(308.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.75% {
      background: linear-gradient(308.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.77777777777777% {
      background: linear-gradient(308.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.80555555555556% {
      background: linear-gradient(308.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.83333333333333% {
      background: linear-gradient(309deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.8611111111111% {
      background: linear-gradient(309.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.88888888888889% {
      background: linear-gradient(309.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.91666666666666% {
      background: linear-gradient(309.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.94444444444444% {
      background: linear-gradient(309.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    85.97222222222221% {
      background: linear-gradient(309.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86% {
      background: linear-gradient(309.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.02777777777777% {
      background: linear-gradient(309.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.05555555555556% {
      background: linear-gradient(309.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.08333333333333% {
      background: linear-gradient(309.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.1111111111111% {
      background: linear-gradient(310deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.13888888888889% {
      background: linear-gradient(310.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.16666666666666% {
      background: linear-gradient(310.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.19444444444444% {
      background: linear-gradient(310.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.22222222222221% {
      background: linear-gradient(310.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.25% {
      background: linear-gradient(310.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.27777777777777% {
      background: linear-gradient(310.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.30555555555556% {
      background: linear-gradient(310.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.33333333333333% {
      background: linear-gradient(310.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.3611111111111% {
      background: linear-gradient(310.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.38888888888889% {
      background: linear-gradient(311deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.41666666666666% {
      background: linear-gradient(311.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.44444444444444% {
      background: linear-gradient(311.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.47222222222221% {
      background: linear-gradient(311.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.5% {
      background: linear-gradient(311.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.52777777777777% {
      background: linear-gradient(311.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.55555555555556% {
      background: linear-gradient(311.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.58333333333333% {
      background: linear-gradient(311.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.6111111111111% {
      background: linear-gradient(311.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.63888888888889% {
      background: linear-gradient(311.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.66666666666666% {
      background: linear-gradient(312deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.69444444444444% {
      background: linear-gradient(312.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.72222222222221% {
      background: linear-gradient(312.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.75% {
      background: linear-gradient(312.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.77777777777777% {
      background: linear-gradient(312.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.80555555555556% {
      background: linear-gradient(312.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.83333333333333% {
      background: linear-gradient(312.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.8611111111111% {
      background: linear-gradient(312.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.88888888888889% {
      background: linear-gradient(312.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.91666666666666% {
      background: linear-gradient(312.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.94444444444444% {
      background: linear-gradient(313deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    86.97222222222221% {
      background: linear-gradient(313.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87% {
      background: linear-gradient(313.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.02777777777777% {
      background: linear-gradient(313.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.05555555555556% {
      background: linear-gradient(313.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.08333333333333% {
      background: linear-gradient(313.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.1111111111111% {
      background: linear-gradient(313.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.13888888888889% {
      background: linear-gradient(313.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.16666666666666% {
      background: linear-gradient(313.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.19444444444444% {
      background: linear-gradient(313.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.22222222222221% {
      background: linear-gradient(314deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.25% {
      background: linear-gradient(314.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.27777777777777% {
      background: linear-gradient(314.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.30555555555556% {
      background: linear-gradient(314.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.33333333333333% {
      background: linear-gradient(314.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.3611111111111% {
      background: linear-gradient(314.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.38888888888889% {
      background: linear-gradient(314.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.41666666666666% {
      background: linear-gradient(314.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.44444444444444% {
      background: linear-gradient(314.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.47222222222221% {
      background: linear-gradient(314.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.5% {
      background: linear-gradient(315deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.52777777777777% {
      background: linear-gradient(315.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.55555555555556% {
      background: linear-gradient(315.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.58333333333333% {
      background: linear-gradient(315.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.6111111111111% {
      background: linear-gradient(315.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.63888888888889% {
      background: linear-gradient(315.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.66666666666666% {
      background: linear-gradient(315.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.69444444444444% {
      background: linear-gradient(315.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.72222222222221% {
      background: linear-gradient(315.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.75% {
      background: linear-gradient(315.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.77777777777777% {
      background: linear-gradient(316deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.80555555555556% {
      background: linear-gradient(316.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.83333333333333% {
      background: linear-gradient(316.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.8611111111111% {
      background: linear-gradient(316.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.88888888888889% {
      background: linear-gradient(316.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.91666666666666% {
      background: linear-gradient(316.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.94444444444444% {
      background: linear-gradient(316.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    87.97222222222221% {
      background: linear-gradient(316.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88% {
      background: linear-gradient(316.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.02777777777777% {
      background: linear-gradient(316.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.05555555555556% {
      background: linear-gradient(317deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.08333333333333% {
      background: linear-gradient(317.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.1111111111111% {
      background: linear-gradient(317.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.13888888888889% {
      background: linear-gradient(317.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.16666666666666% {
      background: linear-gradient(317.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.19444444444444% {
      background: linear-gradient(317.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.22222222222221% {
      background: linear-gradient(317.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.25% {
      background: linear-gradient(317.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.27777777777777% {
      background: linear-gradient(317.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.30555555555556% {
      background: linear-gradient(317.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.33333333333333% {
      background: linear-gradient(318deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.3611111111111% {
      background: linear-gradient(318.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.38888888888889% {
      background: linear-gradient(318.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.41666666666666% {
      background: linear-gradient(318.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.44444444444444% {
      background: linear-gradient(318.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.47222222222221% {
      background: linear-gradient(318.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.5% {
      background: linear-gradient(318.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.52777777777777% {
      background: linear-gradient(318.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.55555555555556% {
      background: linear-gradient(318.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.58333333333333% {
      background: linear-gradient(318.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.6111111111111% {
      background: linear-gradient(319deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.63888888888889% {
      background: linear-gradient(319.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.66666666666666% {
      background: linear-gradient(319.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.69444444444444% {
      background: linear-gradient(319.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.72222222222221% {
      background: linear-gradient(319.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.75% {
      background: linear-gradient(319.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.77777777777777% {
      background: linear-gradient(319.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.80555555555556% {
      background: linear-gradient(319.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.83333333333333% {
      background: linear-gradient(319.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.8611111111111% {
      background: linear-gradient(319.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.88888888888889% {
      background: linear-gradient(320deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.91666666666666% {
      background: linear-gradient(320.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.94444444444444% {
      background: linear-gradient(320.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    88.97222222222221% {
      background: linear-gradient(320.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89% {
      background: linear-gradient(320.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.02777777777777% {
      background: linear-gradient(320.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.05555555555556% {
      background: linear-gradient(320.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.08333333333333% {
      background: linear-gradient(320.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.1111111111111% {
      background: linear-gradient(320.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.13888888888889% {
      background: linear-gradient(320.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.16666666666666% {
      background: linear-gradient(321deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.19444444444444% {
      background: linear-gradient(321.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.22222222222221% {
      background: linear-gradient(321.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.25% {
      background: linear-gradient(321.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.27777777777777% {
      background: linear-gradient(321.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.30555555555556% {
      background: linear-gradient(321.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.33333333333333% {
      background: linear-gradient(321.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.3611111111111% {
      background: linear-gradient(321.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.38888888888889% {
      background: linear-gradient(321.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.41666666666666% {
      background: linear-gradient(321.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.44444444444444% {
      background: linear-gradient(322deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.47222222222221% {
      background: linear-gradient(322.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.5% {
      background: linear-gradient(322.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.52777777777777% {
      background: linear-gradient(322.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.55555555555556% {
      background: linear-gradient(322.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.58333333333333% {
      background: linear-gradient(322.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.6111111111111% {
      background: linear-gradient(322.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.63888888888889% {
      background: linear-gradient(322.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.66666666666666% {
      background: linear-gradient(322.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.69444444444444% {
      background: linear-gradient(322.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.72222222222221% {
      background: linear-gradient(323deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.75% {
      background: linear-gradient(323.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.77777777777777% {
      background: linear-gradient(323.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.80555555555556% {
      background: linear-gradient(323.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.83333333333333% {
      background: linear-gradient(323.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.8611111111111% {
      background: linear-gradient(323.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.88888888888889% {
      background: linear-gradient(323.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.91666666666666% {
      background: linear-gradient(323.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.94444444444444% {
      background: linear-gradient(323.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    89.97222222222221% {
      background: linear-gradient(323.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90% {
      background: linear-gradient(324deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.02777777777777% {
      background: linear-gradient(324.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.05555555555556% {
      background: linear-gradient(324.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.08333333333333% {
      background: linear-gradient(324.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.1111111111111% {
      background: linear-gradient(324.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.13888888888889% {
      background: linear-gradient(324.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.16666666666666% {
      background: linear-gradient(324.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.19444444444444% {
      background: linear-gradient(324.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.22222222222221% {
      background: linear-gradient(324.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.25% {
      background: linear-gradient(324.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.27777777777777% {
      background: linear-gradient(325deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.30555555555556% {
      background: linear-gradient(325.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.33333333333333% {
      background: linear-gradient(325.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.3611111111111% {
      background: linear-gradient(325.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.38888888888889% {
      background: linear-gradient(325.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.41666666666666% {
      background: linear-gradient(325.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.44444444444444% {
      background: linear-gradient(325.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.47222222222221% {
      background: linear-gradient(325.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.5% {
      background: linear-gradient(325.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.52777777777777% {
      background: linear-gradient(325.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.55555555555556% {
      background: linear-gradient(326deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.58333333333333% {
      background: linear-gradient(326.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.6111111111111% {
      background: linear-gradient(326.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.63888888888889% {
      background: linear-gradient(326.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.66666666666666% {
      background: linear-gradient(326.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.69444444444444% {
      background: linear-gradient(326.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.72222222222221% {
      background: linear-gradient(326.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.75% {
      background: linear-gradient(326.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.77777777777777% {
      background: linear-gradient(326.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.80555555555556% {
      background: linear-gradient(326.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.83333333333333% {
      background: linear-gradient(327deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.8611111111111% {
      background: linear-gradient(327.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.88888888888889% {
      background: linear-gradient(327.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.91666666666666% {
      background: linear-gradient(327.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.94444444444444% {
      background: linear-gradient(327.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    90.97222222222221% {
      background: linear-gradient(327.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91% {
      background: linear-gradient(327.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.02777777777777% {
      background: linear-gradient(327.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.05555555555556% {
      background: linear-gradient(327.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.08333333333333% {
      background: linear-gradient(327.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.1111111111111% {
      background: linear-gradient(328deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.13888888888889% {
      background: linear-gradient(328.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.16666666666666% {
      background: linear-gradient(328.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.19444444444444% {
      background: linear-gradient(328.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.22222222222221% {
      background: linear-gradient(328.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.25% {
      background: linear-gradient(328.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.27777777777777% {
      background: linear-gradient(328.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.30555555555556% {
      background: linear-gradient(328.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.33333333333333% {
      background: linear-gradient(328.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.3611111111111% {
      background: linear-gradient(328.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.38888888888889% {
      background: linear-gradient(329deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.41666666666666% {
      background: linear-gradient(329.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.44444444444444% {
      background: linear-gradient(329.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.47222222222221% {
      background: linear-gradient(329.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.5% {
      background: linear-gradient(329.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.52777777777777% {
      background: linear-gradient(329.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.55555555555556% {
      background: linear-gradient(329.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.58333333333333% {
      background: linear-gradient(329.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.6111111111111% {
      background: linear-gradient(329.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.63888888888889% {
      background: linear-gradient(329.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.66666666666666% {
      background: linear-gradient(330deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.69444444444444% {
      background: linear-gradient(330.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.72222222222221% {
      background: linear-gradient(330.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.75% {
      background: linear-gradient(330.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.77777777777777% {
      background: linear-gradient(330.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.80555555555556% {
      background: linear-gradient(330.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.83333333333333% {
      background: linear-gradient(330.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.8611111111111% {
      background: linear-gradient(330.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.88888888888889% {
      background: linear-gradient(330.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.91666666666666% {
      background: linear-gradient(330.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.94444444444444% {
      background: linear-gradient(331deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    91.97222222222221% {
      background: linear-gradient(331.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92% {
      background: linear-gradient(331.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.02777777777777% {
      background: linear-gradient(331.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.05555555555556% {
      background: linear-gradient(331.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.08333333333333% {
      background: linear-gradient(331.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.1111111111111% {
      background: linear-gradient(331.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.13888888888889% {
      background: linear-gradient(331.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.16666666666666% {
      background: linear-gradient(331.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.19444444444444% {
      background: linear-gradient(331.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.22222222222221% {
      background: linear-gradient(332deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.25% {
      background: linear-gradient(332.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.27777777777777% {
      background: linear-gradient(332.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.30555555555556% {
      background: linear-gradient(332.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.33333333333333% {
      background: linear-gradient(332.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.3611111111111% {
      background: linear-gradient(332.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.38888888888889% {
      background: linear-gradient(332.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.41666666666666% {
      background: linear-gradient(332.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.44444444444444% {
      background: linear-gradient(332.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.47222222222221% {
      background: linear-gradient(332.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.5% {
      background: linear-gradient(333deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.52777777777777% {
      background: linear-gradient(333.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.55555555555556% {
      background: linear-gradient(333.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.58333333333333% {
      background: linear-gradient(333.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.6111111111111% {
      background: linear-gradient(333.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.63888888888889% {
      background: linear-gradient(333.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.66666666666666% {
      background: linear-gradient(333.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.69444444444444% {
      background: linear-gradient(333.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.72222222222221% {
      background: linear-gradient(333.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.75% {
      background: linear-gradient(333.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.77777777777777% {
      background: linear-gradient(334deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.80555555555556% {
      background: linear-gradient(334.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.83333333333333% {
      background: linear-gradient(334.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.8611111111111% {
      background: linear-gradient(334.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.88888888888889% {
      background: linear-gradient(334.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.91666666666666% {
      background: linear-gradient(334.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.94444444444444% {
      background: linear-gradient(334.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    92.97222222222221% {
      background: linear-gradient(334.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93% {
      background: linear-gradient(334.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.02777777777777% {
      background: linear-gradient(334.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.05555555555556% {
      background: linear-gradient(335deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.08333333333333% {
      background: linear-gradient(335.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.1111111111111% {
      background: linear-gradient(335.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.13888888888889% {
      background: linear-gradient(335.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.16666666666666% {
      background: linear-gradient(335.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.19444444444444% {
      background: linear-gradient(335.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.22222222222221% {
      background: linear-gradient(335.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.25% {
      background: linear-gradient(335.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.27777777777777% {
      background: linear-gradient(335.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.30555555555556% {
      background: linear-gradient(335.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.33333333333333% {
      background: linear-gradient(336deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.3611111111111% {
      background: linear-gradient(336.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.38888888888889% {
      background: linear-gradient(336.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.41666666666666% {
      background: linear-gradient(336.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.44444444444444% {
      background: linear-gradient(336.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.47222222222221% {
      background: linear-gradient(336.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.5% {
      background: linear-gradient(336.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.52777777777777% {
      background: linear-gradient(336.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.55555555555556% {
      background: linear-gradient(336.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.58333333333333% {
      background: linear-gradient(336.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.6111111111111% {
      background: linear-gradient(337deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.63888888888889% {
      background: linear-gradient(337.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.66666666666666% {
      background: linear-gradient(337.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.69444444444444% {
      background: linear-gradient(337.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.72222222222221% {
      background: linear-gradient(337.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.75% {
      background: linear-gradient(337.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.77777777777777% {
      background: linear-gradient(337.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.80555555555556% {
      background: linear-gradient(337.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.83333333333333% {
      background: linear-gradient(337.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.8611111111111% {
      background: linear-gradient(337.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.88888888888889% {
      background: linear-gradient(338deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.91666666666666% {
      background: linear-gradient(338.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.94444444444444% {
      background: linear-gradient(338.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    93.97222222222221% {
      background: linear-gradient(338.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94% {
      background: linear-gradient(338.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.02777777777777% {
      background: linear-gradient(338.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.05555555555556% {
      background: linear-gradient(338.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.08333333333333% {
      background: linear-gradient(338.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.1111111111111% {
      background: linear-gradient(338.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.13888888888889% {
      background: linear-gradient(338.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.16666666666666% {
      background: linear-gradient(339deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.19444444444444% {
      background: linear-gradient(339.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.22222222222221% {
      background: linear-gradient(339.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.25% {
      background: linear-gradient(339.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.27777777777777% {
      background: linear-gradient(339.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.30555555555556% {
      background: linear-gradient(339.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.33333333333333% {
      background: linear-gradient(339.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.3611111111111% {
      background: linear-gradient(339.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.38888888888889% {
      background: linear-gradient(339.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.41666666666666% {
      background: linear-gradient(339.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.44444444444444% {
      background: linear-gradient(340deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.47222222222221% {
      background: linear-gradient(340.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.5% {
      background: linear-gradient(340.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.52777777777777% {
      background: linear-gradient(340.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.55555555555556% {
      background: linear-gradient(340.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.58333333333333% {
      background: linear-gradient(340.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.6111111111111% {
      background: linear-gradient(340.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.63888888888889% {
      background: linear-gradient(340.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.66666666666666% {
      background: linear-gradient(340.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.69444444444444% {
      background: linear-gradient(340.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.72222222222221% {
      background: linear-gradient(341deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.75% {
      background: linear-gradient(341.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.77777777777777% {
      background: linear-gradient(341.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.80555555555556% {
      background: linear-gradient(341.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.83333333333333% {
      background: linear-gradient(341.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.8611111111111% {
      background: linear-gradient(341.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.88888888888889% {
      background: linear-gradient(341.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.91666666666666% {
      background: linear-gradient(341.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.94444444444444% {
      background: linear-gradient(341.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    94.97222222222221% {
      background: linear-gradient(341.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95% {
      background: linear-gradient(342deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.02777777777777% {
      background: linear-gradient(342.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.05555555555556% {
      background: linear-gradient(342.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.08333333333333% {
      background: linear-gradient(342.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.1111111111111% {
      background: linear-gradient(342.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.13888888888889% {
      background: linear-gradient(342.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.16666666666666% {
      background: linear-gradient(342.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.19444444444444% {
      background: linear-gradient(342.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.22222222222221% {
      background: linear-gradient(342.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.25% {
      background: linear-gradient(342.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.27777777777777% {
      background: linear-gradient(343deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.30555555555556% {
      background: linear-gradient(343.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.33333333333333% {
      background: linear-gradient(343.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.3611111111111% {
      background: linear-gradient(343.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.38888888888889% {
      background: linear-gradient(343.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.41666666666666% {
      background: linear-gradient(343.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.44444444444444% {
      background: linear-gradient(343.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.47222222222221% {
      background: linear-gradient(343.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.5% {
      background: linear-gradient(343.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.52777777777777% {
      background: linear-gradient(343.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.55555555555556% {
      background: linear-gradient(344deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.58333333333333% {
      background: linear-gradient(344.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.6111111111111% {
      background: linear-gradient(344.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.63888888888889% {
      background: linear-gradient(344.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.66666666666666% {
      background: linear-gradient(344.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.69444444444444% {
      background: linear-gradient(344.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.72222222222221% {
      background: linear-gradient(344.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.75% {
      background: linear-gradient(344.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.77777777777777% {
      background: linear-gradient(344.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.80555555555556% {
      background: linear-gradient(344.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.83333333333333% {
      background: linear-gradient(345deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.8611111111111% {
      background: linear-gradient(345.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.88888888888889% {
      background: linear-gradient(345.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.91666666666666% {
      background: linear-gradient(345.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.94444444444444% {
      background: linear-gradient(345.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    95.97222222222221% {
      background: linear-gradient(345.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96% {
      background: linear-gradient(345.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.02777777777777% {
      background: linear-gradient(345.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.05555555555556% {
      background: linear-gradient(345.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.08333333333333% {
      background: linear-gradient(345.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.1111111111111% {
      background: linear-gradient(346deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.13888888888889% {
      background: linear-gradient(346.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.16666666666666% {
      background: linear-gradient(346.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.19444444444444% {
      background: linear-gradient(346.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.22222222222221% {
      background: linear-gradient(346.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.25% {
      background: linear-gradient(346.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.27777777777777% {
      background: linear-gradient(346.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.30555555555556% {
      background: linear-gradient(346.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.33333333333333% {
      background: linear-gradient(346.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.3611111111111% {
      background: linear-gradient(346.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.38888888888889% {
      background: linear-gradient(347deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.41666666666666% {
      background: linear-gradient(347.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.44444444444444% {
      background: linear-gradient(347.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.47222222222221% {
      background: linear-gradient(347.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.5% {
      background: linear-gradient(347.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.52777777777777% {
      background: linear-gradient(347.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.55555555555556% {
      background: linear-gradient(347.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.58333333333333% {
      background: linear-gradient(347.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.6111111111111% {
      background: linear-gradient(347.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.63888888888889% {
      background: linear-gradient(347.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.66666666666666% {
      background: linear-gradient(348deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.69444444444444% {
      background: linear-gradient(348.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.72222222222221% {
      background: linear-gradient(348.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.75% {
      background: linear-gradient(348.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.77777777777777% {
      background: linear-gradient(348.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.80555555555556% {
      background: linear-gradient(348.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.83333333333333% {
      background: linear-gradient(348.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.8611111111111% {
      background: linear-gradient(348.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.88888888888889% {
      background: linear-gradient(348.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.91666666666666% {
      background: linear-gradient(348.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.94444444444444% {
      background: linear-gradient(349deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    96.97222222222221% {
      background: linear-gradient(349.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97% {
      background: linear-gradient(349.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.02777777777777% {
      background: linear-gradient(349.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.05555555555556% {
      background: linear-gradient(349.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.08333333333333% {
      background: linear-gradient(349.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.1111111111111% {
      background: linear-gradient(349.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.13888888888889% {
      background: linear-gradient(349.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.16666666666666% {
      background: linear-gradient(349.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.19444444444444% {
      background: linear-gradient(349.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.22222222222221% {
      background: linear-gradient(350deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.25% {
      background: linear-gradient(350.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.27777777777777% {
      background: linear-gradient(350.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.30555555555556% {
      background: linear-gradient(350.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.33333333333333% {
      background: linear-gradient(350.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.3611111111111% {
      background: linear-gradient(350.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.38888888888889% {
      background: linear-gradient(350.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.41666666666666% {
      background: linear-gradient(350.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.44444444444444% {
      background: linear-gradient(350.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.47222222222221% {
      background: linear-gradient(350.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.5% {
      background: linear-gradient(351deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.52777777777777% {
      background: linear-gradient(351.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.55555555555556% {
      background: linear-gradient(351.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.58333333333333% {
      background: linear-gradient(351.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.6111111111111% {
      background: linear-gradient(351.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.63888888888889% {
      background: linear-gradient(351.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.66666666666666% {
      background: linear-gradient(351.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.69444444444444% {
      background: linear-gradient(351.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.72222222222221% {
      background: linear-gradient(351.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.75% {
      background: linear-gradient(351.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.77777777777777% {
      background: linear-gradient(352deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.80555555555556% {
      background: linear-gradient(352.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.83333333333333% {
      background: linear-gradient(352.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.8611111111111% {
      background: linear-gradient(352.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.88888888888889% {
      background: linear-gradient(352.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.91666666666666% {
      background: linear-gradient(352.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.94444444444444% {
      background: linear-gradient(352.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    97.97222222222221% {
      background: linear-gradient(352.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98% {
      background: linear-gradient(352.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.02777777777777% {
      background: linear-gradient(352.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.05555555555556% {
      background: linear-gradient(353deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.08333333333333% {
      background: linear-gradient(353.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.1111111111111% {
      background: linear-gradient(353.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.13888888888889% {
      background: linear-gradient(353.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.16666666666666% {
      background: linear-gradient(353.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.19444444444444% {
      background: linear-gradient(353.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.22222222222221% {
      background: linear-gradient(353.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.25% {
      background: linear-gradient(353.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.27777777777777% {
      background: linear-gradient(353.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.30555555555556% {
      background: linear-gradient(353.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.33333333333333% {
      background: linear-gradient(354deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.3611111111111% {
      background: linear-gradient(354.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.38888888888889% {
      background: linear-gradient(354.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.41666666666666% {
      background: linear-gradient(354.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.44444444444444% {
      background: linear-gradient(354.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.47222222222221% {
      background: linear-gradient(354.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.5% {
      background: linear-gradient(354.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.52777777777777% {
      background: linear-gradient(354.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.55555555555556% {
      background: linear-gradient(354.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.58333333333333% {
      background: linear-gradient(354.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.6111111111111% {
      background: linear-gradient(355deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.63888888888889% {
      background: linear-gradient(355.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.66666666666666% {
      background: linear-gradient(355.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.69444444444444% {
      background: linear-gradient(355.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.72222222222221% {
      background: linear-gradient(355.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.75% {
      background: linear-gradient(355.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.77777777777777% {
      background: linear-gradient(355.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.80555555555556% {
      background: linear-gradient(355.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.83333333333333% {
      background: linear-gradient(355.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.8611111111111% {
      background: linear-gradient(355.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.88888888888889% {
      background: linear-gradient(356deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.91666666666666% {
      background: linear-gradient(356.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.94444444444444% {
      background: linear-gradient(356.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    98.97222222222221% {
      background: linear-gradient(356.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99% {
      background: linear-gradient(356.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.02777777777777% {
      background: linear-gradient(356.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.05555555555556% {
      background: linear-gradient(356.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.08333333333333% {
      background: linear-gradient(356.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.1111111111111% {
      background: linear-gradient(356.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.13888888888889% {
      background: linear-gradient(356.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.16666666666666% {
      background: linear-gradient(357deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.19444444444444% {
      background: linear-gradient(357.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.22222222222221% {
      background: linear-gradient(357.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.25% {
      background: linear-gradient(357.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.27777777777777% {
      background: linear-gradient(357.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.30555555555556% {
      background: linear-gradient(357.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.33333333333333% {
      background: linear-gradient(357.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.3611111111111% {
      background: linear-gradient(357.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.38888888888889% {
      background: linear-gradient(357.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.41666666666666% {
      background: linear-gradient(357.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.44444444444444% {
      background: linear-gradient(358deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.47222222222221% {
      background: linear-gradient(358.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.5% {
      background: linear-gradient(358.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.52777777777777% {
      background: linear-gradient(358.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.55555555555554% {
      background: linear-gradient(358.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.58333333333333% {
      background: linear-gradient(358.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.6111111111111% {
      background: linear-gradient(358.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.63888888888889% {
      background: linear-gradient(358.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.66666666666666% {
      background: linear-gradient(358.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.69444444444444% {
      background: linear-gradient(358.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.72222222222221% {
      background: linear-gradient(359deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.75% {
      background: linear-gradient(359.1deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.77777777777777% {
      background: linear-gradient(359.20000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.80555555555554% {
      background: linear-gradient(359.3deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.83333333333333% {
      background: linear-gradient(359.40000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.8611111111111% {
      background: linear-gradient(359.5deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.88888888888889% {
      background: linear-gradient(359.6deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.91666666666666% {
      background: linear-gradient(359.70000000000005deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.94444444444444% {
      background: linear-gradient(359.8deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
    99.97222222222221% {
      background: linear-gradient(359.90000000000003deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%);
    }
}
</style>
