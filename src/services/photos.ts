import { decode } from 'base64-arraybuffer'
import type { Ref } from 'vue'
import { setErrors } from '@formkit/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Filesystem } from '@capacitor/filesystem'
import mime from 'mime'
import { useSupabase } from './supabase'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const supabase = useSupabase()
const main = useMainStore()
const organizationStore = useOrganizationStore()

async function uploadPhotoShared(data: string, fileName: string, contentType: string, isLoading: Ref<boolean>, callback: (success: boolean, url: string) => Promise<void>) {
  const { error } = await supabase.storage
    .from('images')
    .upload(`${main.user?.id}/${fileName}`, decode(data), {
      contentType,
    })

  const { data: res } = supabase.storage
    .from('images')
    .getPublicUrl(`${main.user?.id}/${fileName}`)

  isLoading.value = false

  if (error || !res.publicUrl)
    await callback(false, '')
  else
    await callback(true, res.publicUrl)
}

async function updloadPhotoUser(data: string, fileName: string, contentType: string, isLoading: Ref<boolean>, wentWrong: string) {
  async function userCallback(success: boolean, url: string) {
    if (!success) {
      setErrors('update-account', [wentWrong], {})
      return
    }

    const { data: usr, error: dbError } = await supabase
      .from('users')
      .update({ image_url: url })
      .eq('id', main.user?.id)
      .select()
      .single()

    if (!usr || dbError) {
      setErrors('update-account', [wentWrong], {})
      console.error('upload error', dbError)
      return
    }

    main.user = usr as any
  }

  await uploadPhotoShared(data, fileName, contentType, isLoading, userCallback)
}

async function updloadPhotoOrg(data: string, fileName: string, contentType: string, isLoading: Ref<boolean>, wentWrong: string) {
  async function orgCallback(success: boolean, url: string) {
    if (!success)
      return

    const { data: usr, error: dbError } = await supabase
      .from('orgs')
      .update({ logo: url })
      .eq('created_by', main.user?.id)
      .select()
      .single()

    if (!usr || dbError) {
      console.error('upload error', dbError)
      return
    }

    await organizationStore.setCurrentOrganizationFromValue(usr as any)
  }

  await uploadPhotoShared(data, fileName, contentType, isLoading, orgCallback)
}

function blobToData(blob: Blob) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

export async function takePhoto(isLoading: Ref<boolean>, type: 'org' | 'user', wentWrong: string) {
  const updloadPhoto = (type === 'user') ? updloadPhotoUser : updloadPhotoOrg
  const cameraPhoto = await Camera.getPhoto({
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    quality: 100,
  })

  isLoading.value = true

  const fileName = `${new Date().getTime()}.${cameraPhoto.format}`

  if (!cameraPhoto.dataUrl)
    return

  const contentType = mime.getType(cameraPhoto.format)

  if (!contentType)
    return
  try {
    await updloadPhoto(cameraPhoto.dataUrl.split('base64,')[1], fileName, contentType, isLoading, wentWrong)
  }
  catch (e) {
    console.error(e)
    isLoading.value = false
  }
}

export async function pickPhoto(isLoading: Ref<boolean>, type: 'org' | 'user', wentWrong: string) {
  const updloadPhoto = (type === 'user') ? updloadPhotoUser : updloadPhotoOrg
  const { photos } = await Camera.pickImages({
    limit: 1,
    quality: 100,
  })
  isLoading.value = true
  if (photos.length === 0)
    return
  try {
    let contents
    if (photos[0].path) {
      contents = await Filesystem.readFile({
        path: photos[0].path || photos[0].webPath,
      })
    }
    else {
      const blob = await blobToData(await fetch(photos[0].webPath).then(r => r.blob()))
      contents = { data: blob.split('base64,')[1] }
    }
    const contentType = mime.getType(photos[0].format)
    if (!contentType)
      return
    await updloadPhoto(
      contents.data,
        `${new Date().getTime()}.${photos[0].format}`,
        contentType,
        isLoading,
        wentWrong,
    )
  }
  catch (e) {
    console.error(e)
    isLoading.value = false
  }
}
