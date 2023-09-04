<script setup lang="ts">
import type { Stat } from './comp_def'

const props = defineProps<{ stats: Stat[]; mini?: boolean }>()
</script>

<template>
  <template v-for="s, i in stats" :key="i">
    <a
      :href="s.link || '#'" class="flex flex-col items-center w-full group"
      :class="{ 'hover:bg-gray-100 dark:hover:bg-gray-800': s.link, 'p-10 sm:px-12 lg:px-16 lg:py-14': !props.mini, 'p-5 sm:px-7 lg:px-6 lg:py-4': props.mini }"
    >
      <span class="text-center duration-100 ease-in scale-100" :class="{ 'group-hover:scale-125': s.link }">
        <p
          class="font-bold dark:text-white font-pj lg:order-1 lg:mt-3"
          :class="{ 'text-5xl': !props.mini, 'text-3xl': props.mini }"
        >
          {{ s.value }}
        </p>
        <h3 class="mt-5 text-sm font-bold tracking-widest text-gray-400 uppercase font-pj lg:order-2 lg:mt-0">
          {{ s.label }}
        </h3>
      </span>
    </a>
  </template>
</template>
