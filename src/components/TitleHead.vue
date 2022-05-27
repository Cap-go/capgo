<script setup lang="ts">
import {
  IonBackButton,
  IonButtons,
  IonHeader,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import { useI18n } from 'vue-i18n'
import Banner from '~/components/Banner.vue'

defineProps({
  defaultBack: { type: String, default: '/app' },
  noBack: { type: Boolean, default: false },
  color: { type: String, default: 'default' },
  title: { type: String, default: '' },
  big: { type: Boolean, default: false },
  search: { type: Boolean, default: false },
})
const emit = defineEmits(['searchInput'])
const { t } = useI18n()
const onSearch = (val: string) => {
  emit('searchInput', val)
}
</script>

<template>
  <IonHeader :collapse="big ? 'condense' : undefined">
    <IonToolbar mode="ios">
      <IonButtons v-if="!noBack && !big" slot="start">
        <IonBackButton :default-href="defaultBack" :text="t('button.back')" />
      </IonButtons>
      <IonTitle :color="color" :size="big ? 'large' : ''">
        {{ title }}
      </IonTitle>
    </IonToolbar>
    <IonToolbar v-if="search">
      <IonSearchbar @ion-change="onSearch($event.detail.value)" />
    </IonToolbar>
    <Banner />
  </IonHeader>
</template>
