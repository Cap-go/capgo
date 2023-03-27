<script setup lang="ts">
import Atropos from 'atropos/vue'
import 'atropos/css/min'
import { useRouter } from 'vue-router'

const props = defineProps<{
  number: number
  label: string
  link: string
}>()

const router = useRouter()

const open = () => {
  router.push(props.link)
}
</script>

<template>
  <div class="hidden cursor-pointer md:block" @click="open">
    <Atropos class="z-10" :rotate-x-max="15" :rotate-y-max="15" :shadow="false">
      <div class="h-56 flex flex-col items-center justify-center border border-gray-300 rounded-3xl bg-gray-800">
        <p data-atropos-offset="5" class="font-pj text-7xl font-bold text-white">
          {{ props.number }}
        </p>
        <p data-atropos-offset="5" class="font-pj mt-4 text-2xl font-normal leading-tight text-gray-300">
          {{ props.label }}
        </p>
      </div>
    </Atropos>
  </div>

  <div class="cursor-pointer md:hidden" @click="open">
    <div class="btn btn-outline h-40 flex flex-col items-center justify-center">
      <p class="font-boldfont-pj text-5xl">
        {{ props.number }}
      </p>
      <p class="font-pj mt-4 text-lg font-normal leading-tight">
        {{ props.label }}
      </p>
    </div>
  </div>
</template>
