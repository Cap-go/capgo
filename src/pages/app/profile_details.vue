<script setup lang="ts">
import {
  IonButton,
  IonContent,
  IonInput,
  IonPage,
  IonSpinner,
} from '@ionic/vue'
import { useVuelidate } from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { useI18n } from 'vue-i18n'
import { computed, reactive, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import TitleHead from '~/components/TitleHead.vue'
import { useMainStore } from '~/stores/main'
import type { Database } from '~/types/supabase.types'

const router = useRouter()
const route = useRoute()
const main = useMainStore()
const { t } = useI18n()
const supabase = useSupabase()

const form = reactive({
  first_name: '',
  last_name: '',
  email: main.user?.email,
  country: '',
})

const isLoading = ref(false)
const errorMessage = ref('')

const rules = computed(() => ({
  first_name: { required },
  last_name: { required },
}))

const v$ = useVuelidate(rules, form)

const submit = async () => {
  isLoading.value = true
  const isFormCorrect = await v$.value.$validate()
  if (!isFormCorrect)
    isLoading.value = false

  const updateData: Database['public']['Tables']['users']['Insert'] = {
    id: main.user?.id || '',
    first_name: form.first_name,
    last_name: form.last_name,
    email: form.email || '',
    country: form.country,
  }

  const { data: usr, error: dbError } = await supabase
    .from('users')
    .upsert(updateData)
    .select()
    .single()

  if (dbError || !usr) {
    errorMessage.value = dbError?.message || 'Unknow'
    isLoading.value = false
    return
  }
  main.user = usr
  router.go(-1)
  isLoading.value = false
}
watchEffect(async () => {
  if (route.path === '/app/profile_details') {
    const { data: usr } = await supabase
      .from('users')
      .select(`
        id,
        first_name,
        last_name,
        country,
        email
      `)
      .eq('id', main.user?.id)
      .single()
    if (usr) {
      console.log('usr', usr)
      form.email = usr.email || ''
      form.country = usr.country || ''
      form.first_name = usr.first_name || ''
      form.last_name = usr.last_name || ''
    }
  }
})
</script>

<template>
  <IonPage>
    <TitleHead :title="t('account.personalInformation')" />
    <IonContent :fullscreen="true" class="w-full">
      <div class="grid w-full p-8 mx-auto lg:w-1/2">
        <form
          class="w-full mt-12"
          @submit.prevent="submit"
        >
          <p v-if="errorMessage" class="mt-2 mb-4 text-xs italic text-pumpkin-orange-900">
            {{ errorMessage }}
          </p>
          <div class="grid w-full item-center">
            <div class="py-1">
              <IonInput
                v-model="form.first_name"
                :disabled="isLoading"
                autofocus
                required
                class="z-0 text-left border-b-2 ion-padding-start"
                :placeholder="t('accountProfile.first-name')"
                type="text"
              />

              <div v-for="(error, index) of v$.first_name.$errors" :key="index">
                <p class="mt-2 mb-4 text-xs italic text-pumpkin-orange-900">
                  {{ t('accountProfile.first-name') }}: {{ error.$message }}
                </p>
              </div>
            </div>
            <div class="py-1">
              <IonInput
                v-model="form.last_name"
                :disabled="isLoading"
                required
                class="z-0 text-left border-b-2 ion-padding-start"
                :placeholder="t('accountProfile.last-name')"
                type="text"
              />
              <div v-for="(error, index) of v$.last_name.$errors" :key="index">
                <p class="mt-2 mb-4 text-xs italic text-pumpkin-orange-900">
                  {{ t('accountProfile.last-name') }}: {{ error.$message }}
                </p>
              </div>
            </div>
            <div class="py-1">
              <IonInput
                v-model="form.email"
                required
                disabled
                inputmode="email"
                class="z-0 text-left border-b-2 ion-padding-start"
                :placeholder="t('accountProfile.email')"
                type="email"
              />
            </div>
            <div class="py-1">
              <IonInput
                v-model="form.country"
                :disabled="isLoading"
                required
                class="z-0 text-left border-b-2 ion-padding-start"
                :placeholder="t('accountProfile.country')"
                type="text"
              />
            </div>

            <IonButton
              :disabled="isLoading"
              type="submit"
              color="secondary"
              shape="round"
              class="mx-auto mt-8 font-semibold ion-margin-top w-45"
            >
              <span v-if="!isLoading" class="rounded-4xl">
                {{ t('accountProfile.update') }}
              </span>
              <IonSpinner v-else name="crescent" color="light" />
            </IonButton>
          </div>
        </form>
      </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
ion-datetime {
    height: auto;
    width: auto;

    max-width: 350px;
  }
  ion-modal {
    --width: 290px;
    --height: 382px;
    --border-radius: 8px;
  }

  ion-modal ion-datetime {
    height: 382px;
  }
</style>
