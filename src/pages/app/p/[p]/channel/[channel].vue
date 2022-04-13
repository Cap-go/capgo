<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent, IonHeader,
  IonIcon, IonInput, IonItem, IonItemDivider, IonLabel, IonList, IonListHeader,
  IonModal, IonPage, IonTitle, IonToggle, IonToolbar,
  actionSheetController, toastController,
} from '@ionic/vue'
import { chevronBack } from 'ionicons/icons'
import copy from 'copy-to-clipboard'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import { openVersion } from '~/services/versions'
import NewUserModal from '~/components/NewUserModal.vue'

interface ChannelUsers {
  user_id: definitions['users']
}
interface Channel {
  version: definitions['app_versions']
}
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>()
const channel = ref<definitions['channels'] & Channel>()
const users = ref<(definitions['channel_users'] & ChannelUsers)[]>()
const newUser = ref<string>()
const newUserModalOpen = ref(false)

const openApp = () => {
  if (!channel.value)
    return
  openVersion(channel.value.version)
}
const getUsers = async() => {
  if (!channel.value)
    return
  try {
    const { data: dataUsers } = await supabase
      .from<definitions['channel_users'] & ChannelUsers>('channel_users')
      .select(`
          id,
          channel_id,
          user_id (
            id,
            email,
            first_name,
            last_name
          ),
          created_at
        `)
      .eq('channel_id', id.value)
      .eq('app_id', channel.value.version.app_id)
    if (dataUsers && dataUsers.length)
      users.value = dataUsers
    else
      console.log('no users')
    console.log('users', users.value)
  }
  catch (error) {
    console.error(error)
  }
}
const saveChannelChange = async() => {
  if (!id.value || !channel.value)
    return
  try {
    const update = {
      disableAutoUpdateUnderNative: channel.value.disableAutoUpdateUnderNative,
      disableAutoUpdateToMajor: channel.value.disableAutoUpdateToMajor,
    }
    const { error } = await supabase
      .from<definitions['channels'] & Channel>('channels')
      .update(update)
      .eq('id', id.value)
    if (error)
      console.log('no channel update', error)
  }
  catch (error) {
    console.error(error)
  }
}
const getChannel = async() => {
  if (!id.value)
    return
  try {
    const { data } = await supabase
      .from<definitions['channels'] & Channel>('channels')
      .select(`
          id,
          name,
          public,
          version (
            name,
            app_id,
            bucket_id,
            created_at
          ),
          created_at,
          disableAutoUpdateUnderNative,
          disableAutoUpdateToMajor,
          updated_at
        `)
      .eq('id', id.value)
    if (data && data.length)
      channel.value = data[0]
    else
      console.log('no channel')
    console.log('channel', channel.value)
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
    await getChannel()
    await getUsers()
  }
})
const addUser = async() => {
  console.log('newUser', newUser.value)
  if (!channel.value)
    return
  const { data, error: uError } = await supabase
    .from<definitions['users']>('users')
    .select()
    .eq('email', newUser.value)
  if (!data || !data.length || uError) {
    console.log('no user', uError)
    // const toast = await toastController
    //   .create({
    //     message: t('channel.user_no_found'),
    //     duration: 2000,
    //   })
    // await toast.present()
    newUserModalOpen.value = true

    return
  }

  const { error } = await supabase
    .from<definitions['channel_users']>('channel_users')
    .insert({
      channel_id: id.value,
      app_id: channel.value.version.app_id,
      user_id: data[0].id,
    })
  if (error)
    console.error(error)
  else
    await getUsers()
}
const back = () => {
  router.go(-1)
}
const publicLink = computed(() => channel.value ? `https://capgo.app/api/latest?appid=${channel.value.version.app_id}&channel=${channel.value.name}` : '')
const copyPublicLink = () => {
  copy(publicLink.value)
}
const makePublic = async(val = true) => {
  if (!channel.value || !id.value)
    return
  const { error } = await supabase
    .from<definitions['channels']>('channels')
    .update({ public: val })
    .eq('id', id.value)
  if (error) {
    console.error(error)
  }
  else {
    channel.value.public = val
    const toast = await toastController
      .create({
        message: `Defined as ${val ? 'public' : 'private'}`,
        duration: 2000,
      })
    await toast.present()
  }
}
const deleteUser = async(usr: definitions['users']) => {
  if (!channel.value)
    return
  const { error } = await supabase
    .from<definitions['channel_users']>('channel_users')
    .delete()
    .eq('app_id', channel.value.version.app_id)
    .eq('user_id', usr.id)
  if (error)
    console.error(error)
  else
    await getUsers()
}
const presentActionSheet = async(usr: definitions['users']) => {
  const actionSheet = await actionSheetController.create({
    buttons: [
      {
        text: t('button.delete'),
        handler: () => {
          actionSheet.dismiss()
          deleteUser(usr)
        },
      },
      {
        text: t('button.cancel'),
        role: 'cancel',
        handler: () => {
          console.log('Cancel clicked')
        },
      },
    ],
  })
  await actionSheet.present()
}

