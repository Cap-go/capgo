<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent,
  IonFab,
  IonFabButton,
  IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList,
  IonPage, IonTitle, IonToolbar, actionSheetController,
} from '@ionic/vue'
import { add, chevronBack } from 'ionicons/icons'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'

interface Channel {
  users: definitions['users'][]
}
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>()
const channel = ref<definitions['channels'] & Channel>()

watchEffect(async() => {
  if (route.path.includes('/channel/')) {
    packageId.value = route.params.package as string
    packageId.value = packageId.value.replaceAll('--', '.')
    id.value = Number(route.params.channel as string)
    try {
      const { data: dataApp } = await supabase
        .from<definitions['channels'] & Channel>('channels')
        .select(`
          id,
          name,
          users (
            email,
            first_name,
            last_name
          )[],
          created_at
        `)
        .eq('id', id.value)
      if (dataApp && dataApp.length)
        channel.value = dataApp[0]
      else
        console.log('no channel')
    }
    catch (error) {
      console.error(error)
    }
  }
})
const back = () => {
  router.go(-1)
}
const updateUser = async(usr: definitions['users']) => {
  let users: string[] = channel.value?.users.map((u: definitions['users']) => u.id) || []
  users = users.filter(uid => uid !== usr.id)

  if (!users.length) return
  const { error } = await supabase
    .from<definitions['channels']>('channels')
    .update({
      users,
    })
    .eq('id', id.value)
  if (error) console.error(error)
}
const presentActionSheet = async(usr: definitions['users']) => {
  const actionSheet = await actionSheetController.create({
    buttons: [
      {
        text: 'Delete from list',
        handler: () => {
          actionSheet.dismiss()
          updateUser(usr)
        },
      },
      {
        text: 'Cancel',
        role: 'cancel',
        handler: () => {
          console.log('Cancel clicked')
        },
      },
    ],
  })
  await actionSheet.present()
}
</script>
<template>
  <ion-page>
    <IonHeader class="header-custom">
      <IonToolbar class="toolbar-no-border">
        <IonButtons slot="start" class="mx-3">
          <IonButton @click="back">
            <IonIcon :icon="chevronBack" class="text-grey-dark" />
          </IonButton>
        </IonButtons>
        <div class="flex justify-between items-center">
          <div class="flex">
            <div class="flex flex-col justify-center">
              <p class="text-left text-bright-cerulean-500 text-sm font-bold">
                {{ channel?.name }}
              </p>
            </div>
          </div>
        </div>
      </IonToolbar>
    </IonHeader>
    <ion-content :fullscreen="true">
      <ion-header>
        <ion-toolbar>
          <ion-title size="large">
            {{ t('channel.title') }}
          </ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-list>
        <ion-item-divider v-if="channel?.users?.length">
          <ion-label>
            {{ t('channel.users') }}
          </ion-label>
        </ion-item-divider>
        <IonItem v-for="(usr, index) in channel?.users" :key="index" @click="presentActionSheet(usr)">
          <IonLabel>
            <div class="col-span-6 flex flex-col">
              <div class="flex justify-between items-center">
                <h2 class="text-sm text-bright-cerulean-500">
                  {{ usr.first_name }}  {{ usr.last_name }}
                </h2>
                <p>{{ usr.email }}</p>
              </div>
            </div>
          </IonLabel>
        </IonItem>
      </ion-list>
      <ion-fab slot="fixed" horizontal="end" vertical="bottom">
        <ion-fab-button color="danger">
          <IonIcon :icon="add" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>
