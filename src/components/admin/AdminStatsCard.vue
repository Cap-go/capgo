<script setup lang="ts">
import { computed } from 'vue'
import Spinner from '~/components/Spinner.vue'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  value: {
    type: [Number, String],
    default: undefined,
  },
  unit: {
    type: String,
    default: '',
  },
  evolution: {
    type: Number,
    default: undefined,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  colorClass: {
    type: String,
    default: 'text-primary',
  },
  subtitle: {
    type: String,
    default: '',
  },
  clickable: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['click'])

const showEvolution = computed(() => props.evolution !== undefined && props.evolution !== null)
const displayValue = computed(() => {
  if (props.value === undefined || props.value === null)
    return '-'
  if (typeof props.value === 'number')
    return props.value.toLocaleString()
  return props.value
})

function handleClick() {
  if (props.clickable)
    emit('click')
}
</script>

<template>
  <div
    class="shadow-lg stat bg-base-200 rounded-box"
    :class="{ 'cursor-pointer hover:shadow-xl transition-shadow': clickable }"
    @click="handleClick"
  >
    <!-- Loading state -->
    <div v-if="isLoading" class="flex items-center justify-center h-24">
      <Spinner size="w-12 h-12" />
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Title -->
      <div class="stat-title text-base-content/70">
        {{ title }}
      </div>

      <!-- Value and evolution -->
      <div class="flex items-end gap-2">
        <div class="stat-value" :class="colorClass">
          {{ displayValue }}<span v-if="unit" class="text-2xl font-normal">{{ unit }}</span>
        </div>

        <!-- Evolution badge -->
        <div
          v-if="showEvolution"
          class="mb-2 badge"
          :class="{
            'badge-success': (evolution ?? 0) >= 0,
            'badge-warning': (evolution ?? 0) < 0,
          }"
        >
          {{ (evolution ?? 0) < 0 ? '' : '+' }}{{ (evolution ?? 0).toFixed(1) }}%
        </div>
      </div>

      <!-- Subtitle -->
      <div v-if="subtitle" class="stat-desc text-base-content/60">
        {{ subtitle }}
      </div>
    </template>
  </div>
</template>
