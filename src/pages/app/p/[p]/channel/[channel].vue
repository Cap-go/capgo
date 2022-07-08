<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent, IonHeader,
  IonInput, IonItem, IonItemDivider, IonItemOption, IonItemOptions, IonItemSliding,
  IonLabel, IonList, IonListHeader, IonModal, IonNote,
  IonPage, IonSearchbar, IonTitle, IonToggle, IonToolbar,
  actionSheetController, alertController, toastController,
} from '@ionic/vue'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import { openVersion } from '~/services/versions'
import NewUserModal from '~/components/NewUserModal.vue'
import { formatDate } from '~/services/date'
import TitleHead from '~/components/TitleHead.vue'
import { useMainStore } from '~/stores/main'

interface ChannelUsers {
  user_id: definitions['users']
}
interface Channel {
  version: definitions['app_versions']
}
const router = useRouter()
const { t } = useI18n()
const route = useRoute()
const main = useMainStore()
const listRef = ref()
const supabase = useSupabase()
const auth = supabase.auth.user()
const packageId = ref<string>('')
const id = ref<number>()
const channel = ref<definitions['channels'] & Channel>()
const users = ref<(definitions['channel_users'] & ChannelUsers)[]>()
const newUser = ref<string>()
const newUserModalOpen = ref(false)
const search = ref('')
const devices = ref<definitions['channel_devices'][]>([])

