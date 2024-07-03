<script setup lang="ts">
import { type Container, type Engine, type ISourceOptions, tsParticles } from '@tsparticles/engine'
import { nextTick, onMounted, onUnmounted, watch } from 'vue'

export type IParticlesProps = ISourceOptions

const props = defineProps<{
  id: string
  options?: IParticlesProps
  url?: string
  theme?: string
}>()

const emit = defineEmits<{
  (e: 'particlesLoaded', container?: Container): void
}>()

let container: Container | undefined, engine: Engine | undefined

function initEventHandler(e: Event) {
  const evt = e as CustomEvent<Engine>

  engine = evt.detail

  loadParticles()
}

addEventListener('particlesInit', initEventHandler)

async function loadParticles() {
  if (!engine)
    engine = tsParticles

  container = await engine.load({
    id: props.id,
    url: props.url,
    options: props.options,
  })
  emit('particlesLoaded', container)
}

onMounted(() => {
  nextTick(() => {
    if (!props.id)
      throw new Error('Prop \'id\' is required!')

    loadParticles()
  })
})

onUnmounted(() => {
  if (!container)
    return

  container.destroy()

  container = undefined

  removeEventListener('particlesInit', initEventHandler)
})

watch(
  () => props.theme,
  () => {
    container?.loadTheme(props.theme)
  },
  { immediate: true, deep: true },
)
</script>

<template>
  <div :id="id" />
</template>
