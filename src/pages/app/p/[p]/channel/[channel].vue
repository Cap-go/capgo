<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent,
  IonFab,
  IonFabButton,
  IonHeader, IonIcon, IonInput, IonItem, IonItemDivider, IonLabel, IonList,
  IonPage, IonTitle, IonToolbar, actionSheetController,
  toastController,
} from '@ionic/vue'
import { add, chevronBack } from 'ionicons/icons'
import copy from 'copy-to-clipboard'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>()
const channel = ref<definitions['channels']>()
const users = ref<definitions['channel_users']>()
const newUser = ref<string>()

interface ChannelUsers {
  users_id: definitions['users'][]
}
const getUsers = async() => {
  try {
    const { data: dataUsers } = await supabase
      .from<definitions['channel_users'] & ChannelUsers>('channel_users')
      .select(`
          id,
          channel_id,
          user_id (
            email,
            first_name,
            last_name
          ),
          created_at
        `)
      .eq('channel_id', id.value)
      .eq('app_id', channel.value.app_id)
    if (dataUsers && dataUsers.length)
      users.value = dataUsers
    else
      console.log('no users')
  }
  catch (error) {
    console.error(error)
  }
}
watchEffect(async() => {
  if (route.path.includes('/channel/')) {
    packageId.value = route.params.p as string
    packageId.value = packageId.value.replaceAll('--', '.')
    id.value = Number(route.params.channel as string)
    try {
      const { data: dataApp } = await supabase
        .from<definitions['channels']>('channels')
        .select()
        .eq('id', id.value)
      if (dataApp && dataApp.length)
        channel.value = dataApp[0]
      else
        console.log('no channel')
      await getUsers()
    }
    catch (error) {
      console.error(error)
    }
  }
})
const addUser = async() => {
  console.log('newUser', newUser.value)
  const { data, error: uError } = await supabase
    .from<definitions['users']>('users')
    .select()
    .eq('email', newUser.value)
  if (!data || !data.length || uError) {
    console.log('no user', uError)
    const toast = await toastController
      .create({
        message: 'User not found, ask to register first',
        duration: 2000,
      })
    await toast.present()
    return
  }

  const { error } = await supabase
    .from<definitions['channel_users']>('channel_users')
    .insert({
      channel_id: id.value,
      app_id: channel.value.app_id,
      user_id: data[0].id,
    })
  if (error) console.error(error)
  else
    await getUsers()
}
const back = () => {
  router.go(-1)
}
const publicLink = computed(() => channel.value ? `https://capgp.app/api/latest?appid=${channel.value.app_id}&channel=${channel.value.name}` : '')
const copyPublicLink = () => {
  copy(publicLink.value)
}
const makePublic = async() => {
  const { error } = await supabase
    .from<definitions['channels']>('channels')
    .update({ public: true })
    .eq('id', id.value)
  if (error) {
    console.error(error)
  }
  else {
    channel.value.public = true
    const toast = await toastController
      .create({
        message: 'Defined as public',
        duration: 2000,
      })
    await toast.present()
  }
}
const deleteUser = async(usr: definitions['users']) => {
  const { error } = await supabase
    .from<definitions['channel_users']>('channel_users')
    .delete()
    .eq('app_id', channel.value.app_id)
    .eq('user_id', usr.id)
  if (error) console.error(error)
  else
    await getUsers()
}
const presentActionSheet = async(usr: definitions['users']) => {
  const actionSheet = await actionSheetController.create({
    buttons: [
      {
        text: 'Delete from list',
        handler: () => {
          actionSheet.dismiss()
          deleteUser(usr)
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
        <ion-item-divider>
          <ion-label>
            {{ t('channel.public') }}
          </ion-label>
        </ion-item-divider>
        <IonItem v-if="channel && channel.public" @click="copyPublicLink()">
          <IonLabel>
            <div class="col-span-6 flex flex-col cursor-pointer">
              <div class="flex justify-between items-center">
                <h2 class="text-sm text-bright-cerulean-500">
                  {{ publicLink }}
                </h2>
              </div>
            </div>
          </IonLabel>
        </IonItem>
        <IonItem v-else @click="makePublic()">
          <IonLabel>
            <div class="col-span-6 flex flex-col">
              <div class="flex justify-between items-center cursor-pointer">
                <h2 class="text-sm text-bright-cerulean-500">
                  Your channel is private, click to make it public
                </h2>
              </div>
            </div>
          </IonLabel>
        </IonItem>
        <ion-item-divider>
          <ion-label>
            {{ t('channel.users') }}
          </ion-label>
        </ion-item-divider>
        <ion-item>
          <ion-label position="floating">
            Email address to invite
          </ion-label>
          <ion-input v-model="newUser" type="email" placeholder="Enter Email" />
        </ion-item>
        <IonItem v-for="(usr, index) in users" :key="index" @click="presentActionSheet(usr)">
          <IonLabel>
            <div class="col-span-6 flex flex-col">
              <div class="flex justify-between items-center">
                <h2 class="text-sm text-bright-cerulean-500">
                  {{ usr.user_id.first_name }}  {{ usr.user_id.last_name }}
                </h2>
                <p>{{ usr.user_id.email }}</p>
              </div>
            </div>
          </IonLabel>
        </IonItem>
      </ion-list>
      <ion-fab slot="fixed" horizontal="end" vertical="bottom">
        <ion-fab-button color="danger" @click="addUser()">
          <IonIcon :icon="add" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>
