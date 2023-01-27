<script setup lang="ts">
import Atropos from 'atropos/vue'
import 'atropos/css/min'

const props = defineProps<{
  number: number
  label: string
  link: string
}>()
</script>

<template>
  <a :href="props.link">
    <div class="hidden md:block">
      <Atropos class="z-10" :rotate-x-max="1" :rotate-y-max="1" :shadow="false">
        <div class="flex flex-col h-56 items-center justify-center rounded-3xl border border-gray-300 bg-gray-800">
          <p data-atropos-offset="10" class="text-7xl font-bold text-white font-pj">
            {{ props.number }}
          </p>
          <p class="mt-4 text-2xl font-normal leading-tight text-gray-300 font-pj">
            {{ props.label }}
          </p>
        </div>
      </Atropos>
    </div>

    <div class="md:hidden">
      <div class="flex flex-col h-40 items-center justify-center rounded-3xl border border-gray-300 dark:bg-gray-700">
        <p class="text-5xl font-bold text-gray-900 dark:text-white font-pj">
          {{ props.number }}
        </p>
        <p class="mt-4 text-lg font-normal leading-tight text-gray-900 dark:text-gray-300 font-pj">
          {{ props.label }}
        </p>
      </div>
    </div>

  </a>
</template>
