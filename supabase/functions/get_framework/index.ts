/* eslint-disable n/prefer-global/buffer */
import { serve } from 'https://deno.land/std@0.182.0/http/server.ts'
import AdmZip from 'https://esm.sh/adm-zip?target=deno'
import { supabaseAdmin } from '../_utils/supabase.ts'
import { getEnv, methodJson, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders } from '../_utils/types.ts'

async function downloadApkPure(id: string, mode: 'APK' | 'XAPK' = 'APK') {
  const downloadUrl = `https://d.apkpure.com/b/${mode}/${id}?version=latest`
  // https://d.apkpure.com/b/APK/com.pizzahutau?version=latest
  // const responseApk = await fetch(downloadUrl, { headers })
  const responseApk = await fetch(downloadUrl, {
    headers: {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'accept-language': 'en-GB,en;q=0.8',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'same-site',
      'sec-fetch-user': '?1',
      'sec-gpc': '1',
      'upgrade-insecure-requests': '1',
    },
    redirect: 'follow',
    referrer: 'https://m.apkpure.com/',
    referrerPolicy: 'strict-origin-when-cross-origin',
    body: null,
    method: 'GET',
    mode: 'cors',
    credentials: 'include',
  })
  const arrayBuffer = await responseApk.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  return buffer
}

async function isCapacitor(id: string) {
  const found = {
    capacitor: false,
    cordova: false,
    react_native: false,
    native_script: false,
    capgo: false,
    onprem: false,
    kotlin: false,
    flutter: false,
  }
  try {
    console.log('downloadApkPure', id)
    const buffer = await downloadApkPure(id)
    console.log('AdmZip', id)
    const zip = new AdmZip(buffer)
    const zipEntries = zip.getEntries() // an array of ZipEntry records
    zipEntries.forEach((zipEntry: any) => {
      // console.log('zipEntry', zipEntry.entryName)
      if (zipEntry.entryName === 'assets/capacitor.config.json') {
        console.log('capacitor', 'assets/capacitor.config.json')
        found.capacitor = true
        // check if updateUrl is set, means on-prem
        const res = zipEntry.getData().toString('utf8')
        if (res.includes('updateUrl'))
          found.onprem = true
      }
      if (zipEntry.entryName === 'assets/capacitor.plugins.json') {
        const res = zipEntry.getData().toString('utf8')
        console.log('capacitor', res)
        found.capacitor = true
        if (res.includes('@capgo/capacitor-updater'))
          found.capgo = true
      }
      if (zipEntry.entryName === 'res/xml/config.xml') {
        console.log('cordova', 'res/xml/config.xml')
        found.cordova = true
      }
      if (zipEntry.entryName === 'lib/x86_64/libreactnativejni') {
        console.log('react_native', 'lib/x86_64/libreactnativejni')
        found.react_native = true
      }
      if (zipEntry.entryName === 'kotlin/kotlin.kotlin_builtins') {
        console.log('kotlin', 'kotlin/kotlin.kotlin_builtins')
        found.kotlin = true
      }
      if (zipEntry.entryName === 'lib/x86_64/libflutter.so') {
        console.log('flutter', 'lib/x86_64/libflutter.so')
        found.flutter = true
      }
      if (zipEntry.entryName === 'lib/x86_64/libNativeScript.so') {
        console.log('native_script', 'lib/x86_64/libNativeScript.so')
        found.native_script = true
      }
    })
  }
  catch (e) {
    console.log('error', id, e)
    throw new Error(e as any)
  }
  console.log('found', id, found)
  return found
}
async function getInfoCap(appId: string) {
  try {
    // console.log('getInfoCap', appId)
    // remove from list apps already in supabase
    const res = await isCapacitor(appId)
    // save in supabase
    const { error } = await supabaseAdmin()
      .from('store_apps')
      .upsert({
        app_id: appId,
        capacitor: res.capacitor,
        cordova: res.cordova,
        react_native: res.react_native,
        capgo: res.capgo,
        onprem: res.onprem,
        kotlin: res.kotlin,
        native_script: res.native_script,
        flutter: res.flutter,
        to_get_framework: false,
      })
    if (error)
      console.log('error', error)
    console.log('getInfoCap', appId, res)
  }
  catch (e) {
    console.log('error getInfoCap', e)
    const { error } = await supabaseAdmin()
      .from('store_apps')
      .upsert({
        app_id: appId,
        to_get_framework: false,
        error_get_framework: JSON.stringify(e),
      })
    if (error)
      console.log('error insert', error)
  }
}

async function main(url: URL, headers: BaseHeaders, method: string, body: any) {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = headers.apisecret
  if (!authorizationSecret) {
    console.error('Fail Authorization', headers)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)
  }
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.error('Fail Authorization', { authorizationSecret, API_SECRET })
    return sendRes({ message: 'Fail Authorization', authorizationSecret }, 400)
  }

  console.log('main', method, body)
  if (body.appId) {
    await getInfoCap(body.appId)
  }
  else if (body.appIds) {
    const all = []
    for (const appId of body.appIds)
      all.push(getInfoCap(appId))
    await Promise.all(all)
  }
  else {
    console.log('cannot get apps', body)
    return sendRes({ status: 'Error', error: 'cannot get apps' }, 500)
  }
  return sendRes()
}

serve(async (event: Request) => {
  try {
    const url: URL = new URL(event.url)
    const headers: BaseHeaders = Object.fromEntries(event.headers.entries())
    const method: string = event.method
    const body: any = methodJson.includes(method) ? await event.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})
