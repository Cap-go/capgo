<script setup lang="ts">
import type { Stat } from './comp_def'
import InformationInfo from '~icons/heroicons/information-circle'

const props = defineProps<{ stats: Stat[], mini?: boolean }>()
const refStats = toRef(() => props.stats)
</script>

<template>
  <template v-for="s, i in refStats" :key="i">
    <component
      :is="s.link ? 'a' : 'div'"
      :href="s.link || undefined"
      class="flex flex-col items-center w-full"
      :class="{
        'group hover:bg-gray-100 dark:hover:bg-gray-800': s.link && (s.hoverLabel || s.link),
        'p-10 sm:px-12 lg:px-16 lg:py-14': !props.mini,
        'p-5 sm:px-7 lg:px-6 lg:py-4': props.mini,
      }"
    >
      <span class="text-center duration-100 ease-in scale-100" :class="{ 'group-hover:scale-125': s.link && (s.hoverLabel || s.link) }">
        <p
          v-if="!!s.value"
          id="stats-val"
          class="font-bold dark:text-white font-pj lg:order-1 lg:mt-3"
          :class="{
            'text-5xl group-hover:hidden': !props.mini && (s.link && (s.hoverLabel || s.link)),
            'text-3xl group-hover:hidden': props.mini && (s.link && (s.hoverLabel || s.link)),
            'text-5xl': !props.mini,
            'text-3xl': props.mini,
          }"
        >
          {{ s.value }}
        </p>
        <div v-else class="flex justify-center lg:order-1 lg:mt-3">
          <Spinner size="w-10 h-10 ml-auto mr-auto" />
        </div>
        <div class="flex flex-row-reverse items-center justify-center flex-column">
          <h3 class="mt-5 text-sm font-bold tracking-widest text-gray-400 uppercase font-pj lg:order-2 lg:mt-0">
            <span :class="{ 'group-hover:hidden': s.link && (s.hoverLabel || s.link) }">{{ s.label }}</span>
            <span v-if="s.link && (s.hoverLabel || s.link)" class="hidden group-hover:inline first-letter:uppercase">{{ s.hoverLabel || s.label }}</span>
          </h3>
          <InformationInfo v-if="!!s.informationIcon" class="ml-1 first-letter:uppercase" @click="s.informationIcon" />
        </div>
      </span>
    </component>
  </template>
</template>