const inviteUser = async(userId: string) => {
  const { error } = await supabase
    .from<definitions['channel_users']>('channel_users')
    .insert({
      channel_id: id.value,
      app_id: channel.value?.version.app_id,
      user_id: userId,
    })
  if (error) { console.error(error) }
  else {
    newUser.value = ''
    newUserModalOpen.value = false
    await getUsers()
  }
}
</script>
<template>
  <ion-page>
    <IonHeader class="header-custom">
      <IonToolbar class="toolbar-no-border">
        <IonButtons slot="start" class="mx-3">
          <IonButton @click="back">
            <IonIcon :icon="chevronBack" class="text-grey-dark" /> {{ t('button.back') }}
          </IonButton>
        </IonButtons>
        <IonTitle color="warning">
          {{ t('channel.title') }}
        </IonTitle>
      </IonToolbar>
    </IonHeader>
    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title color="warning" size="large">
            {{ t('channel.title') }}
          </ion-title>
          <IonButtons v-if="channel" slot="end">
            <IonButton color="danger" @click="openApp()">
              {{ t('channel.open') }}
            </IonButton>
          </IonButtons>
        </ion-toolbar>
      </ion-header>
      <ion-list>
        <ion-list-header>
          <span class="text-vista-blue-500">
            {{ channel?.name }} {{ t(channel?.public ? 'channel.public_desc' : 'channel.private_desc') }}
          </span>
        </ion-list-header>
        <ion-item-divider>
          <ion-label>
            {{ t('channel.public') }}
          </ion-label>
        </ion-item-divider>
        <IonItem v-if="channel && channel.public" @click="copyPublicLink()">
          <IonLabel>
            <div class="col-span-6 flex flex-col cursor-pointer">
              <div class="flex justify-between items-center truncate pr-4">
                <h2 class="text-sm text-azure-500">
                  {{ t('channel.copy') }} {{ publicLink }}
                </h2>
              </div>
            </div>
          </IonLabel>
        </IonItem>
        <IonItem @click="makePublic(!channel?.public)">
          <IonLabel>
            <div class="col-span-6 flex flex-col">
              <div class="flex justify-between items-center cursor-pointer">
                <h2 class="text-sm text-azure-500">
                  {{ t('channel.make_it') }} {{ t(channel?.public ? 'channel.private_desc' : 'channel.public_desc') }}
                </h2>
              </div>
            </div>
          </IonLabel>
        </IonItem>
        <IonItem>
          <IonLabel>Disable auto downgrade under native</IonLabel>
          <IonToggle
            color="secondary"
            :checked="channel?.disableAutoUpdateUnderNative"
            @ionChange="channel.disableAutoUpdateUnderNative = $event.target.checked; saveChannelChange()"
          />
        </IonItem>
        <IonItem>
          <IonLabel>Disable auto upgrade above major</IonLabel>
          <IonToggle
            color="secondary"
            :checked="channel?.disableAutoUpdateToMajor"
            @ionChange="channel.disableAutoUpdateToMajor = $event.target.checked; saveChannelChange()"
          />
        </IonItem>
        <ion-item-divider>
          <ion-label>
            {{ t('channel.users') }}
          </ion-label>
        </ion-item-divider>
        <ion-item>
          <ion-label position="floating">
            {{ t('channel.invit') }}
          </ion-label>
          <ion-input v-model="newUser" type="email" placeholder="hello@yourcompany.com" />
          <div slot="end" class="h-full flex items-center justify-center">
            <ion-button color="secondary" @click="addUser()">
              {{ t('channel.add') }}
            </ion-button>
          </div>
        </ion-item>
        <IonItem v-for="(usr, index) in users" :key="index" @click="presentActionSheet(usr.user_id)">
          <IonLabel>
            <div class="col-span-6 flex flex-col">
              <div class="flex justify-between items-center">
                <h2 class="text-sm text-azure-500">
                  {{ usr.user_id.first_name }}  {{ usr.user_id.last_name }}
                </h2>
                <p>{{ usr.user_id.email }}</p>
              </div>
            </div>
          </IonLabel>
        </IonItem>
      </ion-list>
    </ion-content>
    <ion-modal :is-open="newUserModalOpen" :swipe-to-close="true">
      <NewUserModal :email-address="newUser" @close="newUserModalOpen = false" @invite-user="inviteUser" />
    </ion-modal>
  </ion-page>
</template>
