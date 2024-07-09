<script setup lang="ts">
import { kProvider } from 'konsta/vue'
import { defineAsyncComponent } from 'vue'

const ActionSheet = defineAsyncComponent(() => import('~/components/ActionSheet.vue'))
const Toast = defineAsyncComponent(() => import('~/components/Toast.vue'))
const Dialog = defineAsyncComponent(() => import('~/components/Dialog.vue'))

const router = useRouter()
const showTransitionBackground = ref(false)

onMounted(() => {
  router.beforeEach((to, from, next) => {
    showTransitionBackground.value = true
    next()
  })
  router.afterEach(() => {
    showTransitionBackground.value = false
  })
})

onUnmounted(() => {
  router.beforeEach(() => { })
  router.afterEach(() => { })
})
</script>

<template>
  <kProvider theme="ios">
    <div class="h-full overflow-hidden k-ios bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
      <div :class="showTransitionBackground ? 'fixed top-0 left-0 w-screen h-screen z-[10000] bg-slate-800' : 'hidden'">
      </div>
      <RouterView v-slot="{ Component, route }" class="h-full overflow-hidden">
        <Transition name="fade">
          <component :key="route.fullPath" :is="Component" />
        </Transition>
      </RouterView>
      <ActionSheet />
      <Toast />
      <Dialog />
    </div>
  </kProvider>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.7s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
