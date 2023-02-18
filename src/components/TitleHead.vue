<script setup lang="ts">
import { kNavbar, kNavbarBackLink } from 'konsta/vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  defaultBack: { type: String, default: '/app' },
  noBack: { type: Boolean, default: false },
  title: { type: String, default: '' },
})
const router = useRouter()

const back = () => {
  if (window.history.length > 2)
    router.back()
  else
    router.push(props.defaultBack)
}
</script>

<template>
  <div>
    <k-navbar
      class=" no-safe-areas"
      subnavbar-class="flex-col"
    >
      <template #left>
        <div v-if="!noBack">
          <k-navbar-back-link text="Back" @click="back()" />
        </div>
      </template>
      <template #title>
        {{ title }}
      </template>
    </k-navbar>
  </div>
</template>
