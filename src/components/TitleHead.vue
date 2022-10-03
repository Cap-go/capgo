<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import { chevronBackOutline } from 'ionicons/icons'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Banner from '~/components/Banner.vue'

const props = defineProps({
  defaultBack: { type: String, default: '/app' },
  noBack: { type: Boolean, default: false },
  color: { type: String, default: 'default' },
  title: { type: String, default: '' },
  big: { type: Boolean, default: false },
  search: { type: Boolean, default: false },
})
const emit = defineEmits(['searchInput'])
const router = useRouter()
const { t } = useI18n()
const onSearch = (val: string | undefined) => {
  emit('searchInput', val)
}
const back = () => {
  if (window.history.length > 2)
    router.back()
  else
    router.push(props.defaultBack)
}
</script>

<template>
  <IonHeader :collapse="big ? 'condense' : undefined">
    <IonToolbar mode="ios">
      <IonButtons v-if="!noBack && !big" slot="start">
        <IonButton @click="back">
          <IonIcon slot="start" :icon="chevronBackOutline" />
          {{ t('button.back') }}
        </IonButton>
      </IonButtons>
      <IonTitle :color="color" :size="big ? 'large' : undefined">
        {{ title }}
      </IonTitle>
    </IonToolbar>
    <IonToolbar v-if="search">
      <IonSearchbar @ion-change="onSearch($event.detail.value)" />
    </IonToolbar>
    <Banner />
  </IonHeader>
</template>
