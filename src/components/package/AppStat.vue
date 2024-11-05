<script setup lang="ts">
import Atropos from 'atropos/vue'
import { useRouter } from 'vue-router'
import 'atropos/css/min'

const props = defineProps<{
  number: number
  label: string
  link: string
}>()

const router = useRouter()

function open() {
  router.push(props.link)
}
</script>

<template>
  <div class="hidden cursor-pointer md:block" @click="open">
    <Atropos class="z-10" :rotate-x-max="15" :rotate-y-max="15" :shadow="false">
      <div class="flex flex-col items-center justify-center h-56 bg-gray-800 border border-gray-300 rounded-3xl">
        <p data-atropos-offset="5" class="font-bold text-white font-pj text-7xl">
          {{ props.number }}
        </p>
        <p data-atropos-offset="5" class="mt-4 text-2xl font-normal leading-tight text-gray-300 font-pj first-letter:uppercase">
          {{ props.label }}
        </p>
      </div>
    </Atropos>
  </div>

  <div class="cursor-pointer md:hidden" @click="open">
    <div class="flex flex-col items-center justify-center h-40 btn btn-outline">
      <p class="text-5xl font-boldfont-pj">
        {{ props.number }}
      </p>
      <p class="mt-4 text-lg font-normal leading-tight font-pj first-letter:uppercase">
        {{ props.label }}
      </p>
    </div>
  </div>
</template>
