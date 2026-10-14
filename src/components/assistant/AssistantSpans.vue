<script setup lang="ts">
import type { AssistantSpan } from '~/utils/assistantText'

defineProps<{ spans: AssistantSpan[] }>()
</script>

<template>
  <template v-for="(span, index) in spans" :key="index">
    <strong v-if="span.style === 'bold'">{{ span.text }}</strong>
    <code v-else-if="span.style === 'code'" class="rounded bg-black/10 px-1 font-mono text-[12px]">{{ span.text }}</code>
    <template v-else>
      {{ span.text }}
    </template>
  </template>
</template>
