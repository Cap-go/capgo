<script setup lang="ts">
import { applyPureReactInVue } from 'veaury'
import { Toaster } from 'sonner'
const ToasterVue = applyPureReactInVue(Toaster,
  {
    useInjectPropsFromWrapper(reactProps) {
      return {
        ...reactProps,
        richColors: true,
        closeButton: true,
        position: 'top-right',
      }
    },
  })
</script>

<template>
  <ToasterVue />
</template>