const openApp = () => {
  if (!channel.value)
    return
  openVersion(channel.value.version, auth?.id || '')
}
const getUsers = async () => {
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
    // console.log('users', users.value)
  }
  catch (error) {
    console.error(error)
  }
}
const getDevices = async () => {
  if (!channel.value)
    return
  try {
    const { data: dataDevices } = await supabase
      .from<definitions['channel_devices']>('channel_devices')
      .select()
      .eq('channel_id', id.value)
      .eq('app_id', channel.value.version.app_id)
    if (dataDevices && dataDevices.length)
      devices.value = dataDevices
    else
      devices.value = []
  }
  catch (error) {
    console.error(error)
  }
}
const saveChannelChange = async (key: string, val: boolean) => {
  if (!id.value || !channel.value)
    return
  try {
    const update = {
      [key]: val,
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
const getChannel = async () => {
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
      .single()
    if (data)
      channel.value = data
    else
      console.log('no channel')
    console.log('channel', channel.value)
  }
  catch (error) {
    console.error(error)
  }
}
watchEffect(async () => {
  if (route.path.includes('/channel/')) {
    packageId.value = route.params.p as string
    packageId.value = packageId.value.replaceAll('--', '.')
    id.value = Number(route.params.channel as string)
    await getChannel()
    await getUsers()
    await getDevices()
  }
})

const existUser = async (email: string): Promise<string> => {
  const { data, error } = await supabase
    .rpc<string>('exist_user', { e_mail: email })
    .single()
  if (error)
    throw error

  return data
}

const addUser = async () => {
  console.log('newUser', newUser.value)

  if (!channel.value || !auth)
    return
  if (!main.myPlan?.canUseMore && (main.myPlan?.trialDaysLeft || 0) <= 0) {
    // show alert for upgrade plan and return
    const alert = await alertController.create({
      header: t('limit-reached'),
      message: t('please-upgrade'),
      buttons: [
        {
          text: t('button.cancel'),
          role: 'cancel',
          cssClass: 'secondary',
        },
        {
          text: t('upgrade-now'),
          handler: () => {
            router.push('/usage')
          },
        },
      ],
    })
    await alert.present()
    return
  }
  // exist_user
  const exist = await existUser(newUser.value || '')
  if (!exist) {
    newUserModalOpen.value = false
    return
  }

  const { error } = await supabase
    .from<definitions['channel_users']>('channel_users')
    .insert({
      channel_id: id.value,
      app_id: channel.value.version.app_id,
      user_id: exist,
      created_by: auth.id,
    })
  if (error) { console.error(error) }
  else {
    await getUsers()
    newUser.value = ''
  }
}
const makePublic = async (val = true) => {
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
const didCancel = async (name: string) => {
  const alert = await alertController
    .create({
      header: t('alert.confirm-delete'),
      message: `${t('alert.delete-message')} ${name}?`,
      buttons: [
        {
          text: t('button.cancel'),
          role: 'cancel',
        },
        {
          text: t('button.delete'),
          id: 'confirm-button',
        },
      ],
    })
  await alert.present()
  return alert.onDidDismiss().then(d => (d.role === 'cancel'))
}
const deleteUser = async (usr: definitions['users']) => {
  if (!channel.value || await didCancel(t('channel.user')))
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

const presentActionSheet = async (usr: definitions['users']) => {
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

const devicesFilter = computed(() => {
  const value = search.value
  if (value) {
    const filtered = devices.value.filter(device => device.device_id.toLowerCase().includes(value.toLowerCase()))
    return filtered
  }
  return devices.value
})
const deleteDevice = async (device: definitions['channel_devices']) => {
  console.log('deleteDevice', device)
  if (listRef.value)
    listRef.value.$el.closeSlidingItems()
  if (await didCancel(t('channel.device')))
    return
  try {
    const { error: delDevError } = await supabase
      .from<definitions['channel_devices']>('channel_devices')
      .delete()
      .eq('app_id', device.app_id)
      .eq('device_id', device.device_id)
    if (delDevError) {
      const toast = await toastController
        .create({
          message: t('channel.cannot-delete-device'),
          duration: 2000,
        })
      await toast.present()
    }
    else {
      await getDevices()
      const toast = await toastController
        .create({
          message: t('channel.device-deleted'),
          duration: 2000,
        })
      await toast.present()
    }
  }
  catch (error) {
    const toast = await toastController
      .create({
        message: t('channel.cannot-delete-device'),
        duration: 2000,
      })
    await toast.present()
  }
}
const inviteUser = async (userId: string) => {
  const { error } = await supabase
    .from<definitions['channel_users']>('channel_users')
    .insert({
      channel_id: id.value,
      created_by: auth?.id,
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
  <IonPage>
    <TitleHead :title="t('channel.title')" color="warning" :default-back="`/app/package/${route.params.p}`" />
    <IonContent :fullscreen="true">
      <!-- <TitleHead :title="t('channel.title')" big color="warning" /> -->
      <IonHeader collapse="condense">
        <IonToolbar mode="ios">
          <IonTitle color="warning" size="large">
            {{ t('channel.title') }}
          </IonTitle>
          <IonButtons v-if="channel" slot="end">
            <IonButton color="danger" @click="openApp()">
              {{ t('channel.open') }}
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonList ref="listRef">
        <IonListHeader>
          <span class="text-vista-blue-500">
            {{ channel?.name }}
          </span>
        </IonListHeader>
        <IonItem>
          <IonLabel class="my-6 font-extrabold">
            {{ t('channel.is_public') }}
          </IonLabel>
          <IonButtons slot="end">
            <IonToggle
              color="secondary"
              :checked="channel?.public"
              @ion-change="makePublic($event.detail.checked)"
            />
          </IonButtons>
        </IonItem>
        <IonItemDivider>
          <IonLabel>
            {{ t('channel.v3') }}
          </IonLabel>
        </IonItemDivider>
        <!-- <IonItem>
          <IonLabel>{{ t('channel.beta-channel') }}</IonLabel>
          <IonToggle

            color="secondary"
            :checked="channel?.beta"
            @ion-change="saveChannelChange('beta', $event.target.checked)"
          />
        </IonItem> -->
        <IonItem>
          <IonLabel>Disable auto downgrade under native</IonLabel>
          <IonToggle
            color="secondary"
            :checked="channel?.disableAutoUpdateUnderNative"
            @ion-change="saveChannelChange('disableAutoUpdateUnderNative', $event.target.checked)"
          />
        </IonItem>
        <IonItem>
          <IonLabel>Disable auto upgrade above major</IonLabel>
          <IonToggle
            color="secondary"
            :checked="channel?.disableAutoUpdateToMajor"
            @ion-change="saveChannelChange('disableAutoUpdateToMajor', $event.target.checked)"
          />
        </IonItem>
        <IonItemDivider>
          <IonLabel>
            {{ t('channel.users') }}
          </IonLabel>
        </IonItemDivider>
        <IonItem>
          <IonLabel position="floating">
            {{ t('channel.invit') }}
          </IonLabel>
          <IonInput v-model="newUser" type="email" placeholder="hello@yourcompany.com" />
          <div slot="end" class="h-full flex items-center justify-center">
            <IonButton color="secondary" @click="addUser()">
              {{ t('channel.add') }}
            </IonButton>
          </div>
        </IonItem>
        <IonItem v-for="(usr, index) in users" :key="index" class="cursor-pointer" @click="presentActionSheet(usr.user_id)">
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
        <IonItemDivider v-if="devices?.length">
          <IonLabel>
            {{ t('package.devices-list') }}
          </IonLabel>
        </IonItemDivider>
        <!-- add item with searchbar -->
        <IonItem v-if="devices?.length">
          <IonSearchbar @ion-change="search = ($event.detail.value || '')" />
        </IonItem>
        <template v-for="d in devicesFilter" :key="d.device_id">
          <IonItemSliding>
            <IonItem class="cursor-pointer">
              <IonLabel>
                <h2 class="text-sm text-azure-500">
                  {{ d.device_id }}
                </h2>
              </IonLabel>
              <IonNote slot="end">
                {{ formatDate(d.created_at) }}
              </IonNote>
            </IonItem>
            <IonItemOptions side="end">
              <IonItemOption color="warning" @click="deleteDevice(d)">
                Delete
              </IonItemOption>
            </IonItemOptions>
          </IonItemSliding>
        </template>
      </IonList>
    </IonContent>
    <IonModal :is-open="newUserModalOpen" :swipe-to-close="true">
      <NewUserModal :email-address="newUser" @close="newUserModalOpen = false" @invite-user="inviteUser" />
    </IonModal>
  </IonPage>
</template>
