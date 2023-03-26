<script setup lang="ts">
import { applyPureReactInVue } from 'veaury'
import { Toaster } from 'sonner'
// import Toaster from '~/components/sooner/toaster.vue'
const ToasterVue = applyPureReactInVue(Toaster)

// const displayStore = useDisplayStore()
// watch(displayStore.messageToast, (val) => {
//   // toast.success('hello')
//   console.log('messageToast', val)
//   setTimeout(() => {
//     displayStore.messageToast.shift()
//   }, displayStore.durationToast)
// })
</script>

<template>
  <ToasterVue rich-colors />
</template>

<style scoped>

</style>
