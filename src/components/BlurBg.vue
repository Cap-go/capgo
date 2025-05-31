<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

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
const animationName = ref('dynamicRotate')

// Extract colors from the gradient
const colors = ['#44ff9a', '#44b0ff', '#8b44ff', '#ff6644', '#ebff70']
const positions = ['-0.55%', '22.86%', '48.36%', '73.33%', '99.34%']

function generateKeyframes() {
  const steps = 100 // Generate 100 keyframe steps for smooth animation
  let keyframes = `@keyframes ${animationName.value} {\n`
  
  for (let i = 0; i <= steps; i++) {
    const percentage = i
    const angle = (i * 360 / steps) % 360
    
    const gradient = `linear-gradient(${angle}deg, ${colors.map((color, index) => 
      `${color} ${positions[index]}`
    ).join(', ')})`
    
    keyframes += `  ${percentage}% { background: ${gradient}; }\n`
  }
  
  keyframes += '}'
  return keyframes
}

function injectKeyframes() {
  // Remove existing keyframes if any
  const existingStyle = document.getElementById('dynamic-blur-keyframes')
  if (existingStyle) {
    existingStyle.remove()
  }
  
  // Create and inject new keyframes
  const style = document.createElement('style')
  style.id = 'dynamic-blur-keyframes'
  style.textContent = generateKeyframes()
  document.head.appendChild(style)
}

onMounted(() => {
  if (props.rotate) {
    injectKeyframes()
  }
})
</script>

<template>
  <div>
    <div class="relative lg:mx-auto lg:max-w-5xl" :class="{ 'mt-12 lg:mt-20': !props.mini && !props.rotate, 'mt-6 lg:mt-12': props.mini }">
      <div class="absolute -inset-2">
        <div 
          class="w-full h-full mx-auto rounded-3xl opacity-30 blur-lg" 
          :style="style" 
          :class="{ 'animate-dynamic-rotate': props.rotate }"
        />
      </div>

      <div class="absolute rounded-3xl from-cyan-500 to-purple-500 bg-linear-to-r -inset-px" />

      <div class="relative flex flex-col items-stretch overflow-hidden text-center bg-white rounded-3xl dark:bg-black/90 md:flex-row md:text-left">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Safari-optimized smooth rotation */
.animate-dynamic-rotate {
  animation: dynamicRotate 8s linear infinite;
  transform-origin: center;
  will-change: transform, background;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

/* Enhanced blur and smoothing for Safari */
.blur-lg {
  filter: blur(16px);
  -webkit-filter: blur(16px);
}

/* Improve rendering on Safari */
.rounded-3xl {
  border-radius: 1.5rem;
  -webkit-border-radius: 1.5rem;
}
</style> 