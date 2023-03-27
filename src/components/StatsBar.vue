<script setup lang="ts">
import type { Stat } from './comp_def'

const props = defineProps<{ stats: Stat[]; mini?: Boolean }>()
</script>

<template>
  <template v-for="s, i in stats" :key="i">
    <div v-if="i > 0" class="h-px w-full shrink-0 from-cyan-500 to-purple-500 bg-gradient-to-r md:h-auto md:w-px" />

    <a
      :href="s.link || '#'" class="group w-full flex flex-col items-center"
      :class="{ 'hover:bg-gray-800': s.link, 'p-10 sm:px-12 lg:px-16 lg:py-14': !props.mini, 'p-5 sm:px-7 lg:px-6 lg:py-4': props.mini }"
    >
      <span class="scale-100 text-center duration-100 ease-in" :class="{ 'group-hover:scale-125': s.link }">
        <p
          class="font-pj font-bold text-white lg:order-1 lg:mt-3"
          :class="{ 'text-5xl': !props.mini, 'text-3xl': props.mini }"
        >
          {{ s.value }}
        </p>
        <h3 class="font-pj mt-5 text-sm font-bold tracking-widest uppercase text-gray-400 lg:order-2 lg:mt-0">
          {{ s.label }}
        </h3>
      </span>
    </a>
  </template>
</template>
