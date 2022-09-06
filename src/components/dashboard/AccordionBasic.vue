<script>
import { ref } from 'vue'

export default {
  name: 'AccordionBasic',
  props: ['title'],
  setup() {
    const open = ref(false)
    const trigger = ref(null)
    const dropdown = ref(null)

    return {
      open,
      trigger,
      dropdown,
    }
  },
}
</script>

<template>
  <div class="px-5 py-4 rounded-sm border border-slate-200">
    <button
      class="flex items-center justify-between w-full group mb-1"
      :aria-expanded="open"
      @click.prevent="open = !open"
    >
      <div class="text-sm text-slate-800 font-medium">
        {{ title }}
      </div>
      <svg class="w-8 h-8 shrink-0 fill-current text-slate-400 group-hover:text-slate-500 ml-3" :class="{ 'rotate-180': open }" viewBox="0 0 32 32">
        <path d="M16 20l-5.4-5.4 1.4-1.4 4 4 4-4 1.4 1.4z" />
      </svg>
    </button>
    <div v-show="open" class="text-sm">
      <slot />
    </div>
  </div>
</template>
