<script setup lang="ts">
import { kNavbar, kNavbarBackLink } from 'konsta/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const props = defineProps({
  defaultBack: { type: String, default: '/app' },
  noBack: { type: Boolean, default: false },
  title: { type: String, default: '' },
})
const router = useRouter()
const { t } = useI18n()

const back = () => {
  if (window.history.length > 2)
    router.back()
  else
    router.push(props.defaultBack)
}
const defaultColor = 'bg-neutral-focus'
const konstaColors = ref({
  bgIos: defaultColor,
  bgMaterial: defaultColor,
})
</script>

<template>
  <div>
    <k-navbar
      class="no-safe-areas"
      :colors="konstaColors"
      :translucent="false"
    >
      <template #left>
        <div v-if="!noBack">
          <k-navbar-back-link class="text-neutral-content" :text="t('button-back')" @click="back()" />
        </div>
      </template>
      <template #title>
        <span class="text-neutral-content">{{ title }}</span>
      </template>
    </k-navbar>
  </div>
</template>
